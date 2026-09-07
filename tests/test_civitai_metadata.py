import json
from pathlib import Path
import sys
import unittest
from unittest.mock import Mock, patch
import types



ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.civitai_metadata import build_regional_metadata  # noqa: E402
from util.regional import civitai_metadata as metadata_module


class CivitaiRegionalMetadataTests(unittest.TestCase):
    def test_loader_and_known_wrapper_contracts_preserve_chain_order(self):
        for loader, field in metadata_module.MODEL_LOADERS.items():
            for wrapper in metadata_module.MODEL_WRAPPERS:
                with self.subTest(loader=loader, wrapper=wrapper):
                    graph = {
                        "s": {"class_type": "KSampler", "inputs": {"steps": 1, "model": ["w", 0]}},
                        "w": {"class_type": wrapper, "inputs": {"model": ["l2", 0]}},
                        "l2": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["l1", 0], "lora_name": "second", "strength_model": -0.2}},
                        "l1": {"class_type": "LoraLoader", "inputs": {"model": ["m", 0], "lora_name": "first", "strength_model": 0.5, "strength_clip": 0.7}},
                        "m": {"class_type": loader, "inputs": {field: "base.safetensors"}},
                    }
                    info = metadata_module._sampler_info(graph, "s")
                    self.assertEqual(info["model"], "base.safetensors")
                    self.assertEqual(info["global_loras"], [["first", 0.5, 0.7], ["second", -0.2, 0.0]])

    def test_invalid_model_links_cycles_and_dynamic_names_are_unknown(self):
        for link in (["m", 1], ["missing", 0], ["m", "0"], None, ["cycle", 0]):
            graph = {
                "s": {"class_type": "KSampler", "inputs": {"steps": 1, "model": link}},
                "m": {"class_type": "UNETLoader", "inputs": {"unet_name": ["string", 0]}},
                "cycle": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["cycle", 0], "lora_name": "cyclic"}},
            }
            with self.subTest(link=link):
                info = metadata_module._sampler_info(graph, "s")
                self.assertIsNone(info["model"])
                self.assertEqual(info["global_loras"], [])
        graph["s"]["inputs"]["model"] = ["m", 0]
        self.assertIsNone(metadata_module._sampler_info(graph, "s")["model"])

    def test_unet_hash_uses_loader_category_and_cross_category_dedupe(self):
        graph = {
            "s": {"class_type": "KSampler", "inputs": {"steps": 1, "model": ["l", 0]}},
            "l": {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["m", 0], "lora_name": "alias"}},
            "m": {"class_type": "UNETLoader", "inputs": {"unet_name": "same-name.safetensors"}},
        }
        paths = types.ModuleType("folder_paths")
        paths.get_full_path = Mock(return_value=__file__)
        hasher = Mock(return_value="a" * 64)
        with patch.dict(sys.modules, {"folder_paths": paths}):
            _, metadata = build_regional_metadata(self.fixture(), prompt=graph, unique_id="s", hasher=hasher)
        paths.get_full_path.assert_any_call("diffusion_models", "same-name.safetensors")
        self.assertNotIn(("checkpoints", "same-name.safetensors"), [call.args for call in paths.get_full_path.call_args_list])
        self.assertEqual(hasher.call_count, 1)
        self.assertEqual(metadata["model"]["sha256"], "a" * 64)
        self.assertIn("configured loader values", metadata["global_lora_strength_semantics"])

    def test_multiple_samplers_are_ambiguous(self):
        graph = {"save": {"inputs": {"images": ["a", 0], "other": ["b", 0]}},
                 "a": {"class_type": "KSampler", "inputs": {"steps": 1}},
                 "b": {"class_type": "KSamplerAdvanced", "inputs": {"steps": 1}}}
        self.assertIsNone(metadata_module._sampler_info(graph, "save"))

    def test_sampler_model_chain_excludes_post_upscaler_and_clip_branch(self):
        graph = {
            "save": {"inputs": {"images": ["upscale", 0]}},
            "upscale": {"inputs": {"upscale_model": ["up", 0], "image": ["decode", 0]}},
            "up": {"class_type": "UpscaleModelLoader", "inputs": {"model_name": "wrong.pth"}},
            "decode": {"inputs": {"samples": ["sample", 0]}},
            "sample": {"class_type": "KSamplerAdvanced", "inputs": {
                "steps": 10, "model": ["lora", 0], "positive": ["side", 1]}},
            "lora": {"class_type": "LoraLoaderModelOnly", "inputs": {
                "model": ["model", 0], "lora_name": "right.safetensors", "strength_model": 0.8}},
            "side": {"class_type": "LoraLoader", "inputs": {"lora_name": "wrong.safetensors"}},
            "model": {"class_type": "UNETLoader", "inputs": {"unet_name": "right-model.safetensors"}},
        }
        info = metadata_module._sampler_info(graph, "save")
        self.assertEqual(info["model"], "right-model.safetensors")
        self.assertEqual(info["global_loras"], [["right.safetensors", 0.8, 0.0]])

    def test_unknown_wrappers_and_merges_do_not_claim_model(self):
        for class_type in ("UnknownWrapper", "ModelMergeSimple"):
            with self.subTest(class_type=class_type):
                graph = {
                    "s": {"class_type": "KSampler", "inputs": {"steps": 10, "model": ["w", 0]}},
                    "w": {"class_type": class_type, "inputs": {"model": ["m", 0], "model2": ["m", 0]}},
                    "m": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "base.safetensors"}},
                }
                self.assertIsNone(metadata_module._sampler_info(graph, "s")["model"])

    def test_deduplicates_resource_aliases_before_hashing(self):
        hasher = Mock(return_value="a" * 64)
        resources = metadata_module._resolved_resources(
            {"global": [["alias-a", 1, 1]], "region": [["alias-b", 0.5, 0]]},
            lambda _name: __file__, hasher,
        )
        self.assertEqual(hasher.call_count, 1)
        self.assertEqual(len(resources), 1)
        self.assertEqual(len(resources[0]["scopes"]), 2)

    def test_failed_resource_is_not_rehashed_for_other_scopes(self):
        hasher = Mock(side_effect=OSError("file changed"))
        resources = metadata_module._resolved_resources(
            {"global": [["a", 1, 1]], "region": [["b", 1, 0]]}, lambda _: __file__, hasher,
        )
        self.assertEqual(resources, [])
        self.assertEqual(hasher.call_count, 1)

    def fixture(self):
        with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
            return json.load(handle)

    def test_builds_canonical_regional_prompt_and_a1111_parameters(self):
        graph = {
            "90": {"class_type": "BV Regional Image Save", "inputs": {"images": ["30", 0]}},
            "30": {"class_type": "VAEDecode", "inputs": {"samples": ["20", 0]}},
            "20": {"class_type": "KSampler", "inputs": {
                "model": ["10", 0], "steps": 28, "cfg": 6.5, "seed": 1234,
                "sampler_name": "dpmpp_2m", "scheduler": "karras", "denoise": 1.0,
            }},
            "10": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "models/pony.safetensors"}},
        }
        parameters, metadata = build_regional_metadata(
            self.fixture(), prompt=graph, unique_id="90", width=1536, height=1024
        )
        self.assertIn("masterpiece, two people in a cafe", parameters)
        self.assertIn("[Background]\nwooden tables, warm interior", parameters)
        self.assertIn("[Region: Person left | strength=1]", parameters)
        self.assertNotIn("@<person>", parameters)
        self.assertIn("blonde hair, red dress", parameters)
        self.assertIn("Negative prompt: worst quality, watermark", parameters)
        self.assertIn("Steps: 28", parameters)
        self.assertIn("Sampler: dpmpp_2m", parameters)
        self.assertIn("Schedule type: karras", parameters)
        self.assertIn("CFG scale: 6.5", parameters)
        self.assertIn("Seed: 1234", parameters)
        self.assertIn("Size: 1536x1024", parameters)
        self.assertIn("Model: pony", parameters)
        self.assertEqual(metadata["schema"], "bv.regional-generation")
        self.assertEqual(metadata["context"]["version"], 3)

    def test_resolves_seed_from_bv_seed_link_for_a1111_parameters(self):
        graph = {
            "90": {"class_type": "BV Regional Image Save", "inputs": {"images": ["30", 0]}},
            "30": {"class_type": "KSampler", "inputs": {
                "model": ["10", 0], "steps": 30, "cfg": 3.0, "seed": ["7", 0],
                "sampler_name": "euler", "scheduler": "simple", "denoise": 1.0,
            }},
            "10": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
            "7": {"class_type": "BV Seed", "inputs": {"seed_bv": -1, "seed": 2314237723733183}},
        }
        parameters, _metadata = build_regional_metadata(
            self.fixture(), prompt=graph, unique_id="90", width=1024, height=1024
        )
        self.assertIn("Seed: 2314237723733183", parameters)
        self.assertNotIn("Seed: [", parameters)

    def test_omits_civitai_parameters_when_sampler_is_ambiguous_or_missing(self):
        parameters, metadata = build_regional_metadata(self.fixture(), prompt={}, unique_id="90")
        self.assertIsNone(parameters)
        self.assertTrue(metadata["prompts"]["positive"])

    def test_includes_upstream_core_lora_loader(self):
        graph = {
            "90": {"class_type": "BV Regional Image Save", "inputs": {"images": ["30", 0]}},
            "30": {"class_type": "KSampler", "inputs": {
                "model": ["20", 0], "steps": 8, "cfg": 1.0, "seed": 42,
                "sampler_name": "euler_ancestral", "scheduler": "simple",
            }},
            "20": {"class_type": "LoraLoaderModelOnly", "inputs": {
                "model": ["10", 0], "lora_name": "turbo.safetensors", "strength_model": 0.8,
            }},
            "10": {"class_type": "UNETLoader", "inputs": {"unet_name": "anima.safetensors"}},
        }

        parameters, metadata = build_regional_metadata(
            self.fixture(),
            prompt=graph,
            unique_id="90",
            lora_resolver=lambda name: __file__ if name == "turbo.safetensors" else None,
            model_resolver=lambda name: __file__ if name == "anima.safetensors" else None,
            hasher=lambda _path: "a" * 64,
        )

        self.assertIn('Lora hashes: "test_civitai_metadata: aaaaaaaaaa"', parameters)
        self.assertEqual(metadata["loras"][0]["path"], "turbo.safetensors")
        self.assertEqual(metadata["loras"][0]["scopes"], [
            {"scope": "global", "model_strength": 0.8, "clip_strength": 0.0}
        ])


if __name__ == "__main__":
    unittest.main()

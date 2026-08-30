import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.civitai_metadata import build_regional_metadata  # noqa: E402


class CivitaiRegionalMetadataTests(unittest.TestCase):
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

        self.assertIn("Lora hashes: test_civitai_metadata: aaaaaaaaaa", parameters)
        self.assertEqual(metadata["loras"][0]["path"], "turbo.safetensors")
        self.assertEqual(metadata["loras"][0]["scopes"], [
            {"scope": "global", "model_strength": 0.8, "clip_strength": 0.8}
        ])


if __name__ == "__main__":
    unittest.main()

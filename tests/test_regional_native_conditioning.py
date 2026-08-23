import copy
import json
from pathlib import Path
import sys
import types
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.native_conditioning import compile_detailer_conditioning, compile_native_conditioning  # noqa: E402
from util.regional.context import normalize_context  # noqa: E402


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        document = json.load(handle)
    document["canvas"] = {"width": 64, "height": 48}
    return document


class FakeClip:
    def __init__(self):
        self.encoded = []

    def tokenize(self, text):
        return text

    def encode_from_tokens_scheduled(self, tokens):
        self.encoded.append(tokens)
        value = float(len(self.encoded))
        return [[torch.full((1, 2, 3), value), {"pooled_output": torch.full((1, 3), value)}]]


class AnimaTEModel:
    pass


AnimaTEModel.__module__ = "comfy.text_encoders.anima"


class FakeAnimaClip(FakeClip):
    def __init__(self):
        super().__init__()
        self.cond_stage_model = AnimaTEModel()


class FakeHookPatcher:
    def __init__(self):
        self.forced_hooks = None

    def register_all_hook_patches(self, *_args):
        return None


class FakeHookClip(FakeClip):
    def __init__(self, encoded=None):
        super().__init__()
        self.encoded = encoded if encoded is not None else []
        self.patcher = FakeHookPatcher()
        self.apply_hooks_to_conds = None
        self.use_clip_schedule = False

    def clone(self, disable_dynamic=True):
        return FakeHookClip(self.encoded)

    def encode_from_tokens_scheduled(self, tokens):
        result = super().encode_from_tokens_scheduled(tokens)
        if self.apply_hooks_to_conds is not None:
            result[0][1]["hooks"] = self.apply_hooks_to_conds
        return result


class FakeHookGroup:
    def clone(self):
        return self

    def set_keyframes_on_hooks(self, _keyframes):
        return None


class RegionalNativeConditioningTests(unittest.TestCase):
    def test_v3_context_compiles_through_existing_consumer(self):
        positive, negative = compile_native_conditioning(normalize_context(fixture()), FakeClip())
        self.assertTrue(positive)
        self.assertTrue(negative)

    def test_detailer_conditioning_weights_region_and_background_independently(self):
        document = fixture()
        document["version"] = 2
        for region in document["regions"]:
            region["usage"] = "generation"
        region = document["regions"][1]
        region["usage"] = "detailer"
        positive, negative, positive_text, negative_text, positive_weighted, negative_weighted = compile_detailer_conditioning(
            document, FakeClip(), region["id"], global_influence=1.0,
            background_influence=0.35, primary_region_influence=0.8,
            context_regions=[{"region_id": document["regions"][0]["id"], "influence": 0.6}],
        )
        self.assertEqual([item[1].get("strength", 1.0) for item in positive], [0.8, 0.6, 1.0, 0.35])
        self.assertEqual([item[1].get("strength", 1.0) for item in negative], [0.8, 0.6, 1.0, 0.35])
        self.assertIn("green eyes", positive_text)
        self.assertIn("wooden tables", positive_text)
        self.assertIn("blonde hair", positive_text)
        self.assertIn("asymmetrical eyes", negative_text)
        self.assertTrue(positive_weighted.startswith("(symmetrical face, green eyes, detailed irises:0.8)"))
        self.assertIn("(wooden tables, warm interior:0.35)", positive_weighted)
        self.assertIn("(asymmetrical eyes:0.8)", negative_weighted)

    def test_compiles_global_background_and_enabled_regions(self):
        clip = FakeClip()
        positive, negative = compile_native_conditioning(fixture(), clip)
        self.assertEqual(len(positive), 5)
        self.assertEqual(len(negative), 5)
        self.assertNotIn("mask", positive[0][1])
        self.assertEqual([item[1]["mask_strength"] for item in positive[1:]], [1.0, 1.0, 0.9, 0.7])
        self.assertTrue(all(tuple(item[1]["mask"].shape) == (1, 48, 64) for item in positive[1:]))
        self.assertIn("symmetrical face, green eyes, detailed irises", clip.encoded)
        self.assertFalse(any("@<" in text for text in clip.encoded))

    def test_detailer_only_regions_are_excluded_from_generation(self):
        document = fixture()
        document["version"] = 2
        for region in document["regions"]:
            region["usage"] = "generation"
        document["regions"][0]["usage"] = "detailer"
        clip = FakeClip()
        positive, _ = compile_native_conditioning(document, clip)
        self.assertEqual(len(positive), 4)
        self.assertNotIn(document["regions"][0]["prompts"]["positive_source"], clip.encoded)

    def test_zero_out_mirrors_positive_structure_and_zeroes_embeddings(self):
        document = fixture()
        document["negative_mode"] = "zero_out"
        positive, negative = compile_native_conditioning(document, FakeClip())
        self.assertEqual(len(negative), len(positive))
        for positive_item, negative_item in zip(positive, negative):
            self.assertTrue(torch.count_nonzero(negative_item[0]) == 0)
            self.assertTrue(torch.count_nonzero(negative_item[1]["pooled_output"]) == 0)
            self.assertEqual("mask" in positive_item[1], "mask" in negative_item[1])

    def test_auto_uses_zero_out_when_all_negative_sources_are_empty(self):
        document = copy.deepcopy(fixture())
        document["negative_mode"] = "auto"
        document["prompts"]["global"]["negative_source"] = ""
        document["prompts"]["background"]["negative_source"] = ""
        for region in document["regions"]:
            region["prompts"]["negative_source"] = ""
        positive, negative = compile_native_conditioning(document, FakeClip())
        self.assertEqual(len(negative), len(positive))
        self.assertTrue(all(torch.count_nonzero(item[0]) == 0 for item in negative))

    def test_empty_global_uses_only_masked_region_conditioning(self):
        document = copy.deepcopy(fixture())
        document["prompts"]["global"]["positive_source"] = ""
        document["prompts"]["background"]["positive_source"] = ""
        clip = FakeClip()
        positive, _ = compile_native_conditioning(document, clip)
        self.assertTrue(positive)
        self.assertTrue(all("mask" in metadata for _, metadata in positive))
        self.assertNotIn("", clip.encoded)

    def test_empty_positive_document_gets_unmasked_empty_fallback(self):
        document = copy.deepcopy(fixture())
        document["prompts"]["global"]["positive_source"] = ""
        document["prompts"]["background"]["positive_source"] = ""
        for region in document["regions"]:
            region["prompts"]["positive_source"] = ""
        positive, _ = compile_native_conditioning(document, FakeClip())
        self.assertEqual(len(positive), 1)
        self.assertNotIn("mask", positive[0][1])

    def test_region_strength_multiplier_scales_only_regions(self):
        positive, _ = compile_native_conditioning(fixture(), FakeClip(), 0.5)
        self.assertEqual(
            [item[1]["mask_strength"] for item in positive[1:]],
            [1.0, 0.5, 0.45, 0.35],
        )

    def test_region_strength_multiplier_rejects_invalid_values(self):
        for value in (-0.1, float("nan"), float("inf")):
            with self.subTest(value=value), self.assertRaises(ValueError):
                compile_native_conditioning(fixture(), FakeClip(), value)

    def test_mask_bounds_uses_comfy_mask_bounding_areas(self):
        positive, negative = compile_native_conditioning(
            fixture(), FakeClip(), composition_mode="mask_bounds"
        )
        self.assertNotIn("set_area_to_bounds", positive[0][1])
        self.assertTrue(all(item[1]["set_area_to_bounds"] for item in positive[1:]))
        self.assertTrue(all(item[1]["set_area_to_bounds"] for item in negative[1:]))

    def test_mask_bounds_rejects_anima_before_ksampler_mask_processing(self):
        with self.assertRaisesRegex(ValueError, "mask_bounds is not supported with Anima"):
            compile_native_conditioning(
                fixture(), FakeAnimaClip(), composition_mode="mask_bounds"
            )

    def test_exclusive_combines_global_text_per_scope_without_unmasked_conditioning(self):
        document = copy.deepcopy(fixture())
        document["prompts"]["global"]["positive_source"] = "global style"
        document["prompts"]["background"]["positive_source"] = "forest"
        enabled = [region for region in document["regions"] if region["enabled"]]
        for index, region in enumerate(enabled):
            region["prompts"]["positive_source"] = f"subject {index}"
        clip = FakeClip()

        positive, _ = compile_native_conditioning(
            document, clip, composition_mode="exclusive"
        )

        self.assertEqual(len(positive), 1 + len(enabled))
        self.assertTrue(all("mask" in metadata for _, metadata in positive))
        self.assertIn("global style, forest", clip.encoded)
        for index in range(len(enabled)):
            self.assertIn(f"global style, subject {index}", clip.encoded)

    def test_hybrid_endpoints_match_exclusive_and_blend_layouts(self):
        document = fixture()
        exclusive, _ = compile_native_conditioning(document, FakeClip(), composition_mode="exclusive")
        hybrid_exclusive, _ = compile_native_conditioning(
            document, FakeClip(), composition_mode="hybrid", hybrid_blend_ratio=0
        )
        blend, _ = compile_native_conditioning(document, FakeClip(), composition_mode="blend")
        hybrid_blend, _ = compile_native_conditioning(
            document, FakeClip(), composition_mode="hybrid", hybrid_blend_ratio=1
        )
        for expected, actual in ((exclusive, hybrid_exclusive), (blend, hybrid_blend)):
            self.assertEqual(len(actual), len(expected))
            for (expected_embedding, expected_metadata), (actual_embedding, actual_metadata) in zip(expected, actual):
                self.assertTrue(torch.equal(actual_embedding, expected_embedding))
                self.assertEqual(set(actual_metadata), set(expected_metadata))
                for key in actual_metadata:
                    if isinstance(actual_metadata[key], torch.Tensor):
                        self.assertTrue(torch.equal(actual_metadata[key], expected_metadata[key]))
                    else:
                        self.assertEqual(actual_metadata[key], expected_metadata[key])

    def test_hybrid_weights_blend_and_exclusive_groups(self):
        document = fixture()
        positive, _ = compile_native_conditioning(
            document, FakeClip(), composition_mode="hybrid", hybrid_blend_ratio=0.25
        )
        blend_count = 1 + 1 + len([region for region in document["regions"] if region["enabled"]])
        self.assertEqual(positive[0][1]["strength"], 0.25)
        self.assertTrue(all(item[1]["mask_strength"] <= 0.25 for item in positive[1:blend_count]))
        self.assertEqual(positive[blend_count][1]["mask_strength"], 0.75)

    def test_hybrid_rejects_invalid_blend_ratio(self):
        for ratio in (-0.1, 1.1, float("nan"), float("inf")):
            with self.subTest(ratio=ratio), self.assertRaisesRegex(ValueError, "hybrid_blend_ratio"):
                compile_native_conditioning(
                    fixture(), FakeClip(), composition_mode="hybrid", hybrid_blend_ratio=ratio
                )

    def test_exclusive_keeps_scope_specific_lora_hooks(self):
        document = fixture()
        global_hooks, region_hooks = FakeHookGroup(), FakeHookGroup()
        hook_module = types.ModuleType("comfy.hooks")
        hook_module.EnumWeightTarget = types.SimpleNamespace(Clip="clip")
        hook_module.create_target_dict = lambda target: {"target": target}
        comfy_module = types.ModuleType("comfy")
        comfy_module.hooks = hook_module
        region_id = next(region["id"] for region in document["regions"] if region["enabled"])
        with unittest.mock.patch.dict(sys.modules, {"comfy": comfy_module, "comfy.hooks": hook_module}):
            positive, _ = compile_native_conditioning(
                document,
                FakeHookClip(),
                hooks_by_scope={"background": global_hooks, region_id: region_hooks},
                composition_mode="exclusive",
            )
        self.assertIs(positive[0][1]["hooks"], global_hooks)
        matching = [item for item in positive[1:] if item[1].get("hooks") is region_hooks]
        self.assertEqual(len(matching), 1)

    def test_rejects_unknown_composition_mode(self):
        with self.assertRaisesRegex(ValueError, "composition_mode"):
            compile_native_conditioning(fixture(), FakeClip(), composition_mode="unknown")

    def test_scope_hooks_are_encoded_and_attached_to_matching_conditioning(self):
        document = fixture()
        global_hooks, region_hooks = FakeHookGroup(), FakeHookGroup()
        hook_module = types.ModuleType("comfy.hooks")
        hook_module.EnumWeightTarget = types.SimpleNamespace(Clip="clip")
        hook_module.create_target_dict = lambda target: {"target": target}
        comfy_module = types.ModuleType("comfy")
        comfy_module.hooks = hook_module
        with unittest.mock.patch.dict(sys.modules, {"comfy": comfy_module, "comfy.hooks": hook_module}):
            positive, negative = compile_native_conditioning(
                document,
                FakeHookClip(),
                hooks_by_scope={"global": global_hooks, "background": global_hooks, document["regions"][0]["id"]: region_hooks},
            )
        self.assertIs(positive[0][1]["hooks"], global_hooks)
        self.assertIs(positive[1][1]["hooks"], global_hooks)
        self.assertIs(positive[2][1]["hooks"], region_hooks)
        self.assertIs(negative[0][1]["hooks"], global_hooks)


if __name__ == "__main__":
    unittest.main()

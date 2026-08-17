import copy
import json
from pathlib import Path
import sys
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.native_conditioning import compile_native_conditioning  # noqa: E402


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


class RegionalNativeConditioningTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()

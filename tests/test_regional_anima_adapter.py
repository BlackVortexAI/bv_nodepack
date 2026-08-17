import copy
import json
from pathlib import Path
import sys
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.anima_adapter import compile_anima_adapter  # noqa: E402


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


class RegionalAnimaAdapterTests(unittest.TestCase):
    def test_compiles_regions_into_external_patcher_compatible_chain(self):
        positive, negative, chain, background = compile_anima_adapter(fixture(), FakeClip())
        regions = chain.flatten()
        self.assertTrue(positive)
        self.assertTrue(negative)
        self.assertTrue(background)
        self.assertEqual(len(regions), 3)
        self.assertEqual([region.weight for region in regions], [1.0, 0.9, 0.7])
        self.assertTrue(all(tuple(region.mask.shape) == (1, 48, 64) for region in regions))

    def test_empty_global_uses_background_as_sampler_base(self):
        document = copy.deepcopy(fixture())
        document["prompts"]["global"]["positive_source"] = ""
        clip = FakeClip()
        compile_anima_adapter(document, clip)
        self.assertEqual(clip.encoded[0], "wooden tables, warm interior")

    def test_auto_zeroes_negative_when_global_negative_is_empty(self):
        document = copy.deepcopy(fixture())
        document["negative_mode"] = "auto"
        document["prompts"]["global"]["negative_source"] = ""
        positive, negative, _, _ = compile_anima_adapter(document, FakeClip())
        self.assertEqual(len(positive), len(negative))
        self.assertTrue(all(torch.count_nonzero(item[0]) == 0 for item in negative))

    def test_rejects_document_without_usable_regions(self):
        document = copy.deepcopy(fixture())
        for region in document["regions"]:
            region["enabled"] = False
        with self.assertRaisesRegex(ValueError, "at least one enabled region"):
            compile_anima_adapter(document, FakeClip())


if __name__ == "__main__":
    unittest.main()

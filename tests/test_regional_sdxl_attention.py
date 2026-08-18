from pathlib import Path
import copy
import json
import math
import sys
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.sdxl_attention import (  # noqa: E402
    SDXLRegionalSlot,
    _factor_grid,
    _require_sdxl_base_model,
    build_cross_attention_bias,
    compile_sdxl_attention,
)


def fixture():
    path = ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json"
    with path.open(encoding="utf-8") as handle:
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


def _slot(name, mask, strength=1.0, tokens=2):
    embedding = torch.zeros((1, tokens, 4))
    return SDXLRegionalSlot(name, mask, strength, embedding, embedding.clone())


class RegionalSDXLAttentionTests(unittest.TestCase):
    def test_model_patcher_uses_direct_base_model_member(self):
        class FakeSDXL:
            pass

        class FakeModelPatcher:
            model = FakeSDXL()

            def get_model_object(self, name):
                raise AssertionError(f"must not resolve nested model path: {name}")

        patcher = FakeModelPatcher()
        self.assertIs(_require_sdxl_base_model(patcher, FakeSDXL), patcher.model)

    def test_non_sdxl_model_fails_with_backend_error(self):
        class FakeSDXL:
            pass

        with self.assertRaisesRegex(RuntimeError, "only SDXL-family"):
            _require_sdxl_base_model(type("Patcher", (), {"model": object()})(), FakeSDXL)

    def test_compiles_global_background_and_enabled_regions_into_one_context(self):
        clip = FakeClip()
        positive, negative, slots, aspect_ratio = compile_sdxl_attention(fixture(), clip)
        self.assertEqual([slot.name for slot in slots], [
            "global", "background", "Person left", "Face left", "Blue umbrella"
        ])
        self.assertIsNone(slots[0].mask)
        self.assertEqual(tuple(slots[1].mask.shape), (1, 48, 64))
        self.assertEqual(tuple(positive[0][0].shape), (1, 10, 3))
        self.assertEqual(tuple(negative[0][0].shape), (1, 10, 3))
        self.assertAlmostEqual(aspect_ratio, 64 / 48)
        self.assertFalse(any("@<" in text for text in clip.encoded))

    def test_zero_out_preserves_slot_layout_and_zeroes_negative_context(self):
        document = copy.deepcopy(fixture())
        document["negative_mode"] = "zero_out"
        positive, negative, slots, _ = compile_sdxl_attention(document, FakeClip())
        self.assertEqual(positive[0][0].shape, negative[0][0].shape)
        self.assertEqual(len(slots), 5)
        self.assertEqual(torch.count_nonzero(negative[0][0]), 0)
        self.assertEqual(torch.count_nonzero(negative[0][1]["pooled_output"]), 0)

    def test_factor_grid_preserves_landscape_aspect(self):
        self.assertEqual(_factor_grid(24, 1.5), (4, 6))

    def test_cross_attention_keeps_global_visible_and_routes_joint_overlap(self):
        left = torch.tensor([[[1.0, 1.0], [0.0, 1.0]]])
        right = torch.tensor([[[0.0, 1.0], [1.0, 1.0]]])
        slots = [_slot("global", None), _slot("left", left), _slot("right", right)]
        bias = build_cross_attention_bias(
            slots, 4, 6, 1.0, 1.0, torch.device("cpu"), torch.float32
        )[0]
        self.assertTrue(torch.all(bias[:, :2] == 0))
        self.assertTrue(torch.all(bias[0, 2:4] == 0))
        self.assertTrue(torch.all(torch.isneginf(bias[0, 4:6])))
        self.assertTrue(torch.all(bias[1, 2:6] == 0))
        self.assertTrue(torch.all(bias[3, 2:6] == 0))

    def test_region_strength_becomes_soft_attention_penalty(self):
        mask = torch.ones((1, 1, 1))
        slots = [_slot("global", None, tokens=1), _slot("region", mask, strength=0.5, tokens=1)]
        bias = build_cross_attention_bias(
            slots, 1, 2, 1.0, 1.0, torch.device("cpu"), torch.float32
        )[0]
        self.assertAlmostEqual(float(bias[0, 1]), math.log(0.5), places=6)

    def test_context_length_mismatch_fails_closed(self):
        slots = [_slot("global", None)]
        with self.assertRaisesRegex(RuntimeError, "expected"):
            build_cross_attention_bias(
                slots, 4, 3, 1.0, 1.0, torch.device("cpu"), torch.float32
            )


if __name__ == "__main__":
    unittest.main()

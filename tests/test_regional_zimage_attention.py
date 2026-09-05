from pathlib import Path
import json
import math
import sys
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.zimage_attention import (  # noqa: E402
    ZImageRegionalSlot,
    _require_zimage_base_model,
    build_joint_attention_bias,
    compile_zimage_attention,
)
from util.regional.context import normalize_context  # noqa: E402


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        document = json.load(handle)
    document["canvas"] = {"width": 8, "height": 8}
    return document


class FakeClip:
    def __init__(self):
        self.encoded = []

    def tokenize(self, text):
        return text

    def encode_from_tokens_scheduled(self, tokens):
        self.encoded.append(tokens)
        value = float(len(self.encoded))
        return [[
            torch.full((1, 3, 4), value),
            {
                "attention_mask": torch.ones((1, 3)),
                "pooled_output": torch.full((1, 4), value),
            },
        ]]


def slot(name, mask, strength=1.0, tokens=2):
    return ZImageRegionalSlot(name, mask, strength, tokens)


class RegionalZImageAttentionTests(unittest.TestCase):
    def test_v3_context_compiles_through_existing_consumer(self):
        _, _, slots, aspect = compile_zimage_attention(normalize_context(fixture()), FakeClip())
        self.assertEqual(slots[0].name, "global")
        self.assertGreater(aspect, 0)

    def test_compiler_concatenates_slots_and_preserves_prompt_negative(self):
        positive, negative, slots, aspect = compile_zimage_attention(fixture(), FakeClip())
        self.assertEqual([s.name for s in slots], [
            "global", "background", "Person left", "Face left", "Blue umbrella"
        ])
        self.assertEqual(tuple(positive[0][0].shape), (1, 15, 4))
        self.assertEqual(tuple(positive[0][1]["attention_mask"].shape), (1, 15))
        self.assertGreater(torch.count_nonzero(negative[0][0]), 0)
        self.assertGreater(torch.count_nonzero(negative[0][1]["pooled_output"]), 0)
        self.assertEqual(aspect, 1.0)

    def test_joint_bias_keeps_text_and_image_attention_open_but_routes_image_to_text(self):
        left = torch.tensor([[[1.0, 1.0], [0.0, 1.0]]])
        right = torch.tensor([[[0.0, 1.0], [1.0, 1.0]]])
        slots = [slot("global", None), slot("left", left), slot("right", right)]
        bias = build_joint_attention_bias(
            slots, text_tokens=8, image_height=4, image_width=4, patch_size=2,
            image_tokens=4, strength=1.0, device=torch.device("cpu"),
            dtype=torch.float32, batch=1,
        )[0, 0]
        self.assertEqual(tuple(bias.shape), (12, 12))
        self.assertTrue(torch.all(bias[:8] == 0))
        self.assertTrue(torch.all(bias[8:, 6:] == 0))
        self.assertTrue(torch.all(bias[8, :4] == 0))
        self.assertTrue(torch.all(torch.isneginf(bias[8, 4:6])))
        self.assertTrue(torch.all(bias[9, :6] == 0))

    def test_strength_is_a_soft_log_attention_penalty(self):
        slots = [slot("global", None, tokens=1), slot("region", torch.ones((1, 1, 1)), 0.5, 1)]
        bias = build_joint_attention_bias(
            slots, 2, 2, 2, 2, 1, 1.0, torch.device("cpu"), torch.float32, 1
        )
        self.assertAlmostEqual(float(bias[0, 0, 2, 1]), math.log(0.5), places=6)

    def test_text_padding_is_left_open(self):
        slots = [slot("global", None, tokens=1), slot("region", torch.ones((1, 1, 1)), tokens=1)]
        bias = build_joint_attention_bias(
            slots, 4, 2, 2, 2, 1, 1.0, torch.device("cpu"), torch.float32, 1
        )
        self.assertTrue(torch.all(bias[..., :4, :] == 0))
        self.assertEqual(float(bias[0, 0, 4, 2]), 0.0)

    def test_model_validation_rejects_non_lumina(self):
        class FakeLumina:
            pass

        with self.assertRaisesRegex(RuntimeError, "only Z-Image"):
            _require_zimage_base_model(type("Patcher", (), {"model": object()})(), FakeLumina)


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
import json
import math
import sys
import unittest

import torch


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.krea2_attention import (  # noqa: E402
    Krea2AttentionPatch,
    Krea2RegionalSlot,
    _grid_for_tokens,
    _require_krea2,
    build_krea2_joint_attention_bias,
    compile_krea2_attention,
)


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(
        encoding="utf-8"
    ) as handle:
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
        is_negative = len(self.encoded) % 2 == 0
        active = 2 if is_negative else 3
        value = -float(len(self.encoded)) if is_negative else float(len(self.encoded))
        embedding = torch.full((1, 5, 30_720), value)
        attention = torch.zeros((1, 5), dtype=torch.float32)
        attention[:, :active] = 1
        return [[embedding, {
            "attention_mask": attention,
            "pooled_output": torch.full((1, 4), value),
        }]]


class FakeClipWithoutAttentionMask(FakeClip):
    def encode_from_tokens_scheduled(self, tokens):
        self.encoded.append(tokens)
        value = float(len(self.encoded))
        return [[
            torch.full((1, 5, 30_720), value),
            {"pooled_output": torch.full((1, 4), value)},
        ]]


def slot(name, mask, strength=1.0, tokens=2):
    return Krea2RegionalSlot(name, mask, strength, tokens)


class RegionalKrea2AttentionTests(unittest.TestCase):
    def test_compiler_treats_missing_krea_attention_mask_as_all_tokens_active(self):
        positive, negative, slots, _ = compile_krea2_attention(
            fixture(), FakeClipWithoutAttentionMask()
        )
        self.assertEqual([item.token_count for item in slots], [5, 5, 5, 5, 5])
        self.assertEqual(tuple(positive[0][0].shape), (1, 25, 30_720))
        self.assertEqual(tuple(negative[0][0].shape), (1, 25, 30_720))
        self.assertEqual(int(positive[0][1]["attention_mask"].sum()), 25)
        self.assertEqual(int(negative[0][1]["attention_mask"].sum()), 25)

    def test_compiler_preserves_raw_negative_conditioning_and_pair_pads_slots(self):
        positive, negative, slots, aspect = compile_krea2_attention(fixture(), FakeClip())
        self.assertEqual([item.name for item in slots], [
            "global", "background", "Person left", "Face left", "Blue umbrella"
        ])
        self.assertEqual([item.token_count for item in slots], [3, 3, 3, 3, 3])
        self.assertEqual(tuple(positive[0][0].shape), (1, 15, 30_720))
        self.assertEqual(tuple(negative[0][0].shape), (1, 15, 30_720))
        self.assertEqual(int(positive[0][1]["attention_mask"].sum()), 15)
        self.assertEqual(int(negative[0][1]["attention_mask"].sum()), 10)
        self.assertLess(float(negative[0][0].min()), 0.0)
        self.assertEqual(positive[0][1]["bv_krea2_text_fusion_routing"], False)
        self.assertEqual(aspect, 1.0)

    def test_grid_factorization_tracks_canvas_aspect(self):
        self.assertEqual(_grid_for_tokens(4096, 1.0), (64, 64))
        self.assertEqual(_grid_for_tokens(6144, 1.5), (64, 96))

    def test_joint_bias_routes_regions_and_leaves_image_attention_open(self):
        left = torch.tensor([[[1.0, 1.0], [0.0, 1.0]]])
        right = torch.tensor([[[0.0, 1.0], [1.0, 1.0]]])
        slots = [slot("global", None), slot("left", left), slot("right", right)]
        bias = build_krea2_joint_attention_bias(
            slots, text_tokens=8, target_image_tokens=4, reference_image_tokens=1,
            aspect_ratio=1.0, routing_strength=1.0, device=torch.device("cpu"),
            dtype=torch.float32, batch=1,
        )[0, 0]
        self.assertEqual(tuple(bias.shape), (13, 13))
        self.assertTrue(torch.all(torch.isneginf(bias[:, :2])))
        self.assertTrue(torch.all(bias[8:12, 8:] == 0))
        self.assertTrue(torch.all(bias[8, 2:6] == 0))
        self.assertTrue(torch.all(torch.isneginf(bias[8, 6:8])))
        self.assertTrue(torch.all(torch.isneginf(bias[12, 4:8])))

    def test_region_strength_is_log_attention_penalty(self):
        slots = [slot("global", None, tokens=1), slot("region", torch.ones((1, 1, 1)), 0.5, 1)]
        bias = build_krea2_joint_attention_bias(
            slots, 2, 1, 0, 1.0, 1.0, torch.device("cpu"), torch.float32, 1
        )
        self.assertAlmostEqual(float(bias[0, 0, 2, 1]), math.log(0.5), places=6)

    def test_patch_obeys_sampling_window_and_merges_existing_mask(self):
        patch = Krea2AttentionPatch(
            [slot("global", None, tokens=1), slot("region", torch.ones((1, 1, 1)), tokens=1)],
            1.0, 1.0, 10.0, 5.0,
        )
        q = torch.zeros((1, 48, 3, 128))
        existing = torch.full((1, 1, 3, 3), -0.25)
        active = patch(
            q, q, q, attn_mask=existing,
            extra_options={"img_slice": [2, 3], "sigmas": torch.tensor([7.0])},
        )["attn_mask"]
        inactive = patch(
            q, q, q,
            extra_options={"img_slice": [2, 3], "sigmas": torch.tensor([2.0])},
        )["attn_mask"]
        self.assertAlmostEqual(float(active[0, 0, 2, 0]), -0.25, places=6)
        self.assertTrue(torch.isneginf(inactive[0, 0, 2, 1]))

    def test_architecture_gate_accepts_exact_krea2_and_rejects_drift(self):
        class Krea2Base:
            pass

        fusion = type("Fusion", (), {
            "layerwise_blocks": [object(), object()],
            "refiner_blocks": [object(), object()],
        })()
        diffusion = type("Diffusion", (), {
            "patch": 2, "channels": 16, "tdim": 256, "heads": 48,
            "txtdim": 2560, "txtlayers": 12,
            "blocks": [object()] * 28,
            "first": type("First", (), {"out_features": 6144})(),
            "txtfusion": fusion,
        })()
        base = Krea2Base()
        base.diffusion_model = diffusion
        base.model_config = type("Config", (), {"unet_config": {"image_model": "krea2"}})()
        patcher = type("Patcher", (), {"model": base})()
        self.assertIs(_require_krea2(patcher, Krea2Base), base)
        diffusion.heads = 24
        with self.assertRaisesRegex(RuntimeError, "heads"):
            _require_krea2(patcher, Krea2Base)


if __name__ == "__main__":
    unittest.main()

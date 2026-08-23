from pathlib import Path
import json
import math
import sys
import unittest

import torch


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.flux2_klein_attention import (  # noqa: E402
    Flux2KleinAttentionPatch,
    Flux2KleinRegionalSlot,
    _grid_for_tokens,
    _require_flux2_klein_9b,
    build_flux2_joint_attention_bias,
    compile_flux2_klein_attention,
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
        embedding = torch.full((1, 6, 12_288), value)
        return [[embedding, {
            "attention_mask": torch.tensor([[1, 1, 1, 0, 0, 0]], dtype=torch.float32),
            "pooled_output": torch.full((1, 4), value),
        }]]


def slot(name, mask, strength=1.0, tokens=2):
    return Flux2KleinRegionalSlot(name, mask, strength, tokens)


class RegionalFlux2KleinAttentionTests(unittest.TestCase):
    def test_v3_context_compiles_through_existing_consumer(self):
        _, _, slots, aspect = compile_flux2_klein_attention(normalize_context(fixture()), FakeClip())
        self.assertEqual(slots[0].name, "global")
        self.assertGreater(aspect, 0)

    def test_compiler_trims_per_prompt_padding_then_left_pads_combined_context(self):
        positive, negative, slots, aspect = compile_flux2_klein_attention(fixture(), FakeClip())
        self.assertEqual([item.name for item in slots], [
            "global", "background", "Person left", "Face left", "Blue umbrella"
        ])
        self.assertEqual([item.token_count for item in slots], [3, 3, 3, 3, 3])
        self.assertEqual(tuple(positive[0][0].shape), (1, 512, 12_288))
        self.assertEqual(int(positive[0][1]["attention_mask"].sum()), 15)
        self.assertEqual(positive[0][1]["bv_regional_prefix_padding"], 497)
        self.assertEqual(torch.count_nonzero(negative[0][0]), 0)
        self.assertEqual(torch.count_nonzero(negative[0][1]["pooled_output"]), 0)
        self.assertEqual(aspect, 1.0)

    def test_grid_factorization_tracks_canvas_aspect(self):
        self.assertEqual(_grid_for_tokens(4096, 1.0), (64, 64))
        self.assertEqual(_grid_for_tokens(6144, 1.5), (64, 96))

    def test_joint_bias_routes_target_queries_and_keeps_image_attention_open(self):
        left = torch.tensor([[[1.0, 1.0], [0.0, 1.0]]])
        right = torch.tensor([[[0.0, 1.0], [1.0, 1.0]]])
        slots = [slot("global", None), slot("left", left), slot("right", right)]
        bias = build_flux2_joint_attention_bias(
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
        bias = build_flux2_joint_attention_bias(
            slots, 2, 1, 0, 1.0, 1.0, torch.device("cpu"), torch.float32, 1
        )
        self.assertAlmostEqual(float(bias[0, 0, 2, 1]), math.log(0.5), places=6)

    def test_patch_uses_same_mask_contract_for_double_and_single_blocks(self):
        patch = Flux2KleinAttentionPatch(
            [slot("global", None, tokens=1), slot("region", torch.ones((1, 1, 1)), tokens=1)],
            1.0, 1.0, 10.0, 0.0,
        )
        q = torch.zeros((1, 32, 3, 128))
        for block_type in ("double", "single"):
            result = patch(
                q, q, q,
                extra_options={"img_slice": [2, 3], "block_type": block_type},
            )
            self.assertEqual(tuple(result["attn_mask"].shape), (1, 1, 3, 3))

    def test_architecture_gate_accepts_exact_9b_and_rejects_klein_4b(self):
        class Flux2Base:
            pass

        params = type("Params", (), {
            "in_channels": 128, "out_channels": 128, "context_in_dim": 12_288,
            "hidden_size": 4_096, "num_heads": 32, "depth": 8,
            "depth_single_blocks": 24, "patch_size": 1, "theta": 2_000,
            "qkv_bias": False, "global_modulation": True,
            "axes_dim": [32, 32, 32, 32],
        })()
        base = Flux2Base()
        base.diffusion_model = type("Diffusion", (), {"params": params})()
        base.model_config = type("Config", (), {"unet_config": {"image_model": "flux2"}})()
        patcher = type("Patcher", (), {"model": base})()
        self.assertIs(_require_flux2_klein_9b(patcher, Flux2Base), base)
        params.hidden_size = 3_072
        with self.assertRaisesRegex(RuntimeError, "hidden_size"):
            _require_flux2_klein_9b(patcher, Flux2Base)


if __name__ == "__main__":
    unittest.main()

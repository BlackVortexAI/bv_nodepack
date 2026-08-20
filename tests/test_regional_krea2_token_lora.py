from pathlib import Path
import sys
import unittest

import torch
import torch.nn.functional as F


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.krea2_attention import Krea2RegionalSlot  # noqa: E402
from util.regional.krea2_token_lora import (  # noqa: E402
    TokenLoRASpec,
    _RUNTIME,
    _RuntimeContext,
    _apply_kronecker,
    _normalize_lora_state,
    _patched_module,
    build_token_lora_specs,
    build_token_masks,
)


class RegionalKrea2TokenLoRATests(unittest.TestCase):
    def test_specs_collapse_inherited_global_entries_but_preserve_duplicates(self):
        stacks = {
            "global": [("global.safetensors", 0.8, 0.0)],
            "background": [("global.safetensors", 0.8, 0.0)],
            "region-a": [
                ("global.safetensors", 0.8, 0.0),
                ("local.safetensors", 1.2, 0.0),
                ("local.safetensors", 1.2, 0.0),
            ],
        }

        specs = build_token_lora_specs(stacks)

        self.assertEqual(len(specs), 3)
        global_spec = next(item for item in specs if item.path == "global.safetensors")
        self.assertEqual(global_spec.scopes, frozenset({"global", "background", "region-a"}))
        local_specs = [item for item in specs if item.path == "local.safetensors"]
        self.assertEqual(len(local_specs), 2)
        self.assertTrue(all(item.scopes == frozenset({"region-a"}) for item in local_specs))

    def test_standard_lora_keys_are_normalized_for_krea_module_lookup(self):
        state = {
            "diffusion_model.blocks.0.linear.lora_down.weight": torch.ones((2, 4)),
            "diffusion_model.blocks.0.linear.lora_up.weight": torch.ones((6, 2)),
            "diffusion_model.blocks.0.linear.alpha": torch.tensor(1.0),
        }

        normalized = _normalize_lora_state(state)

        self.assertEqual(set(normalized), {"blocks.0.linear"})
        self.assertEqual(normalized["blocks.0.linear"]["kind"], "lora")
        self.assertEqual(normalized["blocks.0.linear"]["alpha"], 1.0)

    def test_lokr_activation_math_matches_materialized_kronecker_weight(self):
        value = torch.arange(1.0, 7.0).reshape(1, 1, 6)
        w1 = torch.tensor([[1.0, 2.0], [0.5, -1.0]])
        w2 = torch.tensor([[1.0, 0.0, -1.0], [0.5, 2.0, 1.0]])

        actual = _apply_kronecker(value, w1, w2)
        expected = F.linear(value, torch.kron(w1, w2))

        self.assertTrue(torch.allclose(actual, expected))

    def test_masks_gate_region_text_and_target_image_but_not_reference_tokens(self):
        region_mask = torch.tensor([[[1.0, 0.0], [0.0, 1.0]]])
        slots = [
            Krea2RegionalSlot("global", None, 1.0, 2, "global"),
            Krea2RegionalSlot("left", region_mask, 1.0, 2, "region-a"),
        ]
        regional = TokenLoRASpec("local", "local.safetensors", 1.0, frozenset({"region-a"}))
        global_spec = TokenLoRASpec("global", "global.safetensors", 1.0, frozenset({"global"}))

        masks = build_token_masks(
            [regional, global_spec], slots, text_tokens=5, target_image_tokens=4,
            reference_image_tokens=2, aspect_ratio=1.0, device=torch.device("cpu"),
        )

        local = masks["local"][0, :, 0]
        self.assertEqual(local.tolist(), [0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0])
        self.assertTrue(torch.all(masks["global"] == 1.0))

    def test_region_lora_keeps_its_image_mask_when_the_region_has_no_prompt_slot(self):
        region_mask = torch.tensor([[[0.0, 1.0], [1.0, 0.0]]])
        slots = [Krea2RegionalSlot("global", None, 1.0, 2, "global")]
        regional = TokenLoRASpec(
            "local", "local.safetensors", 1.0, frozenset({"region-without-prompt"})
        )

        masks = build_token_masks(
            [regional], slots, text_tokens=2, target_image_tokens=4,
            reference_image_tokens=0, aspect_ratio=1.0, device=torch.device("cpu"),
            scope_masks={"region-without-prompt": region_mask},
        )

        self.assertEqual(masks["local"][0, :, 0].tolist(), [0.0, 0.0, 0.0, 1.0, 1.0, 0.0])

    def test_patched_linear_applies_delta_only_to_masked_tokens(self):
        linear = torch.nn.Linear(2, 2, bias=False)
        linear.weight.data.zero_()
        patched = _patched_module(linear)
        patched.bv_krea2_token_adapters["adapter"] = (
            "lora", torch.eye(2), torch.eye(2), 1.0,
        )
        runtime = _RuntimeContext(
            token_masks={"adapter": torch.tensor([[[1.0], [0.0], [0.5]]])},
            text_tokens=1,
            image_tokens=2,
            text_layers=12,
        )
        token = _RUNTIME.set(runtime)
        try:
            output = patched(torch.ones((1, 3, 2)))
        finally:
            _RUNTIME.reset(token)

        self.assertTrue(torch.equal(output[0, 0], torch.ones(2)))
        self.assertTrue(torch.equal(output[0, 1], torch.zeros(2)))
        self.assertTrue(torch.equal(output[0, 2], torch.full((2,), 0.5)))


if __name__ == "__main__":
    unittest.main()

from pathlib import Path
import sys
import types
import unittest

import torch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT.parents[1]))
sys.path.insert(0, str(ROOT / "py"))

# These unit tests exercise the pure attention-bias helpers. ComfyUI supplies
# this module at runtime, but the standalone CI test environment intentionally
# does not install the full application.
comfy_module = types.ModuleType("comfy")
comfy_module.__path__ = []
patcher_extension_module = types.ModuleType("comfy.patcher_extension")
comfy_module.patcher_extension = patcher_extension_module
sys.modules["comfy"] = comfy_module
sys.modules["comfy.patcher_extension"] = patcher_extension_module

from util.regional.anima_patcher import (  # noqa: E402
    WRAPPER_KEY,
    _build_flux_cross_attention_bias,
    _build_flux_self_attention_bias,
)


class RegionalAnimaPatcherTests(unittest.TestCase):
    def test_uses_bv_specific_wrapper_key(self):
        self.assertEqual(WRAPPER_KEY, "bv_anima_regional_conditioning")

    def test_cross_attention_bias_preserves_overlap_membership(self):
        masks = torch.tensor(
            [
                [False, False, False],
                [True, True, False],
                [False, True, True],
            ]
        )
        bias = _build_flux_cross_attention_bias(
            masks,
            [1, 1, 1],
            "disabled",
            torch.device("cpu"),
            torch.float32,
            slot_strengths=torch.ones(3),
        )[0, 0]
        self.assertEqual(float(bias[0, 1]), 0.0)
        self.assertEqual(float(bias[0, 2]), float("-inf"))
        self.assertEqual(float(bias[1, 1]), 0.0)
        self.assertEqual(float(bias[1, 2]), 0.0)
        self.assertEqual(float(bias[2, 1]), float("-inf"))
        self.assertEqual(float(bias[2, 2]), 0.0)

    def test_self_attention_bias_keeps_shared_region_tokens_connected(self):
        masks = torch.tensor(
            [
                [False, False, False],
                [True, True, False],
                [False, True, True],
            ]
        )
        bias = _build_flux_self_attention_bias(
            masks,
            "disabled",
            1.0,
            torch.device("cpu"),
            torch.float32,
            slot_strengths=torch.ones(3),
        )[0, 0]
        self.assertEqual(float(bias[0, 1]), 0.0)
        self.assertEqual(float(bias[1, 2]), 0.0)
        self.assertEqual(float(bias[0, 2]), float("-inf"))


if __name__ == "__main__":
    unittest.main()

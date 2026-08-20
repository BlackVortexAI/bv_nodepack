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
    _diffusion_model_wrapper,
    _late_image_lora_scale,
)
from util.regional.anima_token_lora import AnimaTokenLoRAPatch  # noqa: E402
from util.regional.krea2_token_lora import (  # noqa: E402
    TokenLoRAReport,
    TokenLoRASpec,
    _RUNTIME,
    _RuntimeContext,
    _patched_module,
)


class RegionalAnimaPatcherTests(unittest.TestCase):
    def test_uses_bv_specific_wrapper_key(self):
        self.assertEqual(WRAPPER_KEY, "bv_anima_regional_conditioning")

    def test_token_lora_masks_region_text_and_spatial_tokens(self):
        local = TokenLoRASpec("local", "local.safetensors", 1.0, frozenset({"left"}))
        global_spec = TokenLoRASpec("global", "global.safetensors", 1.0, frozenset({"global"}))
        patch = AnimaTokenLoRAPatch([local, global_spec], TokenLoRAReport())
        spatial = torch.tensor([
            [0.0, 0.0, 0.0, 0.0],
            [1.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 1.0],
        ])

        masks = patch.masks(
            [2, 2, 1], ["left", "right"], spatial,
            batch_chunks=2, batch_size=1, device=torch.device("cpu"),
        )

        self.assertEqual(
            masks["local"][0, :, 0].tolist(),
            [0.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0],
        )
        self.assertTrue(torch.all(masks["global"] == 1.0))

    def test_token_lora_moves_cpu_spatial_masks_to_the_runtime_device(self):
        local = TokenLoRASpec("local", "local.safetensors", 1.0, frozenset({"left"}))
        patch = AnimaTokenLoRAPatch([local], TokenLoRAReport())
        spatial = torch.tensor([
            [0.0, 0.0, 0.0, 0.0],
            [1.0, 1.0, 0.0, 0.0],
        ], device="cpu")

        masks = patch.masks(
            [2, 2], ["left"], spatial,
            batch_chunks=1, batch_size=1, device=torch.device("meta"),
        )

        self.assertEqual(masks["local"].device.type, "meta")

    def test_token_lora_gates_five_dimensional_anima_activations(self):
        linear = torch.nn.Linear(2, 2, bias=False)
        linear.weight.data.zero_()
        patched = _patched_module(linear)
        patched.bv_krea2_token_adapters["adapter"] = (
            "lora", torch.eye(2), torch.eye(2), 1.0,
        )
        runtime = _RuntimeContext(
            token_masks={
                "adapter": torch.tensor(
                    [[[0.0], [0.0], [1.0], [0.0], [0.5], [0.0]]]
                )
            },
            text_tokens=2,
            image_tokens=4,
            text_layers=-1,
            image_shape=(1, 2, 2),
        )
        token = _RUNTIME.set(runtime)
        try:
            output = patched(torch.ones((1, 1, 2, 2, 2)))
        finally:
            _RUNTIME.reset(token)

        self.assertTrue(torch.equal(output[0, 0, 0, 0], torch.ones(2)))
        self.assertTrue(torch.equal(output[0, 0, 0, 1], torch.zeros(2)))
        self.assertTrue(torch.equal(output[0, 0, 1, 0], torch.full((2,), 0.5)))

    def test_late_sampling_keeps_image_lora_without_regional_text_context(self):
        local = TokenLoRASpec("local", "local.safetensors", 1.0, frozenset({"left"}))
        global_spec = TokenLoRASpec("global", "global.safetensors", 1.0, frozenset({"global"}))
        token_patch = AnimaTokenLoRAPatch([local, global_spec], TokenLoRAReport())

        class LatePatch:
            token_lora = token_patch
            region_masks = [torch.ones((1, 4, 4))]
            region_scopes = ["left"]
            start_sigma = 10.0
            end_sigma = 1.0

            @staticmethod
            def is_active(_options):
                return False

        class FakeModel:
            patch_spatial = 2
            patch_temporal = 1

        class RecordingExecutor:
            class_obj = FakeModel()

            def __init__(self):
                self.context_tokens = None
                self.runtime = None

            def __call__(self, *args, **_kwargs):
                self.context_tokens = int(args[2].shape[1])
                self.runtime = _RUNTIME.get()
                return args[0]

        executor = RecordingExecutor()
        latent = torch.zeros((2, 4, 1, 4, 4))
        context = torch.zeros((2, 3, 8))
        options = {
            WRAPPER_KEY: LatePatch(),
            "cond_or_uncond": [0, 1],
            "sigmas": torch.tensor([0.0]),
        }

        _diffusion_model_wrapper(
            executor, latent, torch.zeros(2), context,
            transformer_options=options,
        )

        self.assertEqual(executor.context_tokens, 3)
        self.assertIsNotNone(executor.runtime)
        self.assertEqual(executor.runtime.text_tokens, 3)
        self.assertEqual(executor.runtime.image_shape, (1, 2, 2))
        local_mask = executor.runtime.token_masks["local"]
        self.assertTrue(torch.all(local_mask[:, :3] == 0))
        self.assertTrue(torch.allclose(local_mask[:, 3:], torch.full_like(local_mask[:, 3:], 0.35)))
        self.assertTrue(torch.all(executor.runtime.token_masks["global"] == 1))

    def test_late_image_lora_scale_decays_linearly_after_attention_window(self):
        class Patch:
            start_sigma = 10.0
            end_sigma = 1.0

        self.assertIsNone(_late_image_lora_scale(Patch(), {"sigmas": torch.tensor([11.0])}))
        self.assertEqual(_late_image_lora_scale(Patch(), {"sigmas": torch.tensor([1.0])}), 1.0)
        self.assertAlmostEqual(
            _late_image_lora_scale(Patch(), {"sigmas": torch.tensor([0.5])}),
            0.675,
        )
        self.assertEqual(_late_image_lora_scale(Patch(), {"sigmas": torch.tensor([0.0])}), 0.35)

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

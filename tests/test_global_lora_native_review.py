"""Independent native CPU proof; no queue, private weights, or runtime export."""
import os
import unittest


@unittest.skipUnless(os.environ.get("BV_NATIVE_COMFY_ROOT"), "requires separate native ComfyUI CPU process")
class NativeGlobalReview(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from test_edit_lora_native import NativeEditLoraTests
        NativeEditLoraTests.setUpClass()

    def test_native_loader_duplicate_delta_and_direct_collector_reentry(self):
        import types
        import torch
        import comfy.model_patcher
        import comfy.sd
        import comfy.utils
        from unittest.mock import patch
        from util.model_patcher import apply_global_patches, OCCURRENCE_MARKER
        from util.regional.lora_v3 import build_lora_provider, reidentify_lora_provider, materialize_lora_capability, LORA_CAPABILITY_REGISTRY

        class TinyModel(torch.nn.Module):
            def __init__(self):
                super().__init__()
                self.diffusion_model = torch.nn.Module()
                self.diffusion_model.projection = torch.nn.Linear(2, 2, bias=False)
                self.diffusion_model.projection.weight.data.fill_(1.)
                self.model_config = types.SimpleNamespace(unet_config={})
            def get_dtype(self):
                return torch.float32

        model = TinyModel()
        base = comfy.model_patcher.ModelPatcher(model, torch.device("cpu"), torch.device("cpu"))
        rid = "22222222-2222-4222-8222-222222222222"
        sid = "33333333-3333-4333-8333-333333333333"
        resource = {"id": sid, "name": "Global", "role": "global", "origin_provider_id": rid,
                    "entry_ids": ["44444444-4444-4444-8444-444444444440", "44444444-4444-4444-8444-444444444441"],
                    "stack": [["synthetic.safetensors", .25, 0.], ["synthetic.safetensors", .25, 0.]]}
        provider = build_lora_provider(rid, {sid: resource})
        collector = reidentify_lora_provider(provider, "55555555-5555-4555-8555-555555555555")
        document = {"schema": "bv.regional", "version": 2, "document_id": "11111111-1111-4111-8111-111111111111",
                    "title": "Synthetic", "canvas": {"width": 64, "height": 64}, "regions": [],
                    "prompts": {"global": {"positive_source": "", "negative_source": ""}, "background": {"positive_source": "", "negative_source": ""}},
                    "negative_mode": "auto", "overlap": {"mode": "joint"}}
        context = materialize_lora_capability(document, collector, registry=LORA_CAPABILITY_REGISTRY)
        direct_context = materialize_lora_capability(document, provider, registry=LORA_CAPABILITY_REGISTRY)
        weights = {"diffusion_model.projection.lora_down.weight": torch.ones(1, 2),
                   "diffusion_model.projection.lora_up.weight": torch.ones(2, 1)}
        with patch("util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch.object(comfy.utils, "load_torch_file", return_value=weights) as load:
            prepared, _ = apply_global_patches(base, None, direct_context)
            result, _ = apply_global_patches(prepared, None, context)
            again, _ = apply_global_patches(result.clone(), None, context)
            opted_out = materialize_lora_capability(context, collector, registry=LORA_CAPABILITY_REGISTRY, apply_global=False)
            with self.assertRaisesRegex(ValueError, "original"):
                apply_global_patches(again, None, opted_out)
        self.assertEqual(load.call_count, 2)
        self.assertIs(result, prepared)
        self.assertEqual(len(prepared.patches["diffusion_model.projection.weight"]), 2)
        self.assertEqual(again.get_attachment(OCCURRENCE_MARKER), prepared.get_attachment(OCCURRENCE_MARKER))
        self.assertFalse(base.patches)
        self.assertIsNone(base.get_attachment(OCCURRENCE_MARKER))
        try:
            again.patch_model()
            torch.testing.assert_close(model.diffusion_model.projection.weight, torch.full((2, 2), 1.5))
        finally:
            again.unpatch_model()
        torch.testing.assert_close(model.diffusion_model.projection.weight, torch.ones(2, 2))

    def test_real_official_diffusers_mapping_matches_native_token_and_time_routes(self):
        import torch
        from util.regional.krea2_lora_routing import plan_krea2_lora_routes
        diffusion = torch.nn.Module()
        diffusion.blocks = torch.nn.ModuleList([torch.nn.Module()])
        diffusion.blocks[0].attn = torch.nn.Module()
        diffusion.blocks[0].attn.wq = torch.nn.Linear(2, 2, bias=False)
        diffusion.tmlp = torch.nn.Sequential(torch.nn.Linear(2, 2), torch.nn.Identity(), torch.nn.Linear(2, 2))
        diffusion.tproj = torch.nn.Sequential(torch.nn.Identity(), torch.nn.Linear(2, 2))
        class Model:
            def get_model_object(self, name):
                assert name == "diffusion_model"
                return diffusion
        def weights(names):
            return {f"{name}.lora_{direction}.weight": torch.eye(2) for name in names for direction in ("A", "B")}
        native_names = ["diffusion_model.blocks.0.attn.wq", "diffusion_model.tmlp.0", "diffusion_model.tmlp.2", "diffusion_model.tproj.1"]
        diffusers_names = ["transformer.transformer_blocks.0.attn.to_q", "transformer.time_embed.linear_1", "transformer.time_embed.linear_2", "transformer.time_mod_proj"]
        for count in (1, 4):
            with self.subTest(targets=count):
                native = plan_krea2_lora_routes(Model(), {"global": [], "r": [("fixture", .5, 0.)]}, ["global", "r"], load_state=lambda _: weights(native_names[:count]))
                mapped = plan_krea2_lora_routes(Model(), {"global": [], "r": [("fixture", .5, 0.)]}, ["global", "r"], load_state=lambda _: weights(diffusers_names[:count]))
                self.assertEqual(mapped.token_scopes, native.token_scopes)
                self.assertEqual(mapped.multipass_scopes, native.multipass_scopes)
                if count == 1:
                    self.assertEqual(mapped.token_scopes["r"], [("fixture", .5, 0.)])
                else:
                    self.assertEqual(mapped.multipass_scopes["r"], [("fixture", .5, 0.)])
        with self.assertRaisesRegex(ValueError, "cannot be resolved"):
            plan_krea2_lora_routes(Model(), {"global": [], "r": [("fixture", .5, 0.)]}, ["global", "r"], load_state=lambda _: weights(["transformer.unknown_projection"]))


if __name__ == "__main__":
    unittest.main()

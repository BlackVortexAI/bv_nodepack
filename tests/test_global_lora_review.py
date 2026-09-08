"""Independent acceptance tests for automatic Registry globals."""
import copy
import io
import json
import types
import unittest
from unittest.mock import patch

from py.util.lora_registry import parse_lora_registry_config
from py.util.regional.context import normalize_context
from py.util.regional.lora_v3 import (
    LORA_CAPABILITY, build_lora_provider, materialize_lora_capability,
    register_lora_contracts, transform_lora_capability,
    reidentify_lora_provider, extend_lora_provider,
    normalize_lora_prompt_config, transform_lora_sequence,
)
from test_regional_lora_v3 import DOCUMENT


RID = "22222222-2222-4222-8222-222222222222"
SID = "33333333-3333-4333-8333-333333333333"
EID = "44444444-4444-4444-8444-444444444444"


class GlobalLoraIndependentReview(unittest.TestCase):
    def setUp(self):
        self.contracts, _ = register_lora_contracts()

    def provider(self, registry_id=RID, entries=None):
        entries = entries if entries is not None else [["same.safetensors", .7, .4]]
        return build_lora_provider(registry_id, {SID: {
            "id": SID, "name": "Global", "role": "global", "stack": entries,
            "origin_provider_id": registry_id,
            "entry_ids": [EID[:-1] + str(index) for index in range(len(entries))],
        }})

    def materialize(self, context, providers):
        return materialize_lora_capability(context, providers, registry=self.contracts)

    def automatic(self, context):
        return context.capabilities[LORA_CAPABILITY]["automatic"]["resources"]

    def test_v1_empty_gains_exactly_one_empty_global_and_is_idempotent(self):
        old = {"schema": "bv.lora_registry_config", "version": 1, "registry_id": RID, "stacks": []}
        migrated = parse_lora_registry_config(old)
        self.assertEqual(migrated["version"], 2)
        self.assertEqual(len(migrated["stacks"]), 1)
        self.assertEqual(migrated["stacks"][0]["role"], "global")
        self.assertEqual(migrated["stacks"][0]["entries"], [])
        self.assertEqual(parse_lora_registry_config(migrated), migrated)
        self.assertEqual(old["stacks"], [])

    def test_multiple_legacy_basis_groups_keep_identity_order_and_disabled_state(self):
        stacks = [{"id": SID, "name": "Old A", "role": "basis", "enabled": False, "entries": []},
                  {"id": EID, "name": "Old B", "role": "basis", "enabled": True, "entries": []}]
        old = {"schema": "bv.lora_registry_config", "version": 1, "registry_id": RID, "stacks": stacks}
        migrated = parse_lora_registry_config(old)
        self.assertEqual([s for s in migrated["stacks"] if s.get("role") == "basis"], stacks)
        self.assertEqual(len([s for s in migrated["stacks"] if s.get("role") == "global"]), 1)
        self.assertEqual(parse_lora_registry_config(migrated), migrated)

    def test_empty_prompt_discovers_global_without_manual_selection(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        resources = self.automatic(context)
        self.assertEqual(len(resources), 1)
        self.assertEqual(resources[0]["stack"], [["same.safetensors", .7, .4]])
        self.assertEqual(context.capabilities[LORA_CAPABILITY]["entries"], [])
        self.assertEqual(context.capabilities[LORA_CAPABILITY]["scopes"], {})

    def test_repeat_materialization_does_not_duplicate_occurrences(self):
        provider = self.provider(entries=[["same.safetensors", .7, .4]] * 2)
        context = normalize_context(DOCUMENT)
        for _ in range(4):
            context = self.materialize(context, provider)
        resources = self.automatic(context)
        self.assertEqual(len(resources), 1)
        self.assertEqual(len(resources[0]["stack"]), 2)
        self.assertEqual(len(set(resources[0]["entry_ids"])), 2)

    def test_clear_manual_assignment_keeps_automatic_global(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        before = copy.deepcopy(self.automatic(context))
        context = transform_lora_capability(context, {"version": 2, "entries": []},
                                            registry=self.contracts, operation="clear")
        self.assertEqual(self.automatic(context), before)

    def test_separate_active_registries_are_an_explicit_conflict_even_with_identical_paths(self):
        other_id = "55555555-5555-4555-8555-555555555555"
        with self.assertRaisesRegex(ValueError, "Multiple active Global"):
            self.materialize(normalize_context(DOCUMENT), {RID: self.provider(), other_id: self.provider(other_id)})

    def test_disable_update_replaces_previous_provider_stack(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        context = self.materialize(context, self.provider(entries=[]))
        self.assertFalse(any(r["stack"] for r in self.automatic(context)))

    def test_collector_and_manual_chain_preserve_original_registry_identity(self):
        collector_id = "55555555-5555-4555-8555-555555555555"
        provider = self.provider()
        extended = extend_lora_provider(provider, "manual", "Manual", [("manual.safetensors", 1., 0.)])
        collected = reidentify_lora_provider(extended, collector_id)
        context = self.materialize(normalize_context(DOCUMENT), {RID: provider, collector_id: collected})
        self.assertEqual(len(self.automatic(context)), 1)
        self.assertEqual(self.automatic(context)[0]["provider_id"], RID)

    def test_empty_provider_refresh_removes_its_old_automatic_resources(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        context = self.materialize(context, build_lora_provider(RID, {}))
        resources = context.capabilities.get(LORA_CAPABILITY, {}).get("automatic", {}).get("resources", [])
        self.assertEqual(resources, [])

    def patch_globals(self, model, clip, context):
        from py.util.model_patcher import apply_global_patches
        return apply_global_patches(model, clip, context)

    def test_model_and_clip_apply_each_intentional_occurrence_once_across_reentry(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider(entries=[["same.safetensors", .7, .4]] * 2))
        model, clip = ReviewModel(), ReviewClip()
        applied = []
        def apply(model, clip, entries):
            applied.extend(list(entries))
            return copy.deepcopy(model), copy.deepcopy(clip)
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=apply):
            model2, clip2 = self.patch_globals(model, clip, context)
            model3, clip3 = self.patch_globals(model2, clip2, context)
        self.assertEqual(applied, [("same.safetensors", .7, .4)] * 2)
        self.assertEqual(model.attachments, {})
        self.assertEqual(clip.patcher.attachments, {})

    def test_model_only_preparation_does_not_skip_later_clip_application(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        applied = []
        def apply(model, clip, entries):
            applied.extend(list(entries))
            return copy.deepcopy(model), copy.deepcopy(clip)
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=apply):
            model, _ = self.patch_globals(ReviewModel(), None, context)
            self.patch_globals(model, ReviewClip(), context)
        self.assertEqual(applied, [("same.safetensors", .7, 0.), ("same.safetensors", 0., .4)])

    def test_direct_registry_then_collector_attention_does_not_apply_twice(self):
        provider = self.provider(entries=[["same.safetensors", .7, .4]] * 2)
        collected = reidentify_lora_provider(provider, "55555555-5555-4555-8555-555555555555")
        direct_context = self.materialize(normalize_context(DOCUMENT), provider)
        context = self.materialize(normalize_context(DOCUMENT), collected)
        applied = []
        def apply(model, clip, entries):
            applied.extend(list(entries))
            return copy.deepcopy(model), copy.deepcopy(clip)
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=apply):
            model, clip = self.patch_globals(ReviewModel(), ReviewClip(), direct_context)
            self.patch_globals(model, clip, context)
        self.assertEqual(applied, [("same.safetensors", .7, .4)] * 2)

    def test_changed_strength_on_prepatched_occurrence_fails_without_additional_patch(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        changed = self.materialize(normalize_context(DOCUMENT), self.provider(entries=[["same.safetensors", .9, .4]]))
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=lambda model, clip, entries: (copy.deepcopy(model), copy.deepcopy(clip))) as apply:
            model, clip = self.patch_globals(ReviewModel(), ReviewClip(), context)
            with self.assertRaisesRegex(ValueError, "original"):
                self.patch_globals(model, clip, changed)
            self.assertEqual(apply.call_count, 1)

    def test_historical_manual_global_and_empty_optout_scopes_are_unchanged_by_preparation(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        payload = copy.deepcopy(context.capabilities[LORA_CAPABILITY])
        payload["scopes"] = {"global": [["historical.safetensors", .8, .3]], "background": [["historical.safetensors", .8, .3]], "legacy-region": []}
        context = context.with_capability(LORA_CAPABILITY, payload)
        before = copy.deepcopy(context.to_dict())
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda stacks: stacks), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=lambda model, clip, entries: (copy.deepcopy(model), copy.deepcopy(clip))) as apply:
            self.patch_globals(ReviewModel(), ReviewClip(), context)
        self.assertEqual(context.to_dict(), before)
        self.assertEqual(apply.call_args.args[2], [("same.safetensors", .7, .4)])

    def test_existing_normal_global_name_is_not_promoted_or_merged(self):
        legacy = {"id": SID, "name": "Global", "enabled": False, "entries": []}
        old = {"schema": "bv.lora_registry_config", "version": 1, "registry_id": RID, "stacks": [legacy]}
        migrated = parse_lora_registry_config(old)
        for _ in range(5):
            migrated = parse_lora_registry_config(migrated)
        self.assertEqual(next(stack for stack in migrated["stacks"] if stack["id"] == SID), legacy)
        self.assertEqual(len(migrated["stacks"]), 2)
        self.assertEqual(len([s for s in migrated["stacks"] if s.get("role") == "global"]), 1)

    def test_explicit_registry_only_prompt_config_materializes_without_fake_entry(self):
        configured = normalize_lora_prompt_config({"version": 3, "entries": [], "steps": [], "registry_ids": [RID]})
        self.assertEqual(configured["entries"], [])
        context = transform_lora_capability(normalize_context(DOCUMENT), configured, registry=self.contracts)
        context = self.materialize(context, self.provider())
        self.assertEqual(len(self.automatic(context)), 1)
        self.assertEqual(context.capabilities[LORA_CAPABILITY]["entries"], [])

    def test_explicit_registry_only_transformer_keeps_existing_automatic_resources(self):
        context = self.materialize(normalize_context(DOCUMENT), self.provider())
        before = copy.deepcopy(self.automatic(context))
        transformed = transform_lora_sequence(context, {"version": 3, "entries": [], "steps": [], "registry_ids": [RID]}, registry=self.contracts)
        self.assertEqual(self.automatic(transformed), before)


class ReviewModel:
    def __init__(self):
        self.attachments = {}

    def get_attachment(self, key):
        return self.attachments.get(key)

    def set_attachments(self, key, value):
        self.attachments[key] = value


class ReviewClip:
    def __init__(self):
        self.patcher = ReviewModel()


class NativeGlobalPortReview(unittest.TestCase):
    def test_transformer_explicit_registry_dependency_rejects_disconnected_provider(self):
        from test_regional_nodes import load_node_module
        module = load_node_module()
        config = json.dumps({"version": 3, "entries": [], "steps": [], "registry_ids": [RID]})
        with self.assertRaisesRegex(ValueError, "missing"):
            module.BVRegionalLoraNode().transform(DOCUMENT, "merge", config)
        provider = build_lora_provider(RID, {SID: {"id": SID, "name": "Global", "role": "global", "stack": [], "origin_provider_id": RID, "entry_ids": []}})
        result = module.BVRegionalLoraNode().transform(DOCUMENT, "merge", config, resource_provider_1=provider)
        self.assertEqual(result[0]["capabilities"][LORA_CAPABILITY]["entries"], [])
        self.assertEqual(result[0]["capabilities"][LORA_CAPABILITY]["automatic"]["resources"][0]["provider_id"], RID)

    def test_native_model_ports_append_and_runtime_returns_patched_model(self):
        from test_regional_nodes import load_node_module
        module = load_node_module()
        cls = module.BVRegionalNativeConditioningNode
        self.assertEqual(cls.RETURN_TYPES, ("CONDITIONING", "CONDITIONING", "MODEL"))
        self.assertEqual(cls.RETURN_NAMES[:2], ("positive", "negative"))
        self.assertEqual(list(cls.INPUT_TYPES()["optional"]), ["lora_registry", "lora_bindings", "model"])
        with patch.object(module, "apply_global_patches", return_value=("patched", "patched-clip")) as prepare, patch.object(module, "compile_native_conditioning", return_value=("pos", "neg")) as compile_native, patch.object(module, "_consumer_lora_scopes", return_value={}), patch.object(module, "create_hook_groups", return_value={}):
            result = cls().compile(DOCUMENT, "clip", model="model")
        self.assertEqual(result, ("pos", "neg", "patched"))
        prepare.assert_called_once_with("model", "clip", DOCUMENT)
        self.assertEqual(compile_native.call_args.args[1], "patched-clip")


class CatalogEvidenceReview(unittest.TestCase):
    def test_civitai_links_use_only_authorized_public_model_urls_or_proven_ids(self):
        from py.util.lora_registry import _civitai_url
        for url in ["javascript:alert(1)", "https://civitai.com.evil.test/models/1", "https://evil.test@civitai.com/models/1", "https://civitai.com/api/download/models/1", "https://civitai.com:999/models/1", "https://civitai.com/models/1\n"]:
            with self.subTest(url=url):
                self.assertIsNone(_civitai_url({"url": url}, {}))
        self.assertEqual(_civitai_url({"civitai": {"modelId": 123, "id": 456}}, {}), "https://civitai.com/models/123?modelVersionId=456")
        self.assertIsNone(_civitai_url({"civitai": {"modelId": True, "id": 456}}, {}))
        self.assertEqual(_civitai_url({"url": "https://civitai.com/models/123/name?modelVersionId=456"}, {}), "https://civitai.com/models/123/name?modelVersionId=456")

    def test_zero_byte_weight_payload_does_not_claim_validated_token_candidate(self):
        from py.util.lora_registry import _header_compatibility
        header = {f"lora_unet_blocks_0_attn_wq.lora_{direction}.weight": {"dtype": "F32", "shape": [2, 2], "data_offsets": [0, 0]} for direction in ("down", "up")}
        encoded = json.dumps(header).encode()
        payload = len(encoded).to_bytes(8, "little") + encoded
        path = types.SimpleNamespace(open=lambda mode: io.BytesIO(payload), stat=lambda: types.SimpleNamespace(st_size=len(payload)))
        self.assertEqual(_header_compatibility(path)["status"], "unknown")

    def test_overlapping_tensor_offsets_are_unknown_and_valid_pairs_are_candidates(self):
        from py.util.lora_registry import _header_compatibility
        for up_offsets, expected in [([0, 16], "unknown"), ([16, 32], "token_candidate")]:
            with self.subTest(up_offsets=up_offsets):
                header = {"lora_unet_blocks_0_attn_wq.lora_down.weight": {"dtype": "F32", "shape": [2, 2], "data_offsets": [0, 16]},
                          "lora_unet_blocks_0_attn_wq.lora_up.weight": {"dtype": "F32", "shape": [2, 2], "data_offsets": up_offsets}}
                encoded = json.dumps(header).encode()
                payload = len(encoded).to_bytes(8, "little") + encoded + bytes(32)
                path = types.SimpleNamespace(open=lambda mode: io.BytesIO(payload), stat=lambda: types.SimpleNamespace(st_size=len(payload)))
                self.assertEqual(_header_compatibility(path)["status"], expected)


if __name__ == "__main__":
    unittest.main()

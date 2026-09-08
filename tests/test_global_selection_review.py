"""Independent acceptance for exclusive Global source and per-Prompt opt-out."""
import copy
import unittest
from unittest.mock import patch

from py.util.lora_registry import parse_lora_registry_config
from py.util.regional.context import normalize_context
from py.util.regional.lora_v3 import build_lora_provider, materialize_lora_capability, normalize_lora_prompt_config, transform_lora_capability, transform_lora_sequence, register_lora_contracts, LORA_CAPABILITY
from py.util.model_patcher import apply_global_patches
from test_regional_lora_v3 import DOCUMENT
from test_global_lora_review import ReviewModel, ReviewClip, RID, SID, EID


class ExclusiveGlobalReview(unittest.TestCase):
    def setUp(self):
        self.registry, _ = register_lora_contracts()

    def provider(self, enabled=True, rid=RID, role="global"):
        return build_lora_provider(rid, {SID: {"id": SID, "name": "Global", "role": role,
            "origin_provider_id": rid, "entry_ids": [EID], "global_enabled": enabled,
            "stack": [["synthetic.safetensors", .5, .3]]}})

    def materialize(self, providers, optout=False):
        context = normalize_context(DOCUMENT)
        if optout:
            config = normalize_lora_prompt_config({"version": 3, "entries": [], "steps": [], "apply_global": False})
            context = transform_lora_capability(context, config, registry=self.registry)
        return materialize_lora_capability(context, providers, registry=self.registry, apply_global=not optout)

    def test_disabled_registry_never_introduces_global_or_migrated_basis_resources(self):
        for role in ("global", "basis"):
            with self.subTest(role=role):
                context = self.materialize(self.provider(False, role=role))
                resources = context.capabilities.get(LORA_CAPABILITY, {}).get("automatic", {}).get("resources", [])
                self.assertFalse(any(r["stack"] for r in resources))

    def test_runtime_global_activation_requires_a_real_boolean(self):
        for value in ("false", "true", 0, 1, None, []):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, "boolean"):
                self.provider(value)

    def test_two_active_origins_conflict_independently_of_provider_order(self):
        other = "55555555-5555-4555-8555-555555555555"
        for providers in ({RID: self.provider(), other: self.provider(rid=other)}, {other: self.provider(rid=other), RID: self.provider()}):
            with self.assertRaisesRegex(ValueError, "(?i)global|conflict|multiple"):
                self.materialize(providers)

    def test_optout_survives_materialization_and_preserves_manual_scopes(self):
        context = self.materialize(self.provider(), optout=True)
        payload = copy.deepcopy(context.capabilities[LORA_CAPABILITY])
        self.assertFalse(payload["automatic"]["enabled"])
        payload["scopes"] = {"global": [["manual.safetensors", .8, .2]], "region": []}
        context = context.with_capability(LORA_CAPABILITY, payload)
        before = copy.deepcopy(context.to_dict())
        with patch("py.util.model_patcher.apply_static_lora_stack") as loader:
            model, clip = ReviewModel(), ReviewClip()
            self.assertEqual(apply_global_patches(model, clip, context), (model, clip))
        loader.assert_not_called()
        self.assertEqual(context.to_dict(), before)

    def test_optout_rejects_already_patched_input_instead_of_silent_non_optout(self):
        active = self.materialize(self.provider())
        disabled = self.materialize(self.provider(), optout=True)
        with patch("py.util.model_patcher.resolve_stack_paths", side_effect=lambda value: value), patch("py.util.model_patcher.apply_static_lora_stack", side_effect=lambda model, clip, entries: (copy.deepcopy(model), copy.deepcopy(clip))) as loader:
            model, clip = apply_global_patches(ReviewModel(), ReviewClip(), active)
            with self.assertRaisesRegex(ValueError, "(?i)original|already|opt"):
                apply_global_patches(model, clip, disabled)
            self.assertEqual(loader.call_count, 1)

    def test_downstream_empty_transform_and_rematerialize_do_not_reenable_optout(self):
        context = self.materialize(self.provider(), optout=True)
        context = transform_lora_sequence(context, {"version": 3, "entries": [], "steps": []}, registry=self.registry)
        context = materialize_lora_capability(context, self.provider(), registry=self.registry)
        self.assertIs(context.capabilities[LORA_CAPABILITY]["automatic"]["enabled"], False)

    def test_v1_empty_migration_does_not_invent_activation(self):
        migrated = parse_lora_registry_config({"schema": "bv.lora_registry_config", "version": 1, "registry_id": RID, "stacks": []})
        self.assertFalse(next(s for s in migrated["stacks"] if s.get("role") == "global")["enabled"])
        self.assertEqual(parse_lora_registry_config(migrated), migrated)

    def test_v1_active_basis_is_preserved_but_disabled_entry_does_not_invent_activation(self):
        for enabled in (True, False):
            with self.subTest(entry_enabled=enabled):
                basis = {"id": SID, "name": "Old basis", "role": "basis", "enabled": True, "entries": [{"id": EID, "lora_name": "synthetic.safetensors", "enabled": enabled, "model_strength": .5, "clip_strength": .3}]}
                migrated = parse_lora_registry_config({"schema": "bv.lora_registry_config", "version": 1, "registry_id": RID, "stacks": [basis]})
                self.assertEqual(next(s for s in migrated["stacks"] if s.get("role") == "global")["enabled"], enabled)
                self.assertEqual(next(s for s in migrated["stacks"] if s.get("role") == "basis"), basis)
                self.assertEqual(parse_lora_registry_config(migrated), migrated)

    def test_saved_v2_empty_global_keeps_explicit_enabled_value(self):
        for enabled in (True, False):
            source = {"schema": "bv.lora_registry_config", "version": 2, "registry_id": RID, "stacks": [{"id": SID, "name": "Global", "role": "global", "enabled": enabled, "entries": []}]}
            migrated = parse_lora_registry_config(source)
            for _ in range(4):
                migrated = parse_lora_registry_config(migrated)
            self.assertEqual(migrated, source)

    def test_real_prompt_forwards_optout_without_manual_selection(self):
        import json
        from test_regional_nodes import load_node_module
        module = load_node_module()
        result = module.BVRegionalPromptNode().build(json.dumps(DOCUMENT), lora_v3_config_json=json.dumps({"version": 3, "entries": [], "steps": [], "apply_global": False}), resource_provider_1=self.provider())
        self.assertIs(result[0]["capabilities"][LORA_CAPABILITY]["automatic"]["enabled"], False)

    def test_prompt_ignores_obsolete_deleted_provider_only_binding_for_default_on_and_off(self):
        import json
        from test_regional_nodes import load_node_module
        module = load_node_module()
        for flags in ({}, {"apply_global": True}, {"apply_global": False}):
            with self.subTest(flags=flags):
                config = {"version": 3, "entries": [], "steps": [], "registry_ids": [RID], **flags}
                result = module.BVRegionalPromptNode().build(json.dumps(DOCUMENT), lora_v3_config_json=json.dumps(config))
                self.assertIsInstance(result[0], dict)

    def test_prompt_still_rejects_genuinely_missing_manual_stack_provider(self):
        import json
        from test_regional_nodes import load_node_module
        module = load_node_module()
        entry = {"id": EID, "source": {"kind": "external", "collector_id": RID, "resource_id": SID}, "targets": [{"scope": "global"}]}
        for enabled in (True, False):
            with self.subTest(apply_global=enabled), self.assertRaisesRegex(ValueError, "missing"):
                module.BVRegionalPromptNode().build(json.dumps(DOCUMENT), lora_v3_config_json=json.dumps({"version": 3, "entries": [entry], "steps": [], "registry_ids": [RID], "apply_global": enabled}))


if __name__ == "__main__":
    unittest.main()

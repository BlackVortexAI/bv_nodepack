import json
import unittest

from py.util.regional.lora_hooks import add_named_stack, default_bindings, parse_bindings, parse_registry, reconcile_bindings, resolve_scope_stacks


class RegionalLoraHookContractTests(unittest.TestCase):
    def test_named_stacks_chain_without_mutating_the_source_registry(self):
        first = add_named_stack(None, "stack-a", "Portrait", [("a.safetensors", 0.8, 0.5)])
        second = add_named_stack(first, "stack-b", "Armor", [("b.safetensors", 1.0, 0.0)])
        self.assertEqual(list(first["stacks"]), ["stack-a"])
        self.assertEqual(list(second["stacks"]), ["stack-a", "stack-b"])

    def test_duplicate_identity_and_name_are_rejected(self):
        registry = add_named_stack(None, "stack-a", "Portrait", [])
        with self.assertRaisesRegex(ValueError, "Duplicate LoRA stack ID"):
            add_named_stack(registry, "stack-a", "Other", [])
        with self.assertRaisesRegex(ValueError, "Duplicate LoRA stack name"):
            add_named_stack(registry, "stack-b", "portrait", [])

    def test_non_finite_strengths_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "strengths must be finite"):
            add_named_stack(None, "stack-a", "Portrait", [("a.safetensors", float("nan"), 1)])

    def test_public_json_registry_contract_accepts_array_entries(self):
        value = {
            "schema": "bv.lora_stack_registry",
            "version": 1,
            "stacks": {"stack-a": {"id": "stack-a", "name": "Portrait", "stack": [["a.safetensors", 0.8, 0.6]]}},
        }
        parsed = parse_registry(json.dumps(value))
        self.assertEqual(parsed["stacks"]["stack-a"]["stack"], [("a.safetensors", 0.8, 0.6)])

    def test_public_registry_rejects_a_key_identity_mismatch(self):
        value = {"schema": "bv.lora_stack_registry", "version": 1, "stacks": {"key": {"id": "other", "name": "Portrait", "stack": []}}}
        with self.assertRaisesRegex(ValueError, "key and id differ"):
            parse_registry(value)

    def test_bindings_are_a_separate_document_scoped_contract(self):
        value = default_bindings("doc-a")
        value["global_stack_id"] = "stack-a"
        value["regions"] = {"region-a": "stack-b", "region-unused": None}
        parsed = parse_bindings(json.dumps(value), "doc-a")
        self.assertEqual(parsed["regions"], {"region-a": "stack-b"})
        with self.assertRaisesRegex(ValueError, "different BV Regional document"):
            parse_bindings(value, "doc-b")

    def test_global_stack_is_inherited_and_region_stack_is_additive(self):
        document = {"document_id": "doc-a", "regions": [{"id": "region-a"}, {"id": "region-b"}]}
        registry = add_named_stack(None, "global", "Base", [("base.safetensors", 1, 0)])
        registry = add_named_stack(registry, "local", "Face", [("face.safetensors", 0.7, 0)])
        bindings = default_bindings("doc-a")
        bindings["global_stack_id"] = "global"
        bindings["regions"] = {"region-a": "local"}
        scopes = resolve_scope_stacks(registry, bindings, document)
        self.assertEqual([entry[0] for entry in scopes["region-a"]], ["base.safetensors", "face.safetensors"])
        self.assertEqual([entry[0] for entry in scopes["region-b"]], ["base.safetensors"])

    def test_missing_registry_only_errors_when_assignments_exist(self):
        document = {"document_id": "doc-a", "regions": []}
        self.assertEqual(resolve_scope_stacks(None, default_bindings("doc-a"), document), {})
        bindings = default_bindings("doc-a")
        bindings["global_stack_id"] = "missing"
        with self.assertRaisesRegex(ValueError, "registry is not connected"):
            resolve_scope_stacks(None, bindings, document)

    def test_assigned_empty_stack_is_a_valid_noop(self):
        document = {"document_id": "doc-a", "regions": [{"id": "region-a"}]}
        registry = add_named_stack(None, "disabled", "Temporarily Disabled", [])
        bindings = default_bindings("doc-a")
        bindings["global_stack_id"] = "disabled"
        bindings["regions"] = {"region-a": "disabled"}

        self.assertEqual(resolve_scope_stacks(registry, bindings, document), {})

    def test_orphaned_region_binding_does_not_require_its_old_stack_at_runtime(self):
        document = {"document_id": "doc-a", "regions": [{"id": "current-region"}]}
        registry = add_named_stack(None, "current", "Current", [("current.safetensors", 1, 0)])
        bindings = default_bindings("doc-a")
        bindings["regions"] = {
            "current-region": "current",
            "removed-region": "missing-old-stack",
        }

        scopes = resolve_scope_stacks(registry, bindings, document)

        self.assertEqual([entry[0] for entry in scopes["current-region"]], ["current.safetensors"])

    def test_reconciliation_removes_orphaned_region_bindings(self):
        document = {"document_id": "doc-a", "regions": [{"id": "current-region"}]}
        bindings = default_bindings("doc-a")
        bindings["global_stack_id"] = "global"
        bindings["regions"] = {"current-region": "current", "removed-region": "stale"}

        reconciled = reconcile_bindings(bindings, document)

        self.assertEqual(reconciled["global_stack_id"], "global")
        self.assertEqual(reconciled["regions"], {"current-region": "current"})


if __name__ == "__main__":
    unittest.main()

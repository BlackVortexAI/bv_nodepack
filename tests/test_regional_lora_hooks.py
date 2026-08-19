import json
import unittest
from unittest.mock import patch

import torch

from py.util.regional.lora_hooks import add_named_stack, apply_attention_hook_passes, default_bindings, parse_bindings, parse_registry, reconcile_bindings, resolve_scope_stacks


def pass_document(*regions):
    return {
        "canvas": {"width": 4, "height": 2},
        "regions": [{"id": region_id, "enabled": enabled} for region_id, enabled in regions],
    }


def conditioning():
    return [[torch.ones((1, 1, 1)), {"source": "test"}]]


def selection_mask(selection, _width, _height):
    masks = {
        "left": torch.tensor([[[1.0, 1.0, 0.0, 0.0], [1.0, 1.0, 0.0, 0.0]]]),
        "right": torch.tensor([[[0.0, 0.0, 1.0, 1.0], [0.0, 0.0, 1.0, 1.0]]]),
        "overlap": torch.tensor([[[0.0, 0.5, 1.0, 0.0], [0.0, 0.5, 1.0, 0.0]]]),
    }
    return masks[selection["region_id"]]


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

    def test_fully_disabled_stack_is_a_valid_noop(self):
        document = {"document_id": "doc-a", "regions": [{"id": "region-a"}]}
        registry = add_named_stack(None, "disabled", "Disabled", [("missing.safetensors", 0, 0)])
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

    def test_no_lora_preserves_existing_conditioning(self):
        positive, negative = conditioning(), conditioning()
        result = apply_attention_hook_passes(positive, negative, pass_document(("left", True)), {}, {})
        self.assertIs(result[0], positive)
        self.assertIs(result[1], negative)

    def test_global_lora_uses_one_unmasked_pass(self):
        positive, negative = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True)),
            {"global": [("base.safetensors", 1.0, 0.5)], "left": [("base.safetensors", 1.0, 0.5)]},
            {"global": "global-hooks"},
        )
        self.assertEqual((len(positive), len(negative)), (1, 1))
        self.assertEqual(positive[0][1]["hooks"], "global-hooks")
        self.assertNotIn("mask", positive[0][1])

    @patch("py.util.regional.mask_renderer.render_selection", side_effect=selection_mask)
    def test_one_regional_lora_adds_baseline_and_override_passes(self, _render):
        positive, negative = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True)),
            {"left": [("local.safetensors", 0.8, 0.6)]}, {"left": "local-hooks"},
        )
        self.assertEqual((len(positive), len(negative)), (2, 2))
        self.assertNotIn("hooks", positive[0][1])
        self.assertEqual(positive[1][1]["hooks"], "local-hooks")

    @patch("py.util.regional.mask_renderer.render_selection", side_effect=selection_mask)
    def test_identical_regional_model_stacks_share_one_override_pass(self, _render):
        stack = [("local.safetensors", 0.8, 0.6)]
        positive, _ = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True), ("overlap", True)),
            {"left": stack, "overlap": list(stack)}, {"left": "left-hooks", "overlap": "overlap-hooks"},
        )
        expected = torch.maximum(selection_mask({"region_id": "left"}, 4, 2), selection_mask({"region_id": "overlap"}, 4, 2))
        self.assertEqual(len(positive), 2)
        self.assertTrue(torch.equal(positive[1][1]["mask"], expected))

    @patch("py.util.regional.mask_renderer.render_selection", side_effect=selection_mask)
    def test_different_regional_model_stacks_use_separate_passes(self, _render):
        positive, _ = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True), ("right", True)),
            {"left": [("left.safetensors", 0.8, 0.6)], "right": [("right.safetensors", 0.8, 0.6)]},
            {"left": "left-hooks", "right": "right-hooks"},
        )
        self.assertEqual(len(positive), 2)
        self.assertEqual({item[1]["hooks"] for item in positive}, {"left-hooks", "right-hooks"})

    @patch("py.util.regional.mask_renderer.render_selection", side_effect=selection_mask)
    def test_clip_only_differences_do_not_add_model_passes(self, render):
        positive, _ = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True)),
            {"global": [("style.safetensors", 1.0, 0.4)], "left": [("style.safetensors", 1.0, 0.9)]},
            {"global": "global-hooks", "left": "left-hooks"},
        )
        self.assertEqual(len(positive), 1)
        self.assertEqual(positive[0][1]["hooks"], "global-hooks")
        render.assert_not_called()

    @patch("py.util.regional.mask_renderer.render_selection", side_effect=selection_mask)
    def test_overlapping_different_stacks_keep_both_override_masks(self, _render):
        positive, _ = apply_attention_hook_passes(
            conditioning(), conditioning(), pass_document(("left", True), ("overlap", True)),
            {"left": [("left.safetensors", 0.8, 0.6)], "overlap": [("overlap.safetensors", 0.8, 0.6)]},
            {"left": "left-hooks", "overlap": "overlap-hooks"},
        )
        by_hook = {item[1].get("hooks"): item[1]["mask"] for item in positive}
        self.assertEqual(by_hook["left-hooks"][0, 0, 1].item(), 1.0)
        self.assertEqual(by_hook["overlap-hooks"][0, 0, 1].item(), 0.5)
        self.assertEqual(by_hook[None][0, 0, 3].item(), 1.0)


if __name__ == "__main__":
    unittest.main()

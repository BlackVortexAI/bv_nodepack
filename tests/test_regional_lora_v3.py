import unittest

from py.util.regional.context import normalize_context
from py.util.regional.lora_v3 import (
    LORA_CAPABILITY,
    LORA_RESOURCE_TYPE,
    build_lora_provider,
    register_lora_contracts,
    resolve_lora_capability,
    transform_lora_capability,
)


DOCUMENT = {
    "schema": "bv.regional",
    "version": 2,
    "document_id": "11111111-1111-4111-8111-111111111111",
    "title": "LoRA v3",
    "canvas": {"width": 64, "height": 64},
    "prompts": {
        "global": {"positive_source": "", "negative_source": ""},
        "background": {"positive_source": "", "negative_source": ""},
    },
    "negative_mode": "auto",
    "overlap": {"mode": "joint"},
    "regions": [],
}


class RegionalLoraV3Tests(unittest.TestCase):
    def setUp(self):
        self.capabilities, self.resources = register_lora_contracts()
        self.context = normalize_context(DOCUMENT, registry=self.capabilities)

    def test_external_stack_is_resolved_live_without_entering_context(self):
        provider = build_lora_provider(
            "22222222-2222-4222-8222-222222222222",
            {"skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", 0.8, 0.4]]}},
        )
        payload = {
            "version": 1,
            "collector_id": provider["provider_id"],
            "entries": [{
                "id": "33333333-3333-4333-8333-333333333333",
                "source": {"kind": "external", "resource_id": "skin"},
                "targets": [{"scope": "global"}],
            }],
        }
        transformed = transform_lora_capability(self.context, payload, registry=self.capabilities)
        self.assertNotIn("stack", transformed.require_capability(LORA_CAPABILITY)["entries"][0]["source"])
        resolved = resolve_lora_capability(transformed, provider, registry=self.capabilities)
        self.assertEqual(resolved["global"], [["skin.safetensors", 0.8, 0.4]])
        changed_provider = build_lora_provider(
            provider["provider_id"],
            {"skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", 0.25, 0.1]]}},
        )
        self.assertEqual(
            resolve_lora_capability(transformed, changed_provider, registry=self.capabilities)["global"],
            [["skin.safetensors", 0.25, 0.1]],
        )

    def test_native_and_external_entries_preserve_semantic_order(self):
        provider = build_lora_provider(
            "22222222-2222-4222-8222-222222222222",
            {"skin": {"id": "skin", "name": "Skin", "stack": [["external.safetensors", 0.5, 0.25]]}},
        )
        payload = {
            "version": 1,
            "collector_id": provider["provider_id"],
            "entries": [
                {"id": "33333333-3333-4333-8333-333333333333", "source": {"kind": "native", "lora_name": "native.safetensors", "model_strength": 1.0, "clip_strength": 0.5}, "targets": [{"scope": "global"}]},
                {"id": "44444444-4444-4444-8444-444444444444", "source": {"kind": "external", "resource_id": "skin"}, "targets": [{"scope": "global"}]},
            ],
        }
        transformed = transform_lora_capability(self.context, payload, registry=self.capabilities)
        self.assertEqual(resolve_lora_capability(transformed, provider, registry=self.capabilities)["global"], [
            ["native.safetensors", 1.0, 0.5], ["external.safetensors", 0.5, 0.25]
        ])

    def test_provider_identity_is_fail_closed(self):
        provider = build_lora_provider("22222222-2222-4222-8222-222222222222", {})
        payload = {"version": 1, "collector_id": "55555555-5555-4555-8555-555555555555", "entries": []}
        transformed = transform_lora_capability(self.context, payload, registry=self.capabilities)
        with self.assertRaisesRegex(ValueError, "mismatched"):
            resolve_lora_capability(transformed, provider, registry=self.capabilities)

    def test_transform_does_not_mutate_a_branch(self):
        payload = {"version": 1, "collector_id": None, "entries": []}
        transformed = transform_lora_capability(self.context, payload, registry=self.capabilities)
        self.assertNotIn(LORA_CAPABILITY, self.context.capabilities)
        self.assertIn(LORA_CAPABILITY, transformed.capabilities)

    def test_merge_and_subtract_require_the_same_collector(self):
        first = {"version": 1, "collector_id": "22222222-2222-4222-8222-222222222222", "entries": []}
        context = transform_lora_capability(self.context, first, registry=self.capabilities)
        other = {"version": 1, "collector_id": "55555555-5555-4555-8555-555555555555", "entries": []}
        with self.assertRaisesRegex(ValueError, "same collector_id"):
            transform_lora_capability(context, other, registry=self.capabilities, operation="merge")
        with self.assertRaisesRegex(ValueError, "same collector_id"):
            transform_lora_capability(context, other, registry=self.capabilities, operation="subtract")

    def test_clear_removes_only_the_lora_capability(self):
        payload = {"version": 1, "collector_id": None, "entries": []}
        context = transform_lora_capability(self.context, payload, registry=self.capabilities)
        cleared = transform_lora_capability(context, {}, registry=self.capabilities, operation="clear")
        self.assertNotIn(LORA_CAPABILITY, cleared.capabilities)
        self.assertEqual(cleared.core, self.context.core)

    def test_registered_resource_type_rejects_runtime_objects(self):
        provider = build_lora_provider("22222222-2222-4222-8222-222222222222", {})
        reference = {"provider_id": provider["provider_id"], "resource_type": LORA_RESOURCE_TYPE, "resource_id": "skin"}
        self.assertEqual(self.resources.validate(LORA_RESOURCE_TYPE, reference), reference)


if __name__ == "__main__":
    unittest.main()

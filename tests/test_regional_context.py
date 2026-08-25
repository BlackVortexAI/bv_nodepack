import copy
import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.context import (  # noqa: E402
    CapabilityRegistration,
    CapabilityRegistry,
    RegionalContext,
    RegionalContextError,
    RegistryCollisionError,
    ResourceRegistration,
    ResourceRegistry,
    UnsupportedCapabilityVersionError,
    context_document,
    normalize_context,
    serialize_context,
)


def fixture(name="v1_hybrid_joint.json"):
    with (ROOT / "tests" / "fixtures" / "regional" / name).open(encoding="utf-8") as handle:
        return json.load(handle)


def validate_entries(payload):
    if set(payload) != {"version", "entries"} or not isinstance(payload["entries"], list):
        raise RegionalContextError("extension payload is invalid")


class RegionalContextTests(unittest.TestCase):
    def test_v1_and_v2_normalize_deterministically_to_v3_core_v1(self):
        v1 = fixture()
        v2 = copy.deepcopy(v1)
        v2["version"] = 2
        for region in v2["regions"]:
            region["usage"] = "generation"
        normalized_v1 = normalize_context(v1).to_dict()
        normalized_v2 = normalize_context(v2).to_dict()
        self.assertEqual(normalized_v1, normalized_v2)
        self.assertEqual(normalized_v1["version"], 3)
        self.assertEqual(normalized_v1["core"]["version"], 1)
        self.assertEqual(normalized_v1["capabilities"], {})

    def test_v3_round_trips_canonically(self):
        context = normalize_context(fixture())
        self.assertEqual(normalize_context(serialize_context(context)).to_dict(), context.to_dict())

    def test_existing_consumer_projection_is_deterministic_and_defensive(self):
        context = normalize_context(fixture()).with_capability(
            "future-pack.opaque", {"version": 9, "payload": ["preserved"]}
        )
        projected = context_document(context)
        projected["title"] = "mutated projection"
        self.assertEqual(projected["version"], 2)
        self.assertNotIn("capabilities", projected)
        self.assertEqual(context.core["title"], fixture()["title"])

    def test_facade_constructor_cannot_bypass_validation(self):
        with self.assertRaisesRegex(RegionalContextError, "requires a BV Regional v3"):
            RegionalContext(fixture())

    def test_envelope_and_core_reject_unknown_fields(self):
        wire = normalize_context(fixture()).to_dict()
        wire["surprise"] = True
        with self.assertRaisesRegex(RegionalContextError, "context contains unknown fields"):
            normalize_context(wire)
        wire = normalize_context(fixture()).to_dict()
        wire["core"]["surprise"] = True
        with self.assertRaisesRegex(RegionalContextError, "core contains unknown fields"):
            normalize_context(wire)
        wire = normalize_context(fixture()).to_dict()
        wire["core"]["regions"][0]["mask"]["surprise"] = True
        with self.assertRaisesRegex(RegionalContextError, "mask contains unknown fields"):
            normalize_context(wire)

    def test_context_rejects_non_json_and_non_finite_values(self):
        wire = normalize_context(fixture()).to_dict()
        wire["capabilities"]["third-party.demo"] = {"version": 1, "value": object()}
        with self.assertRaisesRegex(RegionalContextError, "non-JSON value"):
            normalize_context(wire)
        wire["capabilities"]["third-party.demo"]["value"] = float("nan")
        with self.assertRaisesRegex(RegionalContextError, "non-finite"):
            normalize_context(wire)

    def test_facade_and_transforms_preserve_branch_immutability(self):
        source = fixture()
        original_title = source["title"]
        root = normalize_context(source)
        source["title"] = "mutated after normalization"
        exported = root.to_dict()
        exported["core"]["title"] = "mutated export"
        core = root.core
        core["title"] = "Branch title"
        branch = root.with_core(core).with_capability("third-party.demo", {"version": 1, "entries": []})
        self.assertEqual(root.core["title"], original_title)
        self.assertEqual(root.capabilities, {})
        self.assertEqual(branch.core["title"], "Branch title")
        self.assertIn("third-party.demo", branch.capabilities)

    def test_context_facade_exposes_no_context_merge_operation(self):
        context = normalize_context(fixture())
        self.assertNotIn("merge", RegionalContext.__dict__)
        with self.assertRaises(AttributeError):
            getattr(context, "merge")

    def test_unknown_capability_is_losslessly_passed_through(self):
        opaque = {"version": 91, "nested": [{"future": None}], "label": "unchanged"}
        wire = normalize_context(fixture()).to_dict()
        wire["capabilities"]["future-pack.experimental"] = copy.deepcopy(opaque)
        context = normalize_context(wire)
        branch = context.with_capability("third-party.other", {"version": 1, "enabled": True})
        self.assertEqual(branch.capabilities["future-pack.experimental"], opaque)

    def test_registered_capability_migrates_sequentially_and_validates_each_result(self):
        seen = []

        def migrate_v1(payload):
            seen.append(copy.deepcopy(payload))
            return {"version": 2, "entries": payload["items"]}

        registry = CapabilityRegistry()
        key = registry.register(
            "Example_Pack", "filters", CapabilityRegistration(version=2, validator=validate_entries, migrations={1: migrate_v1}), source="example.module"
        )
        context = normalize_context(fixture(), registry=registry).with_capability(key, {"version": 1, "items": ["warm"]})
        self.assertEqual(context.require_capability(key), {"version": 2, "entries": ["warm"]})
        self.assertEqual(seen, [{"version": 1, "items": ["warm"]}])

    def test_newer_registered_capability_is_preserved_but_required_use_fails_closed(self):
        registry = CapabilityRegistry()
        key = registry.register("example-pack", "filters", CapabilityRegistration(version=1, validator=validate_entries), source="example.module")
        opaque = {"version": 2, "future": {"mode": "new"}}
        context = normalize_context(fixture(), registry=registry).with_capability(key, opaque)
        self.assertEqual(context.capabilities[key], opaque)
        with self.assertRaises(UnsupportedCapabilityVersionError):
            context.require_capability(key)

    def test_registration_collision_reports_both_sources_and_keeps_first(self):
        registry = CapabilityRegistry()
        registration = CapabilityRegistration(version=1, validator=validate_entries)
        key = registry.register("example.pack", "filters", registration, source="first.module")
        with self.assertRaisesRegex(RegistryCollisionError, "first.module.*second.module"):
            registry.register("example-pack", "filters", registration, source="second.module")
        self.assertIs(registry.get(key), registration)

    def test_fictitious_resource_extension_is_isolated_and_validated(self):
        registry = ResourceRegistry()

        def validate_reference(reference):
            if set(reference) != {"provider_id", "resource_id"}:
                raise RegionalContextError("invalid reference")

        key = registry.register("example-pack", "palette", ResourceRegistration(validate_reference), source="example.resources")
        reference = {"provider_id": "collector-1", "resource_id": "palette-1"}
        clean = registry.validate(key, reference)
        reference["resource_id"] = "changed"
        self.assertEqual(clean["resource_id"], "palette-1")
        self.assertEqual(normalize_context(fixture()).core["title"], fixture()["title"])

    def test_registry_instances_do_not_share_mutable_state(self):
        first = CapabilityRegistry()
        second = CapabilityRegistry()
        key = first.register("example-pack", "filters", CapabilityRegistration(version=1, validator=validate_entries), source="first")
        self.assertIsNotNone(first.get(key))
        self.assertIsNone(second.get(key))


if __name__ == "__main__":
    unittest.main()

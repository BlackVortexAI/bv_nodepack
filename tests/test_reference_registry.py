import json
import unittest
import uuid

import torch

from py.util.regional.reference_registry import (
    REFERENCE_CAPABILITY, attach_reference_catalog, build_reference_provider,
    parse_reference_config, reference_catalog, resolve_reference, materialize_reference_catalog,
)
from py.util.regional.context import normalize_context
from py.util.regional.document import default_document
from py.util.regional.v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY


def config(count=3):
    return {"schema": "bv.reference_registry_config", "version": 1,
            "collector_id": str(uuid.uuid4()),
            "entries": [{"id": str(uuid.uuid4()), "slot": f"media{i}"} for i in range(count)]}


class ReferenceRegistryTests(unittest.TestCase):
    def test_generated_media_batches_pass_through_without_copying(self):
        stored = config()
        image = torch.rand(2, 8, 8, 3)
        audio = {"waveform": torch.zeros(1, 2, 80), "sample_rate": 44100}
        provider = build_reference_provider(stored, {"media0": image, "media1": audio, "media2": image})
        ids = [entry["id"] for entry in stored["entries"]]
        self.assertEqual([entry["name"] for entry in provider["metadata"].values()], ["Image 1", "Audio 1", "Image 2"])
        self.assertIs(provider["resources"][ids[0]], image)
        self.assertIs(provider["resources"][ids[1]], audio)
        self.assertIs(provider["resources"][ids[2]], image)
        self.assertIs(resolve_reference(provider, stored["collector_id"], ids[0], expected_type="IMAGE"), image)

    def test_content_change_and_compaction_keep_explicit_identity(self):
        stored = config(2)
        first = build_reference_provider(stored, {"media0": torch.zeros(1, 2, 2, 3), "media1": torch.ones(1, 2, 2, 3)})
        survivor = stored["entries"][1]["id"]
        stored["entries"] = [{"id": survivor, "slot": "media0"}]
        newer = torch.rand(3, 2, 2, 3)
        second = build_reference_provider(json.dumps(stored), {"media0": newer})
        self.assertEqual(first["metadata"][survivor]["name"], "Image 2")
        self.assertEqual(second["metadata"][survivor]["name"], "Image 1")
        self.assertIs(resolve_reference(second, stored["collector_id"], survivor), newer)

    def test_catalog_is_json_only_and_preserves_other_capabilities(self):
        stored = config(1)
        provider = build_reference_provider(stored, {"media0": torch.ones(1, 2, 2, 3)})
        original = normalize_context(default_document()).with_capability("example.future", {"version": 1, "value": "kept"}).to_dict()
        result = attach_reference_catalog(original, provider, registry=REGIONAL_V3_CAPABILITY_REGISTRY)
        json.dumps(result)
        self.assertEqual(result["capabilities"]["example.future"], {"version": 1, "value": "kept"})
        self.assertNotIn(REFERENCE_CAPABILITY, original["capabilities"])
        normalize_context(result, registry=REGIONAL_V3_CAPABILITY_REGISTRY)

    def test_missing_wrong_owner_and_wrong_type_fail_closed(self):
        stored = config(1)
        provider = build_reference_provider(stored, {"media0": torch.ones(1, 2, 2, 3)})
        resource = stored["entries"][0]["id"]
        for owner, resource_id, kind in [(str(uuid.uuid4()), resource, None), (stored["collector_id"], str(uuid.uuid4()), None), (stored["collector_id"], resource, "AUDIO")]:
            with self.assertRaises(ValueError):
                resolve_reference(provider, owner, resource_id, expected_type=kind)
        provider["metadata"][resource]["media_type"] = "AUDIO"
        with self.assertRaises(ValueError):
            reference_catalog(provider)

    def test_empty_registry_and_strict_config(self):
        self.assertEqual(reference_catalog(build_reference_provider(config(0), {})), {"version": 1, "entries": []})
        for media in [None, {"media0": object()}, {"media0": torch.ones(2, 2)}, {"media0": {"waveform": torch.ones(1, 1, 2), "sample_rate": True}}]:
            with self.assertRaises(ValueError):
                build_reference_provider(config(1), media)
        stored = config(1)
        stored["entries"].append(dict(stored["entries"][0]))
        with self.assertRaises(ValueError):
            parse_reference_config(stored)
        with self.assertRaises(ValueError):
            build_reference_provider(config(1), {})

    def test_regional_prompt_catalog_uses_managed_collectors_without_new_output(self):
        from test_regional_nodes import load_node_module, fixture
        module = load_node_module()
        stored = config(1)
        provider = build_reference_provider(stored, {"media0": torch.ones(1, 2, 2, 3)})
        node = module.BVRegionalPromptNode()
        baseline = node.build(json.dumps(fixture()))
        selection = {"version": 1, "collector_ids": [stored["collector_id"]]}
        result = node.build(json.dumps(fixture()), reference_v3_config_json=json.dumps(selection), reference_resource_provider_7=provider)
        self.assertEqual(len(result), 2)
        self.assertEqual(len(baseline), 2)
        self.assertEqual(baseline[1], result[1])
        json.dumps(result[0])
        self.assertEqual(result[0]["capabilities"][REFERENCE_CAPABILITY], reference_catalog(provider))

    def test_collector_channels_are_resolved_by_identity_and_fail_closed(self):
        first, second = config(1), config(1)
        p = build_reference_provider(first, {"media0": torch.ones(1, 2, 2, 3)})
        q = build_reference_provider(second, {"media0": torch.zeros(1, 2, 2, 3)})
        selected = {"version": 1, "collector_ids": [second["collector_id"], first["collector_id"]]}
        kwargs = {"registry": REGIONAL_V3_CAPABILITY_REGISTRY}
        result = materialize_reference_catalog(default_document(), selected, {"reference_resource_provider_1": p, "reference_resource_provider_2": q, "lut_resource_provider_1": {}}, **kwargs)
        self.assertEqual([entry["collector_id"] for entry in result["capabilities"][REFERENCE_CAPABILITY]["entries"]], selected["collector_ids"])
        for providers in [{}, {"reference_resource_provider_1": p}, {"reference_resource_provider_1": p, "reference_resource_provider_2": p}, {"reference_resource_provider_1": {}}]:
            with self.assertRaises(ValueError):
                materialize_reference_catalog(default_document(), selected, providers, **kwargs)


if __name__ == "__main__":
    unittest.main()

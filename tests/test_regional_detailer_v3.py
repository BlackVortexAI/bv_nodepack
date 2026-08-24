import unittest

from py.util.regional.context import RegionalContextError, normalize_context
from py.util.regional.detailer import normalize_detector_binding
from py.util.regional.detailer_v3 import (
    DETAILER_CAPABILITY,
    build_detector_provider,
    materialize_detailer_plan,
    migrate_detailer_plan_v1,
    register_detailer_contracts,
    transform_detailer_capability,
)


DOCUMENT = {
    "schema": "bv.regional",
    "version": 2,
    "document_id": "11111111-1111-4111-8111-111111111111",
    "title": "Detailer v3",
    "canvas": {"width": 64, "height": 64},
    "prompts": {
        "global": {"positive_source": "", "negative_source": ""},
        "background": {"positive_source": "", "negative_source": ""},
    },
    "negative_mode": "auto",
    "overlap": {"mode": "joint"},
    "regions": [
        {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
            "name": "Face",
            "parent_region_id": None,
            "enabled": True,
            "usage": "both",
            "strength": 1.0,
            "priority": 0,
            "prompts": {"positive_source": "face", "negative_source": ""},
            "mask": {"feather": 0},
            "geometry": [],
            "authoring": {"visible": True, "locked": False, "color": "#ffffff"},
        },
        {
            "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            "name": "Eyes",
            "parent_region_id": None,
            "enabled": True,
            "usage": "detailer",
            "strength": 1.0,
            "priority": 1,
            "prompts": {"positive_source": "eyes", "negative_source": ""},
            "mask": {"feather": 0},
            "geometry": [],
            "authoring": {"visible": True, "locked": False, "color": "#ffffff"},
        },
    ],
}

CONDITIONING = {
    "global_influence": 1.0,
    "background_influence": 0.35,
    "primary_region_influence": 1.0,
    "context_region_influence": 1.0,
}
OPTIONS = {
    "roi_padding": 0.15,
    "threshold": 0.5,
    "dilation": 0,
    "crop_factor": 1.5,
    "drop_size": 10,
}


def assignment(assignment_id, collector_id, resource_id):
    return {
        "id": assignment_id,
        "source": {"collector_id": collector_id, "resource_id": resource_id},
        "options": dict(OPTIONS),
    }


def job(job_id, region_id, assignments=None):
    return {
        "id": job_id,
        "region_ids": [region_id],
        "primary_region_id": region_id,
        "mask_composition": "union",
        "prompt_composition": "context",
        "conditioning": dict(CONDITIONING),
        "detector_assignments": list(assignments or []),
    }


class DetailerV3Tests(unittest.TestCase):
    def setUp(self):
        self.capabilities, self.resources = register_detailer_contracts()
        self.context = normalize_context(DOCUMENT, registry=self.capabilities)
        self.left_collector = "22222222-2222-4222-8222-222222222222"
        self.right_collector = "33333333-3333-4333-8333-333333333333"

    def test_v1_rejects_more_than_one_detector_assignment_per_job(self):
        payload = {"version": 1, "jobs": [job(
            "job-face",
            DOCUMENT["regions"][0]["id"],
            [
                assignment("assignment-a", self.left_collector, "face"),
                assignment("assignment-b", self.right_collector, "face"),
            ],
        )]}
        with self.assertRaisesRegex(RegionalContextError, "at most one"):
            transform_detailer_capability(self.context, payload, registry=self.capabilities)

    def test_two_jobs_resolve_independent_collectors_and_resources(self):
        left_binding = normalize_detector_binding(bbox_detector=object())
        right_binding = normalize_detector_binding(segm_detector=object(), sam_model=object())
        payload = {"version": 1, "jobs": [
            job("job-face", DOCUMENT["regions"][0]["id"], [assignment("assignment-face", self.left_collector, "face")]),
            job("job-eyes", DOCUMENT["regions"][1]["id"], [assignment("assignment-eyes", self.right_collector, "eyes")]),
        ]}
        configured = transform_detailer_capability(self.context, payload, registry=self.capabilities)
        providers = {
            self.left_collector: build_detector_provider(self.left_collector, {"face": left_binding}),
            self.right_collector: build_detector_provider(self.right_collector, {"eyes": right_binding}),
        }

        plan = materialize_detailer_plan(configured, providers, registry=self.capabilities)

        self.assertIs(plan["jobs"][0]["detector_binding"], left_binding)
        self.assertIs(plan["jobs"][1]["detector_binding"], right_binding)
        self.assertEqual([item["detector_id"] for item in plan["jobs"]], ["face", "eyes"])

    def test_two_jobs_reuse_one_provider_without_losing_resource_identity(self):
        face = normalize_detector_binding(sam_model=object())
        eyes = normalize_detector_binding(sam_model=object())
        payload = {"version": 1, "jobs": [
            job("job-face", DOCUMENT["regions"][0]["id"], [assignment("assignment-face", self.left_collector, "face")]),
            job("job-eyes", DOCUMENT["regions"][1]["id"], [assignment("assignment-eyes", self.left_collector, "eyes")]),
        ]}
        context = transform_detailer_capability(self.context, payload, registry=self.capabilities)
        provider = build_detector_provider(self.left_collector, {"face": face, "eyes": eyes})

        plan = materialize_detailer_plan(context, provider, registry=self.capabilities)

        self.assertIs(plan["jobs"][0]["detector_binding"], face)
        self.assertIs(plan["jobs"][1]["detector_binding"], eyes)

    def test_missing_collector_and_resource_fail_closed(self):
        payload = {"version": 1, "jobs": [job(
            "job-face", DOCUMENT["regions"][0]["id"],
            [assignment("assignment-face", self.left_collector, "missing")],
        )]}
        context = transform_detailer_capability(self.context, payload, registry=self.capabilities)
        with self.assertRaisesRegex(RegionalContextError, self.left_collector):
            materialize_detailer_plan(context, registry=self.capabilities)
        provider = build_detector_provider(
            self.left_collector, {"other": normalize_detector_binding(sam_model=object())},
        )
        with self.assertRaisesRegex(RegionalContextError, "missing"):
            materialize_detailer_plan(context, provider, registry=self.capabilities)

    def test_detector_free_job_materializes_without_a_provider(self):
        payload = {"version": 1, "jobs": [job("job-face", DOCUMENT["regions"][0]["id"])]}
        context = transform_detailer_capability(self.context, payload, registry=self.capabilities)
        plan = materialize_detailer_plan(context, registry=self.capabilities)
        self.assertIsNone(plan["jobs"][0]["detector_binding"])
        self.assertIsNone(plan["jobs"][0]["detector_id"])

    def test_legacy_plan_migration_requires_explicit_mapping_and_is_deterministic(self):
        legacy = {"schema": "bv.detailer_plan", "version": 1, "jobs": [{
            "id": "legacy-face",
            "region_ids": [DOCUMENT["regions"][0]["id"]],
            "detector_id": "face-yolo",
            "detector": {"threshold": 0.7},
        }]}
        with self.assertRaisesRegex(RegionalContextError, "explicit same-graph"):
            migrate_detailer_plan_v1(self.context, legacy, {}, registry=self.capabilities)
        mapping = {"face-yolo": {"collector_id": self.left_collector, "resource_id": "face"}}
        first = migrate_detailer_plan_v1(self.context, legacy, mapping, registry=self.capabilities)
        second = migrate_detailer_plan_v1(self.context, legacy, mapping, registry=self.capabilities)
        first_payload = first.require_capability(DETAILER_CAPABILITY)
        second_payload = second.require_capability(DETAILER_CAPABILITY)
        self.assertEqual(first_payload, second_payload)
        self.assertEqual(first_payload["jobs"][0]["detector_assignments"][0]["options"]["threshold"], 0.7)
        self.assertEqual(
            first_payload["jobs"][0]["detector_assignments"][0]["source"],
            {"collector_id": self.left_collector, "resource_id": "face"},
        )

    def test_capability_rejects_unavailable_detailer_region(self):
        payload = {"version": 1, "jobs": [job("job-missing", "missing-region")]}
        with self.assertRaisesRegex(RegionalContextError, "unavailable"):
            transform_detailer_capability(self.context, payload, registry=self.capabilities)

import json
from pathlib import Path
import sys
import unittest
from collections import namedtuple

import torch


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.detailer import (  # noqa: E402
    build_detailer_plan,
    compose_job_mask,
    detailer_job_at,
    filter_segs_labels,
    normalize_detector_binding,
    rebase_segs,
    register_detector,
    resolve_detector,
)


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        document = json.load(handle)
    document["version"] = 2
    for index, region in enumerate(document["regions"]):
        region["usage"] = "detailer"
        region["priority"] = 10 - index
    return document


class Detector:
    def detect(self, *args, **kwargs):
        return None


class RegionalDetailerTests(unittest.TestCase):
    def test_default_plan_contains_enabled_detailer_regions_in_priority_order(self):
        document = fixture()
        plan = build_detailer_plan(document)
        self.assertEqual(len(plan["jobs"]), len(document["regions"]))
        self.assertEqual(plan["jobs"][0]["region_ids"], [document["regions"][-1]["id"]])
        self.assertEqual(plan["jobs"][0]["prompt_composition"], "context")

    def test_config_combines_regions_and_resolves_stable_job(self):
        document = fixture()
        region_ids = [document["regions"][0]["id"], document["regions"][1]["id"]]
        config = {"schema": "bv.detailer_plan", "version": 1, "jobs": [{
            "id": "eyes", "region_ids": region_ids, "primary_region_id": region_ids[1],
            "mask_composition": "union", "prompt_composition": "combined", "detector_id": "eye-yolo",
            "conditioning": {"primary_region_influence": 1.4},
            "detector": {"roi_padding": 0.25, "threshold": 0.65},
        }]}
        job = detailer_job_at(build_detailer_plan(document, config), 0)
        self.assertEqual(job["id"], "eyes")
        self.assertEqual(job["detector_id"], "eye-yolo")
        self.assertEqual(job["conditioning"]["primary_region_influence"], 1.4)
        self.assertEqual(job["detector"]["roi_padding"], 0.25)
        mask = compose_job_mask(job, 160, 120)
        self.assertEqual(tuple(mask.shape), (1, 120, 160))
        self.assertGreater(float(mask.max()), 0.0)

    def test_plan_rejects_generation_only_region(self):
        document = fixture()
        document["regions"][0]["usage"] = "generation"
        with self.assertRaisesRegex(ValueError, "unavailable detailer regions"):
            build_detailer_plan(document, {"jobs": [{"region_ids": [document["regions"][0]["id"]]}]})

    def test_detector_binding_discards_non_callable_impact_sentinel(self):
        binding = normalize_detector_binding(bbox_detector=Detector(), segm_detector=object())
        self.assertTrue(binding["capabilities"]["bbox"])
        self.assertFalse(binding["capabilities"]["segmentation"])
        registry = register_detector(None, "eyes", binding)
        self.assertIs(resolve_detector(registry, "eyes"), binding)

    def test_rebase_segs_translates_crop_and_bbox_to_full_image(self):
        Segment = namedtuple("Segment", "cropped_image cropped_mask confidence crop_region bbox label control_net_wrapper")
        seg = Segment(None, torch.ones((5, 5)), 0.9, (1, 2, 11, 12), (2, 3, 9, 10), "eye", None)
        rebased = rebase_segs(((20, 30), [seg]), 100, 50, 400, 300)
        self.assertEqual(rebased[0], (300, 400))
        self.assertEqual(rebased[1][0].crop_region, (101, 52, 111, 62))
        self.assertEqual(rebased[1][0].bbox, (102, 53, 109, 60))

    def test_filter_segs_labels_is_case_insensitive(self):
        Segment = namedtuple("Segment", "label")
        segs = ((100, 100), [Segment("eye"), Segment("FACE")])
        filtered = filter_segs_labels(segs, ["face"])
        self.assertEqual([seg.label for seg in filtered[1]], ["FACE"])


if __name__ == "__main__":
    unittest.main()

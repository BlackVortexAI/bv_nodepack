import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from py.util.regional.context import RegionalContextError  # noqa: E402
from py.util.regional.detailer import normalize_detector_binding  # noqa: E402
from py.util.regional.detailer_v3 import (  # noqa: E402
    build_detector_provider,
    materialize_detailer_plan,
    register_detailer_contracts,
    transform_detailer_capability,
)


class ExampleWorkflowTests(unittest.TestCase):
    @staticmethod
    def detailer_workflow():
        return json.loads(
            (ROOT / "examples" / "workflows" / "bv-regional-v3-detailer-loop-two-jobs.json")
            .read_text(encoding="utf-8")
        )

    def test_detailer_loop_example_exercises_registered_detectors(self):
        workflow = self.detailer_workflow()
        nodes = {node["id"]: node for node in workflow["nodes"]}
        by_type = {node["type"]: node for node in workflow["nodes"]}
        registry = by_type["BV Detector Registry"]
        plan = by_type["BV Regional Detailer Plan"]
        resolver = by_type["BV Detailer Loop Job Resolver"]
        detect = by_type["BV Detailer Loop Detect to SEGS (Impact)"]
        detailer = by_type["DetailerForEachPipe"]
        loop_end = by_type["BV Detailer Loop End"]

        registry_config = json.loads(registry["widgets_values"][0])
        plan_config = json.loads(plan["widgets_values"][0])
        self.assertEqual(registry_config["version"], 2)
        self.assertEqual(len(registry_config["detectors"]), 2)
        self.assertTrue(all(job["detector_assignments"] for job in plan_config["jobs"]))
        self.assertEqual(
            {assignment["source"]["collector_id"] for job in plan_config["jobs"] for assignment in job["detector_assignments"]},
            {registry_config["collector_id"]},
        )

        links = {(link[1], link[3], link[4], link[5]) for link in workflow["links"]}
        self.assertIn((registry["id"], plan["id"], next(i for i, item in enumerate(plan["inputs"]) if item["name"] == "resource_provider"), "BV_RUNTIME_RESOURCE_PROVIDER"), links)
        self.assertIn((resolver["id"], detect["id"], 0, "BV_DETAILER_JOB"), links)
        self.assertIn((resolver["id"], detect["id"], 1, "IMAGE"), links)
        self.assertIn((resolver["id"], detect["id"], 2, "MASK"), links)
        self.assertIn((detect["id"], detailer["id"], 1, "SEGS"), links)
        self.assertIn((resolver["id"], detailer["id"], 0, "IMAGE"), links)
        self.assertIn((resolver["id"], detailer["id"], 2, "BASIC_PIPE"), links)
        self.assertIn((detailer["id"], loop_end["id"], 1, "IMAGE"), links)
        self.assertIs(nodes[detailer["id"]], detailer)

    def test_detailer_workflow_golden_fails_closed_for_broken_ids(self):
        workflow = self.detailer_workflow()
        by_type = {node["type"]: node for node in workflow["nodes"]}
        document = json.loads(by_type["BV Regional Prompt"]["widgets_values"][0])
        config = json.loads(by_type["BV Regional Detailer Plan"]["widgets_values"][0])
        collector = json.loads(by_type["BV Detector Registry"]["widgets_values"][0])
        capabilities, _resources = register_detailer_contracts()
        context = transform_detailer_capability(document, config, registry=capabilities)
        bindings = {
            resource["id"]: normalize_detector_binding(sam_model=object())
            for resource in collector["detectors"]
        }
        provider = build_detector_provider(collector["collector_id"], bindings)

        plan = materialize_detailer_plan(context, provider, registry=capabilities)
        self.assertEqual([job["detector_id"] for job in plan["jobs"]], ["Face", "Hand"])

        with self.assertRaisesRegex(RegionalContextError, "same graph"):
            materialize_detailer_plan(context, registry=capabilities)

        missing_resource_provider = build_detector_provider(
            collector["collector_id"], {"Other": normalize_detector_binding(sam_model=object())},
        )
        with self.assertRaisesRegex(RegionalContextError, "Face"):
            materialize_detailer_plan(context, missing_resource_provider, registry=capabilities)

        broken_region = json.loads(json.dumps(config))
        broken_region["jobs"][0]["region_ids"] = ["missing-region"]
        broken_region["jobs"][0]["primary_region_id"] = "missing-region"
        with self.assertRaisesRegex(RegionalContextError, "missing-region"):
            transform_detailer_capability(document, broken_region, registry=capabilities)


if __name__ == "__main__":
    unittest.main()

import json
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class ExampleWorkflowTests(unittest.TestCase):
    def test_detailer_loop_example_exercises_registered_detectors(self):
        workflow = json.loads(
            (ROOT / "examples" / "workflows" / "bv-regional-v3-detailer-loop-two-jobs.json")
            .read_text(encoding="utf-8")
        )
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


if __name__ == "__main__":
    unittest.main()

import json
import unittest

from py.nodes.bv_smart_pipe import BVSmartPipe


class SmartPipeTests(unittest.TestCase):
    def test_values_follow_slot_ids_across_chain(self):
        schema = [
            {"id": "model-id", "name": "model", "ordinal": 1},
            {"id": "image-id", "name": "image", "ordinal": 2},
        ]
        first_route = json.dumps({"nodeId": "first", "name": "Pipe"})
        second_route = json.dumps({"nodeId": "second", "name": "Pipe_1"})
        first = BVSmartPipe().run(json.dumps(schema), first_route, v_001="model-a", v_002="image-a")[0]
        second = BVSmartPipe().run(json.dumps(schema), second_route, pipe=first, v_002="image-b")[0]
        self.assertEqual({"model-id": "model-a", "image-id": "image-b"}, second["values"])
        self.assertEqual({"model-id": "first", "image-id": "second"}, second["writers"])

    def test_missing_connected_slot_blocks_validation(self):
        schema = [{"id": "gone", "name": "image", "ordinal": 1, "missing": True, "connected": True}]
        route = json.dumps({"nodeId": "pipe", "name": "Pipe"})
        result = BVSmartPipe.VALIDATE_INPUTS(json.dumps(schema), route)
        self.assertIn("still used", result)


if __name__ == "__main__":
    unittest.main()

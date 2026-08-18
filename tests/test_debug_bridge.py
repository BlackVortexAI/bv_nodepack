import unittest

from py.util.debug_bridge.service import DebugBridge, DebugBridgeError


class DebugBridgeTests(unittest.TestCase):
    def test_disabled_bridge_rejects_and_clears_snapshot(self):
        bridge = DebugBridge()
        with self.assertRaisesRegex(DebugBridgeError, "disabled"):
            bridge.publish({"1": {"class_type": "Test"}})
        bridge.set_enabled(True)
        bridge.publish({"1": {"class_type": "Test"}}, "Workflow")
        self.assertTrue(bridge.status()["snapshot_available"])
        bridge.set_enabled(False)
        self.assertFalse(bridge.status()["snapshot_available"])

    def test_snapshot_is_validated_copied_and_fingerprinted(self):
        bridge = DebugBridge()
        bridge.set_enabled(True)
        prompt = {"1": {"class_type": "Test", "inputs": {"text": "hello"}}}
        status = bridge.publish(prompt, " Debug ")
        prompt["1"]["inputs"]["text"] = "mutated"
        snapshot = bridge.snapshot()
        self.assertEqual(snapshot["prompt"]["1"]["inputs"]["text"], "hello")
        self.assertEqual(status["workflow_name"], "Debug")
        self.assertEqual(len(status["revision"]), 64)

    def test_snapshot_requires_string_node_ids_and_object_nodes(self):
        bridge = DebugBridge()
        bridge.set_enabled(True)
        for invalid in ({}, {1: {}}, {"1": "node"}):
            with self.subTest(invalid=invalid):
                with self.assertRaises(DebugBridgeError):
                    bridge.publish(invalid)


if __name__ == "__main__":
    unittest.main()

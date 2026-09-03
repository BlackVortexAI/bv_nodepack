import importlib.util
import json
import os
from pathlib import Path
import unittest
from unittest.mock import patch
import torch


MODULE_PATH = Path(__file__).parents[1] / "py" / "nodes" / "bv_titlebar_port_canary.py"
SPEC = importlib.util.spec_from_file_location("bv_titlebar_port_canary", MODULE_PATH)
MODULE = importlib.util.module_from_spec(SPEC)
_previous = os.environ.get("BV_ENABLE_TITLEBAR_PORT_CANARY")
os.environ["BV_ENABLE_TITLEBAR_PORT_CANARY"] = "1"
try:
    SPEC.loader.exec_module(MODULE)
finally:
    if _previous is None:
        os.environ.pop("BV_ENABLE_TITLEBAR_PORT_CANARY", None)
    else:
        os.environ["BV_ENABLE_TITLEBAR_PORT_CANARY"] = _previous


class TitlebarPortCanaryTests(unittest.TestCase):
    def test_tensor_transport_cpu_and_available_cuda(self):
        for device in ("cpu", "cuda"):
            if device == "cuda" and not torch.cuda.is_available():
                continue
            previous = None
            for marker in ("Tensor A", "Tensor B frisch"):
                provider = MODULE.BVTitlebarPortCanarySender().emit(marker, device)[2]
                tensor = provider["resources"]["canary"]["tensor"]
                result = MODULE.BVTitlebarPortCanaryReceiver().receive("", resource_provider=provider)
                check = json.loads(result["result"][0])["tensor_check"]
                self.assertTrue(check["passed"])
                self.assertTrue(check["device"].startswith(device))
                self.assertEqual(check["shape"], [2, 3])
                self.assertEqual(check["dtype"], "torch.float32")
                self.assertIs(provider["resources"]["canary"]["tensor"], tensor)
                self.assertNotEqual(previous, check["values"])
                previous = check["values"]

    def test_tensor_contract_rejects_corruption(self):
        for replacement in (None, torch.zeros(3), torch.zeros(2, 3, dtype=torch.int64), torch.zeros(2, 3)):
            provider = MODULE.BVTitlebarPortCanarySender().emit("tensor", "cpu")[2]
            provider["resources"]["canary"]["tensor"] = replacement
            with self.assertRaisesRegex(ValueError, "DG canary: received tensor"):
                MODULE.BVTitlebarPortCanaryReceiver().receive("", resource_provider=provider)
        provider = MODULE.BVTitlebarPortCanarySender().emit("tensor", "cpu")[2]
        provider["resources"]["canary"]["tensor_mode"] = "cuda"
        with self.assertRaisesRegex(ValueError, "contract mismatch"):
            MODULE.BVTitlebarPortCanaryReceiver().receive("", resource_provider=provider)

    def test_cuda_never_falls_back_to_cpu(self):
        with patch.object(torch.cuda, "is_available", return_value=False):
            with self.assertRaisesRegex(ValueError, "CUDA requested but unavailable"):
                MODULE.BVTitlebarPortCanarySender().emit("tensor", "cuda")

    def test_throw_away_nodes_are_registered_with_provider_slots(self):
        sender = MODULE.NODE_CLASS_MAPPINGS["BV Titlebar Port Canary Sender (THROW AWAY)"]
        receiver = MODULE.NODE_CLASS_MAPPINGS["BV Titlebar Port Canary Receiver (THROW AWAY)"]

        self.assertEqual(sender.RETURN_TYPES.count(MODULE.RUNTIME_PROVIDER), 1)
        self.assertEqual(sender.RETURN_NAMES[2], "resource_provider")
        inputs = receiver.INPUT_TYPES()
        self.assertIn("sender_id", inputs["required"])
        self.assertEqual(inputs["optional"]["resource_provider"][0], MODULE.RUNTIME_PROVIDER)
        self.assertEqual(inputs["optional"]["samples"][0], "IMAGE")

    def test_sender_emits_six_values_in_declared_order(self):
        values = MODULE.BVTitlebarPortCanarySender().emit()

        self.assertEqual(len(values), len(MODULE.BVTitlebarPortCanarySender.RETURN_TYPES))
        self.assertEqual(values[2]["schema"], "bv.runtime_resource_provider")
        self.assertEqual(values[0], "alpha")

    def test_receiver_reports_actual_payload_not_selected_sender_id(self):
        self.assertEqual(MODULE.BVTitlebarPortCanaryReceiver.RETURN_TYPES, ("STRING",))
        self.assertTrue(MODULE.BVTitlebarPortCanaryReceiver.OUTPUT_NODE)
        for marker in ("Root / A / Grüße", "Sibling B / changed 2"):
            provider = MODULE.BVTitlebarPortCanarySender().emit(marker)[2]
            result = MODULE.BVTitlebarPortCanaryReceiver().receive("unrelated-selection-id", resource_provider=provider)
            self.assertEqual(json.loads(result["result"][0]), provider["resources"]["canary"])
            self.assertEqual(result["ui"]["text"], list(result["result"]))
            self.assertEqual(json.loads(result["result"][0])["text"], marker)

    def test_receiver_rejects_missing_or_malformed_transport(self):
        for provider in (None, {}, "sender-1", {"schema": "bv.runtime_resource_provider", "resources": {}}):
            with self.assertRaisesRegex(ValueError, "DG canary"):
                MODULE.BVTitlebarPortCanaryReceiver().receive("valid-looking-sender-id", resource_provider=provider)


if __name__ == "__main__":
    unittest.main()

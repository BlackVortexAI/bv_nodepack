import importlib.util
import os
from pathlib import Path
import unittest
from unittest import mock


ROOT = Path(__file__).parents[1]
MODULE_PATH = ROOT / "py" / "nodes" / "bv_titlebar_port_canary.py"


def load_canary(value):
    name = f"bv_titlebar_port_canary_test_{value!r}".replace(" ", "_")
    spec = importlib.util.spec_from_file_location(name, MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    environment = {} if value is None else {"BV_TITLEBAR_PORT_CANARY": value}
    with mock.patch.dict(os.environ, environment, clear=True):
        spec.loader.exec_module(module)
    return module


class TitlebarProviderPortRuntimeCanaryTests(unittest.TestCase):
    def test_registration_requires_exact_one(self):
        for value in (None, "", "0", "true", "TRUE", " 1", "1 "):
            with self.subTest(value=value):
                module = load_canary(value)
                self.assertEqual(module.NODE_CLASS_MAPPINGS, {})
                self.assertEqual(module.NODE_DISPLAY_NAME_MAPPINGS, {})

        module = load_canary("1")
        self.assertEqual(
            set(module.NODE_CLASS_MAPPINGS),
            {module.SENDER_NAME, module.RECEIVER_NAME},
        )
        self.assertEqual(set(module.NODE_DISPLAY_NAME_MAPPINGS), set(module.NODE_CLASS_MAPPINGS))

    def test_sender_and_receiver_keep_provider_at_distinct_middle_indices(self):
        module = load_canary("1")
        sender = module.BVTitlebarPortCanarySender
        receiver = module.BVTitlebarPortCanaryReceiver

        self.assertEqual(len(sender.RETURN_TYPES), 6)
        self.assertEqual(sender.RETURN_TYPES[2], module.PROVIDER_TYPE)
        self.assertEqual(sender.RETURN_NAMES[2], "resource_provider")

        required = receiver.INPUT_TYPES()["required"]
        socket_names = list(required)[:6]
        self.assertEqual(socket_names, ["alpha", "beta", "gamma", "resource_provider", "delta", "epsilon"])
        self.assertEqual(required["resource_provider"][0], module.PROVIDER_TYPE)
        self.assertEqual(required["resource_provider"][1]["forceInput"], True)
        self.assertEqual(list(required)[3], "resource_provider")
        self.assertEqual(list(required)[6:], ["presentation_mode", "canary_note"])

    def test_nodes_are_executable_without_reordering_channel_contract(self):
        module = load_canary("1")
        payloads = module.BVTitlebarPortCanarySender().send("Native", "baseline")
        self.assertEqual(len(payloads), 6)
        self.assertEqual(payloads[2]["channel"], "resource_provider")
        result = module.BVTitlebarPortCanaryReceiver().receive(
            payloads[0], payloads[1], payloads[3], payloads[2], payloads[4], payloads[5], "Native", "baseline"
        )
        self.assertIn("sender[2]->receiver[3]", result[0])


if __name__ == "__main__":
    unittest.main()

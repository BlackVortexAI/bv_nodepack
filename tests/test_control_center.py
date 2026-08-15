import json
import unittest

from py.nodes.bv_control_center import BVControlCenterNode


class ControlCenterTests(unittest.TestCase):
    def test_enabled_control_with_unresolved_group_blocks(self):
        config = {
            "controls": [{
                "name": "Upscale",
                "enabled": True,
                "assignments": [{"groupPath": "Root / Upscale", "unresolved": True}],
            }]
        }
        result = BVControlCenterNode.VALIDATE_INPUTS(json.dumps(config))
        self.assertIn("Root / Upscale", result)

    def test_disabled_control_allows_unresolved_group(self):
        config = {"controls": [{"enabled": False, "assignments": [{"unresolved": True}]}]}
        self.assertTrue(BVControlCenterNode.VALIDATE_INPUTS(json.dumps(config)))


if __name__ == "__main__":
    unittest.main()

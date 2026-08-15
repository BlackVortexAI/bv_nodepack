import importlib.util
from pathlib import Path
import unittest


MODULE_PATH = Path(__file__).parents[1] / "py" / "nodes" / "bv_util_hex_color_int.py"
SPEC = importlib.util.spec_from_file_location("bv_hex_color", MODULE_PATH)
HEX_COLOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(HEX_COLOR)


class HexColorTests(unittest.TestCase):
    def setUp(self):
        self.node = HEX_COLOR.BVHexColorToInt()

    def test_expands_short_rgb(self):
        self.assertEqual(self.node.run("#3af"), (0x33AAFF,))
        self.assertEqual(self.node.run("3AF"), (0x33AAFF,))

    def test_keeps_supported_six_digit_formats(self):
        self.assertEqual(self.node.run("#12abEF"), (0x12ABEF,))
        self.assertEqual(self.node.run("0x12abef"), (0x12ABEF,))

    def test_rejects_alpha_and_invalid_values(self):
        for value in ("#12345678", "#12", "not-a-color"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    self.node.run(value)


if __name__ == "__main__":
    unittest.main()

import unittest
import math

from py.nodes.bv_inspect_any import BVInspectAnyNode
from py.util.inspect_any import inspect_value


class BrokenObject:
    def __str__(self):
        raise RuntimeError("no")

    def __repr__(self):
        raise RuntimeError("no")


class FakeTensor:
    shape = (1, 4, 64, 64)
    dtype = "float32"
    device = "cuda:0"

    def tolist(self):
        raise AssertionError("must not materialize")


class EndlessShape:
    def __iter__(self):
        return iter(range(1_000_000_000))


class EndlessTensor:
    shape = EndlessShape()
    dtype = "float16"
    device = "cpu"


class FakeModelPatcher:
    def __str__(self):
        raise AssertionError("must not stringify model internals")


class GuardedBytearray(bytearray):
    def __bytes__(self):
        raise AssertionError("must not materialize the complete buffer")


class InspectAnyTests(unittest.TestCase):
    def test_primitives_and_unicode_are_readable(self):
        self.assertEqual(inspect_value(None).text, "None")
        self.assertEqual(inspect_value(True).text, "True")
        self.assertEqual(inspect_value(12.5).text, "12.5")
        self.assertEqual(inspect_value(math.nan).text, "NaN")
        self.assertEqual(inspect_value(math.inf).text, "Infinity")
        self.assertEqual(inspect_value("Grüße\n世界").text, "Grüße\n世界")

    def test_structures_are_pretty_bounded_and_cycle_safe(self):
        value = {"items": [1, 2], "tuple": (True, None)}
        self.assertIn('"items": [', inspect_value(value).text)
        cyclic = []
        cyclic.append(cyclic)
        result = inspect_value(cyclic)
        self.assertTrue(result.truncated)
        self.assertIn("cycle", result.text)
        broad = inspect_value(list(range(100)), max_items=3)
        self.assertTrue(broad.truncated)
        self.assertIn("item limit", broad.text)
        deep = inspect_value([[[[1]]]], max_depth=2)
        self.assertTrue(deep.truncated)
        self.assertIn("depth limit", deep.text)
        keyed = inspect_value({1 << 100_000: "value"})
        self.assertIn("<int bits=100001>", keyed.text)

    def test_character_and_line_limits_are_hard(self):
        chars = inspect_value("x" * 200, max_chars=64)
        self.assertLessEqual(len(chars.text), 64)
        self.assertIn("value limit", chars.text)
        lines = inspect_value("\n".join(str(i) for i in range(20)), max_chars=200, max_lines=3)
        self.assertTrue(lines.truncated)
        self.assertIn("line limit", lines.text)
        nested = inspect_value(["x" * 100_000 for _ in range(20)], max_chars=256)
        self.assertLessEqual(len(nested.text), 256)
        self.assertTrue(nested.truncated)
        self.assertIn("limit", nested.text)

    def test_heavy_and_broken_objects_do_not_walk_or_raise(self):
        tensor = inspect_value(FakeTensor())
        self.assertIn("shape=[1, 4, 64, 64]", tensor.text)
        self.assertIn("device=cuda:0", tensor.text)
        broken = inspect_value(BrokenObject())
        self.assertEqual(broken.text, f"<{BrokenObject.__module__}.BrokenObject>")
        endless = inspect_value(EndlessTensor())
        self.assertIn("shape=[0, 1, 2", endless.text)
        self.assertIn("…]", endless.text)
        model = inspect_value(FakeModelPatcher())
        self.assertEqual(model.text, f"<{FakeModelPatcher.__module__}.FakeModelPatcher>")
        latent = inspect_value({"samples": FakeTensor(), "batch_index": [0]})
        self.assertIn("shape=[1, 4, 64, 64]", latent.text)

    def test_binary_values_are_summarized(self):
        result = inspect_value(GuardedBytearray(range(64)))
        self.assertIn("length=64", result.text)
        self.assertIn("…", result.text)
        self.assertTrue(result.truncated)

    def test_huge_integers_are_summarized_before_string_conversion(self):
        positive = inspect_value(1 << 100_000)
        negative = inspect_value(-(1 << 100_000))
        self.assertEqual(positive.text, "<int bits=100001>")
        self.assertEqual(negative.text, "<int bits=100001>")

    def test_node_returns_the_same_bounded_ui_and_string_result(self):
        result = BVInspectAnyNode().inspect("x" * 20_000)
        self.assertEqual(result["ui"]["text"][0], result["result"][0])
        self.assertLessEqual(len(result["result"][0]), 16_384)
        self.assertTrue(result["ui"]["truncated"][0])
        self.assertEqual(BVInspectAnyNode.RETURN_TYPES, ("STRING",))
        self.assertEqual(BVInspectAnyNode.RETURN_NAMES, ("text",))
        self.assertTrue(BVInspectAnyNode.OUTPUT_NODE)
        self.assertFalse(hasattr(BVInspectAnyNode, "IS_CHANGED"))


if __name__ == "__main__":
    unittest.main()

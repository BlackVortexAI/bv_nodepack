import unittest

from py.nodes.bv_subgraph_dynamic_combo import BVDynamicCombo


class DynamicComboTests(unittest.TestCase):
    def test_rejects_stale_selection(self):
        with self.assertRaisesRegex(Exception, "not present"):
            BVDynamicCombo().run("old", "new")

    def test_rejects_duplicate_options(self):
        with self.assertRaisesRegex(Exception, "duplicate"):
            BVDynamicCombo().run("one", "one\none")

    def test_rejects_non_finite_connected_float(self):
        prompt = {"consumer": {"inputs": {"value": ["combo", 2]}}}
        with self.assertRaisesRegex(Exception, "finite"):
            BVDynamicCombo().run("NaN", "NaN", prompt=prompt, unique_id="combo")


if __name__ == "__main__":
    unittest.main()

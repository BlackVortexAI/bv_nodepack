import unittest

from py.nodes.bv_smart_pipe_merge import BVSmartPipeMerge, merge_smart_pipes


def pipe(schema, values, writers, provenance=None):
    result = {"version": 2, "schema": schema, "values": values, "writers": writers}
    if provenance is not None:
        result["provenance"] = provenance
    return result


class SmartPipeMergeTests(unittest.TestCase):
    def test_later_sources_win_for_the_same_stable_id(self):
        first = pipe(
            [{"id": "image", "name": "image", "ordinal": 1, "type": "IMAGE"}],
            {"image": "base"},
            {"image": "writer-a"},
        )
        second = pipe(
            [{"id": "image", "name": "image", "ordinal": 4, "type": "IMAGE"}],
            {"image": "detail"},
            {"image": "writer-b"},
        )
        merged = merge_smart_pipes([first, second])
        self.assertEqual(merged["values"]["image"], "detail")
        self.assertEqual(merged["writers"]["image"], "writer-b")
        self.assertEqual(merged["schema"][0]["ordinal"], 1)

    def test_compatible_slots_with_the_same_name_are_coalesced(self):
        first = pipe(
            [{"id": "image-a", "name": "image", "ordinal": 1, "type": "IMAGE"}],
            {"image-a": "a"},
            {"image-a": "writer-a"},
        )
        second = pipe(
            [{"id": "image-b", "name": "image", "ordinal": 1, "type": "IMAGE"}],
            {"image-b": "b"},
            {"image-b": "writer-b"},
        )
        merged = merge_smart_pipes([first, second])
        self.assertEqual([slot["name"] for slot in merged["schema"]], ["image"])
        self.assertEqual(merged["values"], {"image-a": "b"})

    def test_same_name_with_incompatible_types_remains_separate(self):
        first = pipe(
            [{"id": "value-a", "name": "value", "ordinal": 1, "type": "STRING"}],
            {"value-a": "text"},
            {"value-a": "writer-a"},
        )
        second = pipe(
            [{"id": "value-b", "name": "value", "ordinal": 1, "type": "IMAGE"}],
            {"value-b": "image"},
            {"value-b": "writer-b"},
        )
        merged = merge_smart_pipes([first, second])
        self.assertEqual([slot["name"] for slot in merged["schema"]], ["value", "value_2"])

    def test_inherited_base_does_not_overwrite_a_genuine_branch_write(self):
        schema = [{"id": "x", "name": "x", "ordinal": 1}]
        changed = pipe(schema, {"x": "changed"}, {"x": "branch-a"}, {"x": ["root", "branch-a"]})
        inherited = pipe(schema, {"x": "base"}, {"x": "root"}, {"x": ["root"]})
        merged = merge_smart_pipes([changed, inherited])
        self.assertEqual(merged["values"]["x"], "changed")
        self.assertEqual(merged["writers"]["x"], "branch-a")

    def test_later_divergent_branch_write_still_wins(self):
        schema = [{"id": "x", "name": "x", "ordinal": 1}]
        first = pipe(schema, {"x": "a"}, {"x": "branch-a"}, {"x": ["root", "branch-a"]})
        second = pipe(schema, {"x": "b"}, {"x": "branch-b"}, {"x": ["root", "branch-b"]})
        merged = merge_smart_pipes([first, second])
        self.assertEqual(merged["values"]["x"], "b")
        self.assertEqual(merged["writers"]["x"], "branch-b")

    def test_node_uses_explicit_source_order(self):
        first = pipe([{"id": "x", "name": "x", "ordinal": 1}], {"x": 1}, {"x": "a"})
        second = pipe([{"id": "x", "name": "x", "ordinal": 1}], {"x": 2}, {"x": "b"})
        result = BVSmartPipeMerge().run(
            '[{"key":"pipe_002"},{"key":"pipe_001"}]',
            pipe_001=first,
            pipe_002=second,
        )[0]
        self.assertEqual(result["values"]["x"], 1)
        self.assertEqual(result["writers"]["x"], "a")

    def test_configured_missing_source_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "pipe_001"):
            BVSmartPipeMerge().run('[{"key":"pipe_001","mode":"wireless"}]')

    def test_duplicate_source_addresses_are_rejected(self):
        config = '[{"key":"pipe_001","address":"root/a"},{"key":"pipe_002","address":"root/a"}]'
        self.assertIn("same source", BVSmartPipeMerge.VALIDATE_INPUTS(config))


if __name__ == "__main__":
    unittest.main()

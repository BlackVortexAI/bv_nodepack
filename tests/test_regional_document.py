import copy
import json
from pathlib import Path
import sys
import unittest


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.document import (  # noqa: E402
    RegionalValidationError,
    parse_document,
    select_scope,
    selection_prompts,
    serialize_document,
)


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        return json.load(handle)


class RegionalDocumentTests(unittest.TestCase):
    def test_fixture_round_trips_canonically(self):
        document = parse_document(fixture())
        self.assertEqual(parse_document(serialize_document(document)), document)

    def test_reserved_overlap_is_storable_but_not_executable(self):
        document = fixture()
        document["overlap"]["mode"] = "priority"
        self.assertEqual(parse_document(document, executable=False)["overlap"]["mode"], "priority")
        with self.assertRaisesRegex(RegionalValidationError, "reserved but not executable"):
            parse_document(document)

    def test_parent_cycle_and_out_of_bounds_rectangle_are_rejected(self):
        document = fixture()
        document["regions"][0]["parent_region_id"] = document["regions"][1]["id"]
        document["regions"][0]["geometry"][0]["width"] = 0.95
        with self.assertRaises(RegionalValidationError) as context:
            parse_document(document)
        message = str(context.exception)
        self.assertIn("cycle", message)
        self.assertIn("inside normalized canvas", message)

    def test_prompt_selection_returns_ast_plain_and_source(self):
        selection = select_scope(fixture(), "region", "Face left")
        positive, negative = selection_prompts(selection)
        self.assertEqual(selection["region_id"], fixture()["regions"][1]["id"])
        self.assertIn("green eyes", positive["text"])
        self.assertIn("@<eyes>", positive["source"])
        self.assertEqual(negative["text"], "asymmetrical eyes")

    def test_duplicate_shape_id_is_rejected(self):
        document = copy.deepcopy(fixture())
        document["regions"][1]["geometry"][0]["id"] = document["regions"][0]["geometry"][0]["id"]
        with self.assertRaisesRegex(RegionalValidationError, "globally unique"):
            parse_document(document)

    def test_optional_layer_metadata_and_brush_modes_are_validated(self):
        document = fixture()
        shape = document["regions"][0]["geometry"][1]
        shape["enabled"] = True
        shape["layer_id"] = shape["id"]
        shape["authoring"] = {"name": "Hair", "visible": True, "locked": False}
        shape["shape"] = "square"
        shape["pressure_mode"] = "constant"
        self.assertEqual(parse_document(document)["regions"][0]["geometry"][1]["shape"], "square")
        shape["pressure_mode"] = "mouse-ish"
        with self.assertRaisesRegex(RegionalValidationError, "pressure_mode"):
            parse_document(document)

    def test_multiple_operations_may_share_one_layer_id(self):
        document = fixture()
        shapes = document["regions"][0]["geometry"][:2]
        layer_id = shapes[0]["id"]
        shapes[0]["layer_id"] = layer_id
        shapes[1]["layer_id"] = layer_id
        parsed = parse_document(document)
        self.assertEqual(parsed["regions"][0]["geometry"][0]["layer_id"], parsed["regions"][0]["geometry"][1]["layer_id"])


if __name__ == "__main__":
    unittest.main()

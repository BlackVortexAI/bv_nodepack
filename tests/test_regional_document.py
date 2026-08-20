import base64
import copy
import io
import json
from pathlib import Path
import sys
import unittest

from PIL import Image


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


def raster_data_url():
    image = Image.new("RGBA", (2, 1), (255, 255, 255, 255))
    payload = io.BytesIO()
    image.save(payload, format="PNG")
    return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")


class RegionalDocumentTests(unittest.TestCase):
    def test_fixture_round_trips_canonically(self):
        document = parse_document(fixture())
        self.assertEqual(parse_document(serialize_document(document)), document)

    def test_v1_migrates_to_v2_generation_usage(self):
        document = parse_document(fixture())
        self.assertEqual(document["version"], 2)
        self.assertTrue(all(region["usage"] == "generation" for region in document["regions"]))

    def test_v2_accepts_detailer_and_both_usage(self):
        document = parse_document(fixture())
        document["regions"][0]["usage"] = "detailer"
        document["regions"][1]["usage"] = "both"
        self.assertEqual(parse_document(document)["regions"][0]["usage"], "detailer")

    def test_invalid_region_usage_is_rejected(self):
        document = parse_document(fixture())
        document["regions"][0]["usage"] = "upscaler"
        with self.assertRaisesRegex(RegionalValidationError, "usage"):
            parse_document(document)

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

    def test_raster_mask_contract_is_validated(self):
        document = fixture()
        shape = {
            "id": "20000000-0000-4000-8000-000000000095",
            "type": "raster_mask",
            "operation": "add",
            "x": 0.1,
            "y": 0.2,
            "width": 0.4,
            "height": 0.3,
            "pixel_width": 2,
            "pixel_height": 1,
            "data_url": raster_data_url(),
        }
        document["regions"][0]["geometry"] = [shape]
        self.assertEqual(parse_document(document)["regions"][0]["geometry"][0]["type"], "raster_mask")
        shape["data_url"] = "data:image/png;base64,bm90IGEgcG5n"
        with self.assertRaisesRegex(RegionalValidationError, "PNG data"):
            parse_document(document)

    def test_ellipse_and_polygon_contracts_are_validated(self):
        document = fixture()
        document["regions"][0]["geometry"] = [
            {"id": "20000000-0000-4000-8000-000000000081", "type": "ellipse", "operation": "add", "x": 0.1, "y": 0.2, "width": 0.4, "height": 0.3},
            {"id": "20000000-0000-4000-8000-000000000082", "type": "polygon", "operation": "subtract", "points": [
                {"x": 0.2, "y": 0.2, "pressure": 1.0}, {"x": 0.4, "y": 0.2, "pressure": 1.0}, {"x": 0.3, "y": 0.4, "pressure": 1.0},
            ]},
        ]
        self.assertEqual([shape["type"] for shape in parse_document(document)["regions"][0]["geometry"]], ["ellipse", "polygon"])
        document["regions"][0]["geometry"][1]["points"] = document["regions"][0]["geometry"][1]["points"][:2]
        with self.assertRaisesRegex(RegionalValidationError, "at least three vertices"):
            parse_document(document)


if __name__ == "__main__":
    unittest.main()

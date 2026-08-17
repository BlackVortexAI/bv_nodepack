import base64
import io
import json
from pathlib import Path
import sys
import unittest

import torch
from PIL import Image


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.document import select_scope  # noqa: E402
from util.regional.mask_renderer import mask_bbox, render_selection  # noqa: E402


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        return json.load(handle)


def raster_data_url(alpha):
    image = Image.new("RGBA", (len(alpha[0]), len(alpha)), (255, 255, 255, 0))
    image.putdata([(255, 255, 255, value) for row in alpha for value in row])
    payload = io.BytesIO()
    image.save(payload, format="PNG")
    return "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii")


class RegionalMaskTests(unittest.TestCase):
    def test_global_is_full_and_background_is_inverse_union(self):
        document = fixture()
        global_mask = render_selection(select_scope(document, "global"), 96, 64)
        background = render_selection(select_scope(document, "background"), 96, 64)
        self.assertEqual(tuple(global_mask.shape), (1, 64, 96))
        self.assertTrue(torch.all(global_mask == 1))
        self.assertGreater(float(background.max()), 0)
        self.assertLess(float(background.mean()), 1)

    def test_rectangle_region_has_expected_bbox_without_feather(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        mask = render_selection(select_scope(document, "region", region["id"]), 100, 100)
        self.assertEqual(mask_bbox(mask), (22, 16, 20, 24))

    def test_brush_and_subtract_are_finite_and_bounded(self):
        document = fixture()
        mask = render_selection(select_scope(document, "region", "Person left"), 80, 64)
        self.assertTrue(torch.isfinite(mask).all())
        self.assertGreaterEqual(float(mask.min()), 0)
        self.assertLessEqual(float(mask.max()), 1)

    def test_square_brush_covers_corner_that_round_brush_does_not(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        stroke = {
            "id": "20000000-0000-4000-8000-000000000099",
            "type": "brush_stroke",
            "operation": "add",
            "size": 0.2,
            "hardness": 1.0,
            "opacity": 1.0,
            "points": [{"x": 0.5, "y": 0.5, "pressure": 1.0}],
        }
        region["geometry"] = [stroke]
        selection = select_scope(document, "region", region["id"])
        round_mask = render_selection(selection, 100, 100)
        stroke["shape"] = "square"
        square_mask = render_selection(select_scope(document, "region", region["id"]), 100, 100)
        self.assertEqual(float(round_mask[0, 59, 59]), 0)
        self.assertEqual(float(square_mask[0, 59, 59]), 1)

    def test_disabled_geometry_is_skipped_without_changing_layer_order(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        region["geometry"][0]["enabled"] = False
        mask = render_selection(select_scope(document, "region", region["id"]), 100, 100)
        self.assertEqual(float(mask.sum()), 0)

    def test_subtract_affects_only_its_grouped_layer(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        region["geometry"] = [
            {"id": "20000000-0000-4000-8000-000000000091", "layer_id": "30000000-0000-4000-8000-000000000001", "type": "rect", "operation": "add", "x": 0.0, "y": 0.0, "width": 0.6, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000092", "layer_id": "30000000-0000-4000-8000-000000000002", "type": "rect", "operation": "add", "x": 0.4, "y": 0.0, "width": 0.4, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000093", "layer_id": "30000000-0000-4000-8000-000000000001", "type": "rect", "operation": "subtract", "x": 0.4, "y": 0.0, "width": 0.2, "height": 1.0},
        ]
        mask = render_selection(select_scope(document, "region", region["id"]), 100, 100)
        self.assertEqual(float(mask[0, 50, 50]), 1)

    def test_legacy_flat_operations_keep_original_subtract_semantics(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        region["geometry"] = [
            {"id": "20000000-0000-4000-8000-000000000094", "type": "rect", "operation": "add", "x": 0.0, "y": 0.0, "width": 0.6, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000095", "type": "rect", "operation": "add", "x": 0.4, "y": 0.0, "width": 0.4, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000096", "type": "rect", "operation": "subtract", "x": 0.4, "y": 0.0, "width": 0.2, "height": 1.0},
        ]
        mask = render_selection(select_scope(document, "region", region["id"]), 100, 100)
        self.assertEqual(float(mask[0, 50, 50]), 0)

    def test_merged_editor_layer_keeps_independent_mask_groups(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        common_layer = "30000000-0000-4000-8000-000000000010"
        region["geometry"] = [
            {"id": "20000000-0000-4000-8000-000000000097", "layer_id": common_layer, "mask_group_id": "30000000-0000-4000-8000-000000000001", "type": "rect", "operation": "add", "x": 0.0, "y": 0.0, "width": 0.6, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000098", "layer_id": common_layer, "mask_group_id": "30000000-0000-4000-8000-000000000001", "type": "rect", "operation": "subtract", "x": 0.4, "y": 0.0, "width": 0.2, "height": 1.0},
            {"id": "20000000-0000-4000-8000-000000000099", "layer_id": common_layer, "mask_group_id": "30000000-0000-4000-8000-000000000002", "type": "rect", "operation": "add", "x": 0.4, "y": 0.0, "width": 0.4, "height": 1.0},
        ]
        mask = render_selection(select_scope(document, "region", region["id"]), 10, 4)
        self.assertTrue(torch.all(mask[0, :, :8] == 1))
        self.assertTrue(torch.all(mask[0, :, 8:] == 0))

    def test_cropped_raster_mask_preserves_alpha_and_bounds(self):
        document = fixture()
        region = document["regions"][1]
        region["mask"]["feather"] = 0
        region["geometry"] = [{
            "id": "20000000-0000-4000-8000-000000000096",
            "layer_id": "20000000-0000-4000-8000-000000000096",
            "type": "raster_mask",
            "operation": "add",
            "x": 0.2,
            "y": 0.25,
            "width": 0.2,
            "height": 0.5,
            "pixel_width": 2,
            "pixel_height": 2,
            "data_url": raster_data_url([[255, 0], [128, 255]]),
        }]
        mask = render_selection(select_scope(document, "region", region["id"]), 10, 4)[0]
        self.assertEqual(float(mask[1, 2]), 1.0)
        self.assertEqual(float(mask[1, 3]), 0.0)
        self.assertAlmostEqual(float(mask[2, 2]), 128 / 255, places=5)
        self.assertEqual(float(mask[2, 3]), 1.0)
        self.assertEqual(float(mask[:, :2].sum()), 0.0)


if __name__ == "__main__":
    unittest.main()

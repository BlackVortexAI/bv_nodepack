import json
from pathlib import Path
import sys
import unittest

import torch


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))

from util.regional.color_control import compile_color_control  # noqa: E402
from util.regional.context import normalize_context  # noqa: E402


def document():
    return {
        "schema": "bv.regional",
        "version": 1,
        "document_id": "00000000-0000-4000-8000-000000000001",
        "title": "Color control contract",
        "canvas": {"width": 4, "height": 2},
        "prompts": {
            "global": {"positive_source": "", "negative_source": ""},
            "background": {"positive_source": "", "negative_source": ""},
        },
        "negative_mode": "auto",
        "overlap": {"mode": "joint"},
        "regions": [
            {
                "id": "10000000-0000-4000-8000-000000000001",
                "name": "Top priority",
                "parent_region_id": None,
                "enabled": True,
                "strength": 1,
                "priority": 0,
                "prompts": {"positive_source": "", "negative_source": ""},
                "mask": {"feather": 0.2},
                "geometry": [{"id": "20000000-0000-4000-8000-000000000001", "type": "rect", "operation": "add", "x": 0.25, "y": 0, "width": 0.5, "height": 1}],
                "authoring": {"visible": True, "locked": False, "color": "#010203"},
            },
            {
                "id": "10000000-0000-4000-8000-000000000002",
                "name": "Lower priority",
                "parent_region_id": None,
                "enabled": True,
                "strength": 1,
                "priority": 1,
                "prompts": {"positive_source": "", "negative_source": ""},
                "mask": {"feather": 0},
                "geometry": [{"id": "20000000-0000-4000-8000-000000000002", "type": "rect", "operation": "add", "x": 0.5, "y": 0, "width": 0.5, "height": 1}],
                "authoring": {"visible": True, "locked": False, "color": "#FFFFFF"},
            },
        ],
    }


class RegionalColorControlTests(unittest.TestCase):
    def test_v3_context_compiles_through_existing_consumer(self):
        source = document()
        image, legend = compile_color_control(normalize_context(source))
        self.assertEqual(tuple(image.shape[-3:]), (source["canvas"]["height"], source["canvas"]["width"], 3))
        self.assertEqual(legend["schema"], "bv.regional.color_control")

    def test_control_image_is_white_with_solid_priority_winning_regions(self):
        image, legend = compile_color_control(document())
        entries = {entry["name"]: entry for entry in legend["regions"]}
        top = torch.tensor(entries["Top priority"]["rgb"], dtype=torch.float32)
        lower = torch.tensor(entries["Lower priority"]["rgb"], dtype=torch.float32)

        self.assertEqual(tuple(image.shape), (1, 2, 4, 3))
        self.assertTrue(torch.equal(image[0, 0, 0], torch.ones(3)))
        self.assertTrue(torch.equal(image[0, 0, 1], top))
        self.assertTrue(torch.equal(image[0, 0, 2], top))
        self.assertTrue(torch.equal(image[0, 0, 3], lower))
        self.assertFalse(torch.equal(top, lower))
        self.assertNotEqual(entries["Top priority"]["color"], "#010203")
        self.assertEqual(legend["overlap_policy"], "priority_wins")

    def test_region_colors_are_deterministic_and_legend_is_json_serializable(self):
        first_image, first = compile_color_control(document())
        second_image, second = compile_color_control(document())
        self.assertTrue(torch.equal(first_image, second_image))
        self.assertEqual(first, second)
        json.dumps(first)


if __name__ == "__main__":
    unittest.main()

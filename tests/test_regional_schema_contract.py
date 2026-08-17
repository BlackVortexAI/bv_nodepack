import importlib.util
import base64
import io
import json
from pathlib import Path
import unittest

import jsonschema
from PIL import Image


ROOT = Path(__file__).parents[1]
SCHEMA_PATH = ROOT / "schemas" / "bv_regional_v1.schema.json"
FIXTURE_ROOT = ROOT / "tests" / "fixtures" / "regional"
PROMPT_MODULE_PATH = ROOT / "py" / "util" / "prompt" / "category.py"

PROMPT_SPEC = importlib.util.spec_from_file_location(
    "bv_prompt_category_for_regional_contract",
    PROMPT_MODULE_PATH,
)
PROMPT = importlib.util.module_from_spec(PROMPT_SPEC)
PROMPT_SPEC.loader.exec_module(PROMPT)


def load_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def collect_categories(node):
    categories = []
    category = node.get("cat")
    if category and category != "default":
        categories.append(category)
    for child in node.get("children", []) or []:
        categories.extend(collect_categories(child))
    return categories


class RegionalSchemaContractTests(unittest.TestCase):
    def test_schema_identity_and_reserved_overlap_modes_are_explicit(self):
        schema = load_json(SCHEMA_PATH)

        self.assertEqual(schema["properties"]["schema"]["const"], "bv.regional")
        self.assertEqual(schema["properties"]["version"]["const"], 1)
        self.assertEqual(
            schema["$defs"]["overlap"]["properties"]["mode"]["enum"],
            ["joint", "normalized", "priority", "exclusive"],
        )

    def test_all_contract_fixtures_use_v1_and_have_unique_ids(self):
        manifest = load_json(FIXTURE_ROOT / "manifest.json")

        for entry in manifest["documents"]:
            with self.subTest(file=entry["file"]):
                document = load_json(FIXTURE_ROOT / entry["file"])
                self.assertEqual(document["schema"], "bv.regional")
                self.assertEqual(document["version"], 1)
                self.assertEqual(len(document["regions"]), entry["expected_regions"])

                ids = [document["document_id"]]
                for region in document["regions"]:
                    ids.append(region["id"])
                    ids.extend(shape["id"] for shape in region["geometry"])
                self.assertEqual(len(ids), len(set(ids)))

    def test_fixture_prompt_sources_parse_with_existing_bv_ast_parser(self):
        manifest = load_json(FIXTURE_ROOT / "manifest.json")

        for entry in manifest["documents"]:
            with self.subTest(file=entry["file"]):
                document = load_json(FIXTURE_ROOT / entry["file"])
                sources = []
                for scope in ("global", "background"):
                    prompts = document["prompts"][scope]
                    sources.extend(
                        (prompts["positive_source"], prompts["negative_source"])
                    )
                for region in document["regions"]:
                    sources.extend(
                        (
                            region["prompts"]["positive_source"],
                            region["prompts"]["negative_source"],
                        )
                    )

                categories = []
                for source in sources:
                    categories.extend(
                        collect_categories(PROMPT.parse_prompt_to_ast(source))
                    )

                self.assertEqual(
                    sorted(set(categories)),
                    sorted(entry["expected_prompt_categories"]),
                )

    def test_optional_geometry_layer_and_brush_authoring_fields_validate(self):
        schema = load_json(SCHEMA_PATH)
        document = load_json(FIXTURE_ROOT / "v1_hybrid_joint.json")
        rectangle = document["regions"][1]["geometry"][0]
        rectangle["enabled"] = True
        rectangle["authoring"] = {"name": "Face box", "visible": True, "locked": False}
        brush = document["regions"][0]["geometry"][1]
        brush["enabled"] = True
        brush["layer_id"] = brush["id"]
        brush["authoring"] = {"name": "Hair brush", "visible": True, "locked": False}
        brush["shape"] = "square"
        brush["pressure_mode"] = "stylus"
        jsonschema.Draft202012Validator(schema).validate(document)

    def test_raster_mask_geometry_validates(self):
        schema = load_json(SCHEMA_PATH)
        document = load_json(FIXTURE_ROOT / "v1_hybrid_joint.json")
        image = Image.new("RGBA", (2, 1), (255, 255, 255, 255))
        payload = io.BytesIO()
        image.save(payload, format="PNG")
        document["regions"][0]["geometry"] = [{
            "id": "20000000-0000-4000-8000-000000000094",
            "type": "raster_mask",
            "operation": "add",
            "x": 0.1,
            "y": 0.2,
            "width": 0.4,
            "height": 0.3,
            "pixel_width": 2,
            "pixel_height": 1,
            "data_url": "data:image/png;base64," + base64.b64encode(payload.getvalue()).decode("ascii"),
        }]
        jsonschema.Draft202012Validator(schema).validate(document)


if __name__ == "__main__":
    unittest.main()

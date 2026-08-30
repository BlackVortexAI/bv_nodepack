import ast
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]

EXPECTED_NODE_NAMES_BY_CATEGORY = {
    "__hidden__": {
        "BV Detailer Loop Advance (internal)",
        "BV Detailer Loop Result (internal)",
        "BV Detailer While End (internal)",
        "BV Detailer While Start (internal)",
        "BV LUT Loop Advance (Prototype internal)",
        "BV LUT Loop Result (Prototype internal)",
        "BV LUT While End (Prototype internal)",
        "BV LUT While Start (Prototype internal)",
    },
    "🌀 BV Node Pack/advanced/integrations": {"BV Detector Binding"},
    "🌀 BV Node Pack/control": {"BV Control Center"},
    "🌀 BV Node Pack/latent": {
        "BV Empty Latent Random Ratio",
        "BV Latent Random Rotate 90",
    },
    "🌀 BV Node Pack/latent/Deprecated Legacy Nodes": {
        "BV Latent Random Aspect Ratio",
    },
    "🌀 BV Node Pack/pipe": {"BV Smart Pipe", "BV Smart Pipe Merge"},
    "🌀 BV Node Pack/pipe/Deprecated Legacy Nodes": {
        "BV Pipe",
        "BV Pipe Config",
    },
    "🌀 BV Node Pack/prompting": {
        "BV Prompt AST Debug",
        "BV Prompt Category Switch",
        "BV Prompt Decode",
        "BV Prompt Encode",
    },
    "🌀 BV Node Pack/regional/core": {
        "BV Regional Debug",
        "BV Regional Deconstructor",
        "BV Regional Mask Render",
        "BV Regional Prompt",
        "BV Regional Prompt Extract",
        "BV Regional Select",
    },
    "🌀 BV Node Pack/regional/detailer": {
        "BV Detailer Loop End",
        "BV Detailer Loop Job Resolver",
        "BV Detailer Loop Start",
        "BV Detector Registry",
        "BV Regional Detailer Plan",
    },
    "🌀 BV Node Pack/regional/integrations/Impact Pack": {
        "BV Detailer Loop Detect to SEGS (Impact)",
        "BV Regional Detailer Mask",
    },
    "🌀 BV Node Pack/regional/LoRA": {"BV LoRA Registry", "BV Regional LoRA"},
    "🌀 BV Node Pack/regional/LoRA/Manual Chains (Optional)": {
        "BV LoRA Stack Collector",
        "BV Named LoRA Stack",
    },
    "🌀 BV Node Pack/regional/LUT": {
        "BV Apply LUT",
        "BV Impact Detector Mask",
        "BV LUT Loop End",
        "BV LUT Loop Job Resolver",
        "BV LUT Loop Start",
        "BV LUT Registry",
        "BV Regional LUT Plan",
    },
    "🌀 BV Node Pack/regional/LUT/Manual Chains (Optional)": {
        "BV LUT Job",
        "BV LUT Loader",
    },
    "🌀 BV Node Pack/regional/models/Anima": {
        "BV Regional Anima Adapter",
        "BV Regional Anima Conditioning",
        "BV Regional Anima LLLite",
        "BV Regional Color Control Image",
    },
    "🌀 BV Node Pack/regional/models/FLUX.2 Klein 9B": {
        "BV Regional FLUX.2 Klein 9B Attention",
    },
    "🌀 BV Node Pack/regional/models/Generic": {
        "BV Regional Native Conditioning",
    },
    "🌀 BV Node Pack/regional/models/Krea 2": {
        "BV Regional Krea 2 Attention",
    },
    "🌀 BV Node Pack/regional/models/SDXL": {
        "BV Regional SDXL Attention",
    },
    "🌀 BV Node Pack/regional/models/Z-Image": {
        "BV Regional Z-Image Attention",
    },
    "🌀 BV Node Pack/regional/output": {
        "BV Regional Image Save",
        "BV Regional Image Send",
    },
    "🌀 BV Node Pack/regional/prompt enhancement": {
        "BV Apply Regional Enhancement",
        "BV Comfy CLIP LLM Provider",
        "BV Regional Prompt Enhancer",
        "BV Remote LLM Provider",
    },
    "🌀 BV Node Pack/subgraph": {
        "BV Dynamic Combo",
        "BV Subgraph Divider",
        "BV Subgraph Heading",
        "BV Subgraph Spacer",
    },
    "🌀 BV Node Pack/utils": {
        "BV Hex Color To Int",
        "BV Inspect Any",
        "BV Seed",
        "BV Text Log Writer",
    },
}


def collect_literal_node_mapping_keys() -> set[str]:
    names: set[str] = set()
    for path in (ROOT / "py" / "nodes").glob("*.py"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for statement in tree.body:
            if not isinstance(statement, ast.Assign):
                continue
            if not any(
                isinstance(target, ast.Name)
                and target.id == "NODE_CLASS_MAPPINGS"
                for target in statement.targets
            ):
                continue
            if not isinstance(statement.value, ast.Dict):
                continue
            for key in statement.value.keys:
                if isinstance(key, ast.Constant) and isinstance(key.value, str):
                    names.add(key.value)
    return names


def resolve_string_expression(
    expression: ast.expr,
    constants: dict[str, str],
) -> str | None:
    if isinstance(expression, ast.Constant) and isinstance(expression.value, str):
        return expression.value
    if isinstance(expression, ast.Name):
        return constants.get(expression.id)
    if isinstance(expression, ast.JoinedStr):
        parts: list[str] = []
        for value in expression.values:
            if isinstance(value, ast.Constant) and isinstance(value.value, str):
                parts.append(value.value)
            elif isinstance(value, ast.FormattedValue):
                resolved = resolve_string_expression(value.value, constants)
                if resolved is None:
                    return None
                parts.append(resolved)
            else:
                return None
        return "".join(parts)
    return None


def collect_declared_node_categories(filename: str) -> dict[str, str]:
    path = ROOT / "py" / "nodes" / filename
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    constants: dict[str, str] = {}
    class_categories: dict[str, str] = {}
    node_classes: dict[str, str] = {}

    for statement in tree.body:
        if isinstance(statement, ast.Assign):
            value = resolve_string_expression(statement.value, constants)
            if value is not None:
                for target in statement.targets:
                    if isinstance(target, ast.Name):
                        constants[target.id] = value
            if any(
                isinstance(target, ast.Name) and target.id == "NODE_CLASS_MAPPINGS"
                for target in statement.targets
            ) and isinstance(statement.value, ast.Dict):
                for key, mapped_class in zip(
                    statement.value.keys,
                    statement.value.values,
                    strict=True,
                ):
                    if (
                        isinstance(key, ast.Constant)
                        and isinstance(key.value, str)
                        and isinstance(mapped_class, ast.Name)
                    ):
                        node_classes[key.value] = mapped_class.id
        elif isinstance(statement, ast.ClassDef):
            for class_statement in statement.body:
                if not isinstance(class_statement, ast.Assign):
                    continue
                if not any(
                    isinstance(target, ast.Name) and target.id == "CATEGORY"
                    for target in class_statement.targets
                ):
                    continue
                category = resolve_string_expression(class_statement.value, constants)
                if category is not None:
                    class_categories[statement.name] = category

    return {
        node_name: class_categories[class_name]
        for node_name, class_name in node_classes.items()
        if class_name in class_categories
    }


class NodeListTests(unittest.TestCase):
    def test_node_list_matches_all_declared_node_mapping_keys(self):
        node_list = json.loads(
            (ROOT / "node_list.json").read_text(encoding="utf-8")
        )
        self.assertEqual(set(node_list), collect_literal_node_mapping_keys())

    def test_node_list_descriptions_are_non_empty_strings(self):
        node_list = json.loads(
            (ROOT / "node_list.json").read_text(encoding="utf-8")
        )
        self.assertTrue(node_list)
        for node_name, description in node_list.items():
            with self.subTest(node=node_name):
                self.assertIsInstance(description, str)
                self.assertTrue(description.strip())

    def test_deprecated_nodes_live_below_their_product_families(self):
        from py.nodes.bv_latent_random_ratio import BVLatentRandomAspectRatio
        from py.nodes.bv_pipe import BVPipeNode
        from py.nodes.bv_pipe_config import BVPipeConfigNode

        self.assertEqual(
            BVPipeNode.CATEGORY,
            "🌀 BV Node Pack/pipe/Deprecated Legacy Nodes",
        )
        self.assertEqual(
            BVPipeConfigNode.CATEGORY,
            "🌀 BV Node Pack/pipe/Deprecated Legacy Nodes",
        )
        self.assertEqual(
            BVLatentRandomAspectRatio.CATEGORY,
            "🌀 BV Node Pack/latent/Deprecated Legacy Nodes",
        )

    def test_optional_manual_chains_live_below_their_product_families(self):
        categories: dict[str, str] = {}
        for path in (ROOT / "py" / "nodes").glob("*.py"):
            categories.update(collect_declared_node_categories(path.name))

        expected_categories = {
            node_name: category
            for category, node_names in EXPECTED_NODE_NAMES_BY_CATEGORY.items()
            for node_name in node_names
        }
        self.assertEqual(categories, expected_categories)

        manual_chain_names = {
            name
            for name, category in categories.items()
            if category.endswith("/Manual Chains (Optional)")
        }
        self.assertEqual(
            manual_chain_names,
            {
                "BV Named LoRA Stack",
                "BV LoRA Stack Collector",
                "BV LUT Job",
                "BV LUT Loader",
            },
        )

    def test_m0_feasibility_nodes_are_not_publicly_registered(self):
        from py.nodes.bv_regional_v3_m0 import (
            NODE_CLASS_MAPPINGS,
            NODE_DISPLAY_NAME_MAPPINGS,
        )

        self.assertEqual(NODE_CLASS_MAPPINGS, {})
        self.assertEqual(NODE_DISPLAY_NAME_MAPPINGS, {})
        node_list = json.loads((ROOT / "node_list.json").read_text(encoding="utf-8"))
        self.assertFalse(any(name.startswith("BV M0 Fake ") for name in node_list))


if __name__ == "__main__":
    unittest.main()

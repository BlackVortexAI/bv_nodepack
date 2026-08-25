import ast
import json
from pathlib import Path
import unittest


ROOT = Path(__file__).parents[1]


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

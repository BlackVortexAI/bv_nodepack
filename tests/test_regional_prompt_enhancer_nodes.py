import copy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest


ROOT = Path(__file__).parents[1]
PACKAGE = "bv_nodepack_enhancer_node_test"


def load_node_module():
    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(ROOT)]
    sys.modules[PACKAGE] = package
    for name, path in (
        (f"{PACKAGE}.py", ROOT / "py"),
        (f"{PACKAGE}.py.nodes", ROOT / "py" / "nodes"),
        (f"{PACKAGE}.py.util", ROOT / "py" / "util"),
        (f"{PACKAGE}.py.util.regional", ROOT / "py" / "util" / "regional"),
        (f"{PACKAGE}.py.util.prompt", ROOT / "py" / "util" / "prompt"),
    ):
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module
    spec = importlib.util.spec_from_file_location(
        f"{PACKAGE}.py.nodes.bv_regional_prompt_enhancer",
        ROOT / "py" / "nodes" / "bv_regional_prompt_enhancer.py",
    )
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        document = json.load(handle)
    document["version"] = 2
    for region in document["regions"]:
        region["usage"] = "generation"
    return document


def proposal(document):
    return {
        "schema_version": 1,
        "document_id": document["document_id"],
        "prompts": copy.deepcopy(document["prompts"]),
        "regions": [{"id": region["id"], **copy.deepcopy(region["prompts"])} for region in document["regions"]],
    }


class RegionalPromptEnhancerNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_node_module()
        cls.utility = __import__(
            f"{PACKAGE}.py.util.regional.prompt_enhancer",
            fromlist=["LLMResponse", "enhancement_result"],
        )

    def test_nodes_are_registered_with_bv_owned_socket_types(self):
        self.assertIn("BV Comfy CLIP LLM Provider", self.module.NODE_CLASS_MAPPINGS)
        self.assertIn("BV Regional Prompt Enhancer", self.module.NODE_CLASS_MAPPINGS)
        self.assertIn("BV Apply Regional Enhancement", self.module.NODE_CLASS_MAPPINGS)
        self.assertEqual(self.module.BVComfyClipLLMProviderNode.RETURN_TYPES, ("BV_LLM_PROVIDER",))
        self.assertEqual(self.module.BVRegionalPromptEnhancerNode.RETURN_TYPES[0], "BV_ENHANCEMENT_RESULT")
        self.assertEqual(self.module.BVRegionalPromptEnhancerNode.IS_CHANGED(), self.utility.prompt_bundle_fingerprint())

    def test_invalid_model_output_flows_to_unchanged_apply_result(self):
        document = fixture()
        utility = self.utility

        class Provider:
            def generate(self, _request):
                return utility.LLMResponse("invalid", "fake", "fake-model")

        result, _diff, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, Provider(), "Improve", 512, 0
        )
        applied = self.module.BVApplyRegionalEnhancementNode().apply(document, result)[0]
        self.assertFalse(result["valid"])
        self.assertIn("Rejected", diagnostics)
        self.assertIn("anima_hybrid_v1", diagnostics)
        self.assertEqual(result["prompt_bundle"]["policy_id"], "anima_hybrid_v1")
        self.assertEqual(applied, document)

    def test_apply_changes_no_non_prompt_fields(self):
        document = fixture()
        candidate = proposal(document)
        candidate["regions"][0]["positive_source"] += ", detailed fabric"
        result = self.utility.enhancement_result(
            document,
            self.utility.LLMResponse(json.dumps(candidate, separators=(",", ":")), "fake", "fake-model"),
        )
        applied = self.module.BVApplyRegionalEnhancementNode().apply(document, result)[0]
        expected = copy.deepcopy(document)
        expected["regions"][0]["prompts"]["positive_source"] = candidate["regions"][0]["positive_source"]
        self.assertEqual(applied, expected)

    def test_enhancer_repairs_unsupported_new_terms_once(self):
        document = fixture()
        first = proposal(document)
        first["prompts"]["global"]["positive_source"] = "masterpiece, two people in a cafe, natural daylight"
        repaired = proposal(document)
        repaired["prompts"]["global"]["positive_source"] = "masterpiece, two people in a cafe"
        for index, position in ((0, "left"), (1, "left"), (2, "right")):
            source = repaired["regions"][index]["positive_source"]
            if "," in source:
                first_segment, remainder = source.split(",", 1)
                source = f"{first_segment} on the {position},{remainder}"
            else:
                source = f"{source} on the {position}"
            repaired["regions"][index]["positive_source"] = source
        utility = self.utility

        class Provider:
            def __init__(self):
                self.outputs = [first, repaired]
                self.calls = 0

            def generate(self, _request):
                output = self.outputs[self.calls]
                self.calls += 1
                return utility.LLMResponse(json.dumps(output, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0
        )
        self.assertEqual(provider.calls, 2)
        self.assertTrue(result["valid"])
        self.assertIn("repaired", diagnostics)
        self.assertIn("Initial rejection", diagnostics)
        self.assertIn("introduces unsupported terms", diagnostics)
        self.assertEqual(result["diagnostics"][0], "repaired after initial rejection")
        self.assertIn("on the left", diff_json)
        self.assertIn("on the right", diff_json)
        self.assertNotIn("natural daylight", diff_json)

    def test_enhancer_fails_closed_when_repair_still_introduces_terms(self):
        document = fixture()
        candidate = proposal(document)
        candidate["prompts"]["global"]["positive_source"] = "masterpiece, two people in a cafe, natural daylight"
        utility = self.utility

        class Provider:
            calls = 0

            def generate(self, _request):
                self.calls += 1
                return utility.LLMResponse(json.dumps(candidate, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0
        )
        self.assertEqual(provider.calls, 2)
        self.assertFalse(result["valid"])
        self.assertEqual(diff_json, "[]")
        self.assertIn("repair attempt failed", diagnostics)
        self.assertEqual(self.module.BVApplyRegionalEnhancementNode().apply(document, result)[0], document)

    def test_enhancer_repairs_missing_anima_persona_contract_exactly_once(self):
        document = fixture()
        document["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        document["regions"][0]["prompts"]["positive_source"] = "woman, red jacket, black short hair"
        document["regions"][1]["prompts"]["positive_source"] = "man, green sweater, brown curly hair"
        document["regions"][2]["prompts"]["positive_source"] = "wood table"
        missing_contract = proposal(document)
        repaired = proposal(document)
        repaired["prompts"]["global"]["positive_source"] += "; 1girl; 1boy"
        utility = self.utility

        class Provider:
            def __init__(self):
                self.outputs = [missing_contract, repaired]
                self.requests = []

            def generate(self, request):
                self.requests.append(request)
                output = self.outputs[len(self.requests) - 1]
                return utility.LLMResponse(json.dumps(output, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0
        )

        self.assertEqual(len(provider.requests), 2)
        self.assertTrue(result["valid"])
        self.assertIn("must append exact region-supported Anima persona contract", provider.requests[1].user_prompt)
        self.assertIn("1girl", diff_json)
        self.assertIn("1boy", diff_json)
        self.assertNotIn("1girl: red jacket", diff_json)
        self.assertIn("repaired", diagnostics)

    def test_enhancer_reports_source_geometry_conflict_without_rewriting_source(self):
        document = fixture()
        document["regions"][0]["prompts"]["positive_source"] = "person on the right, red coat"
        for region in document["regions"][1:]:
            region["enabled"] = False
        unchanged = proposal(document)
        utility = self.utility

        class Provider:
            calls = 0

            def generate(self, _request):
                self.calls += 1
                return utility.LLMResponse(json.dumps(unchanged, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0
        )
        self.assertEqual(provider.calls, 1)
        self.assertTrue(result["valid"])
        self.assertEqual(diff_json, "[]")
        self.assertIn("Source warnings", diagnostics)
        self.assertIn("geometry indicates left", diagnostics)
        self.assertIn("prompt explicitly says right", diagnostics)


if __name__ == "__main__":
    unittest.main()

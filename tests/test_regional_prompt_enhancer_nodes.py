import copy
import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch


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
        cls.context = __import__(
            f"{PACKAGE}.py.util.regional.context",
            fromlist=["normalize_context"],
        )

    def test_nodes_are_registered_with_bv_owned_socket_types(self):
        self.assertIn("BV Comfy CLIP LLM Provider", self.module.NODE_CLASS_MAPPINGS)
        self.assertIn("BV Remote LLM Provider", self.module.NODE_CLASS_MAPPINGS)
        self.assertIn("BV Regional Prompt Enhancer", self.module.NODE_CLASS_MAPPINGS)
        self.assertIn("BV Apply Regional Enhancement", self.module.NODE_CLASS_MAPPINGS)
        self.assertEqual(self.module.BVComfyClipLLMProviderNode.RETURN_TYPES, ("BV_LLM_PROVIDER",))
        self.assertEqual(self.module.BVRemoteLLMProviderNode.RETURN_TYPES, ("BV_LLM_PROVIDER",))
        self.assertEqual(self.module.BVRegionalPromptEnhancerNode.RETURN_TYPES[0], "BV_ENHANCEMENT_RESULT")
        self.assertEqual(self.module.BVRegionalPromptEnhancerNode.IS_CHANGED(), self.utility.prompt_bundle_fingerprint())
        inputs = self.module.BVRegionalPromptEnhancerNode.INPUT_TYPES()["required"]
        self.assertEqual(inputs["prompt_language"][1]["default"], "Anima / hybrid")
        self.assertEqual(inputs["creativity"][1]["default"], 0.5)

    def test_remote_provider_node_selects_venice_profile_and_catalog_endpoint(self):
        remote_llm = __import__(f"{PACKAGE}.py.util.remote_llm", fromlist=["get_remote_api_key"])
        with patch.object(remote_llm, "get_remote_api_key", return_value="test-key"):
            provider = self.module.BVRemoteLLMProviderNode().build(
                "Venice", "https://ignored.invalid", "zai-org-glm-5-1", "none", 60
            )[0]

        self.assertEqual(provider.provider_id, "venice_chat_completions")
        self.assertEqual(provider.model, "zai-org-glm-5-1")
        self.assertFalse(provider.capabilities.local_execution)

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

    def test_enhancer_accepts_a_v3_context_with_capabilities(self):
        document = fixture()
        context = self.context.normalize_context(document).with_capability(
            "future-pack.opaque", {"version": 9, "payload": ["untouched"]}
        ).to_dict()
        candidate = proposal(document)
        candidate["regions"][0]["positive_source"] += ", detailed fabric"

        class Provider:
            def generate(self, _request):
                return self.utility.LLMResponse(
                    json.dumps(candidate, separators=(",", ":")), "fake", "fake-model"
                )

        provider = Provider()
        provider.utility = self.utility
        result, _diff, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            context, provider, "Improve", 512, 0
        )

        self.assertTrue(result["valid"], diagnostics)

    def test_apply_updates_only_v3_core_prompts_and_preserves_capabilities(self):
        document = fixture()
        context = self.context.normalize_context(document).with_capability(
            "future-pack.opaque", {"version": 9, "payload": ["untouched"]}
        ).to_dict()
        candidate = proposal(document)
        candidate["regions"][0]["positive_source"] += ", detailed fabric"
        result = self.utility.enhancement_result(
            context,
            self.utility.LLMResponse(
                json.dumps(candidate, separators=(",", ":")), "fake", "fake-model"
            ),
        )

        applied = self.module.BVApplyRegionalEnhancementNode().apply(context, result)[0]

        self.assertEqual(applied["version"], 3)
        self.assertEqual(applied["capabilities"], context["capabilities"])
        self.assertEqual(
            applied["core"]["regions"][0]["prompts"]["positive_source"],
            candidate["regions"][0]["positive_source"],
        )
        unchanged_core = copy.deepcopy(applied["core"])
        unchanged_core["regions"][0]["prompts"] = copy.deepcopy(
            context["core"]["regions"][0]["prompts"]
        )
        self.assertEqual(unchanged_core, context["core"])

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
            document, provider, "Improve", 512, 0, creativity=0.0
        )
        self.assertEqual(provider.calls, 2)
        self.assertTrue(result["valid"])
        self.assertIn("repaired", diagnostics)
        self.assertIn("Initial rejection", diagnostics)
        self.assertIn("creativity budget", diagnostics)
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
            document, provider, "Improve", 512, 0, creativity=0.0
        )
        self.assertEqual(provider.calls, 2)
        self.assertFalse(result["valid"])
        self.assertEqual(diff_json, "[]")
        self.assertIn("repair attempt failed", diagnostics)
        self.assertEqual(self.module.BVApplyRegionalEnhancementNode().apply(document, result)[0], document)

    def test_enhancer_adds_missing_anima_persona_contract_locally(self):
        document = fixture()
        document["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        document["regions"][0]["prompts"]["positive_source"] = "woman, red jacket, black short hair"
        document["regions"][1]["prompts"]["positive_source"] = "man, green sweater, brown curly hair"
        document["regions"][2]["prompts"]["positive_source"] = "wood table"
        missing_contract = proposal(document)
        utility = self.utility

        class Provider:
            def __init__(self):
                self.outputs = [missing_contract]
                self.requests = []

            def generate(self, request):
                self.requests.append(request)
                output = self.outputs[len(self.requests) - 1]
                return utility.LLMResponse(json.dumps(output, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0
        )

        self.assertEqual(len(provider.requests), 1)
        self.assertTrue(result["valid"])
        self.assertIn("1girl", diff_json)
        self.assertIn("1boy", diff_json)
        self.assertNotIn("1girl: red jacket", diff_json)
        self.assertIn("locally normalized deterministic Anima persona contract", diagnostics)

    def test_enhancer_normalizes_comma_persona_suffix_without_paid_repair(self):
        document = fixture()
        document["prompts"]["global"]["positive_source"] = "a picture, two people, cafe"
        document["regions"][0]["prompts"]["positive_source"] = "woman, red jacket"
        document["regions"][1]["prompts"]["positive_source"] = "man, green sweater"
        candidate = proposal(document)
        candidate["prompts"]["global"]["positive_source"] = (
            "a cinematic picture of two people in a cafe, 1girl; 1boy"
        )
        utility = self.utility

        class Provider:
            calls = 0

            def generate(self, _request):
                self.calls += 1
                return utility.LLMResponse(json.dumps(candidate, separators=(",", ":")), "fake", "fake-model")

        provider = Provider()
        result, diff_json, diagnostics = self.module.BVRegionalPromptEnhancerNode().enhance(
            document, provider, "Improve", 512, 0, creativity=1.0
        )
        self.assertEqual(provider.calls, 1)
        self.assertTrue(result["valid"])
        self.assertIn("; 1girl; 1boy", diff_json)
        self.assertIn("locally normalized deterministic Anima persona contract", diagnostics)

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

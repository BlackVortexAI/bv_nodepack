import importlib.util
import inspect
import json
from pathlib import Path
import sys
import types
import unittest

import torch


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT.parents[1]))
PACKAGE = "bv_nodepack_test"


def load_node_module():
    comfy_nodes = types.ModuleType("nodes")

    class PreviewImage:
        pass

    class SaveImage:
        pass

    comfy_nodes.PreviewImage = PreviewImage
    comfy_nodes.SaveImage = SaveImage
    sys.modules["nodes"] = comfy_nodes

    package = types.ModuleType(PACKAGE)
    package.__path__ = [str(ROOT)]
    sys.modules[PACKAGE] = package
    for name, path in ((f"{PACKAGE}.py", ROOT / "py"), (f"{PACKAGE}.py.nodes", ROOT / "py" / "nodes"), (f"{PACKAGE}.py.util", ROOT / "py" / "util")):
        module = types.ModuleType(name)
        module.__path__ = [str(path)]
        sys.modules[name] = module
    spec = importlib.util.spec_from_file_location(f"{PACKAGE}.py.nodes.bv_regional", ROOT / "py" / "nodes" / "bv_regional.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def fixture():
    with (ROOT / "tests" / "fixtures" / "regional" / "v1_hybrid_joint.json").open(encoding="utf-8") as handle:
        return json.load(handle)


class DetailerClip:
    def __init__(self):
        self.encoded = []

    def tokenize(self, text):
        return text

    def encode_from_tokens_scheduled(self, tokens):
        self.encoded.append(tokens)
        return [[torch.ones((1, 2, 3)), {"pooled_output": torch.ones((1, 3))}]]


class RegionalNodeTests(unittest.TestCase):
    def test_published_consumers_accept_and_prefer_legacy_lora_sidecars(self):
        consumers = (
            self.module.BVRegionalNativeConditioningNode,
            self.module.BVRegionalSDXLAttentionNode,
            self.module.BVRegionalZImageAttentionNode,
            self.module.BVRegionalFlux2KleinAttentionNode,
            self.module.BVRegionalKrea2AttentionNode,
            self.module.BVRegionalAnimaConditioningNode,
        )
        for consumer in consumers:
            optional = consumer.INPUT_TYPES()["optional"]
            self.assertEqual(optional["lora_registry"][0], "BV_LORA_STACK_REGISTRY")
            self.assertEqual(optional["lora_bindings"][0], "BV_REGIONAL_LORA_BINDINGS")
            parameters = inspect.signature(getattr(consumer, consumer.FUNCTION)).parameters
            self.assertIn("lora_registry", parameters)
            self.assertIn("lora_bindings", parameters)

        document = fixture()
        region_id = document["regions"][0]["id"]
        registry = {
            "schema": "bv.lora_stack_registry",
            "version": 1,
            "stacks": {"legacy": {"id": "legacy", "name": "Legacy", "stack": [["legacy.safetensors", 0.8, 0.6]]}},
        }
        bindings = {
            "schema": "bv.regional.lora_bindings",
            "version": 1,
            "document_id": document["document_id"],
            "global_stack_id": None,
            "regions": {region_id: "legacy"},
        }
        self.assertEqual(
            self.module._consumer_lora_scopes({"invalid": "v3 must not win"}, document, registry, bindings)[region_id],
            [("legacy.safetensors", 0.8, 0.6)],
        )

    def test_nodes_are_grouped_by_role_and_model_in_the_menu(self):
        expected_categories = {
            "BV Regional Prompt": "🌀 BV Node Pack/regional/core",
            "BV Named LoRA Stack": "🌀 BV Node Pack/regional/core",
            "BV LoRA Stack Collector": "🌀 BV Node Pack/regional/core",
            "BV Regional LoRA": "🌀 BV Node Pack/regional/core",
            "BV Regional Debug": "🌀 BV Node Pack/regional/core",
            "BV Regional Select": "🌀 BV Node Pack/regional/core",
            "BV Regional Deconstructor": "🌀 BV Node Pack/regional/core",
            "BV Regional Prompt Extract": "🌀 BV Node Pack/regional/core",
            "BV Regional Mask Render": "🌀 BV Node Pack/regional/core",
            "BV Regional Detailer Mask": "🌀 BV Node Pack/regional/integrations/Impact Pack",
            "BV Regional Native Conditioning": "🌀 BV Node Pack/regional/models/Generic",
            "BV Regional SDXL Attention": "🌀 BV Node Pack/regional/models/SDXL",
            "BV Regional Z-Image Attention": "🌀 BV Node Pack/regional/models/Z-Image",
            "BV Regional FLUX.2 Klein 9B Attention": "🌀 BV Node Pack/regional/models/FLUX.2 Klein 9B",
            "BV Regional Krea 2 Attention": "🌀 BV Node Pack/regional/models/Krea 2",
            "BV Regional Anima Adapter": "🌀 BV Node Pack/regional/models/Anima",
            "BV Regional Anima Conditioning": "🌀 BV Node Pack/regional/models/Anima",
            "BV Regional Color Control Image": "🌀 BV Node Pack/regional/models/Anima",
            "BV Regional Anima LLLite": "🌀 BV Node Pack/regional/models/Anima",
            "BV Regional Image Send": "🌀 BV Node Pack/regional/output",
            "BV Regional Image Save": "🌀 BV Node Pack/regional/output",
        }

        actual_categories = {
            node_name: node_class.CATEGORY
            for node_name, node_class in self.module.NODE_CLASS_MAPPINGS.items()
        }
        self.assertEqual(actual_categories, expected_categories)

    @classmethod
    def setUpClass(cls):
        cls.module = load_node_module()

    def test_main_node_outputs_valid_custom_document(self):
        result = self.module.BVRegionalPromptNode().build(json.dumps(fixture()))
        self.assertEqual(result[0]["schema"], "bv.regional")
        self.assertEqual(result[1]["schema"], "bv.regional.lora_bindings")
        self.assertEqual(result[1]["document_id"], result[0]["document_id"])

    def test_main_node_prunes_orphaned_region_lora_bindings(self):
        document = fixture()
        current_region = document["regions"][0]["id"]
        bindings = {
            "schema": "bv.regional.lora_bindings",
            "version": 1,
            "document_id": document["document_id"],
            "global_stack_id": None,
            "regions": {current_region: "current", "removed-region": "stale"},
        }

        _, parsed = self.module.BVRegionalPromptNode().build(
            json.dumps(document), json.dumps(bindings)
        )

        self.assertEqual(parsed["regions"], {current_region: "current"})

    def test_main_node_easy_mode_emits_v3_lora_capability_from_live_provider(self):
        document = fixture()
        collector_id = "22222222-2222-4222-8222-222222222222"
        config = {
            "version": 1,
            "collector_id": collector_id,
            "entries": [{
                "id": "33333333-3333-4333-8333-333333333333",
                "source": {"kind": "external", "resource_id": "skin"},
                "targets": [{"scope": "global"}],
            }],
        }
        provider = self.module.build_lora_provider(collector_id, {
            "skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", 0.8, 0.6]]},
        })

        regional, _ = self.module.BVRegionalPromptNode().build(
            json.dumps(document), lora_v3_config_json=json.dumps(config), resource_provider=provider
        )

        self.assertEqual(regional["schema"], "bv.regional")
        self.assertEqual(regional["version"], 3)
        self.assertEqual(regional["core"]["document_id"], document["document_id"])
        self.assertEqual(regional["capabilities"]["bv-nodepack.lora"], {
            "version": 3,
            "entries": [{**config["entries"][0], "source": {**config["entries"][0]["source"], "collector_id": collector_id}}],
            "scopes": {
                "global": [["skin.safetensors", 0.8, 0.6]],
                "background": [["skin.safetensors", 0.8, 0.6]],
                **{region["id"]: [["skin.safetensors", 0.8, 0.6]] for region in document["regions"]},
            },
        })

    def test_main_node_accepts_the_frontend_v3_easy_mode_envelope(self):
        document = fixture()
        collector_id = "22222222-2222-4222-8222-222222222222"
        entry = {
            "id": "33333333-3333-4333-8333-333333333333",
            "source": {"kind": "external", "collector_id": collector_id, "resource_id": "skin"},
            "targets": [{"scope": "global"}],
        }
        provider = self.module.build_lora_provider(collector_id, {
            "skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", 0.8, 0.6]]},
        })
        regional, _ = self.module.BVRegionalPromptNode().build(
            json.dumps(document),
            lora_v3_config_json=json.dumps({"version": 3, "entries": [entry], "steps": []}),
            resource_provider_1=provider,
        )
        self.assertEqual(regional["capabilities"]["bv-nodepack.lora"]["entries"], [entry])

    def test_main_node_without_easy_mode_preserves_legacy_document_shape(self):
        regional, _ = self.module.BVRegionalPromptNode().build(json.dumps(fixture()))
        self.assertEqual(regional["schema"], "bv.regional")

    def test_main_node_combines_lora_and_detailer_easy_mode_capabilities(self):
        document = fixture()
        document["version"] = 2
        for item in document["regions"]:
            item["usage"] = "generation"
        region = document["regions"][0]
        region["usage"] = "both"
        region["enabled"] = True
        collector_id = "22222222-2222-4222-8222-222222222222"
        lora_entry = {"id": "33333333-3333-4333-8333-333333333333", "source": {"kind": "external", "collector_id": collector_id, "resource_id": "skin"}, "targets": [{"scope": "global"}]}
        detailer_job = {"id": "face-job", "region_ids": [region["id"]], "primary_region_id": region["id"], "mask_composition": "union", "prompt_composition": "context", "conditioning": {"global_influence": 1, "background_influence": .35, "primary_region_influence": 1, "context_region_influence": 1}, "detector_assignments": []}
        provider = self.module.build_lora_provider(collector_id, {"skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", .8, .6]]}})
        regional, _ = self.module.BVRegionalPromptNode().build(
            json.dumps(document), lora_v3_config_json=json.dumps({"version": 3, "entries": [lora_entry], "steps": []}),
            detailer_v3_config_json=json.dumps({"version": 1, "jobs": [detailer_job]}), resource_provider_1=provider,
        )
        self.assertIn("bv-nodepack.lora", regional["capabilities"])
        self.assertEqual(regional["capabilities"]["bv-nodepack.detailer-plan"]["jobs"], [detailer_job])

    def test_native_compiler_is_not_a_lora_resource_consumer(self):
        inputs = self.module.BVRegionalNativeConditioningNode.INPUT_TYPES()
        self.assertEqual(set(inputs["optional"]), {"lora_registry", "lora_bindings"})
        self.assertNotIn(self.module.RUNTIME_PROVIDER, {spec[0] for spec in inputs["optional"].values()})
        self.assertEqual(self.module.BVRegionalPromptNode.RETURN_TYPES[0], "BV_REGIONAL")

    def test_only_regional_context_writers_expose_typed_provider_inputs(self):
        for node_type in (self.module.BVRegionalPromptNode, self.module.BVRegionalLoraNode):
            optional = node_type.INPUT_TYPES()["optional"]
            providers = [optional[f"resource_provider_{index}"] for index in range(1, 21)]
            self.assertTrue(all(spec[0] == self.module.RUNTIME_PROVIDER and spec[1]["forceInput"] for spec in providers))
        for node_type in (
            self.module.BVRegionalNativeConditioningNode,
            self.module.BVRegionalSDXLAttentionNode,
            self.module.BVRegionalZImageAttentionNode,
            self.module.BVRegionalFlux2KleinAttentionNode,
            self.module.BVRegionalKrea2AttentionNode,
            self.module.BVRegionalAnimaConditioningNode,
        ):
            optional = node_type.INPUT_TYPES()["optional"]
            self.assertEqual(set(optional), {"lora_registry", "lora_bindings"})
            self.assertNotIn(self.module.RUNTIME_PROVIDER, {spec[0] for spec in optional.values()})

    def test_named_lora_stack_node_builds_a_chainable_registry(self):
        output = self.module.BVNamedLoraStackNode().register(
            [("portrait.safetensors", 0.8, 0.6)], "Portrait", "stack-a"
        )[0]
        self.assertEqual(output["stacks"]["stack-a"]["name"], "Portrait")
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Named LoRA Stack"],
            self.module.BVNamedLoraStackNode,
        )

    def test_helper_pipeline_selects_extracts_and_renders(self):
        document = fixture()
        selection, selected_id, selected_name = self.module.BVRegionalSelectNode().select(document, "region", "Face left")
        extracted = self.module.BVRegionalPromptExtractNode().extract(selection)
        rendered = self.module.BVRegionalMaskRenderNode().render(selection, 100, 100)
        self.assertEqual(selected_id, document["regions"][1]["id"])
        self.assertEqual(selected_name, "Face left")
        self.assertIn("green eyes", extracted[1])
        self.assertEqual(tuple(rendered[0].shape), (1, 100, 100))
        self.assertGreater(rendered[3], 0)

    def test_v3_helper_pipeline_selects_extracts_and_renders(self):
        context = self.module.normalize_context(fixture()).with_capability(
            "future-pack.opaque", {"version": 9, "payload": ["untouched"]}
        ).to_dict()
        selection, selected_id, selected_name = self.module.BVRegionalSelectNode().select(
            context, "region", "Face left"
        )
        extracted = self.module.BVRegionalPromptExtractNode().extract(selection)
        rendered = self.module.BVRegionalMaskRenderNode().render(selection, 100, 100)
        self.assertEqual(selected_id, fixture()["regions"][1]["id"])
        self.assertEqual(selected_name, "Face left")
        self.assertIn("green eyes", extracted[1])
        self.assertEqual(tuple(rendered[0].shape), (1, 100, 100))

    def test_lora_collector_keeps_live_stack_resources_outside_the_context(self):
        registry = self.module.BVNamedLoraStackNode().register(
            [("portrait.safetensors", 0.8, 0.6)], "Portrait", "stack-a"
        )[0]
        provider = self.module.BVLoraStackCollectorNode().collect(
            registry, "22222222-2222-4222-8222-222222222222"
        )[0]
        self.assertEqual(provider["resource_type"], "bv-nodepack.lora-stack")
        self.assertEqual(provider["resources"]["stack-a"]["stack"][0][0], "portrait.safetensors")

    def test_regional_lora_node_returns_a_new_v3_context(self):
        source = fixture()
        payload = '{"version":1,"collector_id":null,"entries":[]}'
        transformed = self.module.BVRegionalLoraNode().transform(source, "replace", payload)[0]
        self.assertEqual(transformed["version"], 3)
        self.assertIn("bv-nodepack.lora", transformed["capabilities"])
        self.assertEqual(source["version"], 1)

    def test_detailer_mask_renders_selected_region_at_image_size(self):
        document = fixture()
        document["version"] = 2
        for region in document["regions"]:
            region["usage"] = "generation"
        document["regions"][1]["usage"] = "detailer"
        image = torch.zeros((1, 120, 200, 3))
        model, clip, vae = object(), DetailerClip(), object()

        result = self.module.BVRegionalDetailerMaskNode().render(
            document, image, model, clip, vae, "Face left"
        )

        self.assertIs(result[0], image)
        self.assertEqual(tuple(result[1].shape), (1, 120, 200))
        self.assertEqual(result[2], (model, clip, vae, result[3], result[4]))
        self.assertIn("symmetrical face, green eyes, detailed irises", result[5])
        self.assertIn("asymmetrical eyes", result[6])
        self.assertIn("(symmetrical face, green eyes, detailed irises:1)", result[7])
        self.assertIn("(asymmetrical eyes:1)", result[8])
        self.assertGreater(result[11], 0)
        self.assertGreater(result[12], 0)
        self.assertEqual(result[13], document["regions"][1]["id"])
        self.assertEqual(result[14], "Face left")

    def test_detailer_mask_accepts_a_v3_regional_context(self):
        document = fixture()
        document["version"] = 2
        for region in document["regions"]:
            region["usage"] = "generation"
        document["regions"][1]["usage"] = "detailer"
        context = self.module.normalize_context(document).to_dict()

        result = self.module.BVRegionalDetailerMaskNode().render(
            context, torch.zeros((1, 120, 200, 3)), object(), DetailerClip(), object(), "Face left"
        )

        self.assertEqual(tuple(result[1].shape), (1, 120, 200))
        self.assertEqual(result[13], document["regions"][1]["id"])

    def test_detailer_mask_rejects_generation_only_region(self):
        with self.assertRaisesRegex(ValueError, "not enabled for detailer"):
            self.module.BVRegionalDetailerMaskNode().render(
                fixture(), torch.zeros((1, 120, 200, 3)), object(), DetailerClip(), object(), "Face left"
            )

    def test_detailer_mask_rejects_image_batches_for_impact_compatibility(self):
        with self.assertRaisesRegex(ValueError, "single IMAGE"):
            self.module.BVRegionalDetailerMaskNode().render(
                fixture(), torch.zeros((2, 120, 200, 3)), object(), DetailerClip(), object(), "Face left"
            )

    def test_deconstructor_exposes_selection_ast_text_source_and_identity(self):
        document = fixture()
        result = self.module.BVRegionalDeconstructorNode().deconstruct(document, "region", "Face left")
        self.assertEqual(result[0]["scope"], "region")
        self.assertEqual(result[0]["region_id"], document["regions"][1]["id"])
        self.assertEqual(result[2], "symmetrical face, green eyes, detailed irises")
        self.assertIn("@<eyes>", result[3])
        self.assertEqual(result[7], document["regions"][1]["id"])
        self.assertEqual(result[8], "Face left")

    def test_deconstructor_supports_global_scope_without_region_selector(self):
        result = self.module.BVRegionalDeconstructorNode().deconstruct(fixture(), "global", "")
        self.assertEqual(result[0]["scope"], "global")
        self.assertEqual(result[7:], ("global", "Global"))

    def test_debug_returns_summary_and_json(self):
        output = self.module.BVRegionalDebugNode().run(fixture())
        self.assertIn("3 regions", output["result"][1])
        self.assertEqual(json.loads(output["result"][0])["version"], 2)

    def test_debug_preserves_complete_v3_context_and_unknown_capabilities(self):
        context = self.module.normalize_context(fixture()).with_capability(
            "future-pack.opaque", {"version": 9, "payload": ["untouched"]}
        ).to_dict()
        output = self.module.BVRegionalDebugNode().run(context)
        serialized = json.loads(output["result"][0])
        self.assertEqual(serialized["version"], 3)
        self.assertEqual(serialized["capabilities"]["future-pack.opaque"], context["capabilities"]["future-pack.opaque"])

    def test_native_conditioning_node_is_registered_with_standard_outputs(self):
        self.assertIs(self.module.NODE_CLASS_MAPPINGS["BV Regional Native Conditioning"], self.module.BVRegionalNativeConditioningNode)
        self.assertEqual(self.module.BVRegionalNativeConditioningNode.RETURN_TYPES, ("CONDITIONING", "CONDITIONING"))

    def test_sdxl_attention_node_is_registered_with_standard_sampler_outputs(self):
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional SDXL Attention"],
            self.module.BVRegionalSDXLAttentionNode,
        )
        self.assertEqual(
            self.module.BVRegionalSDXLAttentionNode.RETURN_TYPES,
            ("MODEL", "CONDITIONING", "CONDITIONING"),
        )

    def test_zimage_attention_node_is_registered_with_standard_sampler_outputs(self):
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional Z-Image Attention"],
            self.module.BVRegionalZImageAttentionNode,
        )
        self.assertEqual(
            self.module.BVRegionalZImageAttentionNode.RETURN_TYPES,
            ("MODEL", "CONDITIONING", "CONDITIONING"),
        )

    def test_flux2_klein_attention_node_is_registered_with_standard_sampler_outputs(self):
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional FLUX.2 Klein 9B Attention"],
            self.module.BVRegionalFlux2KleinAttentionNode,
        )
        self.assertEqual(
            self.module.BVRegionalFlux2KleinAttentionNode.RETURN_TYPES,
            ("MODEL", "CONDITIONING", "CONDITIONING"),
        )

    def test_attention_nodes_apply_materialized_context_without_consumer_inputs(self):
        cases = (
            (self.module.BVRegionalSDXLAttentionNode, "compile_sdxl_attention", "apply_sdxl_attention_patch", (1.0,)),
            (self.module.BVRegionalZImageAttentionNode, "compile_zimage_attention", "apply_zimage_attention_patch", (1.0,)),
            (self.module.BVRegionalFlux2KleinAttentionNode, "compile_flux2_klein_attention", "apply_flux2_klein_attention_patch", (1.0,)),
        )
        configured = self.module.normalize_context(fixture()).with_capability(
            self.module.LORA_CAPABILITY,
            {
                "version": 2,
                "entries": [{
                    "id": "33333333-3333-4333-8333-333333333333",
                    "source": {
                        "kind": "external",
                        "collector_id": "22222222-2222-4222-8222-222222222222",
                        "resource_id": "skin",
                    },
                    "targets": [{"scope": "global"}],
                }],
            },
        ).to_dict()
        provider = self.module.build_lora_provider(
            "22222222-2222-4222-8222-222222222222",
            {"skin": {"id": "skin", "name": "Skin", "stack": [["skin.safetensors", 0.8, 0.6]]}},
        )
        regional = self.module.materialize_lora_capability(
            configured, provider, registry=self.module.LORA_CAPABILITY_REGISTRY
        ).to_dict()

        for node_type, compiler_name, patcher_name, compiler_tail in cases:
            with self.subTest(node=node_type.__name__):
                self.assertEqual(set(node_type.INPUT_TYPES()["optional"]), {"lora_registry", "lora_bindings"})
                compiler_result = (["positive"], ["negative"], ["slot"], *compiler_tail)
                with (
                    unittest.mock.patch.object(self.module, "resolve_stack_paths", return_value={"global": [["skin.safetensors", 0.8, 0.6]]}),
                    unittest.mock.patch.object(self.module, "create_hook_groups", return_value={"global": "hooks"}),
                    unittest.mock.patch.object(self.module, compiler_name, return_value=compiler_result),
                    unittest.mock.patch.object(
                        self.module, "apply_attention_hook_passes",
                        return_value=(["hooked-positive"], ["hooked-negative"]),
                    ) as hook_passes,
                    unittest.mock.patch.object(self.module, patcher_name, return_value="patched-model"),
                ):
                    result = node_type().apply(
                        "model", "clip", regional, 1.0, 0.0, 0.5,
                    )

                hook_passes.assert_called_once_with(
                    ["positive"], ["negative"], unittest.mock.ANY,
                    {"global": [["skin.safetensors", 0.8, 0.6]]}, {"global": "hooks"},
                )
                self.assertEqual(result, ("patched-model", ["hooked-positive"], ["hooked-negative"]))

    def test_krea2_attention_node_is_registered_with_standard_sampler_outputs(self):
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional Krea 2 Attention"],
            self.module.BVRegionalKrea2AttentionNode,
        )
        self.assertEqual(
            self.module.BVRegionalKrea2AttentionNode.RETURN_TYPES,
            ("MODEL", "CONDITIONING", "CONDITIONING"),
        )
        self.assertEqual(
            set(self.module.BVRegionalKrea2AttentionNode.INPUT_TYPES()["optional"]),
            {"lora_registry", "lora_bindings"},
        )
        mode = self.module.BVRegionalKrea2AttentionNode.INPUT_TYPES()["required"]["regional_lora_mode"]
        self.assertEqual(mode[0], ["multipass_legacy", "token_gated_singlepass"])
        self.assertEqual(mode[1]["default"], "token_gated_singlepass")

    def test_krea2_call_without_mode_uses_singlepass_default(self):
        node = self.module.BVRegionalKrea2AttentionNode()
        with (
            unittest.mock.patch.object(self.module, "resolve_stack_paths", return_value={}),
            unittest.mock.patch.object(self.module, "create_hook_groups", return_value={}),
            unittest.mock.patch.object(
                self.module, "compile_krea2_attention",
                return_value=(["positive"], ["negative"], ["slot"], 1.0),
            ),
            unittest.mock.patch.object(self.module, "apply_attention_hook_passes") as legacy,
            unittest.mock.patch.object(
                self.module, "apply_krea2_attention_patch", return_value="attention-model"
            ),
            unittest.mock.patch.object(
                self.module, "apply_krea2_token_lora_patch", return_value="singlepass-model"
            ) as singlepass,
        ):
            result = node.apply("model", "clip", fixture(), 1.0, 0.0, 0.5)

        legacy.assert_not_called()
        singlepass.assert_called_once()
        self.assertEqual(result, ("singlepass-model", ["positive"], ["negative"]))

    def test_krea2_singlepass_skips_model_hook_passes(self):
        node = self.module.BVRegionalKrea2AttentionNode()
        with (
            unittest.mock.patch.object(self.module, "resolve_stack_paths", return_value={"region-a": []}),
            unittest.mock.patch.object(self.module, "create_hook_groups", return_value={}),
            unittest.mock.patch.object(
                self.module, "compile_krea2_attention",
                return_value=(["positive"], ["negative"], ["slot"], 1.0),
            ),
            unittest.mock.patch.object(self.module, "apply_attention_hook_passes") as legacy,
            unittest.mock.patch.object(
                self.module, "apply_krea2_attention_patch", return_value="attention-model"
            ),
            unittest.mock.patch.object(
                self.module, "apply_krea2_token_lora_patch", return_value="singlepass-model"
            ) as singlepass,
        ):
            result = node.apply(
                "model", "clip", fixture(), 1.0, 0.0, 0.5,
                regional_lora_mode="token_gated_singlepass",
            )

        legacy.assert_not_called()
        singlepass.assert_called_once_with(
            "attention-model", ["slot"], 1.0, unittest.mock.ANY, {"region-a": []}
        )
        self.assertEqual(result, ("singlepass-model", ["positive"], ["negative"]))

    def test_anima_adapter_is_registered_with_external_region_type(self):
        self.assertIs(self.module.NODE_CLASS_MAPPINGS["BV Regional Anima Adapter"], self.module.BVRegionalAnimaAdapterNode)
        self.assertEqual(
            self.module.BVRegionalAnimaAdapterNode.RETURN_TYPES,
            ("CONDITIONING", "CONDITIONING", "ANIMA_CONDITIONING_REGIONS", "CONDITIONING"),
        )

    def test_builtin_anima_conditioning_is_registered_with_standard_sampler_outputs(self):
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional Anima Conditioning"],
            self.module.BVRegionalAnimaConditioningNode,
        )
        self.assertEqual(
            self.module.BVRegionalAnimaConditioningNode.RETURN_TYPES,
            ("MODEL", "CONDITIONING", "CONDITIONING"),
        )
        mode = self.module.BVRegionalAnimaConditioningNode.INPUT_TYPES()["required"]["regional_lora_mode"]
        self.assertEqual(mode[0], ["multipass_legacy", "token_gated_singlepass"])
        self.assertEqual(mode[1]["default"], "multipass_legacy")

        inputs = self.module.BVRegionalAnimaConditioningNode.INPUT_TYPES()["required"]
        self.assertEqual(inputs["base_mode"][1]["default"], "disabled")
        self.assertEqual(inputs["self_mask_strength"][1]["default"], 0.0)

    def test_anima_singlepass_skips_legacy_model_hook_passes(self):
        node = self.module.BVRegionalAnimaConditioningNode()

        class FakeApply:
            def apply(self, **_kwargs):
                return ("attention-model",)

        fake_patcher = types.ModuleType(f"{PACKAGE}.py.util.regional.anima_patcher")
        fake_patcher.ApplyAnimaRegionalConditioningPatch = FakeApply
        with (
            unittest.mock.patch.dict(sys.modules, {fake_patcher.__name__: fake_patcher}),
            unittest.mock.patch.object(self.module, "resolve_stack_paths", return_value={"region-a": []}),
            unittest.mock.patch.object(self.module, "create_hook_groups", return_value={}),
            unittest.mock.patch.object(
                self.module, "compile_anima_adapter",
                return_value=(["positive"], ["negative"], "regions", ["background"]),
            ),
            unittest.mock.patch.object(self.module, "apply_attention_hook_passes") as legacy,
            unittest.mock.patch.object(
                self.module, "apply_anima_token_lora_patch", return_value="singlepass-model"
            ) as singlepass,
        ):
            result = node.apply(
                "model", "clip", fixture(), "disabled", 0.2, 0.0, 0.35,
                1.0, 0.2, 0.1, 1, 1,
                regional_lora_mode="token_gated_singlepass",
            )

        legacy.assert_not_called()
        singlepass.assert_called_once_with("attention-model", {"region-a": []})
        self.assertEqual(result, ("singlepass-model", ["positive"], ["negative"]))

    def test_anima_call_without_mode_preserves_legacy_hook_passes(self):
        node = self.module.BVRegionalAnimaConditioningNode()

        class FakeApply:
            def apply(self, **_kwargs):
                return ("attention-model",)

        fake_patcher = types.ModuleType(f"{PACKAGE}.py.util.regional.anima_patcher")
        fake_patcher.ApplyAnimaRegionalConditioningPatch = FakeApply
        with (
            unittest.mock.patch.dict(sys.modules, {fake_patcher.__name__: fake_patcher}),
            unittest.mock.patch.object(self.module, "resolve_stack_paths", return_value={"region-a": []}),
            unittest.mock.patch.object(self.module, "create_hook_groups", return_value={}),
            unittest.mock.patch.object(
                self.module, "compile_anima_adapter",
                return_value=(["positive"], ["negative"], "regions", ["background"]),
            ),
            unittest.mock.patch.object(
                self.module, "apply_attention_hook_passes",
                return_value=(["legacy-positive"], ["legacy-negative"]),
            ) as legacy,
            unittest.mock.patch.object(self.module, "apply_anima_token_lora_patch") as singlepass,
        ):
            result = node.apply(
                "model", "clip", fixture(), "disabled", 0.2, 0.0, 0.35,
                1.0, 0.2, 0.1, 1, 1,
            )

        legacy.assert_called_once()
        singlepass.assert_not_called()
        self.assertEqual(result, ("attention-model", ["legacy-positive"], ["legacy-negative"]))
    def test_color_control_node_is_registered_and_returns_image_with_legend(self):
        node = self.module.BVRegionalColorControlImageNode()
        image, legend_json = node.compile(fixture())
        legend = json.loads(legend_json)
        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional Color Control Image"],
            self.module.BVRegionalColorControlImageNode,
        )
        self.assertEqual(tuple(image.shape), (1, 1024, 1536, 3))
        self.assertEqual(legend["schema"], "bv.regional.color_control")

    def test_anima_lllite_node_loads_core_model_patch_and_applies_compiled_image(self):
        calls = {}

        class FakeLoader:
            def load_model_patch(self, name):
                calls["name"] = name
                return ("loaded-patch",)

        class FakeApply:
            def apply_patch(self, model, model_patch, image, strength, start_percent, end_percent, mask=None):
                calls["apply"] = (model, model_patch, tuple(image.shape), strength, start_percent, end_percent, mask)
                return ("patched-model",)

        fake_core = types.ModuleType("comfy_extras.nodes_model_patch")
        fake_core.ModelPatchLoader = FakeLoader
        fake_core.AnimaLLLiteApply = FakeApply
        with unittest.mock.patch.dict(sys.modules, {"comfy_extras.nodes_model_patch": fake_core}):
            result = self.module.BVRegionalAnimaLLLiteNode().apply(
                "source-model", fixture(), "anima-regional.safetensors", 0.75, 0.1, 0.8
            )

        self.assertIs(
            self.module.NODE_CLASS_MAPPINGS["BV Regional Anima LLLite"],
            self.module.BVRegionalAnimaLLLiteNode,
        )
        self.assertEqual(result[0], "patched-model")
        self.assertEqual(calls["name"], "anima-regional.safetensors")
        self.assertEqual(calls["apply"], ("source-model", "loaded-patch", (1, 1024, 1536, 3), 0.75, 0.1, 0.8, None))
        self.assertEqual(json.loads(result[2])["schema"], "bv.regional.color_control")

    def test_anima_lllite_node_rejects_an_inverted_sampling_range(self):
        with self.assertRaisesRegex(ValueError, "start_percent must not exceed end_percent"):
            self.module.BVRegionalAnimaLLLiteNode().apply("model", fixture(), "patch.safetensors", 1, 0.9, 0.2)

    def test_image_sender_targets_document_and_preserves_image_passthrough(self):
        sender = self.module.BVRegionalImageSendNode()
        sender.save_images = lambda images, *_args: {"ui": {"images": [{"filename": "preview.png"}]}}
        images = object()
        output = sender.send(images, " doc-a ")
        self.assertEqual(output["ui"]["bv_regional_background"], [{"document_id": "doc-a"}])
        self.assertIs(output["result"][0], images)

    def test_image_sender_rejects_an_empty_target(self):
        with self.assertRaisesRegex(ValueError, "document_id is required"):
            self.module.BVRegionalImageSendNode().send(object(), "  ")

    def test_image_save_is_registered_and_broadcasts_the_saved_result(self):
        saver = self.module.BVRegionalImageSaveNode()
        saver.save_images = lambda images, prefix, *_args: {
            "ui": {"images": [{"filename": f"{prefix}_00001_.png", "type": "output"}]},
            "result": (images,),
        }
        images = object()
        output = saver.save(images, "portrait", "doc-b")
        self.assertIs(self.module.NODE_CLASS_MAPPINGS["BV Regional Image Save"], self.module.BVRegionalImageSaveNode)
        self.assertEqual(output["ui"]["images"][0]["type"], "output")
        self.assertEqual(output["ui"]["bv_regional_background"], [{"document_id": "doc-b"}])
        self.assertIs(output["result"][0], images)


if __name__ == "__main__":
    unittest.main()

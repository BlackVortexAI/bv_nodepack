import importlib.util
import inspect
import json
import copy
from pathlib import Path
import sys
import types
import tempfile
import unittest
from unittest import mock

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
        metadata = {"pooled_output": torch.ones((1, 3))}
        if getattr(self, "apply_hooks_to_conds", None) is not None:
            metadata["hooks"] = self.apply_hooks_to_conds
        return [[torch.ones((1, 2, 3)), metadata]]


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
            "BV LoRA Registry": "🌀 BV Node Pack/regional/LoRA",
            "BV Named LoRA Stack": "🌀 BV Node Pack/regional/LoRA/Manual Chains (Optional)",
            "BV LoRA Stack Collector": "🌀 BV Node Pack/regional/LoRA/Manual Chains (Optional)",
            "BV Regional LoRA": "🌀 BV Node Pack/regional/LoRA",
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

    def test_registered_regional_consumers_are_explicitly_covered_by_the_v3_contract(self):
        direct_consumers = {
            name
            for name, node_class in self.module.NODE_CLASS_MAPPINGS.items()
            if any(
                spec[0] == "BV_REGIONAL"
                for group in node_class.INPUT_TYPES().values()
                if isinstance(group, dict)
                for spec in group.values()
                if isinstance(spec, tuple)
            )
        }
        expected_direct_consumers = {
            "BV Regional LoRA",
            "BV Regional Debug",
            "BV Regional Select",
            "BV Regional Deconstructor",
            "BV Regional Detailer Mask",
            "BV Regional Native Conditioning",
            "BV Regional SDXL Attention",
            "BV Regional Z-Image Attention",
            "BV Regional FLUX.2 Klein 9B Attention",
            "BV Regional Krea 2 Attention",
            "BV Regional Anima Adapter",
            "BV Regional Anima Conditioning",
            "BV Regional Color Control Image",
            "BV Regional Anima LLLite",
            "BV Regional Image Save",
        }
        selection_consumers = {
            name
            for name, node_class in self.module.NODE_CLASS_MAPPINGS.items()
            if any(
                spec[0] == "BV_REGIONAL_SELECTION"
                for group in node_class.INPUT_TYPES().values()
                if isinstance(group, dict)
                for spec in group.values()
                if isinstance(spec, tuple)
            )
        }

        self.assertEqual(direct_consumers, expected_direct_consumers)
        self.assertEqual(selection_consumers, {"BV Regional Prompt Extract", "BV Regional Mask Render"})

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

    def test_main_node_embeds_lut_easy_mode_capability(self):
        document = fixture()
        document["version"] = 2
        for item in document["regions"]:
            item["usage"] = "generation"
        region = document["regions"][0]
        collector_id = "22222222-2222-4222-8222-222222222222"
        job = {
            "id": "person-grade", "region_ids": [region["id"]], "mask_composition": "union",
            "lut_source": {"collector_id": collector_id, "resource_id": "warm"},
            "strength": .5, "mask_invert": True, "detector_source": None,
        }
        regional, _ = self.module.BVRegionalPromptNode().build(
            json.dumps(document), lut_v3_config_json=json.dumps({"version": 1, "jobs": [job]}),
        )
        self.assertEqual(regional["capabilities"]["bv-nodepack.lut-plan"]["jobs"], [{**job, "scope": "regional"}])

    def test_native_compiler_is_not_a_lora_resource_consumer(self):
        inputs = self.module.BVRegionalNativeConditioningNode.INPUT_TYPES()
        self.assertEqual(set(inputs["optional"]), {"lora_registry", "lora_bindings"})
        self.assertNotIn(self.module.RUNTIME_PROVIDER, {spec[0] for spec in inputs["optional"].values()})
        self.assertEqual(self.module.BVRegionalPromptNode.RETURN_TYPES[0], "BV_REGIONAL")

    def test_only_regional_context_writers_expose_typed_provider_inputs(self):
        prompt_optional = self.module.BVRegionalPromptNode.INPUT_TYPES()["optional"]
        self.assertIn("resource_provider", prompt_optional)
        lora_optional = self.module.BVRegionalLoraNode.INPUT_TYPES()["optional"]
        self.assertEqual(set(lora_optional), {f"resource_provider_{index}" for index in range(1, 21)})
        for optional in (prompt_optional, lora_optional):
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

    def test_named_lora_stack_builds_an_immutable_parallel_v3_provider_chain(self):
        first_registry, first_provider = self.module.BVNamedLoraStackNode().register(
            [("portrait.safetensors", 0.8, 0.6)], "Portrait", "stack-a"
        )
        first_snapshot = copy.deepcopy(first_provider)

        second_registry, second_provider = self.module.BVNamedLoraStackNode().register(
            [("style.safetensors", 0.7, 0.5)],
            "Style",
            "stack-b",
            registry=first_registry,
            resource_provider=first_provider,
        )

        self.assertEqual(first_provider, first_snapshot)
        self.assertEqual(list(second_registry["stacks"]), ["stack-a", "stack-b"])
        self.assertEqual(list(second_provider["resources"]), ["stack-a", "stack-b"])
        self.assertEqual(second_provider["resources"]["stack-a"]["stack"][0][0], "portrait.safetensors")
        self.assertEqual(second_provider["resources"]["stack-b"]["stack"][0][0], "style.safetensors")
        self.assertEqual(self.module.BVNamedLoraStackNode.RETURN_NAMES, ("registry", "resource_provider"))

    def test_named_lora_stack_replaces_a_duplicate_v3_stack_id_deterministically(self):
        _, first_provider = self.module.BVNamedLoraStackNode().register(
            [("old.safetensors", 1.0, 1.0)], "Old", "stack-a"
        )
        _, replaced = self.module.BVNamedLoraStackNode().register(
            [("new.safetensors", 0.6, 0.4)],
            "New",
            "stack-a",
            resource_provider=first_provider,
        )

        self.assertEqual(list(replaced["resources"]), ["stack-a"])
        self.assertEqual(replaced["resources"]["stack-a"]["name"], "New")
        self.assertEqual(replaced["resources"]["stack-a"]["stack"], [("new.safetensors", 0.6, 0.4)])

    def test_lora_registry_node_materializes_the_existing_runtime_contract(self):
        registry = {"schema": "bv.lora_stack_registry", "version": 1, "stacks": {
            "22222222-2222-4222-8222-222222222222": {
                "id": "22222222-2222-4222-8222-222222222222", "name": "Disabled", "stack": [],
            },
        }}
        with mock.patch.object(self.module, "materialize_lora_registry", return_value=(registry, "11111111-1111-4111-8111-111111111111")):
            provider, = self.module.BVLoraRegistryNode().collect("{}")
        self.assertEqual(provider["provider_id"], "11111111-1111-4111-8111-111111111111")
        self.assertEqual(provider["resources"], registry["stacks"])
        self.assertEqual(self.module.BVLoraRegistryNode.RETURN_TYPES, (self.module.RUNTIME_PROVIDER,))
        self.assertEqual(self.module.BVLoraRegistryNode.RETURN_NAMES, ("resource_provider",))

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
        _, chain_provider = self.module.BVNamedLoraStackNode().register(
            [("portrait.safetensors", 0.8, 0.6)], "Portrait", "stack-a"
        )
        snapshot = copy.deepcopy(chain_provider)
        provider = self.module.BVLoraStackCollectorNode().collect(
            chain_provider, "22222222-2222-4222-8222-222222222222"
        )[0]
        required = self.module.BVLoraStackCollectorNode.INPUT_TYPES()["required"]
        self.assertEqual(set(required), {"resource_provider", "collector_id"})
        self.assertNotIn("lora_registry", required)
        self.assertEqual(chain_provider, snapshot)
        self.assertEqual(provider["provider_id"], "22222222-2222-4222-8222-222222222222")
        self.assertEqual(provider["resource_type"], "bv-nodepack.lora-stack")
        self.assertEqual(provider["resources"]["stack-a"]["stack"][0][0], "portrait.safetensors")

    def test_lora_collector_rejects_invalid_v3_provider_payloads(self):
        collector = self.module.BVLoraStackCollectorNode()
        collector_id = "22222222-2222-4222-8222-222222222222"
        valid = self.module.build_lora_provider(
            "11111111-1111-4111-8111-111111111111",
            {"stack-a": {"id": "stack-a", "name": "A", "stack": [("a.safetensors", 1.0, 1.0)]}},
        )
        invalid = [
            {**valid, "resource_type": "bv-nodepack.detector"},
            {**valid, "provider_id": "not-a-uuid"},
            {**valid, "resources": []},
            {**valid, "future": True},
        ]
        for provider in invalid:
            with self.subTest(provider=provider):
                with self.assertRaises(ValueError):
                    collector.collect(provider, collector_id)

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

    def test_detailer_mask_applies_materialized_v3_lora_scope_to_conditioning(self):
        document = fixture()
        document["version"] = 2
        for region in document["regions"]:
            region["usage"] = "generation"
        selected = document["regions"][1]
        selected["usage"] = "detailer"
        collector_id = "22222222-2222-4222-8222-222222222222"
        configured = self.module.normalize_context(document).with_capability(
            self.module.LORA_CAPABILITY,
            {
                "version": 2,
                "entries": [{
                    "id": "33333333-3333-4333-8333-333333333333",
                    "source": {
                        "kind": "external",
                        "collector_id": collector_id,
                        "resource_id": "portrait",
                    },
                    "targets": [{
                        "scope": "region",
                        "document_id": document["document_id"],
                        "region_id": selected["id"],
                    }],
                }],
            },
        )
        provider = self.module.build_lora_provider(
            collector_id,
            {"portrait": {
                "id": "portrait",
                "name": "Portrait",
                "stack": [["portrait.safetensors", 0.8, 0.6]],
            }},
        )
        regional = self.module.materialize_lora_capability(
            configured, provider, registry=self.module.LORA_CAPABILITY_REGISTRY
        ).to_dict()
        hook = object()
        native_conditioning = __import__(
            f"{PACKAGE}.py.util.regional.native_conditioning",
            fromlist=["clip_with_hooks"],
        )

        def clip_with_hooks(clip, hooks):
            clip.apply_hooks_to_conds = hooks
            return clip

        with mock.patch.object(
            self.module,
            "resolve_stack_paths",
            return_value={selected["id"]: [["portrait.safetensors", 0.8, 0.6]]},
        ), mock.patch.object(
            self.module, "create_hook_groups", return_value={selected["id"]: hook}
        ), mock.patch.object(
            native_conditioning, "clip_with_hooks", side_effect=clip_with_hooks
        ):
            result = self.module.BVRegionalDetailerMaskNode().render(
                regional,
                torch.zeros((1, 120, 200, 3)),
                object(),
                DetailerClip(),
                object(),
                selected["id"],
                global_influence=0.0,
                background_influence=0.0,
            )

        self.assertTrue(any(metadata.get("hooks") is hook for _embedding, metadata in result[3]))

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

    def test_image_save_keeps_regional_metadata_strictly_optional(self):
        inputs = self.module.BVRegionalImageSaveNode.INPUT_TYPES()
        self.assertEqual(inputs["optional"]["regional"][0], "BV_REGIONAL")
        self.assertEqual(inputs["hidden"]["unique_id"], "UNIQUE_ID")
        saver = self.module.BVRegionalImageSaveNode()
        calls = []
        saver.save_images = lambda *args: calls.append(args) or {"ui": {"images": []}}
        images, prompt, pnginfo = object(), {"graph": True}, {"workflow": {}}
        saver.save(images, "legacy", "doc-a", prompt, pnginfo, "99")
        self.assertEqual(calls, [(images, "legacy", prompt, pnginfo)])

    def test_image_save_uses_connected_context_and_rejects_wrong_target(self):
        regional = fixture()
        target = regional["document_id"]
        saver = self.module.BVRegionalImageSaveNode()
        calls = []
        saver._save_regional_images = lambda *args: calls.append(args) or {"ui": {"images": []}}
        images = object()
        saver.save(images, "regional", target, {}, {}, "99", regional)
        self.assertEqual(calls[0][:5], (images, "regional", {}, {}, "99"))
        with self.assertRaisesRegex(ValueError, "does not match connected RegionalContext"):
            saver.save(images, "regional", "wrong-document", {}, {}, "99", regional)

    def test_image_save_writes_raw_civitai_parameters_and_structured_bv_context(self):
        from PIL import Image

        regional = fixture()
        target = regional["document_id"]
        graph = {
            "90": {"class_type": "BV Regional Image Save", "inputs": {"images": ["30", 0]}},
            "30": {"class_type": "VAEDecode", "inputs": {"samples": ["20", 0]}},
            "20": {"class_type": "KSampler", "inputs": {
                "model": ["10", 0], "steps": 20, "cfg": 7, "seed": 42,
                "sampler_name": "euler", "scheduler": "normal", "denoise": 1,
            }},
            "10": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
        }
        with tempfile.TemporaryDirectory(dir=ROOT / ".tmp") as directory:
            fake_paths = types.ModuleType("folder_paths")
            fake_paths.get_save_image_path = lambda *_args: (directory, "regional", 1, "", "regional")
            fake_paths.get_full_path = lambda *_args: None
            fake_cli = types.ModuleType("comfy.cli_args")
            fake_cli.args = types.SimpleNamespace(disable_metadata=False)
            fake_comfy = types.ModuleType("comfy")
            fake_comfy.__path__ = []
            saver = self.module.BVRegionalImageSaveNode()
            saver.output_dir = directory
            saver.type = "output"
            saver.prefix_append = ""
            saver.compress_level = 4
            with mock.patch.dict(sys.modules, {"folder_paths": fake_paths, "comfy": fake_comfy, "comfy.cli_args": fake_cli}):
                output = saver.save(torch.zeros((1, 4, 5, 3)), "regional", target, graph, {"workflow": {"nodes": []}}, "90", regional)
            saved = Path(directory, output["ui"]["images"][0]["filename"])
            text = Image.open(saved).text
            self.assertTrue(text["parameters"].startswith("masterpiece"))
            self.assertNotEqual(text["parameters"][0], '"')
            self.assertEqual(json.loads(text["prompt"])["20"]["class_type"], "KSampler")
            self.assertEqual(json.loads(text["workflow"]), {"nodes": []})
            self.assertEqual(json.loads(text["bv_regional"])["schema"], "bv.regional-generation")


if __name__ == "__main__":
    unittest.main()

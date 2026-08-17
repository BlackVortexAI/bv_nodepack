import importlib.util
import json
from pathlib import Path
import sys
import types
import unittest


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


class RegionalNodeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_node_module()

    def test_main_node_outputs_valid_custom_document(self):
        result = self.module.BVRegionalPromptNode().build(json.dumps(fixture()))
        self.assertEqual(result[0]["schema"], "bv.regional")

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
        self.assertEqual(json.loads(output["result"][0])["version"], 1)

    def test_native_conditioning_node_is_registered_with_standard_outputs(self):
        self.assertIs(self.module.NODE_CLASS_MAPPINGS["BV Regional Native Conditioning"], self.module.BVRegionalNativeConditioningNode)
        self.assertEqual(self.module.BVRegionalNativeConditioningNode.RETURN_TYPES, ("CONDITIONING", "CONDITIONING"))

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

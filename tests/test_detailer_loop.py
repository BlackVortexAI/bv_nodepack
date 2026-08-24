from collections import namedtuple
import json
from pathlib import Path
import sys
import unittest
from unittest import mock


ROOT = Path(__file__).parents[1]
COMFY_ROOT = ROOT.parents[1]
sys.path.insert(0, str(COMFY_ROOT))
sys.path.insert(0, str(ROOT.parent))

import numpy as np  # noqa: E402
import torch  # noqa: E402

try:  # noqa: E402
    from comfy_execution.graph import DynamicPrompt
except ModuleNotFoundError:  # CI validates the node pack without a full ComfyUI checkout.
    from fixtures.fake_comfy_execution import install as install_fake_comfy_execution

    install_fake_comfy_execution()
    from comfy_execution.graph import DynamicPrompt
from bv_nodepack.py.nodes.bv_regional_detailer import (  # noqa: E402
    BVDetectorBindingNode,
    BVDetectorRegistryNode,
    BVDetailerLoopEndNode,
    BVDetailerLoopStartNode,
    BVImpactDetailerDetectNode,
    BVRegionalDetailerJobNode,
    BVRegionalDetailerPlanNode,
    _BVDetailerLoopAdvance,
    _BVDetailerWhileEnd,
)
from bv_nodepack.py.util.regional.detailer import normalize_detector_binding, register_detector  # noqa: E402


FakeSEG = namedtuple(
    "FakeSEG",
    "cropped_image cropped_mask confidence crop_region bbox label control_net_wrapper",
)


class FakeImpactCore:
    SEG = FakeSEG

    @staticmethod
    def mask_to_segs(mask, *_args, **_kwargs):
        return ((int(mask.shape[-2]), int(mask.shape[-1])), [])

    @staticmethod
    def segs_bitwise_and_mask(segs, _mask):
        return segs


class FakeBBoxDetector:
    def __init__(self):
        self.queries = []

    def setAux(self, value):
        self.queries.append(value)

    def detect(self, image, threshold, dilation, crop_factor, drop_size):
        mask = np.ones((10, 10), dtype=np.float32)
        segment = FakeSEG(None, mask, 0.9, (2, 3, 12, 13), (3, 4, 10, 11), "eye", None)
        return ((int(image.shape[1]), int(image.shape[2])), [segment])


class DetailerLoopTests(unittest.TestCase):
    def setUp(self):
        self.impact_core = mock.patch.object(
            BVImpactDetailerDetectNode,
            "_impact_core",
            return_value=FakeImpactCore,
        )
        self.impact_core.start()
        self.addCleanup(self.impact_core.stop)

    def test_public_loop_contract_is_minimal_and_state_driven(self):
        start_inputs = BVDetailerLoopStartNode.INPUT_TYPES()["required"]
        job_inputs = BVRegionalDetailerJobNode.INPUT_TYPES()["required"]
        end_inputs = BVDetailerLoopEndNode.INPUT_TYPES()["required"]

        self.assertEqual(set(start_inputs), {"detailer_plan", "initial_image"})
        self.assertEqual(BVDetailerLoopStartNode.RETURN_NAMES, ("flow", "loop_state"))
        self.assertEqual(set(job_inputs), {"loop_state", "model", "clip", "vae", "global_influence", "background_influence", "primary_region_influence"})
        self.assertEqual(BVRegionalDetailerJobNode.RETURN_NAMES, ("detailer_job", "current_image", "region_mask", "basic_pipe"))
        self.assertEqual(set(end_inputs), {"flow", "processed_image"})
        self.assertEqual(BVDetailerLoopEndNode.RETURN_NAMES, ("final_image",))

        detect_inputs = BVImpactDetailerDetectNode.INPUT_TYPES()
        self.assertEqual(
            set(detect_inputs["required"]) - {"roi_padding", "threshold", "dilation", "crop_factor", "drop_size", "detector_query", "detector_labels"},
            {"detailer_job", "current_image", "region_mask"},
        )
        self.assertNotIn("detector_registry", detect_inputs.get("optional", {}))
        self.assertEqual(BVImpactDetailerDetectNode.RETURN_NAMES, ("segs",))

    def test_job_resolver_emits_only_loop_body_values(self):
        node = BVRegionalDetailerJobNode()
        document = {
            "schema": "bv.regional", "version": 2, "canvas": {"width": 8, "height": 8},
            "global_positive": "", "global_negative": "", "background_positive": "",
            "background_negative": "", "regions": [],
        }
        plan = {"schema": "bv.detailer_plan", "version": 1, "document": document, "jobs": [{
            "id": "job", "region_names": ["Face"], "region_ids": ["face"],
            "primary_region_id": "face", "prompt_composition": "primary", "conditioning": {},
        }]}
        image = torch.zeros((1, 8, 8, 3))
        loop_state = {
            "schema": "bv.detailer_loop_state", "version": 1,
            "job_index": 0, "current_image": image, "detailer_plan": plan,
        }
        with mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.compose_job_mask",
            return_value=torch.zeros((1, 8, 8)),
        ), mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.compile_detailer_conditioning",
            return_value=([], [], "", "", None, None),
        ):
            result = node.resolve(loop_state, object(), object(), object())
        self.assertEqual(len(result), 4)
        self.assertIs(result[1], image)
        self.assertIsNone(result[0]["detector_binding"])

    def test_job_resolver_preserves_materialized_detector_binding(self):
        node = BVRegionalDetailerJobNode()
        binding = normalize_detector_binding(sam_model=object())
        document = {
            "schema": "bv.regional", "version": 2, "canvas": {"width": 8, "height": 8},
            "global_positive": "", "global_negative": "", "background_positive": "",
            "background_negative": "", "regions": [],
        }
        plan = {"schema": "bv.detailer_plan", "version": 1, "document": document, "jobs": [{
            "id": "job", "region_names": ["Face"], "region_ids": ["face"],
            "primary_region_id": "face", "prompt_composition": "primary", "conditioning": {},
            "detector_id": "face", "detector_binding": binding,
        }]}
        image = torch.zeros((1, 8, 8, 3))
        loop_state = {
            "schema": "bv.detailer_loop_state", "version": 1,
            "job_index": 0, "current_image": image, "detailer_plan": plan,
        }
        with mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.compose_job_mask",
            return_value=torch.zeros((1, 8, 8)),
        ), mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.compile_detailer_conditioning",
            return_value=([], [], "", "", None, None),
        ):
            result = node.resolve(loop_state, object(), object(), object())
        self.assertIs(result[0]["detector_binding"], binding)

    def test_start_expands_internal_while_state(self):
        plan = {"schema": "bv.detailer_plan", "jobs": [{"id": "one"}]}
        image = object()
        result = BVDetailerLoopStartNode().start(plan, image)
        loop_state = result["result"][1]
        self.assertEqual(loop_state["job_index"], 0)
        self.assertIs(loop_state["current_image"], image)
        self.assertIs(loop_state["detailer_plan"], plan)
        node = next(iter(result["expand"].values()))
        self.assertEqual(node["class_type"], "BV Detailer While Start (internal)")

    def test_end_expands_advance_and_while_end_nodes(self):
        prompt = {
            "10": {"class_type": "BV Detailer Loop Start", "inputs": {"detailer_plan": {"jobs": [{}, {}]}, "initial_image": "initial"}},
            "11": {"class_type": "BV Detailer Loop Job Resolver", "inputs": {"loop_state": ["10", 1]}},
            "12": {"class_type": "BV Detailer Loop End", "inputs": {"flow": ["10", 0], "processed_image": ["11", 1]}},
        }
        result = BVDetailerLoopEndNode().end(
            ["10", 0], ["11", 1], dynprompt=DynamicPrompt(prompt), unique_id="12",
        )
        classes = {node["class_type"] for node in result["expand"].values()}
        self.assertEqual(classes, {
            "BV Detailer Loop Advance (internal)", "BV Detailer While End (internal)",
            "BV Detailer Loop Result (internal)",
        })

    def test_recursive_clone_feeds_next_state_back_into_public_start(self):
        prompt = {
            "10": {"class_type": "BV Detailer Loop Start", "inputs": {"detailer_plan": {"jobs": [{}, {}]}, "initial_image": "initial"}},
            "11": {"class_type": "BV Detailer Loop Job Resolver", "inputs": {"loop_state": ["10", 1]}},
            "12": {"class_type": "BV Detailer Loop End", "inputs": {"flow": ["10", 0], "processed_image": ["11", 1]}},
        }
        next_state = {"schema": "bv.detailer_loop_state", "job_index": 1, "current_image": object(), "detailer_plan": {"jobs": [{}, {}]}}
        result = _BVDetailerWhileEnd().close(
            ["10", 0], True, dynprompt=DynamicPrompt(prompt), unique_id="12", initial_value0=next_state,
        )
        cloned_start = next(node for node in result["expand"].values() if node["class_type"] == "BV Detailer Loop Start")
        self.assertIs(cloned_start["inputs"]["initial_value0"], next_state)

    def test_advance_stops_after_last_job(self):
        node = _BVDetailerLoopAdvance()
        plan = {"jobs": [{}, {}]}
        state = {"schema": "bv.detailer_loop_state", "job_index": 0, "current_image": "first", "detailer_plan": plan}
        next_state, keep_going = node.advance(state, "second")
        self.assertEqual((next_state["job_index"], next_state["current_image"], keep_going), (1, "second", True))
        final_state, keep_going = node.advance(next_state, "third")
        self.assertEqual((final_state["job_index"], final_state["current_image"], keep_going), (2, "third", False))

    def test_impact_detection_runs_on_roi_and_rebases_to_full_image(self):
        detector = FakeBBoxDetector()
        registry = register_detector(
            None, "eyes", normalize_detector_binding(bbox_detector=detector),
        )
        job = {
            "id": "job", "region_names": ["Eyes"], "detector_id": "eyes",
            "detector": {"query": "eyes", "labels": ["eye"]},
            "detector_binding": registry["entries"]["eyes"],
        }
        image = torch.zeros((1, 100, 200, 3))
        mask = torch.zeros((1, 100, 200))
        mask[:, 20:80, 30:150] = 1
        segs = BVImpactDetailerDetectNode().detect(job, image, mask, roi_padding=0)[0]
        self.assertEqual(segs[0], (100, 200))
        self.assertEqual(segs[1][0].crop_region, (32, 23, 42, 33))
        self.assertEqual(segs[1][0].bbox, (33, 24, 40, 31))
        self.assertEqual(detector.queries, ["eyes", None])

    def test_impact_detection_without_binding_converts_region_mask_to_segs(self):
        job = {
            "id": "job", "region_names": ["Eyes"], "detector_id": None,
            "detector": {}, "detector_binding": None,
        }
        image = torch.zeros((1, 100, 200, 3))
        mask = torch.zeros((1, 100, 200))
        mask[:, 20:80, 30:150] = 1
        segs = BVImpactDetailerDetectNode().detect(job, image, mask, roi_padding=0)[0]
        self.assertEqual(segs[0], (100, 200))

    def test_job_roi_padding_overrides_node_default(self):
        job = {"id": "job", "region_names": ["Face"], "detector_id": None, "detector": {"roi_padding": 0.1}}
        image = torch.zeros((1, 100, 200, 3))
        mask = torch.zeros((1, 100, 200)); mask[:, 20:80, 30:150] = 1
        with mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.expanded_roi", return_value=(18, 14, 162, 86),
        ) as roi:
            BVImpactDetailerDetectNode().detect(job, image, mask, roi_padding=0)
        roi.assert_called_once_with(mask, 0.1)

    def test_internal_loop_nodes_use_hidden_category(self):
        from bv_nodepack.py.nodes.bv_regional_detailer import (
            _BVDetailerWhileEnd, _BVDetailerWhileStart,
        )
        self.assertEqual(_BVDetailerWhileStart.CATEGORY, "__hidden__")
        self.assertEqual(_BVDetailerWhileEnd.CATEGORY, "__hidden__")
        self.assertEqual(_BVDetailerLoopAdvance.CATEGORY, "__hidden__")

    def test_registry_collects_named_bindings_in_parallel(self):
        first = BVDetectorBindingNode().bind("eyes", bbox_detector=FakeBBoxDetector())[0]
        second = BVDetectorBindingNode().bind("faces", bbox_detector=FakeBBoxDetector())[0]
        registry, count, summary, provider = BVDetectorRegistryNode().collect(
            external_detector_1=first, external_detector_2=second,
        )
        self.assertEqual(count, 2)
        self.assertEqual(set(registry["entries"]), {"eyes", "faces"})
        self.assertEqual(summary, "eyes\nfaces")
        self.assertIsNone(provider)

    def test_detailer_plan_owns_and_validates_detector_registry(self):
        registry = register_detector(None, "eyes", normalize_detector_binding(bbox_detector=FakeBBoxDetector()))
        planned = {"schema": "bv.detailer_plan", "jobs": [{"detector_id": "eyes", "region_names": ["Eyes"]}]}
        with mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.build_detailer_plan", return_value=planned,
        ):
            result, _, _ = BVRegionalDetailerPlanNode().build(object(), detector_registry=registry)
        self.assertIs(result["detector_registry"], registry)

    def test_detailer_plan_v3_collects_runtime_providers_by_stable_id(self):
        first = {"schema": "bv.runtime_resource_provider", "provider_id": "collector-a"}
        second = {"schema": "bv.runtime_resource_provider", "provider_id": "collector-b"}
        configured = {"version": 1, "jobs": [{"detector_assignments": []}]}
        planned = {"schema": "bv.detailer_plan", "jobs": [{
            "region_names": ["Face"], "detector_id": None,
        }]}
        with mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.transform_detailer_capability", return_value="context",
        ) as transform, mock.patch(
            "bv_nodepack.py.nodes.bv_regional_detailer.materialize_detailer_plan", return_value=planned,
        ) as materialize:
            result, count, _ = BVRegionalDetailerPlanNode().build(
                object(), json.dumps(configured), resource_provider=first, resource_provider_1=second,
            )
        transform.assert_called_once()
        self.assertEqual(materialize.call_args.args[1], {"collector-a": first, "collector-b": second})
        self.assertIs(result, planned)
        self.assertEqual(count, 1)

    def test_detailer_plan_exposes_twenty_one_typed_runtime_provider_inputs(self):
        optional = BVRegionalDetailerPlanNode.INPUT_TYPES()["optional"]
        providers = [name for name in optional if name.startswith("resource_provider")]
        self.assertEqual(len(providers), 21)
        self.assertTrue(all(optional[name][1]["forceInput"] for name in providers))

    def test_registry_rejects_duplicate_detector_ids(self):
        first = BVDetectorBindingNode().bind("eyes", bbox_detector=FakeBBoxDetector())[0]
        second = BVDetectorBindingNode().bind("eyes", bbox_detector=FakeBBoxDetector())[0]
        with self.assertRaisesRegex(ValueError, "already registered"):
            BVDetectorRegistryNode().collect(external_detector_1=first, external_detector_2=second)

    def test_registry_loads_configured_model_without_visible_provider_node(self):
        provider = mock.Mock()
        provider.doit.return_value = (FakeBBoxDetector(), object())
        config = json.dumps({
            "schema": "bv.detector_registry_config", "version": 1,
            "detectors": [{"id": "eyes", "provider": "ultralytics", "model_name": "bbox/eyes.pt"}],
        })
        with mock.patch.object(BVDetectorRegistryNode, "_provider", return_value=provider):
            registry, count, summary, runtime_provider = BVDetectorRegistryNode().collect(config)
        self.assertEqual(count, 1)
        self.assertEqual(summary, "eyes")
        self.assertTrue(registry["entries"]["eyes"]["capabilities"]["bbox"])
        self.assertFalse(registry["entries"]["eyes"]["capabilities"]["segmentation"])
        self.assertIsNone(runtime_provider)
        provider.doit.assert_called_once_with("bbox/eyes.pt")

    def test_registry_v2_appends_runtime_provider_without_shifting_legacy_outputs(self):
        binding = BVDetectorBindingNode().bind("eyes", bbox_detector=FakeBBoxDetector())[0]
        config = json.dumps({
            "schema": "bv.detector_registry_config", "version": 2,
            "collector_id": "22222222-2222-4222-8222-222222222222", "detectors": [],
        })
        registry, count, summary, provider = BVDetectorRegistryNode().collect(
            config, external_detector_1=binding,
        )
        self.assertEqual(BVDetectorRegistryNode.RETURN_NAMES[:3], ("detector_registry", "detector_count", "registry_summary"))
        self.assertEqual((count, summary), (1, "eyes"))
        self.assertIs(provider["resources"]["eyes"], registry["entries"]["eyes"])
        self.assertEqual(provider["provider_id"], "22222222-2222-4222-8222-222222222222")


if __name__ == "__main__":
    unittest.main()

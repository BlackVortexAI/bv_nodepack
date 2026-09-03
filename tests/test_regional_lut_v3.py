import unittest
import json
import torch

from py.nodes.bv_lut_prototype import BVApplyLutPrototype, BVLutLoopJobResolverPrototype, BVLutLoopStartPrototype
from py.nodes.bv_regional_lut import BVRegionalLutPlanNode
from py.util.lut_prototype import builtin_lut
from py.util.regional.context import RegionalContextError
from py.util.regional.lut_v3 import materialize_lut_plan, register_lut_contracts, transform_lut_capability


COLLECTOR = "11111111-1111-4111-8111-111111111111"
REGION = "22222222-2222-4222-8222-222222222222"
DOCUMENT = {"schema":"bv.regional","version":2,"document_id":"33333333-3333-4333-8333-333333333333","title":"T","canvas":{"width":8,"height":8},"prompts":{"global":{"positive_source":"","negative_source":""},"background":{"positive_source":"","negative_source":""}},"negative_mode":"auto","overlap":{"mode":"joint"},"regions":[{"id":REGION,"name":"Person","parent_region_id":None,"enabled":True,"usage":"generation","strength":1,"priority":0,"prompts":{"positive_source":"","negative_source":""},"mask":{"feather":0},"geometry":[],"authoring":{"visible":True,"locked":False,"color":"#fff"}}]}


def payload(invert=True):
    return {"version":1,"jobs":[{"id":"person-grade","region_ids":[REGION],"mask_composition":"union","lut_source":{"collector_id":COLLECTOR,"resource_id":"warm"},"strength":.5,"mask_invert":invert,"detector_source":None}]}


class RegionalLutV3Tests(unittest.TestCase):
    def test_transform_validates_regions_and_preserves_invert(self):
        registry = register_lut_contracts()
        context = transform_lut_capability(DOCUMENT, payload(), registry=registry)
        self.assertTrue(context.capabilities["bv-nodepack.lut-plan"]["jobs"][0]["mask_invert"])
        broken = payload(); broken["jobs"][0]["region_ids"] = ["missing"]
        with self.assertRaisesRegex(RegionalContextError, "unavailable"):
            transform_lut_capability(DOCUMENT, broken, registry=registry)

    def test_global_job_needs_no_region_and_resolves_full_image_mask(self):
        global_payload = payload(False)
        global_payload["jobs"][0]["region_ids"] = []
        global_payload["jobs"][0]["scope"] = "global"
        registry = register_lut_contracts()
        context = transform_lut_capability(DOCUMENT, global_payload, registry=registry)
        lut = builtin_lut("Warm Contrast")
        provider = {"schema":"bv.runtime_resource_provider","version":1,"provider_id":COLLECTOR,"resource_type":"bv-nodepack.lut","resources":{"warm":lut}}
        plan = materialize_lut_plan(context, {COLLECTOR:provider}, registry=registry)
        state = {"schema":"bv.lut_loop_state.prototype","version":1,"job_index":0,"current_image":torch.zeros((1,8,8,3)),"plan":plan}
        _image, _lut, mask, _strength, _info = BVLutLoopJobResolverPrototype().resolve(state)
        self.assertTrue(torch.all(mask == 1))

    def test_materialize_resolves_live_lut_from_same_graph_provider(self):
        registry = register_lut_contracts()
        context = transform_lut_capability(DOCUMENT, payload(False), registry=registry)
        lut = builtin_lut("Warm Contrast")
        provider = {"schema":"bv.runtime_resource_provider","version":1,"provider_id":COLLECTOR,"resource_type":"bv-nodepack.lut","resources":{"warm":lut}}
        plan = materialize_lut_plan(context, {COLLECTOR:provider}, registry=registry)
        self.assertIs(plan["jobs"][0]["lut"], lut)
        self.assertFalse(plan["jobs"][0]["mask_invert"])

    def test_materialize_fails_closed_without_collector(self):
        registry = register_lut_contracts()
        context = transform_lut_capability(DOCUMENT, payload(), registry=registry)
        with self.assertRaisesRegex(RegionalContextError, "same graph"):
            materialize_lut_plan(context, {}, registry=registry)

    def test_regional_plan_node_materializes_for_existing_loop(self):
        lut = builtin_lut("Warm Contrast")
        provider = {"schema":"bv.runtime_resource_provider","version":1,"provider_id":COLLECTOR,"resource_type":"bv-nodepack.lut","resources":{"warm":lut}}
        plan, count, _summary = BVRegionalLutPlanNode().build(
            DOCUMENT, json.dumps(payload()), resource_provider_1=provider,
        )
        state = {"schema":"bv.lut_loop_state.prototype","version":1,"job_index":0,"current_image":torch.zeros((1,8,8,3)),"plan":plan}
        _image, resolved_lut, mask, strength, _info = BVLutLoopJobResolverPrototype().resolve(state)
        self.assertEqual(count, 1)
        self.assertIs(resolved_lut, lut)
        self.assertEqual(tuple(mask.shape), (1, 8, 8))
        self.assertEqual(strength, .5)

    def test_cross_family_provider_identity_collision_never_returns_wrong_resource(self):
        selected = payload(False)
        selected["jobs"][0]["detector_source"] = {"collector_id": COLLECTOR, "resource_id": "face"}
        lut_provider = {"schema": "bv.runtime_resource_provider", "version": 1, "provider_id": COLLECTOR,
                        "resource_type": "bv-nodepack.lut", "resources": {"warm": builtin_lut("Warm Contrast")}}
        detector_provider = {"schema": "bv.runtime_resource_provider", "version": 1, "provider_id": COLLECTOR,
                             "resource_type": "bv-nodepack.detector", "resources": {"face": object()}}
        for first, second in ((lut_provider, detector_provider), (detector_provider, lut_provider)):
            with self.subTest(first=first["resource_type"]):
                with self.assertRaisesRegex(RegionalContextError, "wrong identity or resource type"):
                    BVRegionalLutPlanNode().build(DOCUMENT, json.dumps(selected), resource_provider_1=first,
                                                  resource_provider_2=second)

    def test_loop_start_materializes_easy_regional_context_directly(self):
        registry = register_lut_contracts()
        regional = transform_lut_capability(DOCUMENT, payload(False), registry=registry).to_dict()
        lut = builtin_lut("Warm Contrast")
        provider = {"schema":"bv.runtime_resource_provider","version":1,"provider_id":COLLECTOR,"resource_type":"bv-nodepack.lut","resources":{"warm":lut}}
        plan = BVLutLoopStartPrototype._resolve_plan(regional, {"resource_provider_1": provider})
        self.assertEqual(plan["schema"], "bv.regional_lut_plan")
        self.assertIs(plan["jobs"][0]["lut"], lut)

    def test_loop_start_without_selected_lut_materializes_a_noop(self):
        plan = BVLutLoopStartPrototype._resolve_plan(DOCUMENT, {})
        self.assertEqual(plan["schema"], "bv.lut_plan.prototype")
        self.assertEqual(len(plan["jobs"]), 1)
        self.assertEqual(plan["jobs"][0]["lut"]["title"], "BV Identity")
        self.assertEqual(plan["jobs"][0]["strength"], 0.0)
        self.assertIsNone(plan["jobs"][0]["mask"])
        image = torch.rand((1, 8, 8, 3))
        state = {"schema":"bv.lut_loop_state.prototype","version":1,"job_index":0,"current_image":image,"plan":plan}
        current, lut, mask, strength, _info = BVLutLoopJobResolverPrototype().resolve(state)
        result, applied_mask = BVApplyLutPrototype().apply(current, lut, strength, mask)
        self.assertTrue(torch.equal(result, image))
        self.assertTrue(torch.count_nonzero(applied_mask) == 0)

    def test_loop_start_with_empty_planner_materializes_a_noop(self):
        plan = BVLutLoopStartPrototype._resolve_plan(
            {"schema": "bv.regional_lut_plan", "version": 1, "jobs": []}, {}
        )
        self.assertEqual(len(plan["jobs"]), 1)
        self.assertEqual(plan["jobs"][0]["strength"], 0.0)



if __name__ == "__main__": unittest.main()

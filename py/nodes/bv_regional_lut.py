from __future__ import annotations

import json

from ..util.regional.document import REGIONAL
from ..util.regional.lut_v3 import (
    LUT_CAPABILITY, LUT_CAPABILITY_REGISTRY, MAX_LUT_RESOURCE_PROVIDERS,
    materialize_lut_plan, transform_lut_capability,
)
from ..util.regional.v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY


LUT_PLAN = "BV_LUT_PLAN"
RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"
CATEGORY = "🌀 BV Node Pack/regional/LUT"
def _provider_map(**providers):
    return {
        value["provider_id"]: value
        for value in providers.values()
        if isinstance(value, dict) and value.get("schema") == "bv.runtime_resource_provider" and value.get("provider_id")
    }


class BVRegionalLutPlanNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional_prompt": (REGIONAL, {}),
                "config_json": ("STRING", {"default": '{"version":1,"jobs":[]}', "multiline": True}),
            },
            "optional": {
                **{
                    f"resource_provider_{index}": (RUNTIME_PROVIDER, {"forceInput": True})
                    for index in range(1, MAX_LUT_RESOURCE_PROVIDERS + 1)
                },
            },
        }

    RETURN_TYPES = (LUT_PLAN, "INT", "STRING")
    RETURN_NAMES = ("lut_plan", "job_count", "plan_summary")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Builds an ordered LUT plan from BV Regional v3 regions and same-graph LUT/detector resources."

    def build(self, regional_prompt, config_json, **providers):
        payload = json.loads(config_json) if isinstance(config_json, str) else config_json
        context = transform_lut_capability(
            regional_prompt, payload, registry=REGIONAL_V3_CAPABILITY_REGISTRY,
        )
        plan = materialize_lut_plan(
            context, _provider_map(**providers), registry=REGIONAL_V3_CAPABILITY_REGISTRY,
        )
        summary = "\n".join(
            f"{index + 1}. {job['lut'].get('title', job['lut_source']['resource_id'])}"
            f" · {len(job['region_ids'])} region(s) · {job['strength']:.2f}"
            f"{' · inverted' if job['mask_invert'] else ''}"
            for index, job in enumerate(plan["jobs"])
        ) or "No LUT jobs"
        return plan, len(plan["jobs"]), summary


NODE_CLASS_MAPPINGS = {"BV Regional LUT Plan": BVRegionalLutPlanNode}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Regional LUT Plan": "🌀 BV Regional LUT Plan"}

from __future__ import annotations

import json
from typing import Any

from ..util.regional.detailer import (
    DETAILER_JOB,
    DETAILER_LOOP_STATE,
    DETAILER_PLAN,
    DETECTOR_BINDING,
    DETECTOR_REGISTRY,
    build_detailer_plan,
    compose_job_mask,
    detailer_job_at,
    expanded_roi,
    filter_segs_labels,
    job_context_regions,
    normalize_detector_binding,
    rebase_segs,
    register_detector,
    resolve_detector,
)
from ..util.regional.detailer_v3 import (
    DETAILER_CAPABILITY_REGISTRY,
    RUNTIME_PROVIDER,
    build_detector_provider,
    materialize_detailer_plan,
    transform_detailer_capability,
)
from ..util.regional.document import REGIONAL
from ..util.regional.native_conditioning import compile_detailer_conditioning


CATEGORY = "🌀 BV Node Pack/regional/detailer"
CATEGORY_IMPACT = "🌀 BV Node Pack/regional/integrations/Impact Pack"
MAX_DETECTOR_COLLECTORS = 20


def _detector_provider_map(resource_provider=None, **providers):
    values = [resource_provider, *(providers.get(f"resource_provider_{index}") for index in range(1, MAX_DETECTOR_COLLECTORS + 1))]
    return {
        value["provider_id"]: value for value in values
        if isinstance(value, dict) and value.get("schema") == "bv.runtime_resource_provider" and value.get("provider_id")
    }


class _AnyType(str):
    def __eq__(self, _other):
        return True

    def __ne__(self, _other):
        return False


ANY = _AnyType("*")


class BVRegionalDetailerPlanNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional_prompt": (REGIONAL, {}),
                "config_json": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                "detector_registry": (DETECTOR_REGISTRY, {}),
                "resource_provider": (RUNTIME_PROVIDER, {"forceInput": True}),
                **{
                    f"resource_provider_{index}": (RUNTIME_PROVIDER, {"forceInput": True})
                    for index in range(1, MAX_DETECTOR_COLLECTORS + 1)
                },
            },
        }

    RETURN_TYPES = (DETAILER_PLAN, "INT", "STRING")
    RETURN_NAMES = ("detailer_plan", "job_count", "plan_summary")
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Builds an ordered detailer plan from DET/BOTH regions, optionally grouping them through JSON configuration."

    def build(self, regional_prompt, config_json="", detector_registry=None, resource_provider=None, **providers):
        try:
            configured = json.loads(config_json) if str(config_json).strip() else None
        except json.JSONDecodeError:
            configured = None
        if isinstance(configured, dict) and configured.get("version") == 1 and any(
            "detector_assignments" in job for job in configured.get("jobs", []) if isinstance(job, dict)
        ):
            context = transform_detailer_capability(
                regional_prompt, configured, registry=DETAILER_CAPABILITY_REGISTRY,
            )
            plan = materialize_detailer_plan(
                context, _detector_provider_map(resource_provider, **providers), registry=DETAILER_CAPABILITY_REGISTRY,
            )
            summary = "\n".join(
                f"{index + 1}. {' + '.join(job['region_names'])}"
                + (f" [{job['detector_id']}]" if job["detector_id"] else "")
                for index, job in enumerate(plan["jobs"])
            ) or "No enabled detailer regions"
            return plan, len(plan["jobs"]), summary
        plan = build_detailer_plan(regional_prompt, config_json)
        for job in plan["jobs"]:
            detector_id = job.get("detector_id")
            if detector_id is not None:
                resolve_detector(detector_registry, detector_id)
        plan["detector_registry"] = detector_registry
        summary = "\n".join(
            f"{index + 1}. {' + '.join(job['region_names'])}"
            + (f" [{job['detector_id']}]" if job["detector_id"] else "")
            for index, job in enumerate(plan["jobs"])
        ) or "No enabled detailer regions"
        return plan, len(plan["jobs"]), summary


class BVRegionalDetailerJobNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "loop_state": (DETAILER_LOOP_STATE, {}),
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "vae": ("VAE", {}),
                "global_influence": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
                "background_influence": ("FLOAT", {"default": 0.35, "min": 0.0, "max": 2.0, "step": 0.05}),
                "primary_region_influence": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05}),
            }
        }

    RETURN_TYPES = (DETAILER_JOB, "IMAGE", "MASK", "BASIC_PIPE")
    RETURN_NAMES = ("detailer_job", "current_image", "region_mask", "basic_pipe")
    FUNCTION = "resolve"
    CATEGORY = CATEGORY
    DESCRIPTION = "Resolves one detailer job into its combined mask, region-aware conditioning and stable identity."

    def resolve(
        self, loop_state, model, clip, vae,
        global_influence=1.0, background_influence=0.35, primary_region_influence=1.0,
    ):
        if not isinstance(loop_state, dict) or loop_state.get("schema") != "bv.detailer_loop_state":
            raise ValueError("loop_state must be a BV_DETAILER_LOOP_STATE")
        detailer_plan = loop_state["detailer_plan"]
        job_index = loop_state["job_index"]
        current_image = loop_state["current_image"]
        shape = getattr(current_image, "shape", None)
        if shape is None or len(shape) != 4 or int(shape[0]) != 1:
            raise ValueError("BV Detailer Loop Job Resolver requires a single IMAGE shaped B,H,W,C")
        job = detailer_job_at(detailer_plan, job_index)
        detector_id = job.get("detector_id")
        if "detector_binding" not in job:
            job["detector_binding"] = (
                resolve_detector(detailer_plan.get("detector_registry"), detector_id)
                if detector_id is not None else None
            )
        mask = compose_job_mask(job, int(shape[2]), int(shape[1]))
        contexts = job_context_regions(job)
        conditioning = job.get("conditioning", {})
        global_influence = float(conditioning.get("global_influence", global_influence))
        background_influence = float(conditioning.get("background_influence", background_influence))
        primary_region_influence = float(conditioning.get("primary_region_influence", primary_region_influence))
        context_influence = float(conditioning.get("context_region_influence", 1.0))
        contexts = [{**context, "influence": context_influence} for context in contexts]
        positive, negative, _, _, _, _ = compile_detailer_conditioning(
            job["document"], clip, job["primary_region_id"], global_influence,
            background_influence, primary_region_influence, contexts,
        )
        return job, current_image, mask, (model, clip, vae, positive, negative)


class BVDetectorBindingNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "detector_id": ("STRING", {"default": "detector", "multiline": False}),
            },
            "optional": {
                "bbox_detector": ("BBOX_DETECTOR", {}),
                "segm_detector": ("SEGM_DETECTOR", {}),
                "sam_model": ("SAM_MODEL", {}),
            },
        }

    RETURN_TYPES = (DETECTOR_BINDING, "STRING", "BOOLEAN", "BOOLEAN", "BOOLEAN")
    RETURN_NAMES = ("detector_binding", "detector_id", "has_bbox", "has_segmentation", "has_sam")
    FUNCTION = "bind"
    CATEGORY = "🌀 BV Node Pack/advanced/integrations"
    DESCRIPTION = "Advanced adapter for detector objects supplied by other node packs. It is not required when models are configured in BV Detector Registry."

    def bind(self, detector_id, bbox_detector=None, segm_detector=None, sam_model=None):
        detector_id = str(detector_id).strip()
        if not detector_id:
            raise ValueError("detector_id must be non-empty")
        binding = normalize_detector_binding(
            bbox_detector=bbox_detector, segm_detector=segm_detector, sam_model=sam_model,
        )
        binding["id"] = detector_id
        capabilities = binding["capabilities"]
        return binding, detector_id, capabilities["bbox"], capabilities["segmentation"], capabilities["sam"]


class BVDetectorRegistryNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "config_json": ("STRING", {"default": "", "multiline": True}),
            },
            "optional": {
                f"external_detector_{index}": (DETECTOR_BINDING, {})
                for index in range(1, 11)
            },
        }

    RETURN_TYPES = (DETECTOR_REGISTRY, "INT", "STRING", RUNTIME_PROVIDER)
    RETURN_NAMES = ("detector_registry", "detector_count", "registry_summary", "resource_provider")
    FUNCTION = "collect"
    CATEGORY = CATEGORY
    DESCRIPTION = "Loads several named Impact-compatible detector models in one node; external bindings remain optional advanced inputs."

    @staticmethod
    def _provider(name):
        from nodes import NODE_CLASS_MAPPINGS
        provider = NODE_CLASS_MAPPINGS.get(name)
        if provider is None:
            raise RuntimeError(f"BV Detector Registry requires the Impact provider '{name}'")
        return provider()

    def collect(self, config_json="", **kwargs):
        try:
            parsed = json.loads(config_json) if str(config_json).strip() else {
                "schema": "bv.detector_registry_config", "version": 1, "detectors": [],
            }
        except json.JSONDecodeError as error:
            raise ValueError("detector registry configuration is invalid JSON") from error
        if not isinstance(parsed, dict) or parsed.get("schema") != "bv.detector_registry_config" or parsed.get("version") not in {1, 2}:
            raise ValueError("detector registry configuration must be bv.detector_registry_config v1 or v2")
        collector_id = str(parsed.get("collector_id", "")).strip() if parsed.get("version") == 2 else ""
        configured = parsed.get("detectors")
        if not isinstance(configured, list):
            raise ValueError("detector registry detectors must be an array")
        registry = None
        names = []
        for index, entry in enumerate(configured):
            if not isinstance(entry, dict):
                raise ValueError(f"detectors[{index}] must be an object")
            detector_id = str(entry.get("id", "")).strip()
            model_name = str(entry.get("model_name", "")).strip()
            provider_name = str(entry.get("provider", "ultralytics"))
            if not detector_id or not model_name:
                raise ValueError(f"detectors[{index}] requires id and model_name")
            if provider_name == "ultralytics":
                bbox, segm = self._provider("UltralyticsDetectorProvider").doit(model_name)
            elif provider_name == "onnx":
                bbox = self._provider("ONNXDetectorProvider").load_onnx(model_name)[0]
                segm = None
            else:
                raise ValueError(f"detectors[{index}].provider is unsupported: {provider_name}")
            sam = None
            sam_name = str(entry.get("sam_model_name", "")).strip()
            if sam_name:
                sam = self._provider("SAMLoader").load_model(
                    sam_name, str(entry.get("sam_device_mode", "AUTO")),
                )[0]
            binding = normalize_detector_binding(
                bbox_detector=bbox, segm_detector=segm, sam_model=sam,
            )
            binding["id"] = detector_id
            registry = register_detector(registry, detector_id, binding)
            names.append(detector_id)
        for index in range(1, 11):
            binding = kwargs.get(f"external_detector_{index}")
            if binding is None:
                continue
            detector_id = str(binding.get("id", "")).strip() if isinstance(binding, dict) else ""
            if not detector_id:
                raise ValueError(f"external_detector_{index} has no detector_id; rebuild it with BV Detector Binding")
            registry = register_detector(registry, detector_id, binding)
            names.append(detector_id)
        if registry is None:
            registry = {"schema": "bv.detector_registry", "version": 1, "entries": {}}
        provider = build_detector_provider(collector_id, registry["entries"]) if collector_id else None
        return registry, len(names), "\n".join(names) or "No detectors connected", provider


class BVImpactDetailerDetectNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "detailer_job": (DETAILER_JOB, {}),
                "current_image": ("IMAGE", {}),
                "region_mask": ("MASK", {}),
                "roi_padding": ("FLOAT", {"default": 0.15, "min": 0.0, "max": 2.0, "step": 0.01}),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "dilation": ("INT", {"default": 0, "min": -512, "max": 512}),
                "crop_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 20.0, "step": 0.1}),
                "drop_size": ("INT", {"default": 10, "min": 1, "max": 8192}),
                "detector_query": ("STRING", {"default": "", "multiline": False}),
                "detector_labels": ("STRING", {"default": "", "multiline": False}),
            },
        }

    RETURN_TYPES = ("SEGS",)
    RETURN_NAMES = ("segs",)
    FUNCTION = "detect"
    CATEGORY = CATEGORY_IMPACT
    DESCRIPTION = "Runs a registered detector on a BV-region crop, rebases its SEGS and gates detections with the exact full-image region mask."

    @staticmethod
    def _impact_core():
        try:
            import impact.core as core
        except ImportError as error:
            raise RuntimeError("BV Detailer Loop Detect to SEGS (Impact) requires ComfyUI-Impact-Pack") from error
        return core

    def detect(
        self, detailer_job, current_image, region_mask, roi_padding=0.15, threshold=0.5, dilation=0,
        crop_factor=1.5, drop_size=10, detector_query="", detector_labels="",
    ):
        shape = getattr(current_image, "shape", None)
        if shape is None or len(shape) != 4 or int(shape[0]) != 1:
            raise ValueError("BV Detailer Loop Detect to SEGS (Impact) requires a single IMAGE shaped B,H,W,C")
        core = self._impact_core()
        full_height, full_width = int(shape[1]), int(shape[2])
        detector_options = detailer_job.get("detector", {})
        roi_padding = float(detector_options.get("roi_padding", roi_padding))
        x1, y1, x2, y2 = expanded_roi(region_mask, roi_padding)
        threshold = float(detector_options.get("threshold", threshold))
        dilation = int(detector_options.get("dilation", dilation))
        crop_factor = float(detector_options.get("crop_factor", crop_factor))
        drop_size = int(detector_options.get("drop_size", drop_size))
        binding = detailer_job.get("detector_binding")

        if binding is None:
            segs = core.mask_to_segs(
                region_mask, True, crop_factor, False, drop_size,
                label=" + ".join(detailer_job["region_names"]),
            )
        else:
            crop = current_image[:, y1:y2, x1:x2, :]
            bbox_detector = binding.get("bbox")
            segm_detector = binding.get("segmentation")
            primary = bbox_detector or segm_detector
            if primary is None:
                raise ValueError(f"detector binding '{detailer_job['detector_id']}' has no primary detector")
            query = detector_options.get("query", detector_query.strip() or None)
            if query is not None and not isinstance(query, str):
                raise ValueError("detector query must be a string")
            if query and not callable(getattr(primary, "setAux", None)):
                raise ValueError(
                    f"detector binding '{detailer_job['detector_id']}' does not support a text query"
                )
            if query:
                primary.setAux(query)
            try:
                segs = primary.detect(crop, threshold, dilation, crop_factor, drop_size)
            finally:
                if query:
                    primary.setAux(None)
            labels = detector_options.get("labels")
            if labels is None and detector_labels.strip():
                labels = [label.strip() for label in detector_labels.split(",") if label.strip()]
            segs = filter_segs_labels(segs, labels)
            if binding.get("sam") is not None:
                sam_mask = core.make_sam_mask(
                    binding["sam"], segs, crop, "center-1", 0, threshold, 0, 0.7, False,
                )
                segs = core.segs_bitwise_and_mask(segs, sam_mask)
            elif bbox_detector is not None and segm_detector is not None and segm_detector is not bbox_detector:
                segmentation = segm_detector.detect(crop, threshold, dilation, crop_factor, drop_size)
                segs = core.segs_bitwise_and_mask(segs, core.segs_to_combined_mask(segmentation))
            segs = rebase_segs(segs, x1, y1, full_width, full_height)
            segs = core.segs_bitwise_and_mask(segs, region_mask)

        return (segs,)


class _BVDetailerWhileStart:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"condition": ("BOOLEAN", {"default": True})},
            "optional": {"initial_value0": (ANY,)},
        }

    RETURN_TYPES = ("FLOW_CONTROL", ANY)
    RETURN_NAMES = ("flow", "loop_state")
    FUNCTION = "open"
    CATEGORY = "__hidden__"

    def open(self, condition, **kwargs):
        from comfy_execution.graph_utils import ExecutionBlocker
        state = kwargs.get("initial_value0") if condition else ExecutionBlocker(None)
        return "stub", state


class _BVDetailerLoopAdvance:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"loop_state": (DETAILER_LOOP_STATE, {}), "processed_image": ("IMAGE", {})}}

    RETURN_TYPES = (DETAILER_LOOP_STATE, "BOOLEAN")
    RETURN_NAMES = ("next_loop_state", "continue_loop")
    FUNCTION = "advance"
    CATEGORY = "__hidden__"

    def advance(self, loop_state, processed_image):
        if not isinstance(loop_state, dict) or loop_state.get("schema") != "bv.detailer_loop_state":
            raise ValueError("loop_state must be a BV_DETAILER_LOOP_STATE")
        next_index = int(loop_state["job_index"]) + 1
        next_state = {**loop_state, "job_index": next_index, "current_image": processed_image}
        return next_state, next_index < len(loop_state["detailer_plan"]["jobs"])


class _BVDetailerLoopResult:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"loop_state": (DETAILER_LOOP_STATE, {})}}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("final_image",)
    FUNCTION = "extract"
    CATEGORY = "__hidden__"

    def extract(self, loop_state):
        return (loop_state["current_image"],)


class _BVDetailerWhileEnd:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"flow": ("FLOW_CONTROL", {"rawLink": True}), "condition": ("BOOLEAN", {})},
            "optional": {"initial_value0": (ANY,)},
            "hidden": {"dynprompt": "DYNPROMPT", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = (ANY,)
    RETURN_NAMES = ("loop_state",)
    FUNCTION = "close"
    CATEGORY = "__hidden__"

    def _dependencies(self, node_id, dynprompt, upstream, visited=None):
        from comfy_execution.graph_utils import is_link
        visited = visited or set()
        if node_id in visited:
            return
        visited.add(node_id)
        node_info = dynprompt.get_node(node_id)
        for value in node_info.get("inputs", {}).values():
            if not is_link(value):
                continue
            parent_id = value[0]
            upstream.setdefault(parent_id, [])
            self._dependencies(parent_id, dynprompt, upstream, visited)
            upstream[parent_id].append(node_id)

    def _collect(self, node_id, upstream, contained):
        for child_id in upstream.get(node_id, []):
            if child_id not in contained:
                contained.add(child_id)
                self._collect(child_id, upstream, contained)

    def close(self, flow, condition, dynprompt=None, unique_id=None, **kwargs):
        if not condition:
            return (kwargs.get("initial_value0"),)

        from comfy_execution.graph_utils import GraphBuilder, is_link

        upstream: dict[str, list[str]] = {}
        self._dependencies(unique_id, dynprompt, upstream)
        open_node = flow[0]
        contained: set[str] = {str(unique_id), str(open_node)}
        self._collect(open_node, upstream, contained)
        graph = GraphBuilder()

        for node_id in contained:
            original = dynprompt.get_node(node_id)
            clone_id = "Recurse" if node_id == unique_id else node_id
            graph.node(original["class_type"], clone_id).set_override_display_id(node_id)
        for node_id in contained:
            original = dynprompt.get_node(node_id)
            clone = graph.lookup_node("Recurse" if node_id == unique_id else node_id)
            for key, value in original.get("inputs", {}).items():
                if is_link(value) and value[0] in contained:
                    clone.set_input(key, graph.lookup_node(value[0]).out(value[1]))
                else:
                    clone.set_input(key, value)

        new_open = graph.lookup_node(open_node)
        new_open.set_input("initial_value0", kwargs.get("initial_value0"))
        recurse = graph.lookup_node("Recurse")
        return {"result": (recurse.out(0),), "expand": graph.finalize()}


class BVDetailerLoopStartNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"detailer_plan": (DETAILER_PLAN, {}), "initial_image": ("IMAGE", {})},
            "hidden": {"initial_value0": (ANY,)},
        }

    RETURN_TYPES = ("FLOW_CONTROL", DETAILER_LOOP_STATE)
    RETURN_NAMES = ("flow", "loop_state")
    FUNCTION = "start"
    CATEGORY = CATEGORY
    DESCRIPTION = "Starts a BV detailer loop and carries the current single image plus immutable plan through every job."

    def start(self, detailer_plan, initial_image, initial_value0=None):
        if not detailer_plan.get("jobs"):
            raise ValueError("BV Detailer Loop requires at least one detailer job")
        from comfy_execution.graph_utils import GraphBuilder
        graph = GraphBuilder()
        loop_state = initial_value0 or {
            "schema": "bv.detailer_loop_state",
            "version": 1,
            "job_index": 0,
            "current_image": initial_image,
            "detailer_plan": detailer_plan,
        }
        graph.node(
            "BV Detailer While Start (internal)", condition=True,
            initial_value0=loop_state,
        )
        return {"result": ("stub", loop_state), "expand": graph.finalize()}


class BVDetailerLoopEndNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "flow": ("FLOW_CONTROL", {"rawLink": True}),
                "processed_image": ("IMAGE", {"rawLink": True}),
            },
            "hidden": {"dynprompt": "DYNPROMPT", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("final_image",)
    FUNCTION = "end"
    CATEGORY = CATEGORY
    DESCRIPTION = "Feeds the processed image into the next BV detailer job and returns the final accumulated image."

    def end(self, flow, processed_image, dynprompt=None, unique_id=None):
        from comfy_execution.graph_utils import GraphBuilder
        graph = GraphBuilder()
        while_open = flow[0]
        advance = graph.node(
            "BV Detailer Loop Advance (internal)", loop_state=[while_open, 1], processed_image=processed_image,
        )
        close = graph.node(
            "BV Detailer While End (internal)", flow=flow, condition=advance.out(1),
            initial_value0=advance.out(0),
        )
        result = graph.node("BV Detailer Loop Result (internal)", loop_state=close.out(0))
        return {"result": (result.out(0),), "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    "BV Regional Detailer Plan": BVRegionalDetailerPlanNode,
    "BV Detailer Loop Job Resolver": BVRegionalDetailerJobNode,
    "BV Detector Binding": BVDetectorBindingNode,
    "BV Detector Registry": BVDetectorRegistryNode,
    "BV Detailer Loop Detect to SEGS (Impact)": BVImpactDetailerDetectNode,
    "BV Detailer Loop Start": BVDetailerLoopStartNode,
    "BV Detailer Loop End": BVDetailerLoopEndNode,
    "BV Detailer While Start (internal)": _BVDetailerWhileStart,
    "BV Detailer While End (internal)": _BVDetailerWhileEnd,
    "BV Detailer Loop Advance (internal)": _BVDetailerLoopAdvance,
    "BV Detailer Loop Result (internal)": _BVDetailerLoopResult,
}


NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Regional Detailer Plan": "🌀 BV Regional Detailer Plan",
    "BV Detailer Loop Job Resolver": "🌀 BV Detailer Loop Job Resolver",
    "BV Detector Binding": "🌀 BV External Detector Binding (Advanced)",
    "BV Detector Registry": "🌀 BV Detector Registry",
    "BV Detailer Loop Detect to SEGS (Impact)": "🌀 BV Detailer Loop Detect to SEGS (Impact)",
    "BV Detailer Loop Start": "🌀 BV Detailer Loop Start",
    "BV Detailer Loop End": "🌀 BV Detailer Loop End",
    "BV Detailer While Start (internal)": "BV Detailer While Start (internal)",
    "BV Detailer While End (internal)": "BV Detailer While End (internal)",
    "BV Detailer Loop Advance (internal)": "BV Detailer Loop Advance (internal)",
    "BV Detailer Loop Result (internal)": "BV Detailer Loop Result (internal)",
}

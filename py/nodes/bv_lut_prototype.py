"""LUT loading, application, detector masking, and recursive loop nodes."""

from __future__ import annotations

from pathlib import Path

import torch

from ..util.lut_prototype import (
    BUILTIN_LUT_NAMES,
    LUT_TYPE,
    apply_lut,
    builtin_lut,
    normalize_mask,
    parse_cube,
    refine_mask,
    select_segs,
)


CATEGORY = "🌀 BV Node Pack/regional/LUT"
CATEGORY_MANUAL = f"{CATEGORY}/Manual Chains (Optional)"
LUT_FOLDER = "luts"
LUT_EXTENSIONS = {".cube"}
DOWNLOAD_MORE = "Download more LUTs…"
LUT_PLAN = "BV_LUT_PLAN"
LUT_LOOP_STATE = "BV_LUT_LOOP_STATE"


def _canonical_lut_choice(name: str) -> str:
    if name.startswith("Built-in: ") or name == DOWNLOAD_MORE:
        return name
    return name.replace("\\", "/")


class _AnyType(str):
    def __eq__(self, _other):
        return True

    def __ne__(self, _other):
        return False


ANY = _AnyType("*")


def register_lut_folder(folder_paths_module=None) -> Path | None:
    """Register ComfyUI/models/luts without discarding configured extra paths."""
    try:
        if folder_paths_module is None:
            import folder_paths as folder_paths_module
    except ImportError:
        return None

    root = Path(folder_paths_module.models_dir) / LUT_FOLDER
    root.mkdir(parents=True, exist_ok=True)
    folder_paths_module.add_model_folder_path(LUT_FOLDER, str(root), is_default=True)
    paths, extensions = folder_paths_module.folder_names_and_paths[LUT_FOLDER]
    extensions.clear()
    extensions.update(LUT_EXTENSIONS)
    return root


register_lut_folder()


def _example_lut_root() -> Path:
    return Path(__file__).resolve().parents[2] / "examples" / "luts"


def _disk_luts() -> dict[str, Path]:
    result: dict[str, Path] = {}
    try:
        import folder_paths
        for name in folder_paths.get_filename_list(LUT_FOLDER):
            path = folder_paths.get_full_path(LUT_FOLDER, name)
            if path is not None:
                result.setdefault(_canonical_lut_choice(name), Path(path))
    except (ImportError, KeyError):
        pass

    example_root = _example_lut_root()
    if example_root.is_dir():
        for path in sorted(example_root.rglob("*.cube")):
            result.setdefault(path.relative_to(example_root).as_posix(), path)
    return result


def _lut_choices() -> list[str]:
    return [*(f"Built-in: {name}" for name in BUILTIN_LUT_NAMES), *(_disk_luts().keys()), DOWNLOAD_MORE]


def _disk_lut_path(name: str, luts: dict[str, Path]) -> Path | None:
    exact = luts.get(name)
    if exact is not None:
        return exact
    normalized = _canonical_lut_choice(name)
    return next((path for key, path in luts.items() if _canonical_lut_choice(key) == normalized), None)


class BVLutLoaderPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"lut_name": (_lut_choices(),)}}

    RETURN_TYPES = (LUT_TYPE, "STRING")
    RETURN_NAMES = ("lut", "info")
    FUNCTION = "load"
    CATEGORY = CATEGORY_MANUAL
    DESCRIPTION = "Loads a built-in look or a 3D .cube file from ComfyUI/models/luts."

    def load(self, lut_name):
        if lut_name == DOWNLOAD_MORE:
            raise ValueError("Choose a LUT after closing the download catalog")
        if lut_name.startswith("Built-in: "):
            lut = builtin_lut(lut_name.removeprefix("Built-in: "))
        else:
            path = _disk_lut_path(lut_name, _disk_luts())
            if path is None:
                raise ValueError(f"LUT not found: {lut_name}")
            lut = parse_cube(path)
        return lut, f"{lut['title']}\n{lut['size']}³\n{lut['source']}"


class BVApplyLutPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {}),
                "lut": (LUT_TYPE, {}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01, "tooltip": "In LUT loops, connect the resolver's strength output. Leave unconnected only for a manual standalone override."}),
            },
            "optional": {"mask": ("MASK", {})},
        }

    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "applied_mask")
    FUNCTION = "apply"
    CATEGORY = CATEGORY
    DESCRIPTION = "Applies a 3D LUT globally or under an optional detector/region mask."

    def apply(self, image, lut, strength=1.0, mask=None):
        graded = apply_lut(image, lut)
        alpha = normalize_mask(mask, image) * float(strength)
        result = image.to(torch.float32) * (1.0 - alpha.unsqueeze(-1)) + graded.to(torch.float32) * alpha.unsqueeze(-1)
        return result.clamp(0.0, 1.0).to(image.dtype), alpha


class BVImpactDetectorMaskPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE", {}),
                "threshold": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.01}),
                "dilation": ("INT", {"default": 0, "min": -512, "max": 512}),
                "crop_factor": ("FLOAT", {"default": 1.5, "min": 1.0, "max": 20.0, "step": 0.1}),
                "drop_size": ("INT", {"default": 10, "min": 1, "max": 8192}),
                "detector_mode": (["auto", "segmentation", "bbox_sam", "bbox_debug"],),
                "instance_mode": (["combined", "largest", "index"],),
                "instance_index": ("INT", {"default": 0, "min": 0, "max": 999}),
                "mask_threshold": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "mask_grow": ("INT", {"default": 0, "min": -256, "max": 256}),
                "mask_feather": ("INT", {"default": 8, "min": 0, "max": 256}),
            },
            "optional": {
                "bbox_detector": ("BBOX_DETECTOR", {}),
                "segm_detector": ("SEGM_DETECTOR", {}),
                "sam_model": ("SAM_MODEL", {}),
            },
        }

    RETURN_TYPES = ("MASK", "STRING")
    RETURN_NAMES = ("mask", "info")
    FUNCTION = "detect"
    CATEGORY = CATEGORY
    DESCRIPTION = "Converts an Impact-compatible detector result into a full-image mask for LUT application."

    @staticmethod
    def _impact_core():
        try:
            import impact.core as core
        except ImportError as error:
            raise RuntimeError("BV Impact Detector Mask requires ComfyUI-Impact-Pack") from error
        return core

    def detect(
        self, image, threshold=0.5, dilation=0, crop_factor=1.5, drop_size=10,
        detector_mode="auto", instance_mode="combined", instance_index=0,
        mask_threshold=0.0, mask_grow=0, mask_feather=8,
        bbox_detector=None, segm_detector=None, sam_model=None,
    ):
        bbox = bbox_detector if callable(getattr(bbox_detector, "detect", None)) else None
        segmentation = segm_detector if callable(getattr(segm_detector, "detect", None)) else None
        if detector_mode == "auto":
            detector_mode = "segmentation" if segmentation is not None else "bbox_sam" if bbox is not None and sam_model is not None else "bbox_debug"
        if detector_mode == "segmentation" and segmentation is None:
            raise ValueError("segmentation mode requires a SEGM_DETECTOR")
        if detector_mode == "bbox_sam" and (bbox is None or sam_model is None):
            raise ValueError("bbox_sam mode requires BBOX_DETECTOR and SAM_MODEL")
        if detector_mode == "bbox_debug" and bbox is None:
            raise ValueError("bbox_debug mode requires a BBOX_DETECTOR")
        core = self._impact_core()
        masks = []
        reports = []
        for item in image:
            sample = item.unsqueeze(0)
            detector = segmentation if detector_mode == "segmentation" else bbox
            segs = detector.detect(sample, float(threshold), int(dilation), float(crop_factor), int(drop_size))
            segs, selection_report = select_segs(segs, instance_mode, instance_index)
            if detector_mode == "bbox_sam" and segs[1]:
                mask = core.make_sam_mask(sam_model, segs, sample, "center-1", 0, float(threshold), 0, 0.7, False)
            else:
                mask = core.segs_to_combined_mask(segs)
            masks.append(normalize_mask(mask, sample)[0])
            reports.append(selection_report)
        result = refine_mask(torch.stack(masks), mask_grow, mask_feather, mask_threshold)
        warning = " WARNING: rectangular BBOX mask" if detector_mode == "bbox_debug" else ""
        return result, f"{detector_mode}: {'; '.join(reports)}{warning}"


def _validate_lut_plan(plan):
    if not isinstance(plan, dict) or plan.get("schema") not in {"bv.lut_plan.prototype", "bv.regional_lut_plan"} or plan.get("version") != 1:
        raise ValueError("plan must be a version 1 BV LUT prototype plan")
    jobs = plan.get("jobs")
    if not isinstance(jobs, list) or not jobs:
        raise ValueError("BV LUT prototype plan requires at least one job")
    for index, job in enumerate(jobs):
        if not isinstance(job, dict) or not {"lut", "strength", "mask_invert"}.issubset(job):
            raise ValueError(f"BV LUT prototype plan job {index} is invalid")
        if plan["schema"] == "bv.lut_plan.prototype" and set(job) != {"lut", "mask", "strength", "mask_invert"}:
            raise ValueError(f"BV LUT prototype plan job {index} is invalid")
        if plan["schema"] == "bv.regional_lut_plan" and (
            not isinstance(plan.get("document"), dict)
            or not isinstance(job.get("region_ids"), list)
            or job.get("mask_composition") not in {"union", "intersection", "subtract"}
        ):
            raise ValueError(f"BV Regional LUT plan job {index} is invalid")
        if not isinstance(job["lut"], dict) or job["lut"].get("schema") != "bv.lut.prototype":
            raise ValueError(f"BV LUT prototype plan job {index} has no valid LUT")
        if not 0.0 <= float(job["strength"]) <= 1.0:
            raise ValueError(f"BV LUT prototype plan job {index} strength is invalid")
        if not isinstance(job["mask_invert"], bool):
            raise ValueError(f"BV LUT prototype plan job {index} mask_invert must be boolean")
    return plan


def _validate_lut_loop_state(state, allow_complete=False):
    if not isinstance(state, dict) or state.get("schema") != "bv.lut_loop_state.prototype" or state.get("version") != 1:
        raise ValueError("loop_state must be a version 1 BV LUT prototype loop state")
    plan = _validate_lut_plan(state.get("plan"))
    image = state.get("current_image")
    if not torch.is_tensor(image) or image.ndim != 4 or int(image.shape[0]) < 1:
        raise ValueError("BV LUT prototype loop state requires IMAGE shaped B,H,W,C")
    index = state.get("job_index")
    upper = len(plan["jobs"]) if allow_complete else len(plan["jobs"]) - 1
    if isinstance(index, bool) or not isinstance(index, int) or index < 0 or index > upper:
        raise ValueError("BV LUT prototype loop state job_index is out of range")
    return state


class BVLutJobPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lut": (LUT_TYPE, {}),
                "strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "mask_invert": ("BOOLEAN", {"default": False}),
            },
            "optional": {"plan": (LUT_PLAN, {}), "mask": ("MASK", {})},
        }

    RETURN_TYPES = (LUT_PLAN, "INT", "STRING")
    RETURN_NAMES = ("plan", "job_count", "summary")
    FUNCTION = "append"
    CATEGORY = CATEGORY_MANUAL
    DESCRIPTION = "Appends one LUT/mask operation to an immutable in-memory loop plan."

    def append(self, lut, strength=1.0, mask_invert=False, plan=None, mask=None):
        jobs = list(_validate_lut_plan(plan)["jobs"]) if plan is not None else []
        jobs.append({
            "lut": lut, "mask": mask, "strength": float(strength),
            "mask_invert": bool(mask_invert),
        })
        result = {"schema": "bv.lut_plan.prototype", "version": 1, "jobs": jobs}
        titles = [job["lut"].get("title", "Untitled LUT") for job in jobs]
        return result, len(jobs), " -> ".join(titles)


class BVLutLoopJobResolverPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"loop_state": (LUT_LOOP_STATE, {})}}

    RETURN_TYPES = ("IMAGE", LUT_TYPE, "MASK", "FLOAT", "STRING")
    RETURN_NAMES = ("current_image", "lut", "mask", "strength", "job_info")
    OUTPUT_TOOLTIPS = (
        "Current accumulated image for this job.",
        "Resolved LUT for this job.",
        "Resolved regional and detector mask for this job.",
        "Connect this output to BV Apply LUT strength; an unconnected Apply node uses its own widget value.",
        "Current job index and LUT title.",
    )
    FUNCTION = "resolve"
    CATEGORY = CATEGORY
    DESCRIPTION = "Resolves the current LUT loop job into ordinary externally consumable values."

    def resolve(self, loop_state):
        state = _validate_lut_loop_state(loop_state)
        index = state["job_index"]
        job = state["plan"]["jobs"][index]
        if state["plan"]["schema"] == "bv.regional_lut_plan":
            from ..util.regional.detailer import compose_job_mask
            shape = state["current_image"].shape
            mask = (
                torch.ones((int(shape[0]), int(shape[1]), int(shape[2])), dtype=torch.float32)
                if job.get("scope", "regional") == "global"
                else compose_job_mask(
                    {**job, "document": state["plan"]["document"]}, int(shape[2]), int(shape[1]),
                )
            )
            binding = job.get("detector_binding")
            if binding is not None:
                detected, _info = BVImpactDetectorMaskPrototype().detect(
                    state["current_image"], detector_mode="auto", instance_mode="combined",
                    bbox_detector=binding.get("bbox"), segm_detector=binding.get("segmentation"),
                    sam_model=binding.get("sam"),
                )
                mask = torch.minimum(mask, normalize_mask(detected, state["current_image"]))
        else:
            mask = normalize_mask(job["mask"], state["current_image"])
        if job["mask_invert"]:
            mask = 1.0 - mask
        title = job["lut"].get("title", "Untitled LUT")
        return state["current_image"], job["lut"], mask, float(job["strength"]), f"{index + 1}/{len(state['plan']['jobs'])}: {title}"


class _BVLutWhileStartPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"condition": ("BOOLEAN", {"default": True})}, "optional": {"initial_value0": (ANY,)}}

    RETURN_TYPES = ("FLOW_CONTROL", ANY)
    RETURN_NAMES = ("flow", "loop_state")
    FUNCTION = "open"
    CATEGORY = "__hidden__"

    def open(self, condition, **kwargs):
        from comfy_execution.graph_utils import ExecutionBlocker
        state = kwargs.get("initial_value0") if condition else ExecutionBlocker(None)
        return "stub", state


class _BVLutLoopAdvancePrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"loop_state": (LUT_LOOP_STATE, {}), "processed_image": ("IMAGE", {})}}

    RETURN_TYPES = (LUT_LOOP_STATE, "BOOLEAN")
    RETURN_NAMES = ("next_loop_state", "continue_loop")
    FUNCTION = "advance"
    CATEGORY = "__hidden__"

    def advance(self, loop_state, processed_image):
        state = _validate_lut_loop_state(loop_state)
        if not torch.is_tensor(processed_image) or tuple(processed_image.shape) != tuple(state["current_image"].shape):
            raise ValueError("BV LUT Loop End requires processed IMAGE with unchanged B,H,W,C shape")
        next_index = state["job_index"] + 1
        return {**state, "job_index": next_index, "current_image": processed_image}, next_index < len(state["plan"]["jobs"])


class _BVLutLoopResultPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"loop_state": (LUT_LOOP_STATE, {})}}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("final_image",)
    FUNCTION = "extract"
    CATEGORY = "__hidden__"

    def extract(self, loop_state):
        state = _validate_lut_loop_state(loop_state, allow_complete=True)
        if state["job_index"] != len(state["plan"]["jobs"]):
            raise ValueError("BV LUT Loop ended before every job was processed")
        return (state["current_image"],)


class _BVLutWhileEndPrototype:
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
        upstream = {}
        self._dependencies(unique_id, dynprompt, upstream)
        open_node = flow[0]
        contained = {str(unique_id), str(open_node)}
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
                clone.set_input(key, graph.lookup_node(value[0]).out(value[1]) if is_link(value) and value[0] in contained else value)
        graph.lookup_node(open_node).set_input("initial_value0", kwargs.get("initial_value0"))
        recurse = graph.lookup_node("Recurse")
        return {"result": (recurse.out(0),), "expand": graph.finalize()}


class BVLutLoopStartPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"plan": (ANY, {}), "initial_image": ("IMAGE", {})},
            "optional": {
                **{f"resource_provider_{index}": ("BV_RUNTIME_RESOURCE_PROVIDER", {"forceInput": True}) for index in range(1, 41)},
            },
            "hidden": {"initial_value0": (ANY,)},
        }

    RETURN_TYPES = ("FLOW_CONTROL", LUT_LOOP_STATE)
    RETURN_NAMES = ("flow", "loop_state")
    FUNCTION = "start"
    CATEGORY = CATEGORY
    DESCRIPTION = "Starts an ordered LUT loop with one current IMAGE accumulator."

    @staticmethod
    def _resolve_plan(value, providers):
        if isinstance(value, dict) and value.get("schema") in {"bv.lut_plan.prototype", "bv.regional_lut_plan"}:
            if value.get("jobs") == []:
                return _validate_lut_plan({
                    "schema": "bv.lut_plan.prototype", "version": 1,
                    "jobs": [{
                        "lut": builtin_lut("Identity"), "mask": None,
                        "strength": 0.0, "mask_invert": False,
                    }],
                })
            return _validate_lut_plan(value)
        from ..util.regional.context import normalize_context
        from ..util.regional.lut_v3 import LUT_CAPABILITY, materialize_lut_plan
        from ..util.regional.v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY
        context = normalize_context(value, registry=REGIONAL_V3_CAPABILITY_REGISTRY)
        if LUT_CAPABILITY not in context.capabilities:
            return _validate_lut_plan({
                "schema": "bv.lut_plan.prototype", "version": 1,
                "jobs": [{
                    "lut": builtin_lut("Identity"), "mask": None,
                    "strength": 0.0, "mask_invert": False,
                }],
            })
        provider_map = {
            provider["provider_id"]: provider for provider in providers.values()
            if isinstance(provider, dict) and provider.get("schema") == "bv.runtime_resource_provider" and provider.get("provider_id")
        }
        return _validate_lut_plan(materialize_lut_plan(context, provider_map, registry=REGIONAL_V3_CAPABILITY_REGISTRY))

    def start(self, plan, initial_image, initial_value0=None, **providers):
        plan = self._resolve_plan(plan, providers)
        if not torch.is_tensor(initial_image) or initial_image.ndim != 4 or int(initial_image.shape[0]) < 1:
            raise ValueError("BV LUT Loop Start requires IMAGE shaped B,H,W,C")
        from comfy_execution.graph_utils import GraphBuilder
        graph = GraphBuilder()
        state = initial_value0 if initial_value0 is not None else {
            "schema": "bv.lut_loop_state.prototype", "version": 1,
            "job_index": 0, "current_image": initial_image, "plan": plan,
        }
        _validate_lut_loop_state(state)
        graph.node("BV LUT While Start (Prototype internal)", condition=True, initial_value0=state)
        return {"result": ("stub", state), "expand": graph.finalize()}


class BVLutLoopEndPrototype:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"flow": ("FLOW_CONTROL", {"rawLink": True}), "processed_image": ("IMAGE", {"rawLink": True})},
            "hidden": {"dynprompt": "DYNPROMPT", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("final_image",)
    FUNCTION = "end"
    CATEGORY = CATEGORY
    DESCRIPTION = "Feeds a processed image into the next LUT job and returns the accumulated result."

    def end(self, flow, processed_image, dynprompt=None, unique_id=None):
        from comfy_execution.graph_utils import GraphBuilder
        graph = GraphBuilder()
        advance = graph.node("BV LUT Loop Advance (Prototype internal)", loop_state=[flow[0], 1], processed_image=processed_image)
        close = graph.node("BV LUT While End (Prototype internal)", flow=flow, condition=advance.out(1), initial_value0=advance.out(0))
        result = graph.node("BV LUT Loop Result (Prototype internal)", loop_state=close.out(0))
        return {"result": (result.out(0),), "expand": graph.finalize()}


NODE_CLASS_MAPPINGS = {
    "BV LUT Loader": BVLutLoaderPrototype,
    "BV Apply LUT": BVApplyLutPrototype,
    "BV Impact Detector Mask": BVImpactDetectorMaskPrototype,
    "BV LUT Job": BVLutJobPrototype,
    "BV LUT Loop Job Resolver": BVLutLoopJobResolverPrototype,
    "BV LUT Loop Start": BVLutLoopStartPrototype,
    "BV LUT Loop End": BVLutLoopEndPrototype,
    "BV LUT While Start (Prototype internal)": _BVLutWhileStartPrototype,
    "BV LUT While End (Prototype internal)": _BVLutWhileEndPrototype,
    "BV LUT Loop Advance (Prototype internal)": _BVLutLoopAdvancePrototype,
    "BV LUT Loop Result (Prototype internal)": _BVLutLoopResultPrototype,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV LUT Loader": "🌀 BV LUT Loader",
    "BV Apply LUT": "🌀 BV Apply LUT",
    "BV Impact Detector Mask": "🌀 BV Impact Detector Mask",
    "BV LUT Job": "🌀 BV LUT Job",
    "BV LUT Loop Job Resolver": "🌀 BV LUT Loop Job Resolver",
    "BV LUT Loop Start": "🌀 BV LUT Loop Start",
    "BV LUT Loop End": "🌀 BV LUT Loop End",
    "BV LUT While Start (Prototype internal)": "BV LUT While Start (Prototype internal)",
    "BV LUT While End (Prototype internal)": "BV LUT While End (Prototype internal)",
    "BV LUT Loop Advance (Prototype internal)": "BV LUT Loop Advance (Prototype internal)",
    "BV LUT Loop Result (Prototype internal)": "BV LUT Loop Result (Prototype internal)",
}

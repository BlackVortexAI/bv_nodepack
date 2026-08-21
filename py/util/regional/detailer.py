from __future__ import annotations

import json
import math
import uuid
from typing import Any

import torch

from .document import parse_document, region_used_for
from .mask_renderer import mask_bbox, render_selection


DETAILER_PLAN = "BV_DETAILER_PLAN"
DETAILER_JOB = "BV_DETAILER_JOB"
DETECTOR_BINDING = "BV_DETECTOR_BINDING"
DETECTOR_REGISTRY = "BV_DETECTOR_REGISTRY"
DETAILER_LOOP_STATE = "BV_DETAILER_LOOP_STATE"

_PLAN_NAMESPACE = uuid.UUID("122de0c5-bc2a-4a29-ae2a-e13249c43d5c")
_MASK_MODES = {"union", "intersection", "subtract"}
_PROMPT_MODES = {"primary", "combined", "context"}


def _parse_config(value: Any) -> dict[str, Any] | None:
    if value is None or value == "":
        return None
    parsed = json.loads(value) if isinstance(value, str) else value
    if not isinstance(parsed, dict):
        raise ValueError("detailer plan config must be a JSON object")
    return parsed


def _detailer_regions(document: dict[str, Any]) -> list[dict[str, Any]]:
    indexed = [
        (index, region)
        for index, region in enumerate(document["regions"])
        if region.get("enabled", False) and region_used_for(region, "detailer")
    ]
    return [region for _, region in sorted(indexed, key=lambda item: (item[1]["priority"], item[0]))]


def _stable_job_id(document_id: str, ordinal: int, region_ids: list[str]) -> str:
    key = f"{document_id}:{ordinal}:{','.join(region_ids)}"
    return str(uuid.uuid5(_PLAN_NAMESPACE, key))


def build_detailer_plan(regional: Any, config: Any = None) -> dict[str, Any]:
    document = parse_document(regional)
    regions = _detailer_regions(document)
    available = {region["id"]: region for region in regions}
    parsed = _parse_config(config)

    if parsed is None:
        source_jobs = [{"region_ids": [region["id"]]} for region in regions]
    else:
        if parsed.get("schema") not in {None, "bv.detailer_plan"}:
            raise ValueError("detailer plan schema must be 'bv.detailer_plan'")
        if parsed.get("version", 1) != 1:
            raise ValueError("detailer plan version must be 1")
        source_jobs = parsed.get("jobs")
        if not isinstance(source_jobs, list):
            raise ValueError("detailer plan jobs must be an array")

    jobs: list[dict[str, Any]] = []
    for ordinal, source in enumerate(source_jobs):
        if not isinstance(source, dict):
            raise ValueError(f"detailer plan jobs[{ordinal}] must be an object")
        region_ids = source.get("region_ids")
        if not isinstance(region_ids, list) or not region_ids:
            raise ValueError(f"detailer plan jobs[{ordinal}].region_ids must be a non-empty array")
        region_ids = [str(item) for item in region_ids]
        if len(set(region_ids)) != len(region_ids):
            raise ValueError(f"detailer plan jobs[{ordinal}].region_ids contains duplicates")
        missing = [region_id for region_id in region_ids if region_id not in available]
        if missing:
            raise ValueError(
                f"detailer plan jobs[{ordinal}] references unavailable detailer regions: {', '.join(missing)}"
            )
        primary = str(source.get("primary_region_id") or region_ids[0])
        if primary not in region_ids:
            raise ValueError(f"detailer plan jobs[{ordinal}].primary_region_id must occur in region_ids")
        mask_mode = source.get("mask_composition", "union")
        prompt_mode = source.get("prompt_composition", "context")
        if mask_mode not in _MASK_MODES:
            raise ValueError(f"detailer plan jobs[{ordinal}].mask_composition is invalid")
        if prompt_mode not in _PROMPT_MODES:
            raise ValueError(f"detailer plan jobs[{ordinal}].prompt_composition is invalid")
        detector_id = source.get("detector_id")
        if detector_id is not None and not str(detector_id).strip():
            raise ValueError(f"detailer plan jobs[{ordinal}].detector_id must be non-empty")
        jobs.append({
            "id": str(source.get("id") or _stable_job_id(document["document_id"], ordinal, region_ids)),
            "ordinal": ordinal,
            "region_ids": region_ids,
            "primary_region_id": primary,
            "region_names": [available[region_id]["name"] for region_id in region_ids],
            "mask_composition": mask_mode,
            "prompt_composition": prompt_mode,
            "detector_id": str(detector_id) if detector_id is not None else None,
            "detector": source.get("detector") if isinstance(source.get("detector"), dict) else {},
            "conditioning": source.get("conditioning") if isinstance(source.get("conditioning"), dict) else {},
        })

    return {
        "schema": "bv.detailer_plan",
        "version": 1,
        "document_id": document["document_id"],
        "document": document,
        "jobs": jobs,
    }


def detailer_job_at(plan: Any, index: int) -> dict[str, Any]:
    if not isinstance(plan, dict) or plan.get("schema") != "bv.detailer_plan":
        raise ValueError("plan must be a BV_DETAILER_PLAN")
    jobs = plan.get("jobs")
    if not isinstance(jobs, list):
        raise ValueError("detailer plan jobs are missing")
    value = int(index)
    if value < 0 or value >= len(jobs):
        raise IndexError(f"detailer job index {value} is outside 0..{max(len(jobs) - 1, 0)}")
    return {**jobs[value], "document": plan["document"], "index": value, "total": len(jobs)}


def compose_job_mask(job: Any, width: int, height: int) -> torch.Tensor:
    if not isinstance(job, dict) or "document" not in job:
        raise ValueError("job must be a BV_DETAILER_JOB")
    masks = [
        render_selection(
            {"document": job["document"], "scope": "region", "region_id": region_id},
            int(width), int(height),
        )
        for region_id in job["region_ids"]
    ]
    result = masks[0]
    for mask in masks[1:]:
        if job["mask_composition"] == "union":
            result = torch.maximum(result, mask)
        elif job["mask_composition"] == "intersection":
            result = torch.minimum(result, mask)
        else:
            result = torch.clamp(result - mask, 0.0, 1.0)
    return result


def job_context_regions(job: dict[str, Any]) -> list[dict[str, Any]]:
    if job["prompt_composition"] == "primary":
        return []
    return [
        {"region_id": region_id, "influence": 1.0}
        for region_id in job["region_ids"]
        if region_id != job["primary_region_id"]
    ]


def normalize_detector_binding(
    *, bbox_detector: Any = None, segm_detector: Any = None, sam_model: Any = None,
) -> dict[str, Any]:
    bbox = bbox_detector if callable(getattr(bbox_detector, "detect", None)) else None
    segm = segm_detector if callable(getattr(segm_detector, "detect", None)) else None
    # SAM_MODEL is intentionally opaque. Impact validates its actual tuple/model contract.
    sam = sam_model
    return {
        "schema": "bv.detector_binding",
        "version": 1,
        "bbox": bbox,
        "segmentation": segm,
        "sam": sam,
        "capabilities": {
            "bbox": bbox is not None,
            "segmentation": segm is not None,
            "sam": sam is not None,
        },
    }


def register_detector(
    registry: Any, detector_id: str, binding: Any,
) -> dict[str, Any]:
    key = str(detector_id).strip()
    if not key:
        raise ValueError("detector_id must be non-empty")
    if not isinstance(binding, dict) or binding.get("schema") != "bv.detector_binding":
        raise ValueError("binding must be a BV_DETECTOR_BINDING")
    entries = dict(registry.get("entries", {})) if isinstance(registry, dict) else {}
    if key in entries:
        raise ValueError(f"detector_id '{key}' is already registered")
    entries[key] = binding
    return {"schema": "bv.detector_registry", "version": 1, "entries": entries}


def resolve_detector(registry: Any, detector_id: str | None) -> dict[str, Any] | None:
    if detector_id is None:
        return None
    if not isinstance(registry, dict) or registry.get("schema") != "bv.detector_registry":
        raise ValueError("this detailer job requires a BV_DETECTOR_REGISTRY")
    binding = registry.get("entries", {}).get(detector_id)
    if binding is None:
        raise ValueError(f"detector_id '{detector_id}' is not registered")
    return binding


def expanded_roi(mask: torch.Tensor, padding: float = 0.15) -> tuple[int, int, int, int]:
    value = float(padding)
    if not math.isfinite(value) or value < 0.0 or value > 2.0:
        raise ValueError("roi_padding must be between zero and two")
    x, y, width, height = mask_bbox(mask)
    if width <= 0 or height <= 0:
        raise ValueError("detailer job mask is empty")
    image_height, image_width = int(mask.shape[-2]), int(mask.shape[-1])
    pad_x, pad_y = round(width * value), round(height * value)
    x1, y1 = max(0, x - pad_x), max(0, y - pad_y)
    x2, y2 = min(image_width, x + width + pad_x), min(image_height, y + height + pad_y)
    return x1, y1, x2, y2


def rebase_segs(segs: Any, x_offset: int, y_offset: int, full_width: int, full_height: int) -> tuple:
    if not isinstance(segs, (tuple, list)) or len(segs) != 2:
        raise ValueError("detector did not return a valid SEGS bundle")
    rebased = []
    for seg in segs[1]:
        crop = tuple(int(value) for value in seg.crop_region)
        bbox = tuple(int(value) for value in seg.bbox)
        new_crop = (crop[0] + x_offset, crop[1] + y_offset, crop[2] + x_offset, crop[3] + y_offset)
        new_bbox = (bbox[0] + x_offset, bbox[1] + y_offset, bbox[2] + x_offset, bbox[3] + y_offset)
        if hasattr(seg, "_replace"):
            rebased.append(seg._replace(crop_region=new_crop, bbox=new_bbox))
        else:
            values = list(seg)
            values[3], values[4] = new_crop, new_bbox
            rebased.append(type(seg)(*values))
    return ((int(full_height), int(full_width)), rebased)


def filter_segs_labels(segs: Any, labels: Any) -> Any:
    if labels is None:
        return segs
    if not isinstance(labels, list) or not all(isinstance(label, str) and label.strip() for label in labels):
        raise ValueError("detector labels must be an array of non-empty strings")
    accepted = {label.casefold() for label in labels}
    return (segs[0], [seg for seg in segs[1] if str(getattr(seg, "label", "")).casefold() in accepted])

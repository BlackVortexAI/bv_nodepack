from __future__ import annotations

import copy
import math
import re
import uuid
from typing import Any, Mapping

from .context import (
    CapabilityRegistration,
    CapabilityRegistry,
    RegionalContext,
    RegionalContextError,
    ResourceRegistration,
    ResourceRegistry,
    context_document,
    normalize_context,
)
from .detailer import build_detailer_plan


DETAILER_CAPABILITY = "bv-nodepack.detailer-plan"
DETECTOR_RESOURCE_TYPE = "bv-nodepack.detector"
RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"

_UUID = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_ASSIGNMENT_NAMESPACE = uuid.UUID("76015e32-27af-4dc0-b9b7-1e951b90b66c")
_CONDITIONING_FIELDS = {
    "global_influence",
    "background_influence",
    "primary_region_influence",
    "context_region_influence",
}
_OPTION_FIELDS = {"roi_padding", "threshold", "dilation", "crop_factor", "drop_size"}
_OPTIONAL_OPTION_FIELDS = {"query", "labels"}


def _required_text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RegionalContextError(f"{path} must be a non-empty string")
    return value.strip()


def _required_uuid(value: Any, path: str) -> str:
    clean = _required_text(value, path)
    if not _UUID.fullmatch(clean):
        raise RegionalContextError(f"{path} must be a UUID")
    return clean


def _finite(value: Any, path: str, minimum: float, maximum: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise RegionalContextError(f"{path} must be a finite number")
    clean = float(value)
    if clean < minimum or clean > maximum:
        raise RegionalContextError(f"{path} must be between {minimum} and {maximum}")
    return clean


def _validate_conditioning(value: Any, path: str) -> None:
    if not isinstance(value, dict) or set(value) != _CONDITIONING_FIELDS:
        raise RegionalContextError(f"{path} has unknown or missing fields")
    for key in _CONDITIONING_FIELDS:
        _finite(value[key], f"{path}.{key}", 0.0, 2.0)


def _validate_options(value: Any, path: str) -> None:
    if not isinstance(value, dict) or not _OPTION_FIELDS.issubset(value) or set(value) - (_OPTION_FIELDS | _OPTIONAL_OPTION_FIELDS):
        raise RegionalContextError(f"{path} has unknown or missing fields")
    _finite(value["roi_padding"], f"{path}.roi_padding", 0.0, 2.0)
    _finite(value["threshold"], f"{path}.threshold", 0.0, 1.0)
    dilation = _finite(value["dilation"], f"{path}.dilation", -512, 512)
    drop_size = _finite(value["drop_size"], f"{path}.drop_size", 1, 8192)
    if not dilation.is_integer() or not drop_size.is_integer():
        raise RegionalContextError(f"{path}.dilation and drop_size must be integers")
    _finite(value["crop_factor"], f"{path}.crop_factor", 1.0, 20.0)
    if "query" in value and not isinstance(value["query"], str):
        raise RegionalContextError(f"{path}.query must be a string")
    if "labels" in value and (
        not isinstance(value["labels"], list)
        or not all(isinstance(label, str) and label.strip() for label in value["labels"])
    ):
        raise RegionalContextError(f"{path}.labels must be an array of non-empty strings")


def validate_detailer_capability(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict) or set(payload) != {"version", "jobs"} or payload.get("version") != 1:
        raise RegionalContextError("Detailer capability has unknown or missing fields")
    jobs = payload["jobs"]
    if not isinstance(jobs, list):
        raise RegionalContextError("Detailer capability jobs must be an array")
    job_ids: set[str] = set()
    assignment_ids: set[str] = set()
    for index, job in enumerate(jobs):
        path = f"Detailer jobs[{index}]"
        fields = {
            "id", "region_ids", "primary_region_id", "mask_composition",
            "prompt_composition", "conditioning", "detector_assignments",
        }
        if not isinstance(job, dict) or set(job) != fields:
            raise RegionalContextError(f"{path} has unknown or missing fields")
        job_id = _required_text(job["id"], f"{path}.id")
        if job_id in job_ids:
            raise RegionalContextError(f"duplicate Detailer job id: {job_id}")
        job_ids.add(job_id)
        region_ids = job["region_ids"]
        if not isinstance(region_ids, list) or not region_ids:
            raise RegionalContextError(f"{path}.region_ids must be a non-empty array")
        cleaned_regions = [_required_text(region_id, f"{path}.region_ids") for region_id in region_ids]
        if len(set(cleaned_regions)) != len(cleaned_regions):
            raise RegionalContextError(f"{path}.region_ids contains duplicates")
        if _required_text(job["primary_region_id"], f"{path}.primary_region_id") not in cleaned_regions:
            raise RegionalContextError(f"{path}.primary_region_id must occur in region_ids")
        if job["mask_composition"] not in {"union", "intersection", "subtract"}:
            raise RegionalContextError(f"{path}.mask_composition is invalid")
        if job["prompt_composition"] not in {"primary", "context"}:
            raise RegionalContextError(f"{path}.prompt_composition is invalid")
        _validate_conditioning(job["conditioning"], f"{path}.conditioning")
        assignments = job["detector_assignments"]
        if not isinstance(assignments, list) or len(assignments) > 1:
            raise RegionalContextError(f"{path}.detector_assignments must contain at most one assignment")
        for assignment_index, assignment in enumerate(assignments):
            assignment_path = f"{path}.detector_assignments[{assignment_index}]"
            if not isinstance(assignment, dict) or set(assignment) != {"id", "source", "options"}:
                raise RegionalContextError(f"{assignment_path} has unknown or missing fields")
            assignment_id = _required_text(assignment["id"], f"{assignment_path}.id")
            if assignment_id in assignment_ids:
                raise RegionalContextError(f"duplicate Detailer detector assignment id: {assignment_id}")
            assignment_ids.add(assignment_id)
            source = assignment["source"]
            if not isinstance(source, dict) or set(source) != {"collector_id", "resource_id"}:
                raise RegionalContextError(f"{assignment_path}.source has unknown or missing fields")
            _required_uuid(source["collector_id"], f"{assignment_path}.source.collector_id")
            _required_text(source["resource_id"], f"{assignment_path}.source.resource_id")
            _validate_options(assignment["options"], f"{assignment_path}.options")


def validate_detector_resource_reference(reference: dict[str, Any]) -> None:
    if set(reference) != {"provider_id", "resource_type", "resource_id"}:
        raise RegionalContextError("Detector resource reference has unknown or missing fields")
    _required_uuid(reference["provider_id"], "Detector resource provider_id")
    if reference["resource_type"] != DETECTOR_RESOURCE_TYPE:
        raise RegionalContextError(f"Detector resource_type must be {DETECTOR_RESOURCE_TYPE!r}")
    _required_text(reference["resource_id"], "Detector resource resource_id")


def register_detailer_contracts() -> tuple[CapabilityRegistry, ResourceRegistry]:
    capabilities = CapabilityRegistry()
    resources = ResourceRegistry()
    capabilities.register(
        "bv-nodepack",
        "detailer-plan",
        CapabilityRegistration(
            version=1,
            validator=validate_detailer_capability,
            version_validators={1: validate_detailer_capability},
            metadata={"display_name": "Detailer Plan"},
        ),
        source=__name__,
    )
    resources.register(
        "bv-nodepack",
        "detector",
        ResourceRegistration(
            validator=validate_detector_resource_reference,
            metadata={"display_name": "Detector"},
        ),
        source=__name__,
    )
    return capabilities, resources


DETAILER_CAPABILITY_REGISTRY, DETAILER_RESOURCE_REGISTRY = register_detailer_contracts()


def transform_detailer_capability(
    value: Any, payload: Any, *, registry: CapabilityRegistry = DETAILER_CAPABILITY_REGISTRY,
) -> RegionalContext:
    context = normalize_context(value, registry=registry)
    clean = copy.deepcopy(payload)
    validate_detailer_capability(clean)
    available = {
        region["id"] for region in context.core["regions"]
        if region.get("enabled", False) and region.get("usage") in {"detailer", "both"}
    }
    for index, job in enumerate(clean["jobs"]):
        missing = [region_id for region_id in job["region_ids"] if region_id not in available]
        if missing:
            raise RegionalContextError(
                f"Detailer jobs[{index}] references unavailable detailer regions: {', '.join(missing)}"
            )
    return context.with_capability(DETAILER_CAPABILITY, clean)


def build_detector_provider(provider_id: str, resources: Mapping[str, Any]) -> dict[str, Any]:
    clean_id = _required_uuid(provider_id, "Detector provider_id")
    if not isinstance(resources, Mapping):
        raise RegionalContextError("Detector provider resources must be an object")
    clean_resources: dict[str, Any] = {}
    for resource_id, binding in resources.items():
        clean_resource_id = _required_text(resource_id, "Detector resource_id")
        if not isinstance(binding, dict) or binding.get("schema") != "bv.detector_binding" or binding.get("version") != 1:
            raise RegionalContextError(f"Detector resource {clean_resource_id!r} is not a BV_DETECTOR_BINDING")
        clean_resources[clean_resource_id] = binding
    return {
        "schema": "bv.runtime_resource_provider",
        "version": 1,
        "provider_id": clean_id,
        "resource_type": DETECTOR_RESOURCE_TYPE,
        "resources": clean_resources,
    }


def _provider_map(providers: Any) -> dict[str, Any]:
    if isinstance(providers, dict) and providers.get("schema") == "bv.runtime_resource_provider":
        return {providers.get("provider_id"): providers}
    return dict(providers) if isinstance(providers, dict) else {}


def _resolve_detector_binding(providers: dict[str, Any], source: dict[str, Any]) -> Any:
    collector_id = source["collector_id"]
    provider = providers.get(collector_id)
    if not isinstance(provider, dict):
        raise RegionalContextError(
            f"Detector collector {collector_id!r} is missing; collector and consumer must be in the same graph"
        )
    if provider.get("schema") != "bv.runtime_resource_provider" or provider.get("version") != 1:
        raise RegionalContextError("Detector runtime resource provider is invalid")
    if provider.get("provider_id") != collector_id:
        raise RegionalContextError(
            f"Detector collector is missing or mismatched: expected {collector_id!r}, received {provider.get('provider_id')!r}"
        )
    if provider.get("resource_type") != DETECTOR_RESOURCE_TYPE:
        raise RegionalContextError("Detector runtime resource provider has the wrong resource type")
    resources = provider.get("resources")
    resource_id = source["resource_id"]
    binding = resources.get(resource_id) if isinstance(resources, dict) else None
    if not isinstance(binding, dict) or binding.get("schema") != "bv.detector_binding":
        raise RegionalContextError(
            f"Detector resource is unresolved: {resource_id!r} in collector {collector_id!r}"
        )
    return binding


def materialize_detailer_plan(
    value: Any, providers: Any = None, *, registry: CapabilityRegistry = DETAILER_CAPABILITY_REGISTRY,
) -> dict[str, Any]:
    context = normalize_context(value, registry=registry)
    payload = context.require_capability(DETAILER_CAPABILITY)
    provider_map = _provider_map(providers)
    legacy_jobs = []
    for job in payload["jobs"]:
        assignments = job["detector_assignments"]
        assignment = assignments[0] if assignments else None
        legacy_jobs.append({
            "id": job["id"],
            "region_ids": list(job["region_ids"]),
            "primary_region_id": job["primary_region_id"],
            "mask_composition": job["mask_composition"],
            "prompt_composition": job["prompt_composition"],
            "conditioning": copy.deepcopy(job["conditioning"]),
            "detector": copy.deepcopy(assignment["options"] if assignment else {}),
            **({"detector_id": assignment["source"]["resource_id"]} if assignment else {}),
        })
    plan = build_detailer_plan(
        context_document(context, registry=registry),
        {"schema": "bv.detailer_plan", "version": 1, "jobs": legacy_jobs},
    )
    for plan_job, configured_job in zip(plan["jobs"], payload["jobs"], strict=True):
        assignments = configured_job["detector_assignments"]
        assignment = assignments[0] if assignments else None
        plan_job["detector_assignment"] = copy.deepcopy(assignment)
        plan_job["detector_binding"] = (
            _resolve_detector_binding(provider_map, assignment["source"]) if assignment else None
        )
    plan["regional_context"] = context.to_dict()
    return plan


def migrate_detailer_plan_v1(
    value: Any,
    config: Any,
    detector_sources: Mapping[str, Mapping[str, str]],
    *,
    registry: CapabilityRegistry = DETAILER_CAPABILITY_REGISTRY,
) -> RegionalContext:
    context = normalize_context(value, registry=registry)
    legacy = build_detailer_plan(context_document(context, registry=registry), config)
    jobs = []
    for job in legacy["jobs"]:
        detector_id = job.get("detector_id")
        assignments = []
        if detector_id is not None:
            source = detector_sources.get(detector_id)
            if not isinstance(source, Mapping):
                raise RegionalContextError(
                    f"legacy detector_id {detector_id!r} has no explicit same-graph Collector/Resource mapping"
                )
            collector_id = _required_uuid(source.get("collector_id"), f"legacy detector {detector_id!r} collector_id")
            resource_id = _required_text(source.get("resource_id"), f"legacy detector {detector_id!r} resource_id")
            assignment_id = str(uuid.uuid5(_ASSIGNMENT_NAMESPACE, f"{job['id']}:{collector_id}:{resource_id}"))
            assignments = [{
                "id": assignment_id,
                "source": {"collector_id": collector_id, "resource_id": resource_id},
                "options": _canonical_options(job.get("detector", {})),
            }]
        jobs.append({
            "id": job["id"],
            "region_ids": list(job["region_ids"]),
            "primary_region_id": job["primary_region_id"],
            "mask_composition": job["mask_composition"],
            "prompt_composition": "context" if job["prompt_composition"] == "combined" else job["prompt_composition"],
            "conditioning": _canonical_conditioning(job.get("conditioning", {})),
            "detector_assignments": assignments,
        })
    return transform_detailer_capability(context, {"version": 1, "jobs": jobs}, registry=registry)


def _canonical_conditioning(value: Mapping[str, Any]) -> dict[str, float]:
    defaults = {
        "global_influence": 1.0,
        "background_influence": 0.35,
        "primary_region_influence": 1.0,
        "context_region_influence": 1.0,
    }
    return {key: float(value.get(key, default)) for key, default in defaults.items()}


def _canonical_options(value: Mapping[str, Any]) -> dict[str, Any]:
    defaults: dict[str, Any] = {
        "roi_padding": 0.15,
        "threshold": 0.5,
        "dilation": 0,
        "crop_factor": 1.5,
        "drop_size": 10,
    }
    result = {key: value.get(key, default) for key, default in defaults.items()}
    if isinstance(value.get("query"), str) and value["query"].strip():
        result["query"] = value["query"].strip()
    if isinstance(value.get("labels"), list):
        result["labels"] = list(value["labels"])
    return result

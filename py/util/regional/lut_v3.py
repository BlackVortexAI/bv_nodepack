from __future__ import annotations

import copy
import math
import re
from typing import Any, Mapping

from .context import CapabilityRegistration, CapabilityRegistry, RegionalContextError, context_document, normalize_context


LUT_CAPABILITY = "bv-nodepack.lut-plan"
MAX_LUT_RESOURCE_PROVIDERS = 40
LUT_RESOURCE_TYPE = "bv-nodepack.lut"
DETECTOR_RESOURCE_TYPE = "bv-nodepack.detector"

_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)


def _text(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise RegionalContextError(f"{path} must be a non-empty string")
    return value.strip()


def _uuid(value: Any, path: str) -> str:
    clean = _text(value, path)
    if not _UUID.fullmatch(clean):
        raise RegionalContextError(f"{path} must be a UUID")
    return clean


def _source(value: Any, path: str) -> None:
    if not isinstance(value, dict) or set(value) != {"collector_id", "resource_id"}:
        raise RegionalContextError(f"{path} has unknown or missing fields")
    _uuid(value["collector_id"], f"{path}.collector_id")
    _text(value["resource_id"], f"{path}.resource_id")


def validate_lut_capability(payload: dict[str, Any]) -> None:
    if not isinstance(payload, dict) or set(payload) != {"version", "jobs"} or payload.get("version") != 1:
        raise RegionalContextError("LUT capability has unknown or missing fields")
    if not isinstance(payload["jobs"], list):
        raise RegionalContextError("LUT capability jobs must be an array")
    seen: set[str] = set()
    for index, job in enumerate(payload["jobs"]):
        path = f"LUT jobs[{index}]"
        fields = {"id", "region_ids", "mask_composition", "lut_source", "strength", "mask_invert", "detector_source"}
        if not isinstance(job, dict) or frozenset(job) not in {frozenset(fields), frozenset({*fields, "scope"})}:
            raise RegionalContextError(f"{path} has unknown or missing fields")
        job_id = _text(job["id"], f"{path}.id")
        if job_id in seen:
            raise RegionalContextError(f"duplicate LUT job id: {job_id}")
        seen.add(job_id)
        scope = job.get("scope", "regional")
        if scope not in {"global", "regional"}:
            raise RegionalContextError(f"{path}.scope must be global or regional")
        regions = job["region_ids"]
        if not isinstance(regions, list) or not all(isinstance(item, str) and item.strip() for item in regions):
            raise RegionalContextError(f"{path}.region_ids must be a string array")
        if scope == "regional" and not regions:
            raise RegionalContextError(f"{path}.region_ids must not be empty for regional scope")
        if scope == "global" and regions:
            raise RegionalContextError(f"{path}.region_ids must be empty for global scope")
        if len(set(regions)) != len(regions):
            raise RegionalContextError(f"{path}.region_ids contains duplicates")
        if job["mask_composition"] not in {"union", "intersection", "subtract"}:
            raise RegionalContextError(f"{path}.mask_composition is invalid")
        _source(job["lut_source"], f"{path}.lut_source")
        strength = job["strength"]
        if isinstance(strength, bool) or not isinstance(strength, (int, float)) or not math.isfinite(float(strength)) or not 0 <= float(strength) <= 1:
            raise RegionalContextError(f"{path}.strength must be between 0 and 1")
        if not isinstance(job["mask_invert"], bool):
            raise RegionalContextError(f"{path}.mask_invert must be boolean")
        if job["detector_source"] is not None:
            _source(job["detector_source"], f"{path}.detector_source")


def register_lut_contracts() -> CapabilityRegistry:
    registry = CapabilityRegistry()
    registry.register(
        "bv-nodepack", "lut-plan",
        CapabilityRegistration(
            version=1, validator=validate_lut_capability,
            version_validators={1: validate_lut_capability},
            metadata={"display_name": "LUT Plan"},
        ),
        source=__name__,
    )
    return registry


LUT_CAPABILITY_REGISTRY = register_lut_contracts()


def transform_lut_capability(value: Any, payload: Any, *, registry: CapabilityRegistry = LUT_CAPABILITY_REGISTRY):
    context = normalize_context(value, registry=registry)
    clean = copy.deepcopy(payload)
    for job in clean.get("jobs", []) if isinstance(clean, dict) else []:
        if isinstance(job, dict):
            job.setdefault("scope", "regional")
    validate_lut_capability(clean)
    available = {region["id"] for region in context.core["regions"] if region.get("enabled", False)}
    for index, job in enumerate(clean["jobs"]):
        missing = [region_id for region_id in job["region_ids"] if region_id not in available]
        if missing:
            raise RegionalContextError(f"LUT jobs[{index}] references unavailable regions: {', '.join(missing)}")
    return context.with_capability(LUT_CAPABILITY, clean)


def _provider(providers: Mapping[str, Any], source: dict[str, str], resource_type: str):
    provider = providers.get(source["collector_id"])
    if not isinstance(provider, dict) or provider.get("schema") != "bv.runtime_resource_provider":
        raise RegionalContextError(f"Collector {source['collector_id']!r} is missing; collector and consumer must be in the same graph")
    if provider.get("provider_id") != source["collector_id"] or provider.get("resource_type") != resource_type:
        raise RegionalContextError(f"Collector {source['collector_id']!r} has the wrong identity or resource type")
    resource = provider.get("resources", {}).get(source["resource_id"])
    if resource is None:
        raise RegionalContextError(f"Resource {source['resource_id']!r} is unresolved in collector {source['collector_id']!r}")
    return resource


def materialize_lut_plan(value: Any, providers: Mapping[str, Any], *, registry: CapabilityRegistry = LUT_CAPABILITY_REGISTRY):
    context = normalize_context(value, registry=registry)
    payload = context.require_capability(LUT_CAPABILITY)
    provider_map = dict(providers or {})
    jobs = []
    for job in payload["jobs"]:
        jobs.append({
            **copy.deepcopy(job),
            "lut": _provider(provider_map, job["lut_source"], LUT_RESOURCE_TYPE),
            "detector_binding": _provider(provider_map, job["detector_source"], DETECTOR_RESOURCE_TYPE) if job["detector_source"] else None,
        })
    return {
        "schema": "bv.regional_lut_plan", "version": 1,
        "regional_context": context.to_dict(), "document": context_document(context, registry=registry),
        "jobs": jobs,
    }

from __future__ import annotations

import math
import re
import uuid
from typing import Any

from .context import (
    CapabilityRegistration,
    CapabilityRegistry,
    RegionalContext,
    RegionalContextError,
    ResourceRegistration,
    ResourceRegistry,
    normalize_context,
)
from .lora_hooks import add_named_stack, parse_registry


LORA_CAPABILITY = "bv-nodepack.lora"
LORA_RESOURCE_TYPE = "bv-nodepack.lora-stack"
RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"
_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.IGNORECASE)


def _required_uuid(value: Any, path: str) -> str:
    clean = str(value or "").strip()
    if not _UUID.fullmatch(clean):
        raise RegionalContextError(f"{path} must be a UUID")
    return clean


def _finite_number(value: Any, path: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(float(value)):
        raise RegionalContextError(f"{path} must be a finite number")
    return float(value)


def validate_lora_resource_reference(reference: dict[str, Any]) -> None:
    if set(reference) != {"provider_id", "resource_type", "resource_id"}:
        raise RegionalContextError("LoRA resource reference has unknown or missing fields")
    _required_uuid(reference["provider_id"], "LoRA resource provider_id")
    if reference["resource_type"] != LORA_RESOURCE_TYPE:
        raise RegionalContextError(f"LoRA resource_type must be {LORA_RESOURCE_TYPE!r}")
    if not isinstance(reference["resource_id"], str) or not reference["resource_id"].strip():
        raise RegionalContextError("LoRA resource_id must be a non-empty string")


def validate_lora_capability(payload: dict[str, Any]) -> None:
    version = payload.get("version")
    expected = {"version", "collector_id", "entries"} if version == 1 else ({"version", "entries"} if version == 2 else {"version", "entries", "scopes"})
    if version == 3 and "automatic" in payload:
        expected = expected | {"automatic"}
    if version not in {1, 2, 3} or set(payload) != expected:
        raise RegionalContextError("LoRA capability has unknown or missing fields")
    collector_id = payload.get("collector_id")
    if version == 1 and collector_id is not None:
        _required_uuid(collector_id, "LoRA collector_id")
    entries = payload["entries"]
    if not isinstance(entries, list):
        raise RegionalContextError("LoRA capability entries must be an array")
    seen: set[str] = set()
    needs_collector = False
    for index, entry in enumerate(entries):
        path = f"LoRA entries[{index}]"
        if not isinstance(entry, dict) or set(entry) != {"id", "source", "targets"}:
            raise RegionalContextError(f"{path} has unknown or missing fields")
        entry_id = _required_uuid(entry["id"], f"{path}.id")
        if entry_id in seen:
            raise RegionalContextError(f"duplicate LoRA entry id: {entry_id}")
        seen.add(entry_id)
        source = entry["source"]
        if not isinstance(source, dict):
            raise RegionalContextError(f"{path}.source must be an object")
        if source.get("kind") == "external":
            source_fields = {"kind", "resource_id"} if version == 1 else {"kind", "collector_id", "resource_id"}
            if set(source) != source_fields or not isinstance(source["resource_id"], str) or not source["resource_id"].strip():
                raise RegionalContextError(f"{path}.source is not a valid external LoRA reference")
            if version == 2:
                _required_uuid(source["collector_id"], f"{path}.source.collector_id")
            needs_collector = True
        elif source.get("kind") == "native":
            if set(source) != {"kind", "lora_name", "model_strength", "clip_strength"}:
                raise RegionalContextError(f"{path}.source is not a valid native LoRA entry")
            if not isinstance(source["lora_name"], str) or not source["lora_name"].strip():
                raise RegionalContextError(f"{path}.source.lora_name must be non-empty")
            _finite_number(source["model_strength"], f"{path}.source.model_strength")
            _finite_number(source["clip_strength"], f"{path}.source.clip_strength")
        else:
            raise RegionalContextError(f"{path}.source.kind must be native or external")
        targets = entry["targets"]
        if not isinstance(targets, list) or not targets:
            raise RegionalContextError(f"{path}.targets must be a non-empty array")
        for target_index, target in enumerate(targets):
            target_path = f"{path}.targets[{target_index}]"
            if not isinstance(target, dict) or target.get("scope") not in {"global", "region"}:
                raise RegionalContextError(f"{target_path} must target global or region scope")
            if target["scope"] == "global" and set(target) != {"scope"}:
                raise RegionalContextError(f"{target_path} global target has unknown fields")
            if target["scope"] == "region":
                if set(target) != {"scope", "document_id", "region_id"}:
                    raise RegionalContextError(f"{target_path} region target has unknown or missing fields")
                _required_uuid(target["document_id"], f"{target_path}.document_id")
                _required_uuid(target["region_id"], f"{target_path}.region_id")
    if version == 1 and needs_collector and collector_id is None:
        raise RegionalContextError("external LoRA entries require collector_id")
    if version == 3:
        if "automatic" in payload:
            validate_automatic_loras(payload["automatic"])
        scopes = payload["scopes"]
        if not isinstance(scopes, dict):
            raise RegionalContextError("LoRA capability scopes must be an object")
        for scope, stack in scopes.items():
            if not isinstance(scope, str) or not scope:
                raise RegionalContextError("LoRA capability scope names must be non-empty strings")
            parse_registry({"schema": "bv.lora_stack_registry", "version": 1, "stacks": {
                scope: {"id": scope, "name": scope, "stack": stack}
            }})


def validate_automatic_loras(value):
    if not isinstance(value, dict) or set(value) not in ({"version", "resources"}, {"version", "resources", "enabled"}) or value["version"] != 1 or not isinstance(value["resources"], list):
        raise RegionalContextError("Automatic LoRA provenance requires version 1 resources")
    if "enabled" in value and not isinstance(value["enabled"], bool):
        raise RegionalContextError("Automatic LoRA enabled must be boolean")
    seen = set()
    for item in value["resources"]:
        if not isinstance(item, dict) or set(item) != {"provider_id", "resource_id", "role", "entry_ids", "stack"}:
            raise RegionalContextError("Automatic LoRA resource has unknown or missing fields")
        provider = _required_uuid(item["provider_id"], "automatic provider_id")
        resource = _required_uuid(item["resource_id"], "automatic resource_id")
        identity = (provider, resource)
        if identity in seen or item["role"] not in {"basis", "global"}:
            raise RegionalContextError("Duplicate or invalid automatic LoRA resource")
        seen.add(identity)
        parse_registry({"schema": "bv.lora_stack_registry", "version": 1, "stacks": {
            resource: {"id": resource, "name": resource, "stack": item["stack"], "origin_provider_id": provider, "entry_ids": item["entry_ids"]}
        }})


# BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): LoRA capability v1 -> v2.
# Remove together with v1 validation/registration after old workflows have migrated.
def migrate_lora_capability_v1(payload: dict[str, Any]) -> dict[str, Any]:
    validate_lora_capability(payload)
    collector_id = payload["collector_id"]
    entries = []
    for entry in payload["entries"]:
        source = dict(entry["source"])
        if source["kind"] == "external":
            source["collector_id"] = collector_id
        entries.append({**entry, "source": source})
    migrated = {"version": 2, "entries": entries}
    validate_lora_capability(migrated)
    return migrated


# BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): LoRA capability v2 -> v3.
# Remove together with v2 validation/registration after old workflows have migrated.
def migrate_lora_capability_v2(payload: dict[str, Any]) -> dict[str, Any]:
    validate_lora_capability(payload)
    migrated = {"version": 3, "entries": payload["entries"], "scopes": {}}
    validate_lora_capability(migrated)
    return migrated


def normalize_lora_capability(payload: Any) -> dict[str, Any]:
    clean = dict(payload)
    validate_lora_capability(clean)
    if clean["version"] == 1:
        clean = migrate_lora_capability_v1(clean)
    return migrate_lora_capability_v2(clean) if clean["version"] == 2 else clean


def normalize_lora_prompt_config(payload: Any) -> dict[str, Any]:
    """Convert the shared frontend envelope into the persisted capability payload."""
    payload = without_lora_provider_selection(payload)
    if isinstance(payload, dict) and payload.get("version") == 3:
        if set(payload) != {"version", "entries", "steps"} or payload.get("steps") != []:
            raise RegionalContextError("Regional Prompt LoRA config version 3 must contain entries and no steps")
        payload = {"version": 2, "entries": payload["entries"]}
    return normalize_lora_capability(payload)


def without_lora_provider_selection(payload, providers=None):
    """Validate explicit provider dependencies; resource state stays in the provider."""
    if not isinstance(payload, dict):
        return payload
    if "apply_global" in payload and not isinstance(payload["apply_global"], bool):
        raise RegionalContextError("LoRA apply_global must be boolean")
    ids = payload.get("registry_ids", [])
    if not isinstance(ids, list) or len(ids) > 20 or any(not isinstance(value, str) for value in ids) or len(set(ids)) != len(ids):
        raise RegionalContextError("LoRA registry_ids requires up to 20 unique UUIDs")
    for identifier in ids:
        if _required_uuid(identifier, "LoRA registry_ids") != str(uuid.UUID(identifier)):
            raise RegionalContextError("LoRA registry_ids must be canonical UUIDs")
    sources = list(payload.get("entries", []))
    for step in payload.get("steps", []):
        if isinstance(step, dict):
            sources.extend(step.get("entries", []))
    dependencies = set(ids)
    dependencies.update(entry.get("source", {}).get("collector_id") for entry in sources if isinstance(entry, dict) and isinstance(entry.get("source"), dict) and entry["source"].get("kind") == "external")
    dependencies.discard(None)
    if len(dependencies) > 20:
        raise RegionalContextError("LoRA provider selection exceeds 20 providers")
    if providers is not None and any(identifier not in providers for identifier in ids):
        raise RegionalContextError("Selected LoRA Registry provider is missing; reconnect its Registry")
    return {key: value for key, value in payload.items() if key not in {"registry_ids", "apply_global"}}


def _replace_lora(_current: dict[str, Any], configured: Any) -> dict[str, Any]:
    return dict(configured)


def _merge_lora(current: dict[str, Any], configured: Any) -> dict[str, Any]:
    incoming = dict(configured)
    incoming_ids = {entry["id"] for entry in incoming["entries"]}
    return {**incoming, "entries": [entry for entry in current["entries"] if entry["id"] not in incoming_ids] + incoming["entries"]}


def _subtract_lora(current: dict[str, Any], configured: Any) -> dict[str, Any]:
    incoming = dict(configured)
    removed = {entry["id"] for entry in incoming["entries"]}
    return {**current, "entries": [entry for entry in current["entries"] if entry["id"] not in removed]}


def register_lora_contracts() -> tuple[CapabilityRegistry, ResourceRegistry]:
    capabilities = CapabilityRegistry()
    resources = ResourceRegistry()
    capabilities.register(
        "bv-nodepack", "lora",
        CapabilityRegistration(
            version=3,
            validator=validate_lora_capability,
            version_validators={1: validate_lora_capability, 2: validate_lora_capability, 3: validate_lora_capability},
            migrations={1: migrate_lora_capability_v1, 2: migrate_lora_capability_v2},
            operations={"replace": _replace_lora, "merge": _merge_lora, "subtract": _subtract_lora, "clear": lambda current, _configured: current},
            metadata={"display_name": "LoRA"},
        ),
        source=__name__,
    )
    resources.register(
        "bv-nodepack", "lora-stack",
        ResourceRegistration(validator=validate_lora_resource_reference, metadata={"display_name": "LoRA Stack"}),
        source=__name__,
    )
    return capabilities, resources


LORA_CAPABILITY_REGISTRY, LORA_RESOURCE_REGISTRY = register_lora_contracts()


def build_lora_provider(provider_id: str, stacks: Any) -> dict[str, Any]:
    clean_id = _required_uuid(provider_id, "LoRA provider_id")
    registry = parse_registry({"schema": "bv.lora_stack_registry", "version": 1, "stacks": stacks})
    return {
        "schema": "bv.runtime_resource_provider",
        "version": 1,
        "provider_id": clean_id,
        "resource_type": LORA_RESOURCE_TYPE,
        "resources": registry["stacks"],
    }


_LORA_PROVIDER_FIELDS = {"schema", "version", "provider_id", "resource_type", "resources"}


def normalize_lora_provider(provider: Any) -> dict[str, Any]:
    """Validate and copy the complete LoRA runtime-provider wire contract."""
    if not isinstance(provider, dict) or set(provider) != _LORA_PROVIDER_FIELDS:
        raise RegionalContextError("LoRA runtime resource provider has unknown or missing fields")
    provider_id = _required_uuid(provider.get("provider_id"), "LoRA provider_id")
    if provider.get("schema") != "bv.runtime_resource_provider" or provider.get("version") != 1:
        raise RegionalContextError("LoRA runtime resource provider is invalid")
    if provider.get("resource_type") != LORA_RESOURCE_TYPE:
        raise RegionalContextError("LoRA runtime resource provider has the wrong resource type")
    return build_lora_provider(provider_id, provider.get("resources"))


def _manual_chain_provider_id(stacks: dict[str, Any]) -> str:
    identity = "\x1f".join(stacks)
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"bv-nodepack:manual-lora-chain:{identity}"))


def extend_lora_provider(provider: Any, stack_id: str, name: str, lora_stack: Any) -> dict[str, Any]:
    """Immutably extend a manual chain; repeated V3 IDs replace for idempotent execution.

    The published V2 registry path deliberately keeps its stricter duplicate rejection.
    This intermediate provider ID is deterministic transport state and is never persisted.
    """
    resources = normalize_lora_provider(provider)["resources"] if provider is not None else {}
    without_replaced = {key: value for key, value in resources.items() if key != str(stack_id).strip()}
    registry = add_named_stack(
        {"schema": "bv.lora_stack_registry", "version": 1, "stacks": without_replaced},
        stack_id,
        name,
        lora_stack,
    )
    return build_lora_provider(_manual_chain_provider_id(registry["stacks"]), registry["stacks"])


def reidentify_lora_provider(provider: Any, provider_id: str) -> dict[str, Any]:
    """Create the final collector identity without changing the validated resources."""
    normalized = normalize_lora_provider(provider)
    return build_lora_provider(provider_id, normalized["resources"])


def transform_lora_capability(value: Any, payload: Any, *, registry: CapabilityRegistry, operation: str = "replace") -> RegionalContext:
    context = normalize_context(value, registry=registry)
    automatic = context.capabilities.get(LORA_CAPABILITY, {}).get("automatic")
    if operation == "clear":
        if automatic:
            return context.with_capability(LORA_CAPABILITY, {"version": 3, "entries": [], "scopes": {}, "automatic": automatic})
        return context.without_capability(LORA_CAPABILITY)
    clean = normalize_lora_capability(payload)
    clean = {"version": 3, "entries": clean["entries"], "scopes": {}}
    document_id = context.core["document_id"]
    region_ids = {region["id"] for region in context.core["regions"]}
    for entry in clean["entries"]:
        for target in entry["targets"]:
            if target["scope"] == "region" and (
                target["document_id"] != document_id or target["region_id"] not in region_ids
            ):
                raise RegionalContextError(
                    "LoRA target references a missing region "
                    f"{target['document_id']} + {target['region_id']}"
                )
    current = context.capabilities.get(LORA_CAPABILITY)
    if current is None:
        if operation not in {"replace", "merge"}:
            raise RegionalContextError(f"cannot {operation} a missing LoRA capability")
        result = clean
    else:
        registration = registry.get(LORA_CAPABILITY)
        handler = registration.operations.get(operation) if registration else None
        if handler is None:
            raise RegionalContextError(f"unsupported LoRA operation: {operation}")
        result = handler(current, clean)
        result = {"version": 3, "entries": result["entries"], "scopes": {}}
        validate_lora_capability(result)
    if automatic:
        result["automatic"] = automatic
    return context.with_capability(LORA_CAPABILITY, result)


def _same_lora_target(left: dict[str, Any], right: dict[str, Any]) -> bool:
    return left.get("scope") == right.get("scope") and (
        right.get("scope") == "global"
        or (left.get("document_id") == right.get("document_id") and left.get("region_id") == right.get("region_id"))
    )


def _without_lora_target(
    entries: list[dict[str, Any]],
    target: dict[str, Any],
    *,
    matching_sources: list[dict[str, Any]] | None = None,
    matching_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    result = []
    for entry in entries:
        matches_entry = matching_sources is None or entry["source"] in matching_sources or entry["id"] in (matching_ids or set())
        targets = [item for item in entry["targets"] if not (matches_entry and _same_lora_target(item, target))]
        if targets:
            result.append({**entry, "targets": targets})
    return result


def _transform_lora_scope(
    context: RegionalContext,
    configured: dict[str, Any],
    target: dict[str, Any],
    operation: str,
) -> RegionalContext:
    current = context.capabilities.get(LORA_CAPABILITY)
    current_entries = list(current["entries"]) if current else []
    incoming = list(configured["entries"])
    if operation == "clear":
        entries = _without_lora_target(current_entries, target)
    elif operation == "subtract":
        entries = _without_lora_target(
            current_entries,
            target,
            matching_sources=[entry["source"] for entry in incoming],
            matching_ids={entry["id"] for entry in incoming},
        )
    else:
        base = _without_lora_target(current_entries, target) if operation == "replace" else current_entries
        incoming_ids = {entry["id"] for entry in incoming}
        entries = [entry for entry in base if entry["id"] not in incoming_ids] + incoming
    automatic = current.get("automatic") if current else None
    if not entries and not automatic:
        return context.without_capability(LORA_CAPABILITY)
    payload = {"version": 3, "entries": entries, "scopes": {}}
    if automatic:
        payload["automatic"] = automatic
    validate_lora_capability(payload)
    return context.with_capability(LORA_CAPABILITY, payload)


def transform_lora_sequence(
    value: Any,
    config: Any,
    *,
    registry: CapabilityRegistry,
    fallback_operation: str = "replace",
) -> RegionalContext:
    """Apply a transformer config as one or more ordinary LoRA capability operations."""
    if not isinstance(config, dict):
        raise RegionalContextError("LoRA transformer config must be an object")
    config = without_lora_provider_selection(config)
    if config.get("version") == 1:
        return transform_lora_capability(value, config, registry=registry, operation=fallback_operation)
    version = config.get("version")
    if version not in {2, 3} or set(config) != ({"version", "collector_id", "entries", "steps"} if version == 2 else {"version", "entries", "steps"}):
        raise RegionalContextError("LoRA transformer config has unknown or missing fields")
    if config["entries"]:
        raise RegionalContextError("LoRA transformer config version 2 stores entries inside steps")
    steps = config["steps"]
    if not isinstance(steps, list):
        raise RegionalContextError("LoRA transformer steps must be an array")
    context = normalize_context(value, registry=registry)
    step_ids: set[str] = set()
    for index, step in enumerate(steps):
        path = f"LoRA transformer steps[{index}]"
        if not isinstance(step, dict) or set(step) != {"id", "operation", "target", "entries"}:
            raise RegionalContextError(f"{path} has unknown or missing fields")
        step_id = _required_uuid(step["id"], f"{path}.id")
        if step_id in step_ids:
            raise RegionalContextError(f"duplicate LoRA transformer step id: {step_id}")
        step_ids.add(step_id)
        operation = step["operation"]
        if operation not in {"replace", "merge", "subtract", "clear"}:
            raise RegionalContextError(f"{path}.operation is unsupported")
        target = step["target"]
        if not isinstance(target, dict) or target.get("scope") not in {"global", "region"}:
            raise RegionalContextError(f"{path}.target must target global or region scope")
        if target["scope"] == "global" and set(target) != {"scope"}:
            raise RegionalContextError(f"{path}.target global target has unknown fields")
        if target["scope"] == "region":
            if set(target) != {"scope", "document_id", "region_id"}:
                raise RegionalContextError(f"{path}.target region target has unknown or missing fields")
            _required_uuid(target["document_id"], f"{path}.target.document_id")
            _required_uuid(target["region_id"], f"{path}.target.region_id")
        scoped = {"version": 1, "collector_id": config["collector_id"], "entries": step["entries"]} if version == 2 else {"version": 2, "entries": step["entries"]}
        scoped = normalize_lora_capability(scoped)
        if any(len(entry["targets"]) != 1 or not _same_lora_target(entry["targets"][0], target) for entry in scoped["entries"]):
            raise RegionalContextError(f"{path}.entries must target only the step scope")
        context = _transform_lora_scope(context, scoped, target, operation)
    return context


def _provider_resources(provider: Any, expected_id: str | None) -> dict[str, Any]:
    if expected_id is None:
        if provider is not None:
            raise RegionalContextError("LoRA provider is connected but the capability has no collector_id")
        return {}
    if not isinstance(provider, dict):
        raise RegionalContextError(
            f"LoRA collector {expected_id!r} is missing; collector and consumer must be in the same graph"
        )
    if provider.get("schema") != "bv.runtime_resource_provider" or provider.get("version") != 1:
        raise RegionalContextError("LoRA runtime resource provider is invalid")
    if provider.get("resource_type") != LORA_RESOURCE_TYPE:
        raise RegionalContextError("LoRA runtime resource provider has the wrong resource type")
    if provider.get("provider_id") != expected_id:
        raise RegionalContextError(
            f"LoRA collector is missing or mismatched: expected {expected_id!r}, received {provider.get('provider_id')!r}"
        )
    resources = provider.get("resources")
    if not isinstance(resources, dict):
        raise RegionalContextError("LoRA runtime resource provider resources must be an object")
    return resources


def resolve_lora_capability(value: Any, provider: Any = None, *, registry: CapabilityRegistry) -> dict[str, list[list[Any]]]:
    context = normalize_context(value, registry=registry)
    payload = context.require_capability(LORA_CAPABILITY)
    providers = provider if isinstance(provider, dict) and provider.get("schema") != "bv.runtime_resource_provider" else ({provider.get("provider_id"): provider} if isinstance(provider, dict) else {})
    direct: dict[str, list[list[Any]]] = {"global": []}
    for entry in payload["entries"]:
        source = entry["source"]
        if source["kind"] == "native":
            stack = [[source["lora_name"], float(source["model_strength"]), float(source["clip_strength"])]]
        else:
            collector_id = source["collector_id"]
            resources = _provider_resources(providers.get(collector_id), collector_id)
            resource = resources.get(source["resource_id"])
            if not isinstance(resource, dict):
                raise RegionalContextError(
                    f"LoRA resource is unresolved: {source['resource_id']!r} in collector {collector_id!r}"
                )
            if resource.get("role") in {"basis", "global"}:
                # Automatic resources cannot be selected a second time through stale pickers.
                continue
            stack = parse_registry({"schema": "bv.lora_stack_registry", "version": 1, "stacks": {source["resource_id"]: resource}})["stacks"][source["resource_id"]]["stack"]
        for target in entry["targets"]:
            key = "global" if target["scope"] == "global" else target["region_id"]
            direct.setdefault(key, []).extend([list(item) for item in stack])
    global_entries = direct.pop("global")
    scopes: dict[str, list[list[Any]]] = {}
    if global_entries:
        scopes["global"] = [list(item) for item in global_entries]
        scopes["background"] = [list(item) for item in global_entries]
    for region in context.core["regions"]:
        combined = [list(item) for item in global_entries]
        combined.extend(direct.get(region["id"], []))
        combined = [item for item in combined if item[1] != 0.0 or item[2] != 0.0]
        if combined:
            scopes[region["id"]] = combined
    return scopes


def materialize_lora_capability(value: Any, provider: Any = None, *, registry: CapabilityRegistry, apply_global: bool | None = None) -> RegionalContext:
    context = normalize_context(value, registry=registry)
    payload = context.capabilities.get(LORA_CAPABILITY, {"version": 3, "entries": [], "scopes": {}})
    enabled = payload.get("automatic", {}).get("enabled", True) if apply_global is None else apply_global
    providers = provider if isinstance(provider, dict) and provider.get("schema") != "bv.runtime_resource_provider" else ({provider.get("provider_id"): provider} if isinstance(provider, dict) else {})
    automatic = {(item["provider_id"], item["resource_id"]): item for item in payload.get("automatic", {}).get("resources", [])}
    incoming = {}
    refreshed_origins = set()
    for raw in providers.values():
        clean = normalize_lora_provider(raw)
        refreshed_origins.add(clean["provider_id"])
        for resource_id, resource in clean["resources"].items():
            origin = resource.get("origin_provider_id", clean["provider_id"])
            refreshed_origins.add(origin)
            if resource.get("role") not in {"basis", "global"}:
                continue
            if resource.get("global_enabled", True) is False:
                continue
            # Old external providers have no entry IDs; stable per-stack ordinals retain occurrences.
            ids = resource.get("entry_ids", [str(uuid.uuid5(uuid.UUID(origin), f"{resource_id}:{index}")) for index in range(len(resource["stack"]))])
            item = {"provider_id": origin, "resource_id": resource_id, "role": resource["role"], "entry_ids": ids, "stack": [list(entry) for entry in resource["stack"]]}
            identity = (origin, resource_id)
            if identity in incoming and incoming[identity] != item:
                raise RegionalContextError("Conflicting automatic LoRA resource copies")
            incoming[identity] = item
    automatic = {identity: item for identity, item in automatic.items() if identity[0] not in refreshed_origins}
    automatic.update(incoming)
    if enabled and len({identity[0] for identity in automatic}) > 1:
        raise RegionalContextError("Multiple active Global LoRA Registries in this workflow. Turn the intended Registry Global switch off and on again, or disable the other Global switches.")
    if LORA_CAPABILITY not in context.capabilities and not automatic and enabled:
        return context
    context = context.with_capability(LORA_CAPABILITY, payload)
    scopes = resolve_lora_capability(context, provider, registry=registry)
    result = {"version": 3, "entries": payload["entries"], "scopes": scopes}
    if automatic or not enabled:
        result["automatic"] = {"version": 1, "resources": list(automatic.values()), **({"enabled": False} if not enabled else {})}
    return context.with_capability(LORA_CAPABILITY, result)


def materialized_lora_scopes(value: Any, *, registry: CapabilityRegistry) -> dict[str, list[list[Any]]]:
    context = normalize_context(value, registry=registry)
    payload = context.capabilities.get(LORA_CAPABILITY)
    if payload is None:
        return {}
    if payload.get("version") != 3:
        raise RegionalContextError("LoRA capability was not materialized by BV Regional Prompt or BV Regional LoRA")
    return {scope: [list(item) for item in stack] for scope, stack in payload["scopes"].items()}

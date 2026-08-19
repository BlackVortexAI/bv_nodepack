from __future__ import annotations

import json
import math
from pathlib import Path
from typing import Any


REGISTRY = "BV_LORA_STACK_REGISTRY"
BINDINGS = "BV_REGIONAL_LORA_BINDINGS"
BINDINGS_SCHEMA = "bv.regional.lora_bindings"


def default_bindings(document_id: str = "") -> dict[str, Any]:
    return {
        "schema": BINDINGS_SCHEMA,
        "version": 1,
        "document_id": str(document_id),
        "global_stack_id": None,
        "regions": {},
    }


def parse_bindings(value: Any, document_id: str = "") -> dict[str, Any]:
    if value in (None, ""):
        return default_bindings(document_id)
    candidate = json.loads(value) if isinstance(value, str) else dict(value)
    if candidate.get("schema") != BINDINGS_SCHEMA or candidate.get("version") != 1:
        raise ValueError("Not a valid BV regional LoRA bindings v1 value")
    stored_document_id = str(candidate.get("document_id", ""))
    if document_id and stored_document_id and stored_document_id != document_id:
        raise ValueError("LoRA bindings target a different BV Regional document")
    global_stack_id = candidate.get("global_stack_id")
    if global_stack_id is not None and not isinstance(global_stack_id, str):
        raise ValueError("global_stack_id must be a string or null")
    regions = candidate.get("regions", {})
    if not isinstance(regions, dict) or any(
        not isinstance(region_id, str) or (stack_id is not None and not isinstance(stack_id, str))
        for region_id, stack_id in regions.items()
    ):
        raise ValueError("regions must map region IDs to stack IDs or null")
    return {
        "schema": BINDINGS_SCHEMA,
        "version": 1,
        "document_id": document_id or stored_document_id,
        "global_stack_id": global_stack_id or None,
        "regions": {key: stack_id for key, stack_id in regions.items() if stack_id},
    }


def reconcile_bindings(value: Any, document: dict[str, Any]) -> dict[str, Any]:
    parsed = parse_bindings(value, str(document.get("document_id", "")))
    region_ids = {
        str(region.get("id", ""))
        for region in document.get("regions", [])
        if isinstance(region, dict) and str(region.get("id", ""))
    }
    parsed["regions"] = {
        region_id: stack_id
        for region_id, stack_id in parsed["regions"].items()
        if region_id in region_ids
    }
    return parsed


def _normalize_stack(entries: Any, label: str) -> list[tuple[str, float, float]]:
    normalized = []
    for index, entry in enumerate([] if entries is None else list(entries)):
        if not isinstance(entry, (tuple, list)) or len(entry) != 3:
            raise ValueError(f"{label} entry {index + 1} must contain path, model strength and CLIP strength")
        path, model_strength, clip_strength = entry
        if not isinstance(path, (str, Path)) or not str(path).strip():
            raise ValueError(f"{label} entry {index + 1} has no path")
        model_value, clip_value = float(model_strength), float(clip_strength)
        if not math.isfinite(model_value) or not math.isfinite(clip_value):
            raise ValueError(f"{label} entry {index + 1} strengths must be finite")
        normalized.append((str(path), model_value, clip_value))
    return normalized


def parse_registry(value: Any) -> dict[str, Any]:
    candidate = json.loads(value) if isinstance(value, str) else dict(value)
    if candidate.get("schema") != "bv.lora_stack_registry" or candidate.get("version") != 1:
        raise ValueError("Not a valid BV LoRA stack registry v1 value")
    source_stacks = candidate.get("stacks", {})
    if not isinstance(source_stacks, dict):
        raise ValueError("LoRA stack registry stacks must be an object keyed by stable stack ID")
    stacks: dict[str, Any] = {}
    names: set[str] = set()
    for key, item in source_stacks.items():
        if not isinstance(key, str) or not key.strip() or not isinstance(item, dict):
            raise ValueError("Every LoRA stack registry entry requires a stable string ID and object value")
        identifier = str(item.get("id", "")).strip()
        name = str(item.get("name", "")).strip()
        if identifier != key:
            raise ValueError(f"LoRA stack registry key and id differ: {key}")
        if not name:
            raise ValueError(f"LoRA stack registry entry has no name: {key}")
        folded = name.casefold()
        if folded in names:
            raise ValueError(f"Duplicate LoRA stack name: {name}")
        names.add(folded)
        stacks[key] = {"id": identifier, "name": name, "stack": _normalize_stack(item.get("stack"), f"LoRA stack {name}")}
    return {"schema": "bv.lora_stack_registry", "version": 1, "stacks": stacks}


def add_named_stack(registry: Any, stack_id: str, name: str, lora_stack: Any) -> dict[str, Any]:
    identifier = str(stack_id).strip()
    display_name = str(name).strip()
    if not identifier:
        raise ValueError("stack_id is required")
    if not display_name:
        raise ValueError("name is required")
    normalized = _normalize_stack(lora_stack, "LoRA stack")
    source = parse_registry(registry) if registry else {"schema": "bv.lora_stack_registry", "version": 1, "stacks": {}}
    stacks = {key: dict(value) for key, value in source.get("stacks", {}).items()}
    if identifier in stacks:
        raise ValueError(f"Duplicate LoRA stack ID: {identifier}")
    if any(item.get("name", "").casefold() == display_name.casefold() for item in stacks.values()):
        raise ValueError(f"Duplicate LoRA stack name: {display_name}")
    stacks[identifier] = {"id": identifier, "name": display_name, "stack": normalized}
    return {"schema": "bv.lora_stack_registry", "version": 1, "stacks": stacks}


def resolve_scope_stacks(registry: Any, bindings: Any, document: dict[str, Any]) -> dict[str, Any]:
    parsed = reconcile_bindings(bindings, document)
    region_ids = {region["id"] for region in document["regions"]}
    active_assignments = [
        parsed["global_stack_id"],
        *(parsed["regions"].get(region_id) for region_id in region_ids),
    ]
    if not registry:
        if any(active_assignments):
            raise ValueError("LoRA stack registry is not connected but the document has active assignments")
        return {}
    stacks = parse_registry(registry)["stacks"]
    requested = {stack_id for stack_id in active_assignments if stack_id}
    missing = requested.difference(stacks)
    if missing:
        raise ValueError(f"Assigned LoRA stack is missing: {', '.join(sorted(missing))}")
    result: dict[str, Any] = {}
    global_id = parsed["global_stack_id"]
    global_entries = stacks[global_id]["stack"] if global_id else []
    if global_entries:
        result["global"] = global_entries
        result["background"] = global_entries
    for region in document["regions"]:
        region_id = region["id"]
        local_id = parsed["regions"].get(region_id)
        combined = []
        combined.extend(global_entries)
        if local_id:
            combined.extend(stacks[local_id]["stack"])
        if combined:
            result[region_id] = combined
    return result


def create_hook_groups(scope_stacks: dict[str, Any]) -> dict[str, Any]:
    if not scope_stacks:
        return {}
    import comfy.hooks
    import comfy.utils
    import folder_paths

    loaded: dict[str, Any] = {}
    hook_cache: dict[tuple[str, float, float], Any] = {}
    groups: dict[str, Any] = {}
    for scope, entries in scope_stacks.items():
        hooks = []
        for path, model_strength, clip_strength in entries:
            resolved = Path(path)
            if not resolved.is_file():
                found = folder_paths.get_full_path("loras", path)
                if not found:
                    raise ValueError(f"LoRA file not found: {path}")
                resolved = Path(found)
            key = str(resolved.resolve())
            hook_key = (key, model_strength, clip_strength)
            hook_group = hook_cache.get(hook_key)
            if hook_group is None:
                lora = loaded.get(key)
                if lora is None:
                    lora = comfy.utils.load_torch_file(str(resolved), safe_load=True)
                    loaded[key] = lora
                hook_group = comfy.hooks.create_hook_lora(lora, model_strength, clip_strength)
                hook_cache[hook_key] = hook_group
            hooks.append(hook_group)
        groups[scope] = comfy.hooks.HookGroup.combine_all_hooks(hooks)
    return groups

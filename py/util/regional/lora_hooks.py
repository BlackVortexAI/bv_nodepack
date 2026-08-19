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
    global_entries = [entry for entry in global_entries if entry[1] != 0.0 or entry[2] != 0.0]
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
        combined = [entry for entry in combined if entry[1] != 0.0 or entry[2] != 0.0]
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


def _model_stack_fingerprint(entries: Any) -> tuple[tuple[str, float], ...]:
    return tuple(
        (str(path), float(model_strength))
        for path, model_strength, _clip_strength in (entries or [])
        if float(model_strength) != 0.0
    )


def _clip_stack_fingerprint(entries: Any) -> tuple[tuple[str, float], ...]:
    return tuple(
        (str(path), float(clip_strength))
        for path, _model_strength, clip_strength in (entries or [])
        if float(clip_strength) != 0.0
    )


def _conditionings_with_pass(conditioning: list, hooks: Any, mask: Any = None) -> list:
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        if hooks is None:
            values.pop("hooks", None)
        else:
            values["hooks"] = hooks
        if mask is None:
            values.pop("mask", None)
            values.pop("mask_strength", None)
            values.pop("set_area_to_bounds", None)
        else:
            values.update({"mask": mask, "mask_strength": 1.0, "set_area_to_bounds": False})
        result.append([embedding, values])
    return result


def apply_attention_hook_passes(
    positive: list,
    negative: list,
    document: dict[str, Any],
    scope_stacks: dict[str, Any],
    hook_groups: dict[str, Any],
) -> tuple[list, list]:
    """Split full attention conditioning into masked LoRA model passes."""
    if not scope_stacks:
        return positive, negative

    import torch

    from .mask_renderer import render_selection

    width, height = document["canvas"]["width"], document["canvas"]["height"]
    baseline_key = _model_stack_fingerprint(scope_stacks.get("global"))
    grouped_masks: dict[tuple[tuple[str, float], ...], Any] = {}
    representative_scope: dict[tuple[tuple[str, float], ...], str] = {}

    for region in document["regions"]:
        if not region["enabled"]:
            continue
        scope = region["id"]
        key = _model_stack_fingerprint(scope_stacks.get(scope))
        if key == baseline_key:
            continue
        selection = {"document": document, "scope": "region", "region_id": scope}
        mask = render_selection(selection, width, height).detach().float().clamp(0.0, 1.0)
        grouped_masks[key] = torch.maximum(grouped_masks[key], mask) if key in grouped_masks else mask
        representative_scope.setdefault(key, scope)

    if not grouped_masks:
        hooks = hook_groups.get("global")
        return _conditionings_with_pass(positive, hooks), _conditionings_with_pass(negative, hooks)

    override_union = torch.zeros((1, height, width), dtype=torch.float32)
    for mask in grouped_masks.values():
        override_union = torch.maximum(override_union, mask)
    baseline_mask = 1.0 - override_union

    positive_passes: list = []
    negative_passes: list = []
    if bool(torch.any(baseline_mask > 0)):
        baseline_hooks = hook_groups.get("global")
        positive_passes.extend(_conditionings_with_pass(positive, baseline_hooks, baseline_mask))
        negative_passes.extend(_conditionings_with_pass(negative, baseline_hooks, baseline_mask))
    for key, mask in grouped_masks.items():
        hooks = hook_groups.get(representative_scope[key])
        positive_passes.extend(_conditionings_with_pass(positive, hooks, mask))
        negative_passes.extend(_conditionings_with_pass(negative, hooks, mask))
    return positive_passes, negative_passes

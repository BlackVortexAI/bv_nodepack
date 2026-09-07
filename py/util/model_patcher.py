"""Model preparation independent of regional conditioning; currently basis LoRAs."""
import json
from uuid import UUID

from .regional.lora_v3 import normalize_lora_provider
from .regional.lora_hooks import apply_static_lora_stack, resolve_stack_paths

MARKER = "bv_basis_lora_stacks"


def parse_patcher_config(value):
    config = json.loads(value) if isinstance(value, str) else value
    if not isinstance(config, dict) or set(config) != {"version", "collector_ids"} or config["version"] != 1:
        raise ValueError("Model Patcher config requires version 1 and collector_ids")
    ids = config["collector_ids"]
    if not isinstance(ids, list) or len(ids) > 20 or any(not isinstance(item, str) for item in ids):
        raise ValueError("Model Patcher accepts up to 20 unique Registry IDs")
    if any(str(UUID(item)) != item for item in ids) or len(set(ids)) != len(ids):
        raise ValueError("Model Patcher Registry IDs must be unique canonical UUIDs")
    return {"version": 1, "collector_ids": list(ids)}


def apply_basis_patches(model, clip, config, providers):
    ids = parse_patcher_config(config)["collector_ids"]
    inventory = {}
    for raw in providers.values():
        if raw is None:
            continue
        provider = normalize_lora_provider(raw)
        identifier = provider["provider_id"]
        if identifier in inventory:
            raise ValueError("Model Patcher received a duplicate Registry provider")
        inventory[identifier] = provider
    if set(inventory) != set(ids):
        raise ValueError("Model Patcher Registry selection and connected providers differ; reconnect the selected Registry")
    entries, model_ids, clip_ids = [], set(), set()
    for identifier in ids:
        for resource_id, resource in inventory[identifier]["resources"].items():
            if resource.get("role") != "basis":
                continue
            key = f"{identifier}:{resource_id}"
            for path, ms, cs in resource["stack"]:
                if ms == 0 and (clip is None or cs == 0):
                    continue
                entries.append((path, ms, cs if clip is not None else 0.))
                if ms != 0: model_ids.add(key)
                if clip is not None and cs != 0: clip_ids.add(key)
    if not entries:
        return model, clip
    previous_model = set(model.get_attachment(MARKER) or ())
    previous_clip = set(clip.patcher.get_attachment(MARKER) or ()) if clip is not None else set()
    if previous_model & model_ids or previous_clip & clip_ids:
        raise ValueError("Basis LoRA stack already applied to this MODEL or CLIP; use the original input or remove the duplicate Patcher")
    resolved = resolve_stack_paths({"basis": entries})["basis"]
    result_model, result_clip = apply_static_lora_stack(model, clip, resolved)
    result_model.set_attachments(MARKER, tuple(sorted(previous_model | model_ids)))
    if result_clip is not None:
        result_clip.patcher.set_attachments(MARKER, tuple(sorted(previous_clip | clip_ids)))
    return result_model, result_clip

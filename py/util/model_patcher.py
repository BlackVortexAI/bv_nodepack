"""Shared occurrence-aware automatic LoRA preparation for all model consumers."""
from .regional.lora_hooks import apply_static_lora_stack, resolve_stack_paths

OCCURRENCE_MARKER = "bv_automatic_lora_occurrences_v1"


def apply_automatic_resources(model, clip, resources):
    """Apply each registry occurrence exactly once independently to MODEL and CLIP.

    A resource may travel through multiple Collectors without changing its origin.
    Equal filenames and strengths in distinct entries remain intentional repetitions.
    """
    from .regional.lora_v3 import validate_automatic_loras
    validate_automatic_loras({"version": 1, "resources": resources})
    if len({item["provider_id"] for item in resources}) > 1:
        raise ValueError("Multiple active Global LoRA Registries; turn the intended Registry Global switch off and on again, or disable the other Global switches")
    model_ledger = dict(model.get_attachment(OCCURRENCE_MARKER) or {}) if model is not None else {}
    clip_ledger = dict(clip.patcher.get_attachment(OCCURRENCE_MARKER) or {}) if clip is not None else {}
    entries = []
    for resource in resources:
        for entry_id, (path, ms, cs) in zip(resource["entry_ids"], resource["stack"]):
            identity = f'{resource["provider_id"]}:{resource["resource_id"]}:{entry_id}'
            strengths = []
            for target, ledger, strength in ((model, model_ledger, ms), (clip, clip_ledger, cs)):
                signature = (str(path), float(strength))
                old = ledger.get(identity)
                if old is not None and tuple(old) != signature:
                    raise ValueError("Automatic LoRA occurrence changed on an already patched input; use the original MODEL/CLIP")
                effective = float(strength) if target is not None and old is None else 0.
                strengths.append(effective)
                if target is not None and strength != 0:
                    ledger[identity] = signature
            if strengths[0] or strengths[1]:
                entries.append((path, *strengths))
    if not entries:
        return model, clip
    if model is None and any(item[1] for resource in resources for item in resource["stack"]):
        raise ValueError("Automatic Global LoRAs require the Native Conditioning MODEL input and patched MODEL output")
    resolved = resolve_stack_paths({"automatic": entries})["automatic"]
    result_model, result_clip = apply_static_lora_stack(model, clip, resolved)
    if result_model is not None:
        result_model.set_attachments(OCCURRENCE_MARKER, model_ledger)
    if result_clip is not None:
        result_clip.patcher.set_attachments(OCCURRENCE_MARKER, clip_ledger)
    return result_model, result_clip


def apply_global_patches(model, clip, regional):
    from .regional.lora_v3 import LORA_CAPABILITY, LORA_CAPABILITY_REGISTRY
    from .regional.context import normalize_context
    context = normalize_context(regional, registry=LORA_CAPABILITY_REGISTRY)
    automatic = context.capabilities.get(LORA_CAPABILITY, {}).get("automatic", {})
    if automatic.get("enabled", True) is False:
        for target in (model, clip.patcher if clip is not None else None):
            if target is not None and target.get_attachment(OCCURRENCE_MARKER):
                raise ValueError("Global LoRAs are disabled for this editor, but its MODEL/CLIP is already globally patched. Use the original MODEL/CLIP input.")
        return model, clip
    resources = automatic.get("resources", [])
    if len({item["provider_id"] for item in resources}) > 1:
        raise ValueError("Multiple active Global LoRA Registries; turn the intended Registry Global switch off and on again, or disable the other Global switches")
    if model is None and any(item[1] != 0 for resource in resources for item in resource["stack"]):
        raise ValueError("Automatic Global LoRAs require the Native Conditioning MODEL input and patched MODEL output")
    return apply_automatic_resources(model, clip, resources) if resources else (model, clip)

"""Full-image Identity Edit passes composed with native ComfyUI spatial masks."""
import torch
from collections import Counter

from .document import region_used_for
from .mask_renderer import render_selection
from .krea2_identity_edit import edit_prompts, grounded_encode

MAX_EDIT_PASSES = 64


def merge_edit_stacks(current, overlay, baseline):
    """Add overlay-local occurrences; preserve order and explicit duplicates.

    Common inherited entries are removed occurrence-by-occurrence. Identical
    assignments across scopes use the maximum occurrence count, not their sum.
    """
    current = [tuple(item) for item in current]
    inherited = Counter(tuple(item) for item in baseline)
    local = []
    for item in map(tuple, overlay):
        if inherited[item]:
            inherited[item] -= 1
        else:
            local.append(item)
    existing = Counter(current)
    required = Counter(tuple(item) for item in baseline)
    result = list(current)
    for item in local:
        required[item] += 1
        if required[item] > existing[item]:
            result.append(item)
            existing[item] += 1
    return result


def compose_edit_overlays(passes, overlays, stacks):
    baseline = stacks.get("global", [])
    composed = [(scope, text, mask, stacks.get(scope, baseline)) for scope, text, mask in passes]
    for overlay_scope, alpha in overlays:
        combined = {}
        def add(scope, text, mask, entries):
            if not torch.any(mask > 0):
                return
            key = (text, tuple(map(tuple, entries)))
            if key in combined:
                previous = combined[key]
                combined[key] = (previous[0], text, previous[2] + mask, entries)
            else:
                combined[key] = (scope, text, mask, entries)
        for scope, text, mask, entries in composed:
            add(scope, text, mask * (1. - alpha), entries)
            add(scope, text, mask * alpha, merge_edit_stacks(entries, stacks[overlay_scope], baseline))
        composed = list(combined.values())
        if len(composed) > MAX_EDIT_PASSES:
            raise ValueError("Identity Edit LoRA overlaps exceed 64 prompt/stack combinations; reduce overlapping LoRA regions")
    return composed


def compile_edit_regions(document, clip, image, *, scope_encoder=None, lora_scopes=None):
    encode = scope_encoder or (lambda scope, text: grounded_encode(clip, *text, image))
    stacks = lora_scopes or {}
    baseline_stack = stacks.get("global", [])
    global_text = edit_prompts(document)
    width, height = document["canvas"]["width"], document["canvas"]["height"]
    regions = []
    overlays = []
    occupied = torch.zeros((1, 1, height, width), dtype=torch.float32)
    for region in document["regions"]:
        if not region_used_for(region, "generation") or region["strength"] <= 0:
            continue
        text = edit_prompts(document, "region", region["id"])
        if not any(part.strip() for part in text) and stacks.get(region["id"], baseline_stack) == baseline_stack:
            continue
        mask = render_selection({"document": document, "scope": "region", "region_id": region["id"]}, width, height).detach().float().cpu()
        mask = mask.reshape(1, 1, height, width).clamp(0., 1.) * float(region["strength"])
        if not torch.any(mask > 0):
            continue
        if not any(part.strip() for part in text):
            overlays.append((region["id"], mask.clamp(max=1.)))
            continue
        occupied = torch.maximum(occupied, mask.clamp(max=1.))
        combined = tuple("\n".join(part for part in pair if part.strip()) for pair in zip(global_text, text))
        regions.append((region["id"], combined, mask))
    # Preserve the established global-only conditioning exactly.
    if not regions and not overlays:
        return encode("global", global_text)
    baseline = 1. - occupied
    passes = ([("global", global_text, baseline)] if torch.any(baseline > 0) else []) + regions
    if overlays:
        composed = compose_edit_overlays(passes, overlays, stacks)
    else:
        composed = [(scope, text, mask, None) for scope, text, mask in passes]
    positive, negative = [], []
    for scope, text, mask, entries in composed:
        pos, neg = encode(scope, text, entries=entries) if overlays and scope_encoder else encode(scope, text)
        for source, target in ((pos, positive), (neg, negative)):
            for embedding, metadata in source:
                values = dict(metadata)
                values.pop("area", None)
                values.update(mask=mask, mask_strength=1., set_area_to_bounds=False)
                target.append([embedding, values])
    return positive, negative

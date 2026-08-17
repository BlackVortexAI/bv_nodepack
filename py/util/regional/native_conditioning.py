from __future__ import annotations

import math
from typing import Any

import torch

from .document import parse_document, selection_prompts
from .mask_renderer import render_selection


def _encode(clip: Any, text: str) -> list:
    if clip is None:
        raise ValueError("clip is required")
    return clip.encode_from_tokens_scheduled(clip.tokenize(text))


def _with_mask(conditioning: list, mask: torch.Tensor, strength: float) -> list:
    if len(mask.shape) < 3:
        mask = mask.unsqueeze(0)
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        values.update({"mask": mask, "set_area_to_bounds": False, "mask_strength": float(strength)})
        result.append([embedding, values])
    return result


def _zero_out(conditioning: list) -> list:
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        for key in ("pooled_output", "conditioning_lyrics", "conditioning_scale"):
            if values.get(key) is not None:
                values[key] = torch.zeros_like(values[key])
        result.append([torch.zeros_like(embedding), values])
    return result


def _selection(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return {"document": document, "scope": scope, "region_id": region_id}


def _compile_prompt_branch(
    document: dict[str, Any], clip: Any, polarity: str, region_strength_multiplier: float
) -> list:
    width, height = document["canvas"]["width"], document["canvas"]["height"]
    global_selection = _selection(document, "global")
    global_prompt = selection_prompts(global_selection)[0 if polarity == "positive" else 1]
    result = []
    if global_prompt["source"].strip():
        result.extend(_encode(clip, global_prompt["text"]))

    background_selection = _selection(document, "background")
    background_prompt = selection_prompts(background_selection)[0 if polarity == "positive" else 1]
    if background_prompt["source"].strip():
        mask = render_selection(background_selection, width, height)
        result.extend(_with_mask(_encode(clip, background_prompt["text"]), mask, 1.0))

    for region in document["regions"]:
        if not region["enabled"]:
            continue
        region_selection = _selection(document, "region", region["id"])
        prompt = selection_prompts(region_selection)[0 if polarity == "positive" else 1]
        if not prompt["source"].strip():
            continue
        mask = render_selection(region_selection, width, height)
        strength = region["strength"] * region_strength_multiplier
        result.extend(_with_mask(_encode(clip, prompt["text"]), mask, strength))
    return result or list(_encode(clip, ""))


def _has_negative_sources(document: dict[str, Any]) -> bool:
    if document["prompts"]["global"]["negative_source"].strip() or document["prompts"]["background"]["negative_source"].strip():
        return True
    return any(region["enabled"] and region["prompts"]["negative_source"].strip() for region in document["regions"])


def compile_native_conditioning(
    document: Any, clip: Any, region_strength_multiplier: float = 1.0
) -> tuple[list, list]:
    multiplier = float(region_strength_multiplier)
    if not math.isfinite(multiplier) or multiplier < 0:
        raise ValueError("region_strength_multiplier must be a finite value greater than or equal to zero")
    clean = parse_document(document)
    positive = _compile_prompt_branch(clean, clip, "positive", multiplier)
    mode = clean["negative_mode"]
    if mode == "zero_out" or (mode == "auto" and not _has_negative_sources(clean)):
        negative = _zero_out(positive)
    else:
        negative = _compile_prompt_branch(clean, clip, "negative", multiplier)
    return positive, negative

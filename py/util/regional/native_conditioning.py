from __future__ import annotations

import math
from typing import Any

import torch

from .clip_hooks import clip_with_hooks
from .document import parse_document, selection_prompts
from .mask_renderer import render_selection


def _is_anima_clip(clip: Any) -> bool:
    cond_stage_model = getattr(clip, "cond_stage_model", None)
    model_type = type(cond_stage_model)
    return (
        model_type.__module__ == "comfy.text_encoders.anima"
        or model_type.__name__ == "AnimaTEModel"
    )


def _encode(clip: Any, text: str, hooks: Any = None) -> list:
    if clip is None:
        raise ValueError("clip is required")
    encoder = clip_with_hooks(clip, hooks)
    conditioning = encoder.encode_from_tokens_scheduled(encoder.tokenize(text))
    if hooks is None or getattr(encoder, "apply_hooks_to_conds", None) is hooks:
        return conditioning
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        values["hooks"] = hooks
        result.append([embedding, values])
    return result


def _with_mask(conditioning: list, mask: torch.Tensor, strength: float, *, bounds: bool = False) -> list:
    if len(mask.shape) < 3:
        mask = mask.unsqueeze(0)
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        values.update({"mask": mask, "set_area_to_bounds": bool(bounds), "mask_strength": float(strength)})
        result.append([embedding, values])
    return result


def _with_strength(conditioning: list, strength: float) -> list:
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        values["strength"] = float(strength)
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
    document: dict[str, Any], clip: Any, polarity: str, region_strength_multiplier: float,
    hooks_by_scope: dict[str, Any], *, mask_bounds: bool = False, branch_weight: float = 1.0,
) -> list:
    width, height = document["canvas"]["width"], document["canvas"]["height"]
    global_selection = _selection(document, "global")
    global_prompt = selection_prompts(global_selection)[0 if polarity == "positive" else 1]
    result = []
    if global_prompt["source"].strip():
        global_conditioning = _encode(clip, global_prompt["text"], hooks_by_scope.get("global"))
        result.extend(global_conditioning if branch_weight == 1.0 else _with_strength(global_conditioning, branch_weight))

    background_selection = _selection(document, "background")
    background_prompt = selection_prompts(background_selection)[0 if polarity == "positive" else 1]
    if background_prompt["source"].strip():
        mask = render_selection(background_selection, width, height)
        result.extend(_with_mask(_encode(clip, background_prompt["text"], hooks_by_scope.get("background")), mask, branch_weight, bounds=mask_bounds))

    for region in document["regions"]:
        if not region["enabled"]:
            continue
        region_selection = _selection(document, "region", region["id"])
        prompt = selection_prompts(region_selection)[0 if polarity == "positive" else 1]
        if not prompt["source"].strip():
            continue
        mask = render_selection(region_selection, width, height)
        strength = region["strength"] * region_strength_multiplier
        result.extend(_with_mask(_encode(clip, prompt["text"], hooks_by_scope.get(region["id"])), mask, strength * branch_weight, bounds=mask_bounds))
    return result or list(_encode(clip, "", hooks_by_scope.get("global")))


def _combined_scope_text(*prompts: dict[str, Any]) -> str:
    return ", ".join(prompt["text"] for prompt in prompts if prompt["source"].strip())


def _compile_exclusive_branch(
    document: dict[str, Any], clip: Any, polarity: str, region_strength_multiplier: float,
    hooks_by_scope: dict[str, Any], *, branch_weight: float = 1.0,
) -> list:
    width, height = document["canvas"]["width"], document["canvas"]["height"]
    prompt_index = 0 if polarity == "positive" else 1
    global_prompt = selection_prompts(_selection(document, "global"))[prompt_index]
    background_prompt = selection_prompts(_selection(document, "background"))[prompt_index]
    background_mask = render_selection(_selection(document, "background"), width, height)
    result = _with_mask(
        _encode(clip, _combined_scope_text(global_prompt, background_prompt), hooks_by_scope.get("background")),
        background_mask,
        branch_weight,
    )
    for region in document["regions"]:
        if not region["enabled"]:
            continue
        region_selection = _selection(document, "region", region["id"])
        region_prompt = selection_prompts(region_selection)[prompt_index]
        mask = render_selection(region_selection, width, height)
        strength = region["strength"] * region_strength_multiplier
        result.extend(_with_mask(
            _encode(clip, _combined_scope_text(global_prompt, region_prompt), hooks_by_scope.get(region["id"])),
            mask,
            strength * branch_weight,
        ))
    return result


def _compile_hybrid_branch(
    document: dict[str, Any], clip: Any, polarity: str, region_strength_multiplier: float,
    hooks_by_scope: dict[str, Any], *, blend_ratio: float,
) -> list:
    if blend_ratio <= 0.0:
        return _compile_exclusive_branch(document, clip, polarity, region_strength_multiplier, hooks_by_scope)
    if blend_ratio >= 1.0:
        return _compile_prompt_branch(document, clip, polarity, region_strength_multiplier, hooks_by_scope)
    return _compile_prompt_branch(
        document, clip, polarity, region_strength_multiplier, hooks_by_scope,
        branch_weight=blend_ratio,
    ) + _compile_exclusive_branch(
        document, clip, polarity, region_strength_multiplier, hooks_by_scope,
        branch_weight=1.0 - blend_ratio,
    )


def _has_negative_sources(document: dict[str, Any]) -> bool:
    if document["prompts"]["global"]["negative_source"].strip() or document["prompts"]["background"]["negative_source"].strip():
        return True
    return any(region["enabled"] and region["prompts"]["negative_source"].strip() for region in document["regions"])


def compile_native_conditioning(
    document: Any, clip: Any, region_strength_multiplier: float = 1.0,
    hooks_by_scope: dict[str, Any] | None = None,
    composition_mode: str = "blend",
    hybrid_blend_ratio: float = 0.35,
) -> tuple[list, list]:
    multiplier = float(region_strength_multiplier)
    if not math.isfinite(multiplier) or multiplier < 0:
        raise ValueError("region_strength_multiplier must be a finite value greater than or equal to zero")
    if composition_mode not in {"blend", "exclusive", "hybrid", "mask_bounds"}:
        raise ValueError("composition_mode must be blend, exclusive, hybrid or mask_bounds")
    blend_ratio = float(hybrid_blend_ratio)
    if not math.isfinite(blend_ratio) or not 0.0 <= blend_ratio <= 1.0:
        raise ValueError("hybrid_blend_ratio must be a finite value between zero and one")
    if composition_mode == "mask_bounds" and _is_anima_clip(clip):
        raise ValueError(
            "mask_bounds is not supported with Anima. Anima uses a 5D latent, but "
            "this ComfyUI version can calculate conditioning mask bounds only for "
            "2D image latents. Use blend or exclusive instead."
        )
    clean = parse_document(document)
    scoped_hooks = hooks_by_scope or {}
    if composition_mode == "exclusive":
        compile_branch, branch_options = _compile_exclusive_branch, {}
    elif composition_mode == "hybrid":
        compile_branch, branch_options = _compile_hybrid_branch, {"blend_ratio": blend_ratio}
    else:
        compile_branch, branch_options = _compile_prompt_branch, {"mask_bounds": composition_mode == "mask_bounds"}
    positive = compile_branch(clean, clip, "positive", multiplier, scoped_hooks, **branch_options)
    mode = clean["negative_mode"]
    if mode == "zero_out" or (mode == "auto" and not _has_negative_sources(clean)):
        negative = _zero_out(positive)
    else:
        negative = compile_branch(clean, clip, "negative", multiplier, scoped_hooks, **branch_options)
    return positive, negative

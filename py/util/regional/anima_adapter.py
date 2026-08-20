from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional

import torch

from .clip_hooks import clip_with_hooks
from .document import parse_document, region_used_for, selection_prompts
from .mask_renderer import render_selection


ANIMA_REGIONS = "ANIMA_CONDITIONING_REGIONS"


@dataclass(frozen=True)
class AnimaRegionChain:
    """Structural adapter accepted by Comfyui-Anima-Regional-Conditioning."""

    previous: Optional["AnimaRegionChain"]
    mask: torch.Tensor
    conditioning: list
    weight: float
    scope: str | None = None

    def flatten(self) -> list["AnimaRegionChain"]:
        regions = []
        current: Optional[AnimaRegionChain] = self
        while current is not None:
            regions.append(current)
            current = current.previous
        regions.reverse()
        return regions


def _encode(clip: Any, text: str, hooks: Any = None) -> list:
    if clip is None:
        raise ValueError("clip is required")
    encoder = clip_with_hooks(clip, hooks)
    conditioning = encoder.encode_from_tokens_scheduled(encoder.tokenize(text))
    result = []
    for embedding, metadata in conditioning:
        values = metadata.copy()
        values.pop("hooks", None)
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


def _prompt_text(document: dict[str, Any], scope: str, polarity: str) -> tuple[str, str]:
    prompt = selection_prompts(_selection(document, scope))[0 if polarity == "positive" else 1]
    return prompt["source"], prompt["text"]


def compile_anima_adapter(
    document: Any,
    clip: Any,
    hooks_by_scope: dict[str, Any] | None = None,
) -> tuple[list, list, AnimaRegionChain, list]:
    """Compile BV_REGIONAL into the Sen-sou Anima patcher's public node contract."""

    clean = parse_document(document)
    scoped_hooks = hooks_by_scope or {}
    width, height = clean["canvas"]["width"], clean["canvas"]["height"]

    global_positive_source, global_positive_text = _prompt_text(clean, "global", "positive")
    background_positive_source, background_positive_text = _prompt_text(clean, "background", "positive")

    base_text = global_positive_text if global_positive_source.strip() else background_positive_text
    positive = _encode(clip, base_text, scoped_hooks.get("global"))
    background = _encode(
        clip,
        background_positive_text if background_positive_source.strip() else base_text,
        scoped_hooks.get("background"),
    )

    chain: AnimaRegionChain | None = None
    for region in clean["regions"]:
        if not region_used_for(region, "generation"):
            continue
        selection = _selection(clean, "region", region["id"])
        prompt = selection_prompts(selection)[0]
        if not prompt["source"].strip():
            continue
        mask = render_selection(selection, width, height)
        if not bool(torch.any(mask > 0)):
            continue
        chain = AnimaRegionChain(
            previous=chain,
            mask=mask.detach().float().clamp(0.0, 1.0).cpu().contiguous(),
            conditioning=_encode(clip, prompt["text"], scoped_hooks.get(region["id"])),
            weight=float(region["strength"]),
            scope=region["id"],
        )

    if chain is None:
        raise ValueError("Anima regional conditioning requires at least one enabled region with a prompt and a non-empty mask")

    global_negative_source, global_negative_text = _prompt_text(clean, "global", "negative")
    mode = clean["negative_mode"]
    if mode == "zero_out" or (mode == "auto" and not global_negative_source.strip()):
        negative = _zero_out(positive)
    else:
        negative = _encode(clip, global_negative_text, scoped_hooks.get("global"))

    return positive, negative, chain, background

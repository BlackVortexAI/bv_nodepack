from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

import torch
import torch.nn.functional as F

from .document import parse_document, region_used_for, selection_prompts
from .mask_renderer import render_selection


BACKEND_ID = "sdxl_unet_attention"


@dataclass(frozen=True)
class SDXLRegionalSlot:
    name: str
    mask: torch.Tensor | None
    strength: float
    positive: torch.Tensor
    negative: torch.Tensor


def _selection(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return {"document": document, "scope": scope, "region_id": region_id}


def _encode_one(clip: Any, text: str, label: str) -> tuple[torch.Tensor, dict[str, Any]]:
    if clip is None:
        raise ValueError("clip is required")
    conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(text))
    if len(conditioning) != 1:
        raise ValueError(
            f"SDXL attention routing currently requires one conditioning segment for {label}; "
            "scheduled prompt segments are not supported yet"
        )
    embedding, metadata = conditioning[0]
    if not torch.is_tensor(embedding) or embedding.ndim != 3:
        raise ValueError(f"{label} must encode to a [batch,tokens,channels] tensor")
    return embedding, metadata.copy()


def _prompt(document: dict[str, Any], scope: str, polarity: str, region_id: str | None = None) -> dict[str, Any]:
    prompts = selection_prompts(_selection(document, scope, region_id))
    return prompts[0 if polarity == "positive" else 1]


def _has_negative_sources(document: dict[str, Any]) -> bool:
    if document["prompts"]["global"]["negative_source"].strip():
        return True
    if document["prompts"]["background"]["negative_source"].strip():
        return True
    return any(
        region_used_for(region, "generation") and region["prompts"]["negative_source"].strip()
        for region in document["regions"]
    )


def _zero_embedding(embedding: torch.Tensor) -> torch.Tensor:
    return torch.zeros_like(embedding)


def _prepare_mask(mask: torch.Tensor) -> torch.Tensor:
    value = mask.detach().float().cpu()
    if value.ndim == 2:
        value = value.unsqueeze(0)
    if value.ndim != 3:
        raise ValueError("regional masks must have shape [batch,height,width]")
    return value[:1].clamp(0.0, 1.0).contiguous()


def compile_sdxl_attention(
    document: Any,
    clip: Any,
) -> tuple[list, list, list[SDXLRegionalSlot], float]:
    clean = parse_document(document)
    width = int(clean["canvas"]["width"])
    height = int(clean["canvas"]["height"])
    negative_is_zero = clean["negative_mode"] == "zero_out" or (
        clean["negative_mode"] == "auto" and not _has_negative_sources(clean)
    )

    global_positive = _prompt(clean, "global", "positive")
    global_negative = _prompt(clean, "global", "negative")
    global_pos, positive_metadata = _encode_one(clip, global_positive["text"], "global positive")
    if negative_is_zero:
        global_neg = _zero_embedding(global_pos)
        negative_metadata = positive_metadata.copy()
        for key in ("pooled_output", "conditioning_lyrics", "conditioning_scale"):
            if torch.is_tensor(negative_metadata.get(key)):
                negative_metadata[key] = torch.zeros_like(negative_metadata[key])
    else:
        global_neg, negative_metadata = _encode_one(clip, global_negative["text"], "global negative")

    slots: list[SDXLRegionalSlot] = [
        SDXLRegionalSlot("global", None, 1.0, global_pos, global_neg)
    ]
    occupied = torch.zeros((1, height, width), dtype=torch.float32)

    region_values: list[tuple[dict[str, Any], torch.Tensor]] = []
    for region in clean["regions"]:
        if not region_used_for(region, "generation"):
            continue
        mask = _prepare_mask(render_selection(_selection(clean, "region", region["id"]), width, height))
        if not bool(torch.any(mask > 0)):
            continue
        region_values.append((region, mask))
        occupied = torch.maximum(occupied, mask)

    background_positive = _prompt(clean, "background", "positive")
    background_negative = _prompt(clean, "background", "negative")
    if background_positive["source"].strip() or background_negative["source"].strip():
        bg_pos, _ = _encode_one(clip, background_positive["text"], "background positive")
        if negative_is_zero:
            bg_neg = _zero_embedding(bg_pos)
        else:
            bg_neg, _ = _encode_one(clip, background_negative["text"], "background negative")
        slots.append(SDXLRegionalSlot("background", 1.0 - occupied, 1.0, bg_pos, bg_neg))

    for region, mask in region_values:
        positive_prompt = _prompt(clean, "region", "positive", region["id"])
        negative_prompt = _prompt(clean, "region", "negative", region["id"])
        if not positive_prompt["source"].strip() and not negative_prompt["source"].strip():
            continue
        pos, _ = _encode_one(clip, positive_prompt["text"], f"{region['name']} positive")
        if negative_is_zero:
            neg = _zero_embedding(pos)
        else:
            neg, _ = _encode_one(clip, negative_prompt["text"], f"{region['name']} negative")
        slots.append(
            SDXLRegionalSlot(
                region["name"],
                mask,
                max(0.0, float(region["strength"])),
                pos,
                neg,
            )
        )

    if len(slots) == 1:
        raise ValueError("SDXL attention routing requires at least one prompted background or region mask")

    positive = torch.cat([slot.positive for slot in slots], dim=1)
    negative = torch.cat([slot.negative for slot in slots], dim=1)
    positive_metadata["bv_regional_backend"] = BACKEND_ID
    negative_metadata["bv_regional_backend"] = BACKEND_ID
    return [[positive, positive_metadata]], [[negative, negative_metadata]], slots, width / height


def _factor_grid(token_count: int, aspect_ratio: float) -> tuple[int, int]:
    if token_count < 1 or not math.isfinite(aspect_ratio) or aspect_ratio <= 0:
        raise ValueError("token_count and aspect_ratio must be positive")
    best: tuple[float, int, int] | None = None
    for height in range(1, int(math.sqrt(token_count)) + 1):
        if token_count % height:
            continue
        width = token_count // height
        for candidate_width, candidate_height in ((width, height), (height, width)):
            error = abs(math.log((candidate_width / candidate_height) / aspect_ratio))
            if best is None or error < best[0]:
                best = (error, candidate_height, candidate_width)
    if best is None:
        raise ValueError(f"cannot map {token_count} image tokens to a rectangular grid")
    return best[1], best[2]


def build_cross_attention_bias(
    slots: list[SDXLRegionalSlot],
    query_tokens: int,
    key_tokens: int,
    aspect_ratio: float,
    strength: float,
    device: torch.device,
    dtype: torch.dtype,
    batch: int = 1,
) -> torch.Tensor:
    expected_keys = sum(slot.positive.shape[1] for slot in slots)
    if key_tokens != expected_keys:
        raise RuntimeError(
            f"SDXL regional context has {key_tokens} tokens, expected {expected_keys}; "
            "positive and negative branches must keep the same slot layout"
        )
    grid_h, grid_w = _factor_grid(query_tokens, aspect_ratio)
    bias_parts: list[torch.Tensor] = []
    for slot in slots:
        token_count = slot.positive.shape[1]
        if slot.mask is None:
            bias_parts.append(torch.zeros((query_tokens, token_count), dtype=dtype, device=device))
            continue
        coverage = F.interpolate(
            slot.mask.unsqueeze(1),
            size=(grid_h, grid_w),
            mode="bilinear",
            align_corners=False,
        ).reshape(query_tokens).to(device=device, dtype=dtype)
        effective = (coverage * min(max(slot.strength * strength, 0.0), 1.0)).clamp(0.0, 1.0)
        values = torch.full((query_tokens,), float("-inf"), dtype=dtype, device=device)
        visible = effective > 0
        values[visible] = torch.log(effective[visible].clamp_min(1e-6))
        bias_parts.append(values[:, None].expand(-1, token_count))
    return torch.cat(bias_parts, dim=1).unsqueeze(0).expand(batch, -1, -1)


class SDXLAttentionRouter:
    def __init__(
        self,
        slots: list[SDXLRegionalSlot],
        aspect_ratio: float,
        strength: float,
        start_sigma: float,
        end_sigma: float,
    ):
        self.slots = slots
        self.aspect_ratio = float(aspect_ratio)
        self.strength = min(max(float(strength), 0.0), 1.0)
        self.start_sigma = float(start_sigma)
        self.end_sigma = float(end_sigma)

    def active(self, extra_options: dict[str, Any]) -> bool:
        sigmas = extra_options.get("sigmas")
        if sigmas is None or not torch.is_tensor(sigmas) or sigmas.numel() == 0:
            return True
        sigma = float(sigmas.flatten()[0])
        return self.end_sigma <= sigma <= self.start_sigma

    def __call__(self, q: torch.Tensor, k: torch.Tensor, v: torch.Tensor, extra_options: dict[str, Any]):
        from comfy.ldm.modules.attention import optimized_attention_masked

        heads = int(extra_options["n_heads"])
        # The concatenated context contains every regional prompt. Outside the
        # configured window those slots must stay hidden instead of becoming
        # globally visible, so routing strength falls to zero but the mask stays.
        routing_strength = self.strength if self.active(extra_options) else 0.0
        bias = build_cross_attention_bias(
            self.slots,
            q.shape[1],
            k.shape[1],
            self.aspect_ratio,
            routing_strength,
            q.device,
            q.dtype,
            batch=q.shape[0],
        )
        return optimized_attention_masked(
            q,
            k,
            v,
            heads,
            bias,
            transformer_options=extra_options,
        )


def _require_sdxl_base_model(model_patcher: Any, sdxl_type: type) -> Any:
    # ComfyUI's MODEL value is a ModelPatcher whose public ``model`` member is
    # already the BaseModel (for this backend: comfy.model_base.SDXL). It is not
    # a nested object path and therefore must not be resolved as ``model.model``.
    base_model = getattr(model_patcher, "model", None)
    if not isinstance(base_model, sdxl_type):
        raise RuntimeError("BV Regional SDXL Attention supports only SDXL-family models.")
    return base_model


def apply_sdxl_attention_patch(
    model: Any,
    slots: list[SDXLRegionalSlot],
    aspect_ratio: float,
    strength: float,
    start_percent: float,
    end_percent: float,
) -> Any:
    values = (strength, start_percent, end_percent)
    if not all(math.isfinite(float(value)) and 0.0 <= float(value) <= 1.0 for value in values):
        raise ValueError("strength and sampling percentages must be finite values from 0 to 1")
    if start_percent > end_percent:
        raise ValueError("start_percent must be less than or equal to end_percent")
    try:
        import comfy.model_base
    except ImportError as error:
        raise RuntimeError("SDXL attention routing requires a current ComfyUI installation") from error

    _require_sdxl_base_model(model, comfy.model_base.SDXL)
    model_sampling = model.get_model_object("model_sampling")
    router = SDXLAttentionRouter(
        slots,
        aspect_ratio,
        strength,
        float(model_sampling.percent_to_sigma(start_percent)),
        float(model_sampling.percent_to_sigma(end_percent)),
    )
    patched = model.clone()
    # BasicTransformerBlock falls back from the exact transformer index to the
    # enclosing UNet block key, so one replacement covers every transformer in it.
    for block_name, count in (("input", 32), ("middle", 1), ("output", 32)):
        for number in range(count):
            patched.set_model_attn2_replace(router, block_name, number)
    return patched

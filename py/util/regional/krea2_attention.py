from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import torch
import torch.nn.functional as F

from .clip_hooks import clip_with_hooks
from .context import context_document
from .document import region_used_for, selection_prompts
from .mask_renderer import render_selection


BACKEND_ID = "krea2_joint_attention_experimental"
MAX_DENSE_MASK_ENTRIES = 96_000_000
CONDITIONING_WIDTH = 12 * 2560


@dataclass(frozen=True)
class Krea2RegionalSlot:
    name: str
    mask: torch.Tensor | None
    strength: float
    token_count: int
    scope: str | None = None


def _selection(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return {"document": document, "scope": scope, "region_id": region_id}


def _prompts(document: dict[str, Any], scope: str, region_id: str | None = None):
    return selection_prompts(_selection(document, scope, region_id))


def _encode_trimmed(
    clip: Any,
    text: str,
    label: str,
    hooks: Any = None,
) -> tuple[torch.Tensor, dict[str, Any]]:
    encoder = clip_with_hooks(clip, hooks)
    conditioning = encoder.encode_from_tokens_scheduled(encoder.tokenize(text))
    if len(conditioning) != 1:
        raise ValueError(
            f"Krea 2 attention routing requires one conditioning segment for {label}; "
            "scheduled prompt segments are not supported yet"
        )
    embedding, metadata = conditioning[0]
    if not torch.is_tensor(embedding) or embedding.ndim != 3:
        raise ValueError(f"{label} must encode to a [batch,tokens,channels] tensor")
    if int(embedding.shape[-1]) != CONDITIONING_WIDTH:
        raise RuntimeError(
            "Krea 2 requires the 12-layer Qwen3-VL conditioning width "
            f"{CONDITIONING_WIDTH}; got {embedding.shape[-1]}. Load CLIP with type 'krea2'."
        )

    result = metadata.copy()
    result.pop("hooks", None)
    attention = result.get("attention_mask")
    if attention is None:
        # ComfyUI intentionally omits Krea 2's mask when every encoded token is
        # active. In that case the complete returned sequence is the safe slot.
        active = torch.ones(embedding.shape[1], device=embedding.device, dtype=torch.bool)
    elif torch.is_tensor(attention):
        if attention.ndim != 2 or attention.shape[0] != embedding.shape[0]:
            raise RuntimeError(f"{label} attention mask must have shape [batch,tokens]")
        active = attention[0].to(device=embedding.device, dtype=torch.bool)
        if active.numel() != embedding.shape[1]:
            raise RuntimeError(f"{label} attention mask does not match its token sequence")
    else:
        raise RuntimeError(f"{label} attention_mask must be a tensor when provided")
    embedding = embedding[:, active, :]
    if embedding.shape[1] == 0:
        raise RuntimeError(f"{label} encoded to no active tokens")
    result["attention_mask"] = torch.ones(
        embedding.shape[:2], device=embedding.device, dtype=torch.float32
    )
    return embedding, result


def _prepare_mask(mask: torch.Tensor) -> torch.Tensor:
    value = mask.detach().float().cpu()
    if value.ndim == 2:
        value = value.unsqueeze(0)
    if value.ndim != 3:
        raise ValueError("regional masks must have shape [batch,height,width]")
    return value[:1].clamp(0.0, 1.0).contiguous()


def _pad_tokens(value: torch.Tensor, token_count: int) -> torch.Tensor:
    missing = token_count - int(value.shape[1])
    return F.pad(value, (0, 0, 0, missing)) if missing else value


def compile_krea2_attention(
    document: Any,
    clip: Any,
    hooks_by_scope: dict[str, Any] | None = None,
) -> tuple[list, list, list[Krea2RegionalSlot], float]:
    clean = context_document(document)
    scoped_hooks = hooks_by_scope or {}
    width = int(clean["canvas"]["width"])
    height = int(clean["canvas"]["height"])

    occupied = torch.zeros((1, height, width), dtype=torch.float32)
    regions: list[tuple[dict[str, Any], torch.Tensor]] = []
    for region in clean["regions"]:
        if not region_used_for(region, "generation"):
            continue
        mask = _prepare_mask(render_selection(_selection(clean, "region", region["id"]), width, height))
        if bool(torch.any(mask > 0)):
            regions.append((region, mask))
            occupied = torch.maximum(occupied, mask)

    global_positive, global_negative = _prompts(clean, "global")
    specifications = [
        ("global", "global", None, 1.0, global_positive, global_negative)
    ]
    background_positive, background_negative = _prompts(clean, "background")
    if background_positive["source"].strip() or background_negative["source"].strip():
        specifications.append(
            ("background", "background", (1.0 - occupied).clamp(0.0, 1.0), 1.0,
             background_positive, background_negative)
        )
    for region, mask in regions:
        positive_prompt, negative_prompt = _prompts(clean, "region", region["id"])
        if positive_prompt["source"].strip() or negative_prompt["source"].strip():
            specifications.append(
                (region["name"], region["id"], mask, max(0.0, float(region["strength"])),
                 positive_prompt, negative_prompt)
            )
    if len(specifications) == 1:
        raise ValueError("Krea 2 attention routing requires a prompted background or region mask")

    positive_values: list[torch.Tensor] = []
    negative_values: list[torch.Tensor] = []
    positive_masks: list[torch.Tensor] = []
    negative_masks: list[torch.Tensor] = []
    slots: list[Krea2RegionalSlot] = []
    positive_metadata = None
    negative_metadata = None
    for name, scope, mask, strength, positive_prompt, negative_prompt in specifications:
        hooks = scoped_hooks.get(scope)
        pos, pos_meta = _encode_trimmed(
            clip, positive_prompt["text"], f"{name} positive", hooks
        )
        neg, neg_meta = _encode_trimmed(
            clip, negative_prompt["text"], f"{name} negative", hooks
        )
        count = max(int(pos.shape[1]), int(neg.shape[1]))
        positive_values.append(_pad_tokens(pos, count))
        negative_values.append(_pad_tokens(neg, count))
        positive_masks.append(F.pad(pos_meta["attention_mask"], (0, count - pos.shape[1])))
        negative_masks.append(F.pad(neg_meta["attention_mask"], (0, count - neg.shape[1])))
        slots.append(Krea2RegionalSlot(name, mask, strength, count, scope))
        positive_metadata = positive_metadata or pos_meta
        negative_metadata = negative_metadata or neg_meta

    assert positive_metadata is not None and negative_metadata is not None
    positive_embedding = torch.cat(positive_values, dim=1)
    negative_embedding = torch.cat(negative_values, dim=1)
    positive_metadata = positive_metadata.copy()
    negative_metadata = negative_metadata.copy()
    positive_metadata["attention_mask"] = torch.cat(positive_masks, dim=1)
    negative_metadata["attention_mask"] = torch.cat(negative_masks, dim=1)
    for metadata in (positive_metadata, negative_metadata):
        metadata["bv_regional_backend"] = BACKEND_ID
        metadata["bv_krea2_text_fusion_routing"] = False
    return (
        [[positive_embedding, positive_metadata]],
        [[negative_embedding, negative_metadata]],
        slots,
        width / height,
    )


def _grid_for_tokens(tokens: int, aspect_ratio: float) -> tuple[int, int]:
    if tokens < 1 or not math.isfinite(aspect_ratio) or aspect_ratio <= 0:
        raise ValueError("target token count and aspect ratio must be positive")
    best: tuple[float, int, int] | None = None
    for h in range(1, math.isqrt(tokens) + 1):
        if tokens % h:
            continue
        w = tokens // h
        for candidate_h, candidate_w in ((h, w), (w, h)):
            score = abs(math.log((candidate_w / candidate_h) / aspect_ratio))
            candidate = (score, candidate_h, candidate_w)
            if best is None or candidate < best:
                best = candidate
    assert best is not None
    return best[1], best[2]


def build_krea2_joint_attention_bias(
    slots: list[Krea2RegionalSlot],
    text_tokens: int,
    target_image_tokens: int,
    reference_image_tokens: int,
    aspect_ratio: float,
    routing_strength: float,
    device: torch.device,
    dtype: torch.dtype,
    batch: int,
) -> torch.Tensor:
    raw_text_tokens = sum(slot.token_count for slot in slots)
    if text_tokens < raw_text_tokens:
        raise RuntimeError(f"Krea 2 context has {text_tokens} tokens, expected at least {raw_text_tokens}")
    total = text_tokens + target_image_tokens + reference_image_tokens
    entries = total * total
    if entries > MAX_DENSE_MASK_ENTRIES:
        gib = entries * torch.empty((), dtype=dtype).element_size() / (1024 ** 3)
        raise RuntimeError(
            f"Krea 2 regional attention mask would allocate at least {gib:.2f} GiB at this resolution; "
            "reduce the canvas size or use BV Regional Native Conditioning"
        )
    grid_h, grid_w = _grid_for_tokens(target_image_tokens, aspect_ratio)
    bias = torch.zeros((batch, 1, total, total), device=device, dtype=dtype)
    prefix_padding = text_tokens - raw_text_tokens
    if prefix_padding:
        bias[..., :prefix_padding] = float("-inf")

    target_rows = slice(text_tokens, text_tokens + target_image_tokens)
    offset = prefix_padding
    for slot in slots:
        end = offset + slot.token_count
        if slot.mask is not None:
            coverage = F.interpolate(
                slot.mask.unsqueeze(1), size=(grid_h, grid_w), mode="bilinear", align_corners=False
            ).reshape(target_image_tokens).to(device=device, dtype=dtype)
            effective = (
                coverage * min(max(slot.strength * routing_strength, 0.0), 1.0)
            ).clamp(0.0, 1.0)
            values = torch.full((target_image_tokens,), float("-inf"), device=device, dtype=dtype)
            visible = effective > 0
            values[visible] = torch.log(effective[visible].clamp_min(1e-6))
            bias[:, :, target_rows, offset:end] = values[None, None, :, None]
            if reference_image_tokens:
                bias[:, :, text_tokens + target_image_tokens :, offset:end] = float("-inf")
        offset = end
    return bias


@dataclass
class Krea2AttentionPatch:
    slots: list[Krea2RegionalSlot]
    aspect_ratio: float
    strength: float
    start_sigma: float
    end_sigma: float
    _cache: dict[tuple[Any, ...], torch.Tensor] = field(default_factory=dict, init=False, repr=False)

    def active(self, extra_options: dict[str, Any]) -> bool:
        sigmas = extra_options.get("sigmas")
        if sigmas is None or not torch.is_tensor(sigmas) or sigmas.numel() == 0:
            return True
        sigma = float(sigmas.flatten()[0])
        return self.end_sigma <= sigma <= self.start_sigma

    def __call__(self, q, k, v, pe=None, attn_mask=None, extra_options=None):
        options = extra_options if isinstance(extra_options, dict) else {}
        img_slice = options.get("img_slice")
        if not isinstance(img_slice, (list, tuple)) or len(img_slice) != 2:
            raise RuntimeError("Krea 2 attention patch did not receive img_slice from ComfyUI")
        text_tokens = int(img_slice[0])
        all_image_tokens = int(img_slice[1]) - text_tokens
        references = sum(int(value) for value in options.get("reference_image_num_tokens", []) or [])
        target_tokens = all_image_tokens - references
        if target_tokens < 1:
            raise RuntimeError("Krea 2 attention patch could not identify target image tokens")
        strength = self.strength if self.active(options) else 0.0
        cache_key = (text_tokens, target_tokens, references, int(q.shape[0]), q.device, q.dtype, strength)
        bias = self._cache.get(cache_key)
        if bias is None:
            bias = build_krea2_joint_attention_bias(
                self.slots, text_tokens, target_tokens, references, self.aspect_ratio,
                strength, q.device, q.dtype, int(q.shape[0])
            )
            self._cache[cache_key] = bias
        if torch.is_tensor(attn_mask) and attn_mask.ndim >= 3:
            bias = bias + attn_mask.to(device=q.device, dtype=q.dtype)
        return {"attn_mask": bias}


def _require_krea2(model_patcher: Any, krea2_type: type) -> Any:
    base_model = getattr(model_patcher, "model", None)
    diffusion = getattr(base_model, "diffusion_model", None)
    config = getattr(getattr(base_model, "model_config", None), "unet_config", {})
    if not isinstance(base_model, krea2_type) or config.get("image_model") != "krea2" or diffusion is None:
        raise RuntimeError("BV Regional Krea 2 Attention supports only Krea 2 model architectures")

    expected = {
        "patch": 2,
        "channels": 16,
        "tdim": 256,
        "heads": 48,
        "txtdim": 2560,
        "txtlayers": 12,
    }
    mismatches = [
        f"{name}={getattr(diffusion, name, None)!r} (expected {value!r})"
        for name, value in expected.items()
        if getattr(diffusion, name, None) != value
    ]
    if len(getattr(diffusion, "blocks", [])) != 28:
        mismatches.append(f"blocks={len(getattr(diffusion, 'blocks', []))} (expected 28)")
    if getattr(getattr(diffusion, "first", None), "out_features", None) != 6144:
        mismatches.append(
            f"features={getattr(getattr(diffusion, 'first', None), 'out_features', None)!r} (expected 6144)"
        )
    fusion = getattr(diffusion, "txtfusion", None)
    if len(getattr(fusion, "layerwise_blocks", [])) != 2 or len(getattr(fusion, "refiner_blocks", [])) != 2:
        mismatches.append("txtfusion must contain 2 layerwise and 2 refiner blocks")
    if mismatches:
        raise RuntimeError("Unsupported Krea 2 architecture: " + "; ".join(mismatches))
    return base_model


def apply_krea2_attention_patch(
    model: Any,
    slots: list[Krea2RegionalSlot],
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
        raise RuntimeError("Krea 2 attention routing requires a current ComfyUI installation") from error

    _require_krea2(model, comfy.model_base.Krea2)
    sampling = model.get_model_object("model_sampling")
    patch = Krea2AttentionPatch(
        slots,
        float(aspect_ratio),
        float(strength),
        float(sampling.percent_to_sigma(start_percent)),
        float(sampling.percent_to_sigma(end_percent)),
    )
    result = model.clone()
    result.set_model_attn1_patch(patch)
    result.set_attachments(BACKEND_ID, patch)
    return result

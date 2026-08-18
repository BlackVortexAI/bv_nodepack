from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import Any

import torch
import torch.nn.functional as F

from .document import parse_document, selection_prompts
from .mask_renderer import render_selection


BACKEND_ID = "flux2_klein_9b_joint_attention"
MAX_DENSE_MASK_ENTRIES = 96_000_000


@dataclass(frozen=True)
class Flux2KleinRegionalSlot:
    name: str
    mask: torch.Tensor | None
    strength: float
    token_count: int


def _selection(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return {"document": document, "scope": scope, "region_id": region_id}


def _prompt(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return selection_prompts(_selection(document, scope, region_id))[0]


def _encode_trimmed(clip: Any, text: str, label: str) -> tuple[torch.Tensor, dict[str, Any]]:
    conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(text))
    if len(conditioning) != 1:
        raise ValueError(
            f"FLUX.2 Klein attention routing requires one conditioning segment for {label}; "
            "scheduled prompt segments are not supported yet"
        )
    embedding, metadata = conditioning[0]
    if not torch.is_tensor(embedding) or embedding.ndim != 3:
        raise ValueError(f"{label} must encode to a [batch,tokens,channels] tensor")
    if int(embedding.shape[-1]) != 12_288:
        raise RuntimeError(
            f"FLUX.2 Klein 9B requires Qwen3-8B conditioning width 12288; got {embedding.shape[-1]}"
        )

    result = metadata.copy()
    attention = result.get("attention_mask")
    if torch.is_tensor(attention):
        active = attention[0].to(dtype=torch.bool)
        if active.numel() != embedding.shape[1]:
            raise RuntimeError(f"{label} attention mask does not match its token sequence")
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


def compile_flux2_klein_attention(
    document: Any, clip: Any
) -> tuple[list, list, list[Flux2KleinRegionalSlot], float]:
    clean = parse_document(document)
    width = int(clean["canvas"]["width"])
    height = int(clean["canvas"]["height"])

    occupied = torch.zeros((1, height, width), dtype=torch.float32)
    regions: list[tuple[dict[str, Any], torch.Tensor]] = []
    for region in clean["regions"]:
        if not region["enabled"]:
            continue
        mask = _prepare_mask(render_selection(_selection(clean, "region", region["id"]), width, height))
        if bool(torch.any(mask > 0)):
            regions.append((region, mask))
            occupied = torch.maximum(occupied, mask)

    specifications: list[tuple[str, torch.Tensor | None, float, dict[str, Any]]] = [
        ("global", None, 1.0, _prompt(clean, "global"))
    ]
    background = _prompt(clean, "background")
    if background["source"].strip():
        specifications.append(("background", 1.0 - occupied, 1.0, background))
    for region, mask in regions:
        prompt = _prompt(clean, "region", region["id"])
        if prompt["source"].strip():
            specifications.append(
                (region["name"], mask, max(0.0, float(region["strength"])), prompt)
            )
    if len(specifications) == 1:
        raise ValueError("FLUX.2 Klein attention routing requires a prompted background or region mask")

    encoded: list[torch.Tensor] = []
    slots: list[Flux2KleinRegionalSlot] = []
    metadata: dict[str, Any] | None = None
    for name, mask, strength, prompt in specifications:
        value, current_metadata = _encode_trimmed(clip, prompt["text"], f"{name} positive")
        encoded.append(value)
        slots.append(Flux2KleinRegionalSlot(name, mask, strength, int(value.shape[1])))
        if metadata is None:
            metadata = current_metadata

    assert metadata is not None
    positive_embedding = torch.cat(encoded, dim=1)
    raw_tokens = int(positive_embedding.shape[1])
    padded_tokens = max(512, raw_tokens)
    prefix_padding = padded_tokens - raw_tokens
    if prefix_padding:
        positive_embedding = F.pad(positive_embedding, (0, 0, prefix_padding, 0))
    metadata["attention_mask"] = torch.cat(
        (
            torch.zeros((1, prefix_padding), device=positive_embedding.device),
            torch.ones((1, raw_tokens), device=positive_embedding.device),
        ),
        dim=1,
    )
    metadata["bv_regional_backend"] = BACKEND_ID
    metadata["bv_regional_prefix_padding"] = prefix_padding
    positive = [[positive_embedding, metadata]]

    negative_metadata = metadata.copy()
    negative_metadata["attention_mask"] = metadata["attention_mask"].clone()
    for key, value in tuple(negative_metadata.items()):
        if torch.is_tensor(value) and key != "attention_mask":
            negative_metadata[key] = torch.zeros_like(value)
    negative_metadata["bv_negative_mode"] = "zero_distilled"
    negative = [[torch.zeros_like(positive_embedding), negative_metadata]]
    return positive, negative, slots, width / height


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


def build_flux2_joint_attention_bias(
    slots: list[Flux2KleinRegionalSlot],
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
        raise RuntimeError(
            f"FLUX.2 context has {text_tokens} tokens, expected at least {raw_text_tokens}"
        )
    total = text_tokens + target_image_tokens + reference_image_tokens
    entries = total * total
    if entries > MAX_DENSE_MASK_ENTRIES:
        gib = entries * torch.empty((), dtype=dtype).element_size() / (1024 ** 3)
        raise RuntimeError(
            f"FLUX.2 regional attention mask would allocate at least {gib:.2f} GiB at this resolution; "
            "reduce the canvas size or use BV Regional Native Conditioning"
        )
    grid_h, grid_w = _grid_for_tokens(target_image_tokens, aspect_ratio)
    bias = torch.zeros((batch, 1, total, total), device=device, dtype=dtype)
    prefix_padding = text_tokens - raw_text_tokens
    if prefix_padding:
        bias[..., :prefix_padding] = float("-inf")

    target_rows = slice(text_tokens, text_tokens + target_image_tokens)
    all_image_rows = slice(text_tokens, total)
    offset = prefix_padding
    for slot in slots:
        end = offset + slot.token_count
        if slot.mask is not None:
            coverage = F.interpolate(
                slot.mask.unsqueeze(1), size=(grid_h, grid_w), mode="bilinear", align_corners=False
            ).reshape(target_image_tokens).to(device=device, dtype=dtype)
            effective = (coverage * min(max(slot.strength * routing_strength, 0.0), 1.0)).clamp(0.0, 1.0)
            values = torch.full((target_image_tokens,), float("-inf"), device=device, dtype=dtype)
            visible = effective > 0
            values[visible] = torch.log(effective[visible].clamp_min(1e-6))
            bias[:, :, target_rows, offset:end] = values[None, None, :, None]
            if reference_image_tokens:
                bias[:, :, text_tokens + target_image_tokens :, offset:end] = float("-inf")
        offset = end
    # Image-to-image and text-to-image remain unrestricted (cross-only routing).
    assert bias[:, :, all_image_rows, text_tokens:].shape[-1] == target_image_tokens + reference_image_tokens
    return bias


@dataclass
class Flux2KleinAttentionPatch:
    slots: list[Flux2KleinRegionalSlot]
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
            raise RuntimeError("FLUX.2 attention patch did not receive img_slice from ComfyUI")
        text_tokens = int(img_slice[0])
        image_tokens = int(img_slice[1]) - text_tokens
        references = sum(int(value) for value in options.get("reference_image_num_tokens", []) or [])
        target_tokens = image_tokens - references
        if target_tokens < 1:
            raise RuntimeError("FLUX.2 attention patch could not identify target image tokens")
        strength = self.strength if self.active(options) else 0.0
        cache_key = (
            text_tokens, target_tokens, references, int(q.shape[0]), q.device, q.dtype, strength
        )
        bias = self._cache.get(cache_key)
        if bias is None:
            bias = build_flux2_joint_attention_bias(
                self.slots, text_tokens, target_tokens, references, self.aspect_ratio,
                strength, q.device, q.dtype, int(q.shape[0])
            )
            self._cache[cache_key] = bias
        if torch.is_tensor(attn_mask) and attn_mask.ndim >= 3:
            bias = bias + attn_mask.to(device=q.device, dtype=q.dtype)
        return {"attn_mask": bias}


def _require_flux2_klein_9b(model_patcher: Any, flux2_type: type) -> Any:
    base_model = getattr(model_patcher, "model", None)
    diffusion = getattr(base_model, "diffusion_model", None)
    image_model = getattr(getattr(base_model, "model_config", None), "unet_config", {}).get("image_model")
    if not isinstance(base_model, flux2_type) or image_model != "flux2" or diffusion is None:
        raise RuntimeError("BV Regional FLUX.2 Klein 9B Attention supports only FLUX.2 Klein 9B models")
    params = getattr(diffusion, "params", None)
    expected = {
        "in_channels": 128,
        "out_channels": 128,
        "context_in_dim": 12_288,
        "hidden_size": 4_096,
        "num_heads": 32,
        "depth": 8,
        "depth_single_blocks": 24,
        "patch_size": 1,
        "theta": 2_000,
        "qkv_bias": False,
        "global_modulation": True,
    }
    mismatches = [
        f"{name}={getattr(params, name, None)!r} (expected {value!r})"
        for name, value in expected.items()
        if getattr(params, name, None) != value
    ]
    if getattr(params, "axes_dim", None) != [32, 32, 32, 32]:
        mismatches.append(f"axes_dim={getattr(params, 'axes_dim', None)!r} (expected [32, 32, 32, 32])")
    if mismatches:
        raise RuntimeError("Unsupported FLUX.2 architecture: " + "; ".join(mismatches))
    return base_model


def apply_flux2_klein_attention_patch(
    model: Any,
    slots: list[Flux2KleinRegionalSlot],
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
        raise RuntimeError("FLUX.2 Klein attention routing requires a current ComfyUI installation") from error

    _require_flux2_klein_9b(model, comfy.model_base.Flux2)
    sampling = model.get_model_object("model_sampling")
    patch = Flux2KleinAttentionPatch(
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

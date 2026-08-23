from __future__ import annotations

import math
import types
from dataclasses import dataclass
from typing import Any

import torch
import torch.nn.functional as F

from .context import context_document
from .document import region_used_for, selection_prompts
from .mask_renderer import render_selection


BACKEND_ID = "zimage_joint_attention"
WRAPPER_KEY = "bv_zimage_regional_attention"


@dataclass(frozen=True)
class ZImageRegionalSlot:
    name: str
    mask: torch.Tensor | None
    strength: float
    token_count: int


def _selection(document: dict[str, Any], scope: str, region_id: str | None = None) -> dict[str, Any]:
    return {"document": document, "scope": scope, "region_id": region_id}


def _prompt(document: dict[str, Any], scope: str, polarity: str, region_id: str | None = None) -> dict[str, Any]:
    prompts = selection_prompts(_selection(document, scope, region_id))
    return prompts[0 if polarity == "positive" else 1]


def _encode_one(clip: Any, text: str, label: str) -> tuple[torch.Tensor, dict[str, Any]]:
    conditioning = clip.encode_from_tokens_scheduled(clip.tokenize(text))
    if len(conditioning) != 1:
        raise ValueError(
            f"Z-Image attention routing currently requires one conditioning segment for {label}; "
            "scheduled prompt segments are not supported yet"
        )
    embedding, metadata = conditioning[0]
    if not torch.is_tensor(embedding) or embedding.ndim != 3:
        raise ValueError(f"{label} must encode to a [batch,tokens,channels] tensor")
    return embedding, metadata.copy()


def _prepare_mask(mask: torch.Tensor) -> torch.Tensor:
    value = mask.detach().float().cpu()
    if value.ndim == 2:
        value = value.unsqueeze(0)
    if value.ndim != 3:
        raise ValueError("regional masks must have shape [batch,height,width]")
    return value[:1].clamp(0.0, 1.0).contiguous()


def compile_zimage_attention(document: Any, clip: Any) -> tuple[list, list, list[ZImageRegionalSlot], float]:
    clean = context_document(document)
    width = int(clean["canvas"]["width"])
    height = int(clean["canvas"]["height"])

    encoded_positive: list[torch.Tensor] = []
    encoded_negative: list[torch.Tensor] = []
    slots: list[ZImageRegionalSlot] = []
    positive_metadata: dict[str, Any] | None = None
    negative_metadata: dict[str, Any] | None = None

    occupied = torch.zeros((1, height, width), dtype=torch.float32)
    region_values: list[tuple[dict[str, Any], torch.Tensor]] = []
    for region in clean["regions"]:
        if not region_used_for(region, "generation"):
            continue
        mask = _prepare_mask(render_selection(_selection(clean, "region", region["id"]), width, height))
        if bool(torch.any(mask > 0)):
            region_values.append((region, mask))
            occupied = torch.maximum(occupied, mask)

    specifications: list[tuple[str, torch.Tensor | None, float, dict[str, Any], dict[str, Any]]] = []
    specifications.append((
        "global", None, 1.0,
        _prompt(clean, "global", "positive"),
        _prompt(clean, "global", "negative"),
    ))
    bg_pos = _prompt(clean, "background", "positive")
    bg_neg = _prompt(clean, "background", "negative")
    if bg_pos["source"].strip() or bg_neg["source"].strip():
        specifications.append(("background", 1.0 - occupied, 1.0, bg_pos, bg_neg))
    for region, mask in region_values:
        pos = _prompt(clean, "region", "positive", region["id"])
        neg = _prompt(clean, "region", "negative", region["id"])
        if pos["source"].strip() or neg["source"].strip():
            specifications.append((region["name"], mask, max(0.0, float(region["strength"])), pos, neg))

    if len(specifications) == 1:
        raise ValueError("Z-Image attention routing requires at least one prompted background or region mask")

    attention_masks_positive: list[torch.Tensor] = []
    attention_masks_negative: list[torch.Tensor] = []
    for name, mask, strength, positive_prompt, negative_prompt in specifications:
        pos, pos_meta = _encode_one(clip, positive_prompt["text"], f"{name} positive")
        # Z-Image Turbo is distilled without a useful negative-CFG branch.
        # Keep an identically shaped zero context solely because KSampler still
        # requires a negative CONDITIONING input.
        neg, neg_meta = torch.zeros_like(pos), pos_meta.copy()
        for key, value in tuple(neg_meta.items()):
            if torch.is_tensor(value) and key != "attention_mask":
                neg_meta[key] = torch.zeros_like(value)
        encoded_positive.append(pos)
        encoded_negative.append(neg)
        slots.append(ZImageRegionalSlot(name, mask, strength, int(pos.shape[1])))
        attention_masks_positive.append(pos_meta.get("attention_mask", torch.ones(pos.shape[:2])))
        attention_masks_negative.append(neg_meta.get("attention_mask", torch.ones(neg.shape[:2])))
        if positive_metadata is None:
            positive_metadata = pos_meta
            negative_metadata = neg_meta

    assert positive_metadata is not None and negative_metadata is not None
    positive = torch.cat(encoded_positive, dim=1)
    negative = torch.cat(encoded_negative, dim=1)
    positive_metadata["attention_mask"] = torch.cat(attention_masks_positive, dim=1)
    negative_metadata["attention_mask"] = torch.cat(attention_masks_negative, dim=1)
    positive_metadata["bv_regional_backend"] = BACKEND_ID
    negative_metadata["bv_regional_backend"] = BACKEND_ID
    return [[positive, positive_metadata]], [[negative, negative_metadata]], slots, width / height


def build_joint_attention_bias(
    slots: list[ZImageRegionalSlot],
    text_tokens: int,
    image_height: int,
    image_width: int,
    patch_size: int,
    image_tokens: int,
    strength: float,
    device: torch.device,
    dtype: torch.dtype,
    batch: int,
) -> torch.Tensor:
    raw_text_tokens = sum(slot.token_count for slot in slots)
    if text_tokens < raw_text_tokens:
        raise RuntimeError(f"Z-Image context has {text_tokens} projected tokens, expected at least {raw_text_tokens}")
    grid_h = math.ceil(image_height / patch_size)
    grid_w = math.ceil(image_width / patch_size)
    raw_image_tokens = grid_h * grid_w
    if image_tokens < raw_image_tokens:
        raise RuntimeError(f"Z-Image sequence has {image_tokens} image tokens, expected at least {raw_image_tokens}")

    total = text_tokens + image_tokens
    bias = torch.zeros((batch, 1, total, total), device=device, dtype=dtype)
    image_rows = slice(text_tokens, text_tokens + raw_image_tokens)
    offset = 0
    for slot in slots:
        end = offset + slot.token_count
        if slot.mask is not None:
            coverage = F.interpolate(
                slot.mask.unsqueeze(1), size=(grid_h, grid_w), mode="bilinear", align_corners=False
            ).reshape(raw_image_tokens).to(device=device, dtype=dtype)
            effective = (coverage * min(max(slot.strength * strength, 0.0), 1.0)).clamp(0.0, 1.0)
            values = torch.full((raw_image_tokens,), float("-inf"), device=device, dtype=dtype)
            visible = effective > 0
            values[visible] = torch.log(effective[visible].clamp_min(1e-6))
            bias[:, :, image_rows, offset:end] = values[None, None, :, None]
        offset = end
    return bias


@dataclass(frozen=True)
class ZImageAttentionPatch:
    slots: list[ZImageRegionalSlot]
    strength: float
    start_sigma: float
    end_sigma: float

    def active(self, transformer_options: dict[str, Any]) -> bool:
        sigmas = transformer_options.get("sigmas")
        if sigmas is None or not torch.is_tensor(sigmas) or sigmas.numel() == 0:
            return True
        sigma = float(sigmas.flatten()[0])
        return self.end_sigma <= sigma <= self.start_sigma


def _diffusion_model_wrapper(executor, *args, **kwargs):
    transformer_options = kwargs.get("transformer_options")
    if not isinstance(transformer_options, dict):
        return executor(*args, **kwargs)
    patch: ZImageAttentionPatch | None = transformer_options.get(WRAPPER_KEY)
    if patch is None:
        return executor(*args, **kwargs)

    diffusion_model = executor.class_obj
    input_x = args[0] if args else kwargs.get("x")
    context = args[2] if len(args) > 2 else kwargs.get("context")
    if not torch.is_tensor(input_x) or input_x.ndim != 4 or not torch.is_tensor(context):
        raise RuntimeError("BV Regional Z-Image Attention expected 4D latent input and tensor context")

    original = diffusion_model.patchify_and_embed

    def patched_patchify(_self, *patch_args, **patch_kwargs):
        result = original(*patch_args, **patch_kwargs)
        full_embed = result[0]
        pad_multiple = int(getattr(diffusion_model, "pad_tokens_multiple", 1) or 1)
        raw_text = sum(slot.token_count for slot in patch.slots)
        text_tokens = raw_text + ((-raw_text) % pad_multiple)
        image_tokens = int(full_embed.shape[1]) - text_tokens
        # Outside the configured window the concatenated regional slots must
        # remain hidden. Bypassing the wrapper would make every regional prompt
        # global for the rest of sampling.
        routing_strength = patch.strength if patch.active(transformer_options) else 0.0
        bias = build_joint_attention_bias(
            patch.slots,
            text_tokens,
            int(input_x.shape[-2]),
            int(input_x.shape[-1]),
            int(getattr(diffusion_model, "patch_size", 2)),
            image_tokens,
            routing_strength,
            full_embed.device,
            full_embed.dtype,
            int(full_embed.shape[0]),
        )
        return (result[0], bias, *result[2:])

    diffusion_model.patchify_and_embed = types.MethodType(patched_patchify, diffusion_model)
    try:
        return executor(*args, **kwargs)
    finally:
        diffusion_model.patchify_and_embed = original


def _require_zimage_base_model(model_patcher: Any, lumina_type: type) -> Any:
    base_model = getattr(model_patcher, "model", None)
    diffusion_model = getattr(base_model, "diffusion_model", None)
    image_model = getattr(getattr(base_model, "model_config", None), "unet_config", {}).get("image_model")
    if not isinstance(base_model, lumina_type) or image_model != "lumina2":
        raise RuntimeError("BV Regional Z-Image Attention supports only Z-Image/Lumina2 models.")
    if diffusion_model is None or not hasattr(diffusion_model, "patchify_and_embed"):
        raise RuntimeError("Z-Image diffusion model is missing patchify_and_embed.")
    return base_model


def apply_zimage_attention_patch(model: Any, slots: list[ZImageRegionalSlot], strength: float, start_percent: float, end_percent: float) -> Any:
    values = (strength, start_percent, end_percent)
    if not all(math.isfinite(float(v)) and 0.0 <= float(v) <= 1.0 for v in values):
        raise ValueError("strength and sampling percentages must be finite values from 0 to 1")
    if start_percent > end_percent:
        raise ValueError("start_percent must be less than or equal to end_percent")
    try:
        import comfy.model_base
        import comfy.patcher_extension
    except ImportError as error:
        raise RuntimeError("Z-Image attention routing requires a current ComfyUI installation") from error

    _require_zimage_base_model(model, comfy.model_base.Lumina2)
    sampling = model.get_model_object("model_sampling")
    regional_patch = ZImageAttentionPatch(
        slots,
        float(strength),
        float(sampling.percent_to_sigma(start_percent)),
        float(sampling.percent_to_sigma(end_percent)),
    )
    patched = model.clone()
    patched.remove_wrappers_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY)
    patched.add_wrapper_with_key(
        comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY, _diffusion_model_wrapper
    )
    patched.model_options.setdefault("transformer_options", {})[WRAPPER_KEY] = regional_patch
    patched.set_attachments(WRAPPER_KEY, regional_patch)
    return patched

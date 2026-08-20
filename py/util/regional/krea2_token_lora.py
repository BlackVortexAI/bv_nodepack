from __future__ import annotations

import contextvars
import copy
import itertools
import logging
import math
import re
from dataclasses import dataclass, field
from typing import Any

import torch
import torch.nn.functional as F

from .krea2_attention import Krea2RegionalSlot, _grid_for_tokens
from .mask_renderer import render_selection


BACKEND_ID = "krea2_token_gated_singlepass"
WRAPPER_KEY = "bv_krea2_token_lora"


@dataclass(frozen=True)
class TokenLoRASpec:
    uid: str
    path: str
    strength: float
    scopes: frozenset[str]


@dataclass
class TokenLoRAReport:
    mode: str = "token_gated_singlepass"
    adapters: int = 0
    patched_layers: int = 0
    unmatched_keys: dict[str, list[str]] = field(default_factory=dict)
    unmaskable_keys: dict[str, list[str]] = field(default_factory=dict)


@dataclass(frozen=True)
class _RuntimeContext:
    token_masks: dict[str, torch.Tensor]
    text_tokens: int
    image_tokens: int
    text_layers: int
    image_shape: tuple[int, int, int] | None = None


_RUNTIME: contextvars.ContextVar[_RuntimeContext | None] = contextvars.ContextVar(
    "bv_krea2_token_lora_runtime", default=None
)
_CLASS_CACHE: dict[type, type] = {}
_UID = itertools.count()
_PREFIXES = (
    "diffusion_model.", "transformer.", "model.", "lora_unet_", "lora_transformer_",
)


def build_token_lora_specs(scope_stacks: dict[str, Any]) -> list[TokenLoRASpec]:
    """Collapse inherited BV stacks while preserving intentional duplicates."""
    grouped: dict[tuple[str, float, int], set[str]] = {}
    for scope, entries in scope_stacks.items():
        occurrences: dict[tuple[str, float], int] = {}
        for path, model_strength, _clip_strength in entries:
            strength = float(model_strength)
            if strength == 0.0:
                continue
            base = (str(path), strength)
            ordinal = occurrences.get(base, 0)
            occurrences[base] = ordinal + 1
            grouped.setdefault((base[0], base[1], ordinal), set()).add(str(scope))
    return [
        TokenLoRASpec(
            uid=f"bv_krea2_lora_{next(_UID)}",
            path=path,
            strength=strength,
            scopes=frozenset(scopes),
        )
        for (path, strength, _ordinal), scopes in grouped.items()
    ]


def _normalize_lora_state(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    groups: dict[str, dict[str, Any]] = {}
    for raw_key, value in state.items():
        key = str(raw_key)
        match = re.match(r"^(.*?)\.(lora_A|lora_down)\.weight$", key)
        if match:
            groups.setdefault(match.group(1), {})["down"] = value
            continue
        match = re.match(r"^(.*?)\.(lora_B|lora_up)\.weight$", key)
        if match:
            groups.setdefault(match.group(1), {})["up"] = value
            continue
        match = re.match(
            r"^(.*?)\.(lokr_w1|lokr_w1_a|lokr_w1_b|lokr_w2|lokr_w2_a|lokr_w2_b|lokr_t2)$",
            key,
        )
        if match:
            groups.setdefault(match.group(1), {})[match.group(2)] = value
            continue
        match = re.match(r"^(.*?)\.alpha$", key)
        if match:
            groups.setdefault(match.group(1), {})["alpha"] = float(value)

    normalized: dict[str, dict[str, Any]] = {}
    for raw_key, group in groups.items():
        adapter: dict[str, Any] | None = None
        if "down" in group and "up" in group:
            adapter = {"kind": "lora", "down": group["down"], "up": group["up"]}
            if "alpha" in group:
                adapter["alpha"] = group["alpha"]
        elif ("lokr_w1" in group or "lokr_w1_a" in group) and (
            "lokr_w2" in group or "lokr_w2_a" in group
        ):
            if "lokr_t2" in group:
                continue
            rank = None
            if "lokr_w1" in group:
                w1 = group["lokr_w1"].float()
            else:
                rank = int(group["lokr_w1_b"].shape[0])
                w1 = group["lokr_w1_a"].float() @ group["lokr_w1_b"].float()
            if "lokr_w2" in group:
                w2 = group["lokr_w2"].float()
            else:
                rank = int(group["lokr_w2_b"].shape[0])
                w2 = group["lokr_w2_a"].float() @ group["lokr_w2_b"].float()
            if w1.ndim != 2 or w2.ndim != 2:
                continue
            alpha_scale = float(group.get("alpha", rank) / rank) if rank else 1.0
            adapter = {"kind": "lokr", "w1": w1, "w2": w2, "alpha_scale": alpha_scale}
        if adapter is None:
            continue
        key = raw_key
        for prefix in _PREFIXES:
            if key.startswith(prefix):
                key = key[len(prefix):]
                break
        adapter["original_key"] = raw_key
        normalized[key] = adapter
    return normalized


def _adapt_mask(mask: torch.Tensor, value: torch.Tensor) -> torch.Tensor | None:
    runtime = _RUNTIME.get()
    if runtime is None:
        return None
    if value.ndim == 3:
        sequence = int(value.shape[1])
        if sequence == int(mask.shape[1]):
            result = mask
        elif sequence == runtime.text_tokens:
            result = mask[:, :sequence]
        elif sequence == runtime.image_tokens:
            result = mask[:, runtime.text_tokens:runtime.text_tokens + sequence]
        elif (
            sequence == runtime.text_layers
            and runtime.text_tokens > 0
            and int(value.shape[0]) % runtime.text_tokens == 0
        ):
            text_mask = mask[:, :runtime.text_tokens, 0]
            repetitions = int(value.shape[0]) // runtime.text_tokens
            if int(text_mask.shape[0]) == 1:
                flattened = text_mask[0].repeat(repetitions)
            elif int(text_mask.shape[0]) == repetitions:
                flattened = text_mask.reshape(-1)
            else:
                return None
            return flattened[:, None, None]
        else:
            return None
        return result if int(result.shape[0]) in (1, int(value.shape[0])) else None
    if value.ndim == 4 and int(value.shape[1]) == runtime.text_tokens:
        result = mask[:, :runtime.text_tokens]
        return result[..., None] if int(result.shape[0]) in (1, int(value.shape[0])) else None
    if value.ndim == 5 and runtime.image_shape is not None:
        temporal, height, width = runtime.image_shape
        if tuple(value.shape[1:4]) != (temporal, height, width):
            return None
        result = mask[:, runtime.text_tokens:runtime.text_tokens + runtime.image_tokens]
        result = result.reshape(result.shape[0], temporal, height, width, 1)
        return result if int(result.shape[0]) in (1, int(value.shape[0])) else None
    return None


def _apply_kronecker(value: torch.Tensor, w1: torch.Tensor, w2: torch.Tensor) -> torch.Tensor:
    a1, b1 = w1.shape
    a2, b2 = w2.shape
    reshaped = value.reshape(*value.shape[:-1], b1, b2)
    intermediate = torch.einsum("...ij,pj->...ip", reshaped, w2)
    result = torch.einsum("...ip,qi->...qp", intermediate, w1)
    return result.reshape(*value.shape[:-1], a1 * a2)


class _TokenLoRAMixin:
    def forward(self, value, *args, **kwargs):
        result = super().forward(value, *args, **kwargs)
        adapters = getattr(self, "bv_krea2_token_adapters", None)
        runtime = _RUNTIME.get()
        if not adapters or runtime is None or not torch.is_tensor(value) or value.ndim not in (3, 4, 5):
            return result
        cache = self.__dict__.setdefault("_bv_krea2_token_cast", {})
        for uid, adapter in adapters.items():
            mask = runtime.token_masks.get(uid)
            if mask is None:
                continue
            adapted = _adapt_mask(mask, value)
            if adapted is None:
                continue
            kind, first, second, scale = adapter
            cache_key = (uid, value.device, value.dtype)
            if cache_key not in cache:
                cache[cache_key] = (
                    first.to(device=value.device, dtype=value.dtype),
                    second.to(device=value.device, dtype=value.dtype),
                )
            first_cast, second_cast = cache[cache_key]
            if kind == "lokr":
                if int(first_cast.shape[1]) * int(second_cast.shape[1]) != int(value.shape[-1]):
                    continue
                delta = _apply_kronecker(value, first_cast, second_cast)
            else:
                delta = F.linear(F.linear(value, first_cast), second_cast)
            result = result + delta * (
                float(scale) * adapted.to(device=result.device, dtype=result.dtype)
            )
        return result


def _token_lora_class(base_class: type) -> type:
    if base_class not in _CLASS_CACHE:
        _CLASS_CACHE[base_class] = type(
            f"BVKrea2Token{base_class.__name__}", (_TokenLoRAMixin, base_class), {}
        )
    return _CLASS_CACHE[base_class]


def _patched_module(module: torch.nn.Module) -> torch.nn.Module:
    patched = copy.copy(module)
    if isinstance(module, _TokenLoRAMixin):
        patched.bv_krea2_token_adapters = dict(
            getattr(module, "bv_krea2_token_adapters", {})
        )
    else:
        patched.__class__ = _token_lora_class(module.__class__)
        patched.bv_krea2_token_adapters = {}
    patched.__dict__.pop("_bv_krea2_token_cast", None)
    return patched


def _module_lookup(
    diffusion_model: Any,
    excluded_fragments: tuple[str, ...] = (),
) -> tuple[dict[str, str], dict[str, str]]:
    maskable: dict[str, str] = {}
    all_linear: dict[str, str] = {}
    for name, module in diffusion_model.named_modules():
        weight = getattr(module, "weight", None)
        if not torch.is_tensor(weight) or weight.ndim != 2 or not callable(module):
            continue
        for key in (name, name.replace(".", "_")):
            all_linear[key] = name
            if (
                name.startswith(("blocks.", "txtfusion.", "txtmlp", "first", "last"))
                and not any(fragment in name for fragment in excluded_fragments)
            ):
                maskable[key] = name
    return maskable, all_linear


def _inject_adapter(
    model: Any,
    state: dict[str, Any],
    spec: TokenLoRASpec,
    excluded_fragments: tuple[str, ...] = (),
) -> tuple[int, list[str], list[str]]:
    normalized = _normalize_lora_state(state)
    diffusion_model = model.get_model_object("diffusion_model")
    maskable, all_linear = _module_lookup(diffusion_model, excluded_fragments)
    patched_count = 0
    unmatched: list[str] = []
    unmaskable: list[str] = []
    for key, adapter in normalized.items():
        path = maskable.get(key) or maskable.get(key.replace(".", "_"))
        if path is None:
            full_path = all_linear.get(key) or all_linear.get(key.replace(".", "_"))
            if full_path is not None:
                unmaskable.append(key)
            else:
                unmatched.append(key)
            continue
        object_path = f"diffusion_model.{path}"
        target = _patched_module(model.get_model_object(object_path))
        if adapter["kind"] == "lokr":
            target.bv_krea2_token_adapters[spec.uid] = (
                "lokr", adapter["w1"], adapter["w2"],
                spec.strength * float(adapter["alpha_scale"]),
            )
        else:
            rank = int(adapter["down"].shape[0])
            alpha = float(adapter.get("alpha", rank))
            target.bv_krea2_token_adapters[spec.uid] = (
                "lora", adapter["down"], adapter["up"], spec.strength * alpha / rank,
            )
        model.add_object_patch(object_path, target)
        patched_count += 1
    return patched_count, unmatched, unmaskable


def build_token_masks(
    specs: list[TokenLoRASpec],
    slots: list[Krea2RegionalSlot],
    text_tokens: int,
    target_image_tokens: int,
    reference_image_tokens: int,
    aspect_ratio: float,
    device: torch.device,
    scope_masks: dict[str, torch.Tensor] | None = None,
) -> dict[str, torch.Tensor]:
    raw_text_tokens = sum(slot.token_count for slot in slots)
    if text_tokens < raw_text_tokens:
        raise RuntimeError(
            f"Krea 2 token LoRA context has {text_tokens} tokens, expected at least {raw_text_tokens}"
        )
    grid_height, grid_width = _grid_for_tokens(target_image_tokens, aspect_ratio)
    total = text_tokens + target_image_tokens + reference_image_tokens
    prefix = text_tokens - raw_text_tokens
    available_masks = dict(scope_masks or {})
    for slot in slots:
        if slot.scope and slot.mask is not None:
            available_masks.setdefault(slot.scope, slot.mask)
    result: dict[str, torch.Tensor] = {}
    for spec in specs:
        vector = torch.zeros(total, device=device, dtype=torch.float32)
        if "global" in spec.scopes:
            vector.fill_(1.0)
        else:
            offset = prefix
            image_value = torch.zeros(target_image_tokens, device=device, dtype=torch.float32)
            for slot in slots:
                end = offset + slot.token_count
                if slot.scope in spec.scopes:
                    vector[offset:end] = 1.0
                offset = end
            for scope in spec.scopes:
                mask = available_masks.get(scope)
                if mask is None:
                    continue
                coverage = F.interpolate(
                    mask.unsqueeze(1), size=(grid_height, grid_width),
                    mode="bilinear", align_corners=False,
                ).reshape(target_image_tokens)
                image_value = torch.maximum(image_value, coverage.to(device=device))
            vector[text_tokens:text_tokens + target_image_tokens] = image_value
        result[spec.uid] = vector[None, :, None]
    return result


@dataclass
class Krea2TokenLoRAPatch:
    specs: list[TokenLoRASpec]
    slots: list[Krea2RegionalSlot]
    aspect_ratio: float
    scope_masks: dict[str, torch.Tensor]
    report: TokenLoRAReport
    _cache: dict[tuple[Any, ...], dict[str, torch.Tensor]] = field(default_factory=dict, init=False)

    def masks(self, text_tokens: int, target_tokens: int, reference_tokens: int, device: torch.device):
        key = (text_tokens, target_tokens, reference_tokens, device)
        if key not in self._cache:
            self._cache[key] = build_token_masks(
                self.specs, self.slots, text_tokens, target_tokens, reference_tokens,
                self.aspect_ratio, device, self.scope_masks,
            )
        return self._cache[key]


def _reference_token_count(ref_latents: Any, patch_size: int) -> int:
    total = 0
    for reference in ref_latents or []:
        if not torch.is_tensor(reference) or reference.ndim not in (4, 5):
            continue
        total += math.ceil(int(reference.shape[-2]) / patch_size) * math.ceil(
            int(reference.shape[-1]) / patch_size
        )
    return total


def _diffusion_wrapper(executor, *args, **kwargs):
    transformer_options = kwargs.pop("transformer_options", None)
    positional = list(args)
    if transformer_options is None and positional and isinstance(positional[-1], dict):
        transformer_options = positional.pop()
    if transformer_options is None:
        transformer_options = {}
    patch: Krea2TokenLoRAPatch | None = transformer_options.get(WRAPPER_KEY)
    consumed_key = f"{WRAPPER_KEY}_consumed"
    if patch is None or transformer_options.get(consumed_key):
        return executor(*positional, transformer_options=transformer_options, **kwargs)

    input_value = positional[0] if positional else kwargs.get("x")
    context = positional[2] if len(positional) > 2 else kwargs.get("context")
    if not torch.is_tensor(input_value) or input_value.ndim not in (4, 5) or not torch.is_tensor(context):
        raise RuntimeError("BV Krea 2 token LoRA expected a 4D/5D latent and tensor context")

    model = executor.class_obj
    patch_size = int(getattr(model, "patch", 0) or 0)
    if patch_size < 1:
        raise RuntimeError("BV Krea 2 token LoRA could not determine the model patch size")
    text_tokens = int(context.shape[1])
    target_tokens = math.ceil(int(input_value.shape[-2]) / patch_size) * math.ceil(
        int(input_value.shape[-1]) / patch_size
    )
    ref_latents = kwargs.get("ref_latents")
    if ref_latents is None and len(positional) > 4:
        ref_latents = positional[4]
    reference_tokens = _reference_token_count(ref_latents, patch_size)
    runtime = _RuntimeContext(
        token_masks=patch.masks(text_tokens, target_tokens, reference_tokens, input_value.device),
        text_tokens=text_tokens,
        image_tokens=target_tokens + reference_tokens,
        text_layers=int(getattr(model, "txtlayers", -1)),
    )
    transformer_options[consumed_key] = True
    token = _RUNTIME.set(runtime)
    try:
        return executor(*positional, transformer_options=transformer_options, **kwargs)
    finally:
        _RUNTIME.reset(token)
        transformer_options.pop(consumed_key, None)


def apply_krea2_token_lora_patch(
    model: Any,
    slots: list[Krea2RegionalSlot],
    aspect_ratio: float,
    document: dict[str, Any],
    scope_stacks: dict[str, Any],
) -> Any:
    specs = build_token_lora_specs(scope_stacks)
    if not specs:
        return model
    try:
        import comfy.patcher_extension
        import comfy.utils
    except ImportError as error:
        raise RuntimeError("Krea 2 token-gated LoRA requires a current ComfyUI installation") from error

    result = model.clone()
    report = TokenLoRAReport(adapters=len(specs))
    loaded: dict[str, dict[str, Any]] = {}
    for spec in specs:
        state = loaded.get(spec.path)
        if state is None:
            state = comfy.utils.load_torch_file(spec.path, safe_load=True)
            loaded[spec.path] = state
        patched, unmatched, unmaskable = _inject_adapter(result, state, spec)
        report.patched_layers += patched
        if unmatched:
            report.unmatched_keys[spec.path] = unmatched
        if unmaskable:
            report.unmaskable_keys[spec.path] = unmaskable
        if patched == 0:
            raise RuntimeError(
                f"Krea 2 token-gated LoRA matched no maskable model layers: {spec.path}. "
                "Use multipass_legacy for this LoRA."
            )
    if report.unmaskable_keys:
        examples = [f"{path}: {keys[:3]}" for path, keys in report.unmaskable_keys.items()]
        raise RuntimeError(
            "Krea 2 token-gated LoRA found model layers without a spatial token axis; "
            "use multipass_legacy. " + "; ".join(examples)
        )
    if report.unmatched_keys:
        logging.warning(
            "BV Krea 2 token LoRA ignored unmatched non-model keys: %s",
            {path: keys[:3] for path, keys in report.unmatched_keys.items()},
        )

    width = int(document["canvas"]["width"])
    height = int(document["canvas"]["height"])
    scope_masks = {
        region["id"]: render_selection(
            {"document": document, "scope": "region", "region_id": region["id"]},
            width,
            height,
        ).detach().float().cpu().clamp(0.0, 1.0)
        for region in document["regions"]
        if region["enabled"]
    }
    patch = Krea2TokenLoRAPatch(specs, slots, float(aspect_ratio), scope_masks, report)
    result.remove_wrappers_with_key(comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY)
    result.add_wrapper_with_key(
        comfy.patcher_extension.WrappersMP.DIFFUSION_MODEL, WRAPPER_KEY, _diffusion_wrapper
    )
    result.model_options.setdefault("transformer_options", {})[WRAPPER_KEY] = patch
    result.set_attachments(WRAPPER_KEY, patch)
    logging.info(
        "BV Krea 2 regional LoRA mode=%s adapters=%d patched_layers=%d",
        report.mode, report.adapters, report.patched_layers,
    )
    return result

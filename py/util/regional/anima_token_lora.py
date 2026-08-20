from __future__ import annotations

import copy
import logging
from dataclasses import dataclass, field
from typing import Any

import torch

from .anima_patcher import WRAPPER_KEY as ANIMA_WRAPPER_KEY
from .krea2_token_lora import (
    TokenLoRAReport,
    TokenLoRASpec,
    _inject_adapter,
    build_token_lora_specs,
)


BACKEND_ID = "anima_token_gated_singlepass"
ATTACHMENT_KEY = "bv_anima_token_lora"


@dataclass
class AnimaTokenLoRAPatch:
    specs: list[TokenLoRASpec]
    report: TokenLoRAReport
    _cache: dict[tuple[Any, ...], dict[str, torch.Tensor]] = field(default_factory=dict, init=False)

    def masks(
        self,
        text_lengths: list[int],
        region_scopes: list[str],
        spatial_masks: torch.Tensor,
        batch_chunks: int,
        batch_size: int,
        device: torch.device,
        *,
        global_only: bool = False,
    ) -> dict[str, torch.Tensor]:
        key = (
            tuple(text_lengths), tuple(region_scopes), tuple(spatial_masks.shape),
            batch_chunks, batch_size, device, global_only,
        )
        if key in self._cache:
            return self._cache[key]

        text_tokens = sum(text_lengths)
        image_tokens = int(spatial_masks.shape[1])
        masks: dict[str, torch.Tensor] = {}
        for spec in self.specs:
            per_chunk = torch.zeros(
                batch_chunks, text_tokens + image_tokens, device=device, dtype=torch.float32
            )
            if "global" in spec.scopes:
                per_chunk.fill_(1.0)
            elif not global_only:
                offset = text_lengths[0]
                for scope, length in zip(region_scopes, text_lengths[1:]):
                    if scope in spec.scopes:
                        per_chunk[:, offset:offset + length] = 1.0
                    offset += length
                image_mask = torch.zeros(image_tokens, device=device, dtype=torch.float32)
                for index, scope in enumerate(region_scopes, start=1):
                    if scope in spec.scopes:
                        spatial_mask = spatial_masks[index].to(
                            device=device, dtype=image_mask.dtype
                        )
                        image_mask = torch.maximum(image_mask, spatial_mask)
                per_chunk[:, text_tokens:] = image_mask
            masks[spec.uid] = per_chunk.repeat_interleave(batch_size, dim=0).unsqueeze(-1)
        self._cache[key] = masks
        return masks


def apply_anima_token_lora_patch(
    model: Any,
    scope_stacks: dict[str, Any],
) -> Any:
    specs = build_token_lora_specs(scope_stacks)
    if not specs:
        return model
    try:
        import comfy.utils
    except ImportError as error:
        raise RuntimeError("Anima token-gated LoRA requires a current ComfyUI installation") from error

    result = model.clone()
    report = TokenLoRAReport(mode="token_gated_singlepass", adapters=len(specs))
    loaded: dict[str, dict[str, Any]] = {}
    for spec in specs:
        state = loaded.get(spec.path)
        if state is None:
            state = comfy.utils.load_torch_file(spec.path, safe_load=True)
            loaded[spec.path] = state
        patched, unmatched, unmaskable = _inject_adapter(
            result, state, spec, excluded_fragments=("adaln_modulation",)
        )
        report.patched_layers += patched
        if unmatched:
            report.unmatched_keys[spec.path] = unmatched
        if unmaskable:
            report.unmaskable_keys[spec.path] = unmaskable
        if patched == 0:
            raise RuntimeError(
                f"Anima token-gated LoRA matched no maskable model layers: {spec.path}. "
                "Use multipass_legacy for this LoRA."
            )
    if report.unmaskable_keys:
        examples = [f"{path}: {keys[:3]}" for path, keys in report.unmaskable_keys.items()]
        raise RuntimeError(
            "Anima token-gated LoRA found model layers without a spatial or regional text axis; "
            "use multipass_legacy. " + "; ".join(examples)
        )
    if report.unmatched_keys:
        logging.warning(
            "BV Anima token LoRA ignored unmatched non-model keys: %s",
            {path: keys[:3] for path, keys in report.unmatched_keys.items()},
        )

    attention_patch = result.model_options.get("transformer_options", {}).get(ANIMA_WRAPPER_KEY)
    if attention_patch is None:
        raise RuntimeError("Apply the Anima regional attention patch before token-gated LoRAs")
    attention_patch = copy.copy(attention_patch)
    attention_patch.token_lora = AnimaTokenLoRAPatch(specs, report)
    result.model_options.setdefault("transformer_options", {})[ANIMA_WRAPPER_KEY] = attention_patch
    result.set_attachments(ANIMA_WRAPPER_KEY, attention_patch)
    result.set_attachments(ATTACHMENT_KEY, attention_patch.token_lora)
    logging.info(
        "BV Anima regional LoRA mode=%s adapters=%d patched_layers=%d",
        report.mode, report.adapters, report.patched_layers,
    )
    return result

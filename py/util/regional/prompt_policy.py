"""Shared interpretation of the existing Regional negative mode."""
from typing import Any
import torch
from .document import region_used_for

ANIMA_SCOPED_NEGATIVE = "bv_anima_scoped_negative_v1"


def use_negative_prompts(document: dict[str, Any]) -> bool:
    mode = document["negative_mode"]
    if mode == "zero_out":
        return False
    if mode == "prompt":
        return True
    return (
        any(document["prompts"][scope]["negative_source"].strip()
            for scope in ("global", "background"))
        or any(region_used_for(region, "generation")
               and region["prompts"]["negative_source"].strip()
               for region in document["regions"])
    )


def zero_encoded(embedding, metadata):
    return torch.zeros_like(embedding), {
        key: torch.zeros_like(value) if torch.is_tensor(value) and key != "attention_mask" else value
        for key, value in metadata.items()
    }


def mask_cfg_padding(bias, slots, text_offset, options):
    """Mask per-polarity slot padding even when the host ignores text masks."""
    if not any(slot.positive_token_count != slot.negative_token_count for slot in slots):
        return bias
    order = options.get("cond_or_uncond")
    if not order or bias.shape[0] % len(order):
        raise RuntimeError("Regional CFG padding requires valid cond_or_uncond batch metadata")
    result = bias.clone()
    batch = bias.shape[0] // len(order)
    for chunk, polarity in enumerate(order):
        offset = text_offset
        for slot in slots:
            count = slot.negative_token_count if polarity == 1 else slot.positive_token_count
            count = slot.token_count if count is None else count
            result[chunk*batch:(chunk+1)*batch, :, :, offset+count:offset+slot.token_count] = float("-inf")
            offset += slot.token_count
    return result

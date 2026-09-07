"""Shared allocation budget for dense regional attention biases."""

import torch


# Preserve the former 96M-entry allowance for one FP16/BF16 mask in bytes.
# Higher batch sizes and wider dtypes consume this same budget, not multiples.
# This limits one bias only: model weights, attention, cached masks, additions
# and other temporary copies remain outside it. It cannot guarantee no OOM.
MAX_DENSE_MASK_BYTES = 96_000_000 * 2


def check_dense_mask_budget(total: int, batch: int, dtype: torch.dtype, label: str) -> None:
    required = batch * total * total * torch.empty((), dtype=dtype).element_size()
    if required > MAX_DENSE_MASK_BYTES:
        raise RuntimeError(
            f"{label} regional attention mask would allocate {required / 1024**3:.2f} GiB "
            f"(batch={batch}, tokens={total}, dtype={dtype}); "
            f"the per-mask budget is {MAX_DENSE_MASK_BYTES / 1024**3:.2f} GiB. "
            "Reduce batch size or canvas size, or use BV Regional Native Conditioning"
        )

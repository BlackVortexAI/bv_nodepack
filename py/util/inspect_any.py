from __future__ import annotations

import json
import math
from dataclasses import dataclass
from typing import Any


DEFAULT_MAX_CHARS = 16_384
DEFAULT_MAX_DEPTH = 6
DEFAULT_MAX_ITEMS = 128
DEFAULT_MAX_LINES = 256


@dataclass(frozen=True)
class InspectedValue:
    text: str
    type_name: str
    truncated: bool


class _Budget:
    def __init__(self, max_depth: int, max_items: int, max_chars: int):
        self.max_depth = max_depth
        self.remaining_items = max_items
        self.remaining_chars = max_chars
        self.structure_truncated = False

    def take(self) -> bool:
        if self.remaining_items <= 0:
            self.structure_truncated = True
            return False
        self.remaining_items -= 1
        return True

    def clip(self, text: str) -> str:
        if len(text) <= self.remaining_chars:
            self.remaining_chars -= len(text)
            return text
        marker = "… truncated (value limit)"
        available = max(0, self.remaining_chars)
        self.remaining_chars = 0
        self.structure_truncated = True
        if available <= len(marker):
            return marker[:available]
        return text[: available - len(marker)] + marker


def _qualified_type(value: object) -> str:
    cls = type(value)
    return cls.__name__ if cls.__module__ == "builtins" else f"{cls.__module__}.{cls.__name__}"


def _safe_attribute(value: object, name: str) -> Any:
    try:
        return getattr(value, name)
    except Exception:
        return None


def _safe_metadata(value: object, name: str) -> str | None:
    candidate = _safe_attribute(value, name)
    if candidate is None:
        return None
    try:
        return str(candidate)[:160]
    except Exception:
        return None


def _shape(value: object) -> str | None:
    candidate = _safe_attribute(value, "shape")
    if candidate is None:
        return None
    dimensions: list[object] = []
    try:
        iterator = iter(candidate)
        for _index in range(17):
            try:
                dimensions.append(next(iterator))
            except StopIteration:
                break
    except Exception:
        return None
    if len(dimensions) > 16:
        dimensions = dimensions[:16] + ["…"]
    parts: list[str] = []
    for dimension in dimensions:
        if dimension == "…":
            parts.append("…")
            continue
        try:
            parts.append(str(int(dimension)))
        except Exception:
            parts.append("?")
    return f"[{', '.join(parts)}]"


def _heavy_summary(value: object) -> str | None:
    type_name = _qualified_type(value)
    lowered = type_name.lower()
    tensor_named = (
        lowered.startswith(("torch.", "numpy."))
        or any(token in lowered for token in ("tensor", "ndarray", "image", "latent"))
    )
    shape = _shape(value) if tensor_named else None
    tensor_like = tensor_named and shape is not None
    comfy_heavy = any(token in lowered for token in (
        "modelpatcher", "clip", "vae", "controlnet", "sampler", "guider", "conditioning"
    ))
    if not tensor_like and not comfy_heavy:
        return None
    details = [type_name]
    if shape is not None:
        details.append(f"shape={shape}")
    for name in ("dtype", "device"):
        metadata = _safe_metadata(value, name)
        if metadata:
            details.append(f"{name}={metadata}")
    return f"<{' '.join(details)}>"


def _scalar(value: object) -> object:
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value if value.bit_length() <= 4096 else f"<int bits={value.bit_length()}>"
    if isinstance(value, float):
        if math.isnan(value):
            return "NaN"
        if math.isinf(value):
            return "Infinity" if value > 0 else "-Infinity"
        return value
    return None


def _project(value: object, budget: _Budget, seen: set[int], depth: int) -> object:
    if isinstance(value, str):
        return budget.clip(value)
    scalar = _scalar(value)
    if scalar is not None or value is None:
        return scalar
    if isinstance(value, (bytes, bytearray, memoryview)):
        try:
            length = len(value)
            raw = value[:32].tobytes() if isinstance(value, memoryview) else bytes(value[:32])
        except Exception:
            return f"<{_qualified_type(value)} unreadable>"
        suffix = " …" if length > 32 else ""
        if suffix:
            budget.structure_truncated = True
        return f"<{_qualified_type(value)} length={length} hex={raw.hex(' ')}{suffix}>"
    heavy = _heavy_summary(value)
    if heavy is not None:
        return heavy
    if depth >= budget.max_depth:
        budget.structure_truncated = True
        return "… truncated (depth limit)"

    is_container = isinstance(value, (dict, list, tuple, set, frozenset))
    identity = id(value)
    if is_container and identity in seen:
        budget.structure_truncated = True
        return "… truncated (cycle)"
    if is_container:
        seen.add(identity)
    try:
        if isinstance(value, dict):
            projected: dict[str, object] = {}
            for key, item in value.items():
                if not budget.take():
                    projected["…"] = "truncated (item limit)"
                    break
                if isinstance(key, str):
                    label = budget.clip(key)
                elif isinstance(key, int) and not isinstance(key, bool) and key.bit_length() > 4096:
                    label = f"<int bits={key.bit_length()}>"
                elif isinstance(key, (type(None), bool, int, float)):
                    label = str(key)
                else:
                    label = f"<{_qualified_type(key)}>"
                projected[label] = _project(item, budget, seen, depth + 1)
            return projected
        if isinstance(value, (list, tuple)):
            projected_items: list[object] = []
            for item in value:
                if not budget.take():
                    projected_items.append("… truncated (item limit)")
                    break
                projected_items.append(_project(item, budget, seen, depth + 1))
            return projected_items
        if isinstance(value, (set, frozenset)):
            return f"<{_qualified_type(value)} length={len(value)}>"
    finally:
        if is_container:
            seen.discard(identity)
    return f"<{_qualified_type(value)}>"


def _encode(projected: object, original: object) -> str:
    if isinstance(original, str):
        return str(projected)
    if original is None:
        return "None"
    if isinstance(original, bool):
        return "True" if original else "False"
    if isinstance(original, int):
        return str(projected)
    if isinstance(original, float):
        return str(original) if math.isfinite(original) else str(projected)
    if isinstance(projected, str) and not isinstance(original, (dict, list, tuple)):
        return projected
    return json.dumps(projected, ensure_ascii=False, indent=2)


def _limit_text(text: str, max_chars: int, max_lines: int) -> tuple[str, bool]:
    truncated = False
    lines = text.splitlines(keepends=True)
    if len(lines) > max_lines:
        marker = "\n… truncated (line limit)"
        text = "".join(lines[:max_lines])
        text = text[: max(0, max_chars - len(marker))] + marker
        truncated = True
    if len(text) > max_chars:
        marker = "\n… truncated (character limit)"
        text = text[: max(0, max_chars - len(marker))] + marker
        truncated = True
    return text, truncated


def inspect_value(
    value: object,
    *,
    max_chars: int = DEFAULT_MAX_CHARS,
    max_depth: int = DEFAULT_MAX_DEPTH,
    max_items: int = DEFAULT_MAX_ITEMS,
    max_lines: int = DEFAULT_MAX_LINES,
) -> InspectedValue:
    budget = _Budget(max_depth=max_depth, max_items=max_items, max_chars=max_chars)
    try:
        projected = _project(value, budget, set(), 0)
        text = _encode(projected, value)
    except Exception:
        text = f"<{_qualified_type(value)} could not be inspected>"
    text, text_truncated = _limit_text(text, max_chars=max_chars, max_lines=max_lines)
    return InspectedValue(text, _qualified_type(value), budget.structure_truncated or text_truncated)

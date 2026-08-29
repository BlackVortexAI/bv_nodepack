"""PROTOTYPE: small, dependency-free 3D LUT helpers for the LUT side branch."""

from __future__ import annotations

import math
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F


LUT_TYPE = "BV_LUT_PROTOTYPE"
MAX_CUBE_BYTES = 16 * 1024 * 1024


def _identity(rgb: torch.Tensor) -> torch.Tensor:
    return rgb


def _warm_contrast(rgb: torch.Tensor) -> torch.Tensor:
    contrast = torch.clamp((rgb - 0.5) * 1.12 + 0.5, 0.0, 1.0)
    return contrast * torch.tensor([1.06, 1.0, 0.93])


def _cool_graphite(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    muted = rgb * 0.72 + luminance.unsqueeze(-1) * 0.28
    shadows = (1.0 - luminance).unsqueeze(-1)
    return muted + shadows * torch.tensor([-0.015, 0.005, 0.035])


def _digital_green(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    muted = rgb * 0.68 + luminance.unsqueeze(-1) * 0.32
    shadows = (1.0 - luminance).unsqueeze(-1)
    return muted * torch.tensor([0.94, 1.04, 0.88]) + shadows * torch.tensor([-0.01, 0.025, -0.015])


def _machine_blue(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    muted = rgb * 0.74 + luminance.unsqueeze(-1) * 0.26
    shadows = (1.0 - luminance).unsqueeze(-1)
    return muted * torch.tensor([0.9, 0.98, 1.07]) + shadows * torch.tensor([-0.015, 0.008, 0.035])


def _dustfire(rgb: torch.Tensor) -> torch.Tensor:
    contrast = (rgb - 0.5) * 1.16 + 0.5
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    shadows = (1.0 - luminance).unsqueeze(-1)
    return contrast * torch.tensor([1.12, 0.94, 0.72]) + shadows * torch.tensor([-0.01, 0.01, 0.025])


def _steel_action(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    muted = rgb * 0.5 + luminance.unsqueeze(-1) * 0.5
    contrast = (muted - 0.5) * 1.12 + 0.5
    return contrast + (1.0 - luminance).unsqueeze(-1) * torch.tensor([-0.01, 0.005, 0.025])


def _sunbleached_coast(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    softened = (rgb - 0.5) * 0.9 + 0.55
    highlights = luminance.unsqueeze(-1)
    return softened * torch.tensor([1.06, 1.025, 0.9]) + highlights * torch.tensor([0.025, 0.018, -0.01])


def _expired_film(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    faded = (rgb - 0.5) * 0.84 + 0.53
    split = (luminance - 0.5).unsqueeze(-1)
    return faded + split * torch.tensor([0.06, -0.05, 0.045])


def _classic_monochrome(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.299, 0.587, 0.114])
    filmic = (luminance - 0.5) * 1.08 + 0.5
    return filmic.unsqueeze(-1).expand_as(rgb)


def _grayscale(rgb: torch.Tensor) -> torch.Tensor:
    luminance = rgb @ torch.tensor([0.2126, 0.7152, 0.0722])
    return luminance.unsqueeze(-1).expand_as(rgb)


def _hdr_color_boost(rgb: torch.Tensor) -> torch.Tensor:
    luminance = (rgb @ torch.tensor([0.2126, 0.7152, 0.0722])).unsqueeze(-1)
    saturated = luminance + (rgb - luminance) * 1.25
    return (saturated - 0.5) * 1.16 + 0.5


BUILTIN_LUT_REGISTRY = {
    "Identity": _identity,
    "Warm Contrast": _warm_contrast,
    "Cool Graphite": _cool_graphite,
    "Digital Green": _digital_green,
    "Machine Blue": _machine_blue,
    "Dustfire": _dustfire,
    "Steel Action": _steel_action,
    "Sunbleached Coast": _sunbleached_coast,
    "Expired Film": _expired_film,
    "Classic Monochrome": _classic_monochrome,
    "Grayscale": _grayscale,
    "HDR Color Boost": _hdr_color_boost,
}
BUILTIN_LUT_NAMES = tuple(BUILTIN_LUT_REGISTRY)


def _finite_triplet(values: list[str], label: str) -> torch.Tensor:
    if len(values) != 3:
        raise ValueError(f"{label} requires exactly three values")
    result = torch.tensor([float(value) for value in values], dtype=torch.float32)
    if not torch.isfinite(result).all():
        raise ValueError(f"{label} values must be finite")
    return result


def parse_cube(path: Path) -> dict[str, Any]:
    """Parse the useful 3D subset of the common .cube text format."""
    if path.stat().st_size > MAX_CUBE_BYTES:
        raise ValueError(f".cube file exceeds the {MAX_CUBE_BYTES // (1024 * 1024)} MiB prototype limit")
    size = None
    title = path.stem
    domain_min = torch.zeros(3, dtype=torch.float32)
    domain_max = torch.ones(3, dtype=torch.float32)
    entries: list[list[float]] = []
    for line_number, raw in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        key = parts[0].upper()
        if key == "TITLE":
            title = line[len(parts[0]):].strip().strip('"') or title
        elif key == "LUT_3D_SIZE":
            if size is not None:
                raise ValueError(f"line {line_number}: duplicate LUT_3D_SIZE")
            if len(parts) != 2:
                raise ValueError(f"line {line_number}: LUT_3D_SIZE requires one integer")
            size = int(parts[1])
            if size < 2 or size > 65:
                raise ValueError("LUT_3D_SIZE must be between 2 and 65 for this prototype")
        elif key == "LUT_1D_SIZE":
            raise ValueError("1D .cube LUTs are not supported by this prototype")
        elif key == "DOMAIN_MIN":
            domain_min = _finite_triplet(parts[1:], "DOMAIN_MIN")
        elif key == "DOMAIN_MAX":
            domain_max = _finite_triplet(parts[1:], "DOMAIN_MAX")
        else:
            try:
                entry = [float(value) for value in parts]
            except ValueError as error:
                raise ValueError(f"line {line_number}: unsupported .cube directive {parts[0]!r}") from error
            if len(entry) != 3 or not all(math.isfinite(value) for value in entry):
                raise ValueError(f"line {line_number}: LUT entry must contain three finite values")
            entries.append(entry)
    if size is None:
        raise ValueError(".cube file has no LUT_3D_SIZE")
    if torch.any(domain_max <= domain_min):
        raise ValueError("DOMAIN_MAX must be greater than DOMAIN_MIN on every channel")
    if len(entries) != size ** 3:
        raise ValueError(f"expected {size ** 3} LUT entries, found {len(entries)}")
    # .cube convention: red changes fastest, then green, then blue.
    table = torch.tensor(entries, dtype=torch.float32).reshape(size, size, size, 3).contiguous()
    return {
        "schema": "bv.lut.prototype",
        "version": 1,
        "title": title,
        "size": size,
        "domain_min": domain_min,
        "domain_max": domain_max,
        "table": table,
        "source": str(path),
    }


def builtin_lut(name: str, size: int = 17) -> dict[str, Any]:
    axis = torch.linspace(0.0, 1.0, size, dtype=torch.float32)
    blue, green, red = torch.meshgrid(axis, axis, axis, indexing="ij")
    rgb = torch.stack((red, green, blue), dim=-1)
    transform = BUILTIN_LUT_REGISTRY.get(name)
    if transform is None:
        raise ValueError(f"unknown built-in LUT: {name}")
    result = transform(rgb)
    return {
        "schema": "bv.lut.prototype",
        "version": 1,
        "title": f"BV {name}",
        "size": size,
        "domain_min": torch.zeros(3),
        "domain_max": torch.ones(3),
        "table": result.clamp(0.0, 1.0).contiguous(),
        "source": f"builtin:{name}",
    }


def apply_lut(image: torch.Tensor, lut: dict[str, Any]) -> torch.Tensor:
    if not isinstance(lut, dict) or lut.get("schema") != "bv.lut.prototype":
        raise ValueError("lut must be a BV_LUT_PROTOTYPE")
    if image.ndim != 4 or image.shape[-1] < 3:
        raise ValueError("IMAGE must have shape B,H,W,C with at least three channels")
    device = image.device
    rgb = image[..., :3].to(dtype=torch.float32)
    domain_min = lut["domain_min"].to(device=device, dtype=torch.float32)
    domain_max = lut["domain_max"].to(device=device, dtype=torch.float32)
    coords = ((rgb - domain_min) / (domain_max - domain_min)).clamp(0.0, 1.0)
    # grid_sample expects coordinates in x,y,z order. The volume is D=blue,H=green,W=red.
    grid = (coords * 2.0 - 1.0).unsqueeze(1)
    table = lut["table"].to(device=device, dtype=torch.float32).permute(3, 0, 1, 2).unsqueeze(0)
    table = table.expand(image.shape[0], -1, -1, -1, -1)
    graded = F.grid_sample(table, grid, mode="bilinear", padding_mode="border", align_corners=True)
    graded = graded.squeeze(2).permute(0, 2, 3, 1)
    if image.shape[-1] > 3:
        graded = torch.cat((graded, image[..., 3:].to(torch.float32)), dim=-1)
    return graded.to(dtype=image.dtype)


def normalize_mask(mask: torch.Tensor | None, image: torch.Tensor) -> torch.Tensor:
    batch, height, width = int(image.shape[0]), int(image.shape[1]), int(image.shape[2])
    if mask is None:
        return torch.ones((batch, height, width), device=image.device, dtype=torch.float32)
    value = mask.to(device=image.device, dtype=torch.float32)
    if value.ndim == 2:
        value = value.unsqueeze(0)
    if value.ndim != 3:
        raise ValueError("MASK must have shape H,W or B,H,W")
    if value.shape[-2:] != (height, width):
        value = F.interpolate(value.unsqueeze(1), size=(height, width), mode="bilinear", align_corners=False).squeeze(1)
    if value.shape[0] == 1 and batch > 1:
        value = value.expand(batch, -1, -1)
    if value.shape[0] != batch:
        raise ValueError("MASK batch must be one or match IMAGE batch")
    return value.clamp(0.0, 1.0)


def refine_mask(mask: torch.Tensor, grow: int = 0, feather: int = 0, threshold: float = 0.0) -> torch.Tensor:
    """Apply deterministic post-detection morphology and feathering to B,H,W masks."""
    value = mask.to(dtype=torch.float32).clamp(0.0, 1.0)
    if value.ndim != 3:
        raise ValueError("MASK must have shape B,H,W")
    threshold = float(threshold)
    if threshold < 0.0 or threshold > 1.0:
        raise ValueError("mask threshold must be between zero and one")
    if threshold > 0.0:
        value = (value >= threshold).to(value.dtype)
    radius = abs(int(grow))
    if radius:
        kernel = radius * 2 + 1
        framed = value.unsqueeze(1)
        if grow > 0:
            framed = F.max_pool2d(framed, kernel, stride=1, padding=radius)
        else:
            framed = 1.0 - F.max_pool2d(1.0 - framed, kernel, stride=1, padding=radius)
        value = framed.squeeze(1)
    radius = int(feather)
    if radius < 0 or radius > 256:
        raise ValueError("mask feather must be between zero and 256 pixels")
    if radius:
        sigma = max(radius / 3.0, 0.5)
        coordinates = torch.arange(-radius, radius + 1, device=value.device, dtype=torch.float32)
        kernel = torch.exp(-(coordinates.square()) / (2.0 * sigma * sigma))
        kernel /= kernel.sum()
        framed = value.unsqueeze(1)
        framed = F.conv2d(framed, kernel.view(1, 1, 1, -1), padding=(0, radius))
        framed = F.conv2d(framed, kernel.view(1, 1, -1, 1), padding=(radius, 0))
        value = framed.squeeze(1)
    return value.clamp(0.0, 1.0)


def select_segs(segs: Any, mode: str, index: int = 0) -> tuple[Any, str]:
    if not isinstance(segs, (tuple, list)) or len(segs) != 2:
        raise ValueError("detector did not return a valid SEGS bundle")
    items = list(segs[1])
    if not items or mode == "combined":
        return (segs[0], items), f"combined {len(items)} detection(s)"
    if mode == "largest":
        def area(item):
            box = getattr(item, "bbox", None)
            if box is None:
                box = getattr(item, "crop_region", None)
            if box is None or len(box) < 4:
                return 0
            return max(0, int(box[2]) - int(box[0])) * max(0, int(box[3]) - int(box[1]))
        selected = max(items, key=area)
        return (segs[0], [selected]), f"largest of {len(items)} detection(s)"
    if mode == "index":
        position = int(index)
        if position < 0 or position >= len(items):
            return (segs[0], []), f"index {position} unavailable; {len(items)} detection(s)"
        return (segs[0], [items[position]]), f"index {position} of {len(items)} detection(s)"
    raise ValueError(f"unknown instance selection mode: {mode}")

from __future__ import annotations

import math
import base64
import io
from typing import Any

import torch
import torch.nn.functional as functional
from PIL import Image, ImageDraw

from .document import parse_document, region_used_for


def _rect(shape: dict[str, Any], width: int, height: int) -> torch.Tensor:
    x0 = max(0, min(width, round(shape["x"] * width)))
    y0 = max(0, min(height, round(shape["y"] * height)))
    x1 = max(x0, min(width, round((shape["x"] + shape["width"]) * width)))
    y1 = max(y0, min(height, round((shape["y"] + shape["height"]) * height)))
    result = torch.zeros((height, width), dtype=torch.float32)
    result[y0:y1, x0:x1] = 1.0
    return result


def _ellipse(shape: dict[str, Any], width: int, height: int) -> torch.Tensor:
    image = Image.new("L", (width, height), 0)
    ImageDraw.Draw(image).ellipse((shape["x"] * width, shape["y"] * height, (shape["x"] + shape["width"]) * width, (shape["y"] + shape["height"]) * height), fill=255)
    return torch.frombuffer(bytearray(image.tobytes()), dtype=torch.uint8).reshape(height, width).float() / 255.0


def _polygon(shape: dict[str, Any], width: int, height: int) -> torch.Tensor:
    image = Image.new("L", (width, height), 0)
    ImageDraw.Draw(image).polygon([(point["x"] * width, point["y"] * height) for point in shape["points"]], fill=255)
    return torch.frombuffer(bytearray(image.tobytes()), dtype=torch.uint8).reshape(height, width).float() / 255.0


def _brush(shape: dict[str, Any], width: int, height: int) -> torch.Tensor:
    result = torch.zeros((height, width), dtype=torch.float32)
    yy, xx = torch.meshgrid(torch.arange(height), torch.arange(width), indexing="ij")
    radius = max(0.5, shape["size"] * min(width, height) * 0.5)
    points = shape["points"]
    samples: list[tuple[float, float, float]] = []
    for index, point in enumerate(points):
        if index == 0:
            samples.append((point["x"] * width, point["y"] * height, point["pressure"]))
            continue
        previous = points[index - 1]
        dx = (point["x"] - previous["x"]) * width
        dy = (point["y"] - previous["y"]) * height
        steps = max(1, math.ceil(math.hypot(dx, dy) / max(radius * 0.5, 1.0)))
        for step in range(1, steps + 1):
            ratio = step / steps
            samples.append(((previous["x"] + (point["x"] - previous["x"]) * ratio) * width, (previous["y"] + (point["y"] - previous["y"]) * ratio) * height, previous["pressure"] + (point["pressure"] - previous["pressure"]) * ratio))
    hardness = shape["hardness"]
    for x, y, pressure in samples:
        if shape.get("shape", "round") == "square":
            distance = torch.maximum(torch.abs(xx - x), torch.abs(yy - y)) / radius
        else:
            distance = torch.sqrt((xx - x) ** 2 + (yy - y) ** 2) / radius
        if hardness >= 1:
            alpha = (distance <= 1).float()
        else:
            alpha = ((1 - distance) / max(1 - hardness, 1e-6)).clamp(0, 1)
            alpha = torch.where(distance <= hardness, torch.ones_like(alpha), alpha)
        result = torch.maximum(result, alpha * shape["opacity"] * pressure)
    return result


def _raster(shape: dict[str, Any], width: int, height: int) -> torch.Tensor:
    payload = base64.b64decode(shape["data_url"].split(",", 1)[1], validate=True)
    with Image.open(io.BytesIO(payload)) as source:
        source.load()
        if source.format != "PNG" or source.width != shape["pixel_width"] or source.height != shape["pixel_height"]:
            raise ValueError("raster_mask PNG dimensions do not match its document metadata")
        alpha = source.convert("RGBA").getchannel("A")
        x0 = max(0, min(width - 1, round(shape["x"] * width)))
        y0 = max(0, min(height - 1, round(shape["y"] * height)))
        x1 = max(x0 + 1, min(width, round((shape["x"] + shape["width"]) * width)))
        y1 = max(y0 + 1, min(height, round((shape["y"] + shape["height"]) * height)))
        alpha = alpha.resize((x1 - x0, y1 - y0), Image.Resampling.BILINEAR)
        values = torch.frombuffer(bytearray(alpha.tobytes()), dtype=torch.uint8).reshape(y1 - y0, x1 - x0).float() / 255.0
    result = torch.zeros((height, width), dtype=torch.float32)
    result[y0:y1, x0:x1] = values
    return result


def _feather(mask: torch.Tensor, amount: float, width: int, height: int) -> torch.Tensor:
    radius = min(64, round(amount * min(width, height)))
    if radius < 1:
        return mask
    sigma = max(radius / 3, 0.5)
    coords = torch.arange(-radius, radius + 1, dtype=torch.float32)
    kernel = torch.exp(-(coords * coords) / (2 * sigma * sigma))
    kernel /= kernel.sum()
    value = mask[None, None]
    value = functional.conv2d(value, kernel.view(1, 1, 1, -1), padding=(0, radius))
    value = functional.conv2d(value, kernel.view(1, 1, -1, 1), padding=(radius, 0))
    return value[0, 0].clamp(0, 1)


def render_region(region: dict[str, Any], width: int, height: int) -> torch.Tensor:
    layers: dict[str, list[dict[str, Any]]] = {}
    legacy_layer = next((shape["id"] for shape in region["geometry"] if "layer_id" not in shape), "__legacy__")
    for shape in region["geometry"]:
        layer_id = shape.get("layer_id", legacy_layer)
        layers.setdefault(shape.get("mask_group_id", layer_id), []).append(shape)
    mask = torch.zeros((height, width), dtype=torch.float32)
    for shapes in layers.values():
        layer_mask = torch.zeros((height, width), dtype=torch.float32)
        for shape in shapes:
            if not shape.get("enabled", True):
                continue
            renderers = {"rect": _rect, "ellipse": _ellipse, "polygon": _polygon, "raster_mask": _raster, "brush_stroke": _brush}
            shape_mask = renderers[shape["type"]](shape, width, height)
            layer_mask = torch.maximum(layer_mask, shape_mask) if shape["operation"] == "add" else layer_mask * (1 - shape_mask)
        mask = torch.maximum(mask, layer_mask)
    return _feather(mask, region["mask"]["feather"], width, height)


def render_selection(selection: Any, width: int, height: int) -> torch.Tensor:
    document = parse_document(selection["document"])
    if selection["scope"] == "global":
        return torch.ones((1, height, width), dtype=torch.float32)
    enabled = [region for region in document["regions"] if region_used_for(region, "generation")]
    if selection["scope"] == "background":
        union = torch.zeros((height, width), dtype=torch.float32)
        for region in enabled:
            union = torch.maximum(union, render_region(region, width, height))
        return (1 - union).clamp(0, 1)[None]
    region = next(item for item in document["regions"] if item["id"] == selection["region_id"])
    return render_region(region, width, height)[None]


def mask_bbox(mask: torch.Tensor, threshold: float = 0.001) -> tuple[int, int, int, int]:
    points = torch.nonzero(mask.squeeze(0) > threshold)
    if points.numel() == 0:
        return 0, 0, 0, 0
    y0, x0 = points.min(dim=0).values.tolist()
    y1, x1 = points.max(dim=0).values.tolist()
    return int(x0), int(y0), int(x1 - x0 + 1), int(y1 - y0 + 1)

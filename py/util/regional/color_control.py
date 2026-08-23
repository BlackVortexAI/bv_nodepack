from __future__ import annotations

import colorsys
import copy
import hashlib
from typing import Any

import torch

from .context import context_document
from .document import region_used_for
from .mask_renderer import render_region


_CONTROL_PALETTE = (
    (230, 25, 75),
    (60, 180, 75),
    (0, 130, 200),
    (245, 130, 48),
    (145, 30, 180),
    (70, 240, 240),
    (240, 50, 230),
    (210, 245, 60),
    (0, 128, 128),
    (170, 110, 40),
    (128, 0, 0),
    (0, 0, 128),
)


def _stable_region_colors(regions: list[dict[str, Any]]) -> dict[str, tuple[int, int, int]]:
    """Allocate deterministic, document-local control colors independent of UI colors."""
    result: dict[str, tuple[int, int, int]] = {}
    used: set[tuple[int, int, int]] = set()
    for region in sorted(regions, key=lambda item: str(item["id"])):
        digest = hashlib.sha256(str(region["id"]).encode("utf-8")).digest()
        start = int.from_bytes(digest[:4], "big") % len(_CONTROL_PALETTE)
        color = next(
            (candidate for offset in range(len(_CONTROL_PALETTE)) if (candidate := _CONTROL_PALETTE[(start + offset) % len(_CONTROL_PALETTE)]) not in used),
            None,
        )
        if color is None:
            # More regions than the curated palette: deterministic golden-angle probing.
            hue = int.from_bytes(digest[4:8], "big") / 0xFFFFFFFF
            attempt = 0
            while True:
                red, green, blue = colorsys.hsv_to_rgb((hue + attempt * 0.61803398875) % 1.0, 0.82, 0.90)
                color = (round(red * 255), round(green * 255), round(blue * 255))
                if color not in used and color != (255, 255, 255):
                    break
                attempt += 1
        used.add(color)
        result[str(region["id"])] = color
    return result


def compile_color_control(regional: Any) -> tuple[torch.Tensor, dict[str, Any]]:
    """Compile BV_REGIONAL into a solid RGB control image and a machine-readable legend."""
    document = context_document(regional)
    width = int(document["canvas"]["width"])
    height = int(document["canvas"]["height"])
    regions = [region for region in document["regions"] if region_used_for(region, "generation")]
    colors = _stable_region_colors(regions)
    image = torch.ones((height, width, 3), dtype=torch.float32)

    # Larger priority numbers are painted first so P0 wins every overlap.
    for _, region in sorted(enumerate(regions), key=lambda item: (item[1]["priority"], item[0]), reverse=True):
        occupancy_region = copy.deepcopy(region)
        occupancy_region["mask"]["feather"] = 0
        occupancy = render_region(occupancy_region, width, height) > 1e-6
        rgb = colors[str(region["id"])]
        image[occupancy] = torch.tensor(tuple(channel / 255.0 for channel in rgb), dtype=torch.float32)

    legend_regions = []
    for region in sorted(regions, key=lambda item: (item["priority"], str(item["id"]))):
        rgb = colors[str(region["id"])]
        legend_regions.append(
            {
                "id": str(region["id"]),
                "name": region["name"],
                "priority": region["priority"],
                "color": "#" + "".join(f"{channel:02X}" for channel in rgb),
                "rgb": [channel / 255.0 for channel in rgb],
            }
        )

    legend = {
        "schema": "bv.regional.color_control",
        "version": 1,
        "document_id": str(document["document_id"]),
        "background": "#FFFFFF",
        "overlap_policy": "priority_wins",
        "regions": legend_regions,
    }
    return image.unsqueeze(0), legend

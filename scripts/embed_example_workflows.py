from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, PngImagePlugin


ROOT = Path(__file__).resolve().parents[1]
IMAGES = ROOT / "examples" / "images"
WORKFLOWS = ROOT / "examples" / "workflows"

EXAMPLES = {
    "prompt-ast-categories": ((40, 160, 1240, 550), "_ast-full.png"),
    "empty-latent-random-ratio": (None, None),
    "subgraph-ui-layout": (None, None),
    "smart-pipe-wireless-merge": ((40, 160, 1240, 500), "_smart-full.png"),
    "control-center-workflow-states": ((150, 150, 1120, 610), "_control-full.png"),
}

CONFIG_SCREENSHOTS = {
    "smart-pipe-slot-config.png": (180, 175, 1100, 550),
    "smart-pipe-merge-config.png": (250, 195, 1030, 525),
    "control-center-config.png": (180, 80, 1110, 640),
}


for stem, (crop, source_name) in EXAMPLES.items():
    workflow_path = WORKFLOWS / f"{stem}.json"
    source_path = IMAGES / (source_name or f"{stem}.png")
    target_path = IMAGES / f"{stem}.png"
    workflow = json.loads(workflow_path.read_text(encoding="utf-8"))
    with Image.open(source_path) as source:
        image = source.crop(crop) if crop else source.copy()
        metadata = PngImagePlugin.PngInfo()
        metadata.add_text("workflow", json.dumps(workflow, separators=(",", ":"), ensure_ascii=False))
        image.save(target_path, pnginfo=metadata, optimize=True)

for name, crop in CONFIG_SCREENSHOTS.items():
    path = IMAGES / name
    with Image.open(path) as source:
        source.crop(crop).save(path, optimize=True)

for temporary in (IMAGES / "_smart-full.png", IMAGES / "_control-full.png", IMAGES / "_ast-full.png"):
    temporary.unlink(missing_ok=True)

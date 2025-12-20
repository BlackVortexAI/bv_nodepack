# bv_pipe_config.py
from __future__ import annotations
from typing import Dict, Any, List

PIPE = "BV_PIPE"


def _parse_names(raw: str, max_count: int = 100) -> List[str]:
    items: List[str] = []
    for line in (raw or "").replace(",", "\n").splitlines():
        s = line.strip()
        if s:
            items.append(s)
    return items[:max_count]


class BVPipeConfigNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "names": ("STRING", {"default": "model\nclip\nvae", "multiline": True}),
            }
        }

    RETURN_TYPES = (PIPE,)
    RETURN_NAMES = ("pipe",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/pipe"

    def run(self, names: str):
        # store config in the pipe object
        pipe: Dict[str, Any] = {
            "_cfg": {
                "names_raw": names,
                "names": _parse_names(names, 100),
            },
            "items": [],
            "map": {},
        }
        return (pipe,)


NODE_CLASS_MAPPINGS = {
    "BV Pipe Config": BVPipeConfigNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Pipe Config": "🌀 BV Pipe Config",
}

# bv_pipe.py
from __future__ import annotations
from typing import Dict, Any, List

PIPE = "BV_PIPE"

# BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Entire BV Pipe node contract.
# Remove the module and its node-list entry after saved workflows have been migrated to BV Smart Pipe.


class AnyType(str):
    # ComfyUI type-compare hack: makes "ANY" compatible with everything
    def __ne__(self, __value: object) -> bool:
        return False


ANY = AnyType("*")


def _parse_names(raw: str, max_count: int = 100) -> List[str]:
    items: List[str] = []
    for line in (raw or "").replace(",", "\n").splitlines():
        s = line.strip()
        if s:
            items.append(s)
    return items[:max_count]


class BVPipeNode:
    """
    BV Pipe (100 inputs / 100 outputs).
    - Inputs v_001..v_100 are optional ANY.
    - If an input is not provided, value is taken from upstream pipe.items (passthrough).
    - Outputs out_001..out_100 mirror the final resolved values.
    """

    @classmethod
    def INPUT_TYPES(cls):
        optional = {f"v_{i:03d}": (ANY,) for i in range(1, 101)}
        return {
            "required": {
                "pipe": (PIPE,),
            },
            "optional": optional,
        }

    RETURN_TYPES = (PIPE,) + (ANY,) * 100
    RETURN_NAMES = ("pipe",) + tuple([f"out_{i:03d}" for i in range(1, 101)])
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/pipe/Deprecated Legacy Nodes"

    def run(self, pipe: Dict[str, Any], **kwargs):
        pipe = pipe or {}
        cfg = (pipe.get("_cfg", {}) or {})

        # prefer already-parsed names from pipe
        names = cfg.get("names")
        if not names:
            names = _parse_names(cfg.get("names_raw", ""), 100)

        count = len(names)
        upstream_items = pipe.get("items", []) or []

        items: List[Any] = []
        mapping: Dict[str, Any] = {}

        for idx in range(count):
            key = f"v_{idx+1:03d}"

            # override if explicitly provided; else passthrough from upstream pipe
            if key in kwargs:
                val = kwargs.get(key, None)
            else:
                val = upstream_items[idx] if idx < len(upstream_items) else None

            items.append(val)
            mapping[names[idx]] = val

        out_pipe: Dict[str, Any] = {
            "_cfg": {
                "names_raw": cfg.get("names_raw", ""),
                "names": names,
            },
            "items": items,
            "map": mapping,
        }

        outs: List[Any] = [out_pipe]
        # mirror outputs (100 fixed)
        for i in range(100):
            outs.append(items[i] if i < len(items) else None)

        return tuple(outs)


NODE_CLASS_MAPPINGS = {
    "BV Pipe": BVPipeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Pipe": "🌀 BV Pipe [Deprecated]",
}

# py/nodes/bv_subgraph_heading.py
from __future__ import annotations


class BVSubgraphHeading:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                # This is the value you edit
                "value": ("STRING", {"default": "Heading"}),
                "font_size": ("INT", {"default": 20, "min": 10, "max": 60, "step": 1}),
                "show_divider": ("BOOLEAN", {"default": False}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("_",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/subgraph"

    def run(self, value):
        return (value,)


NODE_CLASS_MAPPINGS = {"BV Subgraph Heading": BVSubgraphHeading}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Subgraph Heading": "🌀 BV Subgraph Heading"}

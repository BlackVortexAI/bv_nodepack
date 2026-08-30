from __future__ import annotations

from ..util.inspect_any import inspect_value


class AnyType(str):
    def __ne__(self, _other):
        return False


ANY = AnyType("*")


class BVInspectAnyNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"value": (ANY, {"forceInput": True})}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    OUTPUT_NODE = True
    FUNCTION = "inspect"
    CATEGORY = "🌀 BV Node Pack/utils"
    DESCRIPTION = "Inspect any connected value as bounded, readable text."

    def inspect(self, value):
        inspected = inspect_value(value)
        return {
            "ui": {
                "text": [inspected.text],
                "type_name": [inspected.type_name],
                "truncated": [inspected.truncated],
            },
            "result": (inspected.text,),
        }


NODE_CLASS_MAPPINGS = {"BV Inspect Any": BVInspectAnyNode}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Inspect Any": "🌀 BV Inspect Any"}

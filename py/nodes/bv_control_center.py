import json


class BVControlCenterNode:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "hidden": {
                "config_json": ("STRING", {"default": "{}", "multiline": True}),
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/beta/control"

    def run(self, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {
    "BV Control Center": BVControlCenterNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Control Center": "🌀 BV Control Center"
}

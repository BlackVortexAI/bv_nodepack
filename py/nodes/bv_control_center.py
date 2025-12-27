import json


class BVControlCenterNode:

    @classmethod
    def INPUT_TYPES(cls):
        # Default all booleans to True (ACTIVE by default)
        optional = {
            f"b_{i:03d}": ("BOOLEAN", {"default": True})
            for i in range(1, 101)
        }
        return {
            "required": {
                "config_json": ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": optional,
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("config",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/beta/control"

    def run(self, config_json, **kwargs):
        # kwargs contains b_001..b_100 but we don't need them server-side here.
        try:
            cfg = json.loads(config_json or "{}")
        except Exception:
            cfg = {}

        normalized = json.dumps(cfg, ensure_ascii=False, sort_keys=True, indent=2)
        return (normalized,)


NODE_CLASS_MAPPINGS = {
    "BV Control Center": BVControlCenterNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Control Center": "🌀 BV Control Center"
}

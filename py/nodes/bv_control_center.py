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

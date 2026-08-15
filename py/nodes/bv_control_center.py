import json


class BVControlCenterNode:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "bv_control_config_json": ("STRING", {"default": "{}", "multiline": True}),
            },
        }

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/control"

    @classmethod
    def VALIDATE_INPUTS(cls, bv_control_config_json, **kwargs):
        try:
            config = json.loads(bv_control_config_json)
        except (TypeError, json.JSONDecodeError) as error:
            return f"BV Control Center config is invalid: {error}"
        for control in config.get("controls", []):
            if control.get("enabled", True):
                unresolved = [entry.get("groupPath") or entry.get("groupTitle") for entry in control.get("assignments", []) if entry.get("unresolved")]
                if unresolved:
                    return f"BV Control Center '{control.get('name', 'Unnamed')}' has unresolved groups: {', '.join(unresolved)}"
        return True

    def run(self, bv_control_config_json, **kwargs):
        return ()


NODE_CLASS_MAPPINGS = {
    "BV Control Center": BVControlCenterNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Control Center": "🌀 BV Control Center"
}

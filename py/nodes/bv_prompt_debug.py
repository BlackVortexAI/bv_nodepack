import json

AST = "BV_AST"


class BVPromptASTDebugNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ast": (AST, {}),
            },
            "optional": {
                "pretty": ("BOOLEAN", {"default": True}),
                "indent": ("INT", {"default": 2, "min": 0, "max": 8, "step": 1}),
                "sort_keys": ("BOOLEAN", {"default": False}),
                "debug_output": ("STRING", {"default": "", "multiline": True}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("ast_json",)
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/prompting"

    def run(self, ast, pretty=True, indent=2, sort_keys=False, debug_output=""):
        try:
            if pretty:
                txt = json.dumps(ast, ensure_ascii=False, indent=int(indent), sort_keys=bool(sort_keys))
            else:
                txt = json.dumps(ast, ensure_ascii=False, separators=(",", ":"), sort_keys=bool(sort_keys))
        except Exception as e:
            txt = f"[BV AST Debug] Failed to serialize AST to JSON: {type(e).__name__}: {e}\n\nRaw:\n{repr(ast)}"

        # WICHTIG: UI + result zurückgeben
        return {
            "ui": {
                "ast_json": [txt],        # frei benennbar
            },
            "result": (txt,)             # das ist dein normaler Node-Output
        }


NODE_CLASS_MAPPINGS = {
    "BV Prompt AST Debug": BVPromptASTDebugNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Prompt AST Debug": "🌀 BV Prompt AST Debug",
}

"""Standalone native text with optional, editor-time writing assistance."""


class BVText:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": False})}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "output"
    CATEGORY = "🌀 BV Node Pack/utils"
    DESCRIPTION = "Native text with optional Translate, Improve and Undo controls. Writing assistance runs only when clicked; workflow execution returns the stored text unchanged."

    def output(self, text):
        return (text,)


NODE_CLASS_MAPPINGS = {"BV Text": BVText}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Text": "BV Text"}

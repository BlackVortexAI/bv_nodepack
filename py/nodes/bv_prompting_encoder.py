AST = "BV_AST"

class BVPromptEncodeNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"prompt": "STRING", {d}}
        }

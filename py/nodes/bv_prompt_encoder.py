from ..util.prompt.category import parse_prompt_to_ast, ast_to_plain_text

AST = "BV_AST"

class BVPromptEncodeNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "prompt": ("STRING", {"default": "", "multiline": True})
            }
        }

    RETURN_TYPES = (AST, "STRING")
    RETURN_NAMES = ("ast", "cleaned_prompt")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/prompting"

    def run(self, prompt):
        ast = parse_prompt_to_ast(prompt)
        return (ast, ast_to_plain_text(ast, include_comments=False))


NODE_CLASS_MAPPINGS = {
    "BV Prompt Encode": BVPromptEncodeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Prompt Encode": "🌀 BV Prompt Encode",
}

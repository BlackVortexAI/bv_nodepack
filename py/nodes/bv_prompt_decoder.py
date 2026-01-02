import re

from ..util.prompt.category import parse_prompt_to_ast, ast_to_plain_text, extract_plain_text_by_category

AST = "BV_AST"

def prettify_prompt_text(s: str) -> str:
    """
    Prettify prompt text for readability.

    Rules:
    - Collapse runs of spaces/tabs to a single space (does NOT touch newlines).
    - Normalize commas: no space before ',', exactly one space after ',' (unless end-of-line).
    - Remove spaces before newlines and normalize whitespace right after newlines.
    - Keeps other punctuation and characters as-is.

    Note:
    - This is intentionally conservative and does not try to parse weights or special syntax.
    """

    if not s:
        return s

    # Normalize line endings
    s = s.replace("\r\n", "\n").replace("\r", "\n")

    lines = s.split("\n")
    out_lines = []

    for line in lines:
        # Collapse spaces/tabs within the line
        line = re.sub(r"[ \t]+", " ", line)

        # Remove spaces before commas: "word , " -> "word,"
        line = re.sub(r"\s+,", ",", line)

        # Ensure exactly one space after commas when followed by non-space and not end
        # "a,b" -> "a, b"
        line = re.sub(r",\s*(?=\S)", ", ", line)

        # Optional: also handle semicolons similarly (comment out if you don't want)
        # line = re.sub(r"\s+;", ";", line)
        # line = re.sub(r";\s*(?=\S)", "; ", line)

        # Trim trailing space
        line = line.rstrip(" ")

        out_lines.append(line)

    return "\n".join(out_lines)

class BVPromptDecodeNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "ast": (AST,),
                "category_filter": ("STRING", {"default": "default"}),
                "with_comments": ("BOOLEAN", {"default": False}),
                "inherit": ("BOOLEAN", {"default": True, "label_on": "Include parent categories", "label_off": "Only direct category"}),
                "mode": ("BOOLEAN", {"default": True, "label_on": "Match any category", "label_off": "Match all categories"}),
                "prettify": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = (AST, "STRING")
    RETURN_NAMES = ("ast", "filtered_prompt")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/prompting"

    def run(self, ast, category_filter, with_comments, inherit, mode, prettify):
        cat = category_filter
        if cat == "" or cat is None:
            return (ast, ast_to_plain_text(ast, include_comments=with_comments))

        mode_str = "any" if mode else "all"

        filtered = extract_plain_text_by_category(
            ast,
            cat,
            include_comments=with_comments,
            inherit=inherit,
            mode=mode_str,
        )

        if prettify:
            filtered = prettify_prompt_text(filtered)

        return (ast, filtered)


NODE_CLASS_MAPPINGS = {
    "BV Prompt Decode": BVPromptDecodeNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Prompt Decode": "🌀 BV Prompt Decode",
}

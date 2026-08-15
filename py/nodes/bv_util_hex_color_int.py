import re

class BVHexColorToInt:
    """
    Converts a hex color string (#RRGGBB or 0xRRGGBB or RRGGBB) to an INT (0..0xFFFFFF).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "hex": ("STRING", {"default": "#ffffff", "multiline": False}),
            }
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("color",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/utils"

    def run(self, hex: str):
        color = hex
        s = color.strip().lower()

        # Accept: "#rrggbb", "0xrrggbb", "rrggbb"
        s = s.replace("0x", "")
        if s.startswith("#"):
            s = s[1:]

        if re.fullmatch(r"[0-9a-f]{3}", s):
            s = "".join(ch * 2 for ch in s)
        elif not re.fullmatch(r"[0-9a-f]{6}", s):
            raise ValueError(
                f"Invalid hex color: '{color}'. Expected #RGB, RGB, #RRGGBB, 0xRRGGBB, or RRGGBB."
            )

        value = int(s, 16)
        return (value,)


NODE_CLASS_MAPPINGS = {
    "BV Hex Color To Int": BVHexColorToInt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Hex Color To Int": "🌀 BV Hex Color → Int",
}

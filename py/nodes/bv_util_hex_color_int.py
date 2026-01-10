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
        s = hex.strip().lower()

        # Accept: "#rrggbb", "0xrrggbb", "rrggbb"
        s = s.replace("0x", "")
        if s.startswith("#"):
            s = s[1:]

        if not re.fullmatch(r"[0-9a-f]{6}", s):
            raise ValueError(f"Invalid hex color: '{hex}'. Expected #RRGGBB / 0xRRGGBB / RRGGBB.")

        value = int(s, 16)
        return (value,)


NODE_CLASS_MAPPINGS = {
    "BV Hex Color To Int": BVHexColorToInt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Hex Color To Int": "🌀 BV Hex Color → Int",
}

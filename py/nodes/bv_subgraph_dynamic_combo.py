import math


def _contains_link(obj, my_id: str, out_index: int) -> bool:
    # Link format typically: [node_id, output_index]
    if isinstance(obj, list):
        if len(obj) >= 2 and isinstance(obj[0], (str, int)) and isinstance(obj[1], int):
            if str(obj[0]) == str(my_id) and int(obj[1]) == int(out_index):
                return True
        return any(_contains_link(x, my_id, out_index) for x in obj)
    if isinstance(obj, dict):
        return any(_contains_link(v, my_id, out_index) for v in obj.values())
    return False

def is_output_used(prompt: dict, my_id: str, out_index: int) -> bool:
    for _nid, node in (prompt or {}).items():
        inputs = (node or {}).get("inputs", {})
        if _contains_link(inputs, my_id, out_index):
            return True
    return False

class BVDynamicCombo:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "value": ("STRING", {"default": "option_a"}),
                "options": ("STRING", {
                    "default": "option_a\noption_b\noption_c",
                    "multiline": True
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING", "INT", "FLOAT")
    RETURN_NAMES = ("value_str", "value_int", "value_float")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/subgraph"

    def run(self, value: str, options: str, prompt=None, unique_id=None):
        s = (value or "").strip()
        parsed_options = [line.strip() for line in (options or "").splitlines() if line.strip()]
        if not parsed_options:
            raise Exception("BV Dynamic Combo: at least one option is required.")
        if len(parsed_options) != len(set(parsed_options)):
            raise Exception("BV Dynamic Combo: duplicate options are not allowed.")
        if s not in parsed_options:
            raise Exception(f"BV Dynamic Combo: selected value '{s}' is not present in options.")

        needs_int = is_output_used(prompt, unique_id, 1)
        needs_float = is_output_used(prompt, unique_id, 2)

        i = 0
        f = 0.0

        if needs_int:
            try:
                if not s or any(c not in "+-0123456789" for c in s) or not any(ch.isdigit() for ch in s):
                    raise ValueError
                i = int(s, 10)
            except Exception:
                raise Exception(f"BV Dynamic Combo: INT output is connected, but value '{s}' is not a valid integer.")

        if needs_float:
            try:
                f = float(s)
                if not math.isfinite(f):
                    raise ValueError
            except Exception:
                raise Exception(f"BV Dynamic Combo: FLOAT output is connected, but value '{s}' is not a finite float.")

        return (s, i, f)


NODE_CLASS_MAPPINGS = {
    "BV Dynamic Combo": BVDynamicCombo,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Dynamic Combo": "🌀 BV Dynamic Combo",
}

class BVSubgraphDivider:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "thickness": ("INT", {"default": 2, "min": 1, "max": 10, "step": 1}),
                "padding": ("INT", {"default": 10, "min": 0, "max": 60, "step": 1}),
                "alpha": ("FLOAT", {"default": 0.35, "min": 0.05, "max": 1.0, "step": 0.05}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("_",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/subgraph"

    def run(self, thickness, padding, alpha):
        return ("",)


NODE_CLASS_MAPPINGS = {"BV Subgraph Divider": BVSubgraphDivider}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Subgraph Divider": "🌀 BV Subgraph Divider"}

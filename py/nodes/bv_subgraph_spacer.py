class BVSubgraphSpacer:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "height": ("INT", {"default": 24, "min": 0, "max": 400, "step": 1}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 5.0, "step": 0.05}),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("_",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/subgraph"

    def run(self, height):
        return (height,)


NODE_CLASS_MAPPINGS = {"BV Subgraph Spacer": BVSubgraphSpacer}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Subgraph Spacer": "🌀 BV Subgraph Spacer"}

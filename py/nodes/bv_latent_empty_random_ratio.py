import torch

import comfy.model_management

from ..util.latent_dimensions import combine_ratios, dimensions_for_area


RESOLUTIONS = ["512", "768", "1024", "1536", "2048", "Custom"]
ALIGNMENTS = ["8", "16", "32", "64"]
STANDARD_RATIOS = (
    ("use_1_1", (1, 1)),
    ("use_3_2", (3, 2)),
    ("use_2_3", (2, 3)),
    ("use_4_3", (4, 3)),
    ("use_3_4", (3, 4)),
    ("use_16_9", (16, 9)),
    ("use_9_16", (9, 16)),
    ("use_21_9", (21, 9)),
    ("use_9_21", (9, 21)),
)


class BVEmptyLatentRandomRatio:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
                "resolution": (RESOLUTIONS, {"default": "1024"}),
                "custom_resolution": ("INT", {"default": 1024, "min": 64, "max": 16384, "step": 8}),
                "alignment": (ALIGNMENTS, {"default": "8"}),
                **{name: ("BOOLEAN", {"default": True}) for name, _ratio in STANDARD_RATIOS},
                "ratios": ("STRING", {"default": "", "multiline": True, "placeholder": "Additional ratios, one per line (for example 5:4)"}),
                "batch_size": ("INT", {"default": 1, "min": 1, "max": 4096}),
            }
        }

    RETURN_TYPES = ("LATENT", "INT", "INT", "STRING")
    RETURN_NAMES = ("latent", "width", "height", "picked_ratio")
    FUNCTION = "generate"
    CATEGORY = "🌀 BV Node Pack/latent"
    DESCRIPTION = "Creates a native empty latent at a deterministic aspect ratio while preserving the selected square pixel area."

    def generate(self, seed, resolution, custom_resolution, alignment, ratios, batch_size, **enabled_ratios):
        standard_ratios = [ratio for name, ratio in STANDARD_RATIOS if enabled_ratios[name]]
        parsed_ratios = combine_ratios(standard_ratios, ratios)
        picked_ratio = parsed_ratios[int(seed) % len(parsed_ratios)]
        square_resolution = int(custom_resolution if resolution == "Custom" else resolution)
        alignment_value = int(alignment)
        width, height = dimensions_for_area(square_resolution, picked_ratio, alignment_value)
        latent = torch.zeros(
            [batch_size, 4, height // 8, width // 8],
            device=comfy.model_management.intermediate_device(),
            dtype=comfy.model_management.intermediate_dtype(),
        )
        return ({"samples": latent, "downscale_ratio_spacial": 8}, width, height, f"{picked_ratio[0]}:{picked_ratio[1]}")


NODE_CLASS_MAPPINGS = {"BV Empty Latent Random Ratio": BVEmptyLatentRandomRatio}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Empty Latent Random Ratio": "🌀 BV Empty Latent Random Ratio"}

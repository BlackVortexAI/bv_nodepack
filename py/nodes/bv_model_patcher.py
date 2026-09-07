from ..util.model_patcher import apply_basis_patches
from ..util.regional.lora_v3 import RUNTIME_PROVIDER


class BVModelPatcher:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "model": ("MODEL",),
            "config_json": ("STRING", {"default": '{"version":1,"collector_ids":[]}', "multiline": True, "socketless": True}),
        }, "optional": {"clip": ("CLIP",), **{
            f"base_resource_provider_{index}": (RUNTIME_PROVIDER, {"forceInput": True}) for index in range(1, 21)
        }}}

    RETURN_TYPES = ("MODEL", "CLIP")
    RETURN_NAMES = ("model", "clip")
    FUNCTION = "apply"
    CATEGORY = "🌀 BV Node Pack/regional/LoRA"
    DESCRIPTION = "Prepare MODEL and optional CLIP with the selected Registries' basis LoRAs. Without active basis patches, inputs pass through unchanged."

    def apply(self, model, config_json='{"version":1,"collector_ids":[]}', clip=None, **providers):
        return apply_basis_patches(model, clip, config_json, providers)


NODE_CLASS_MAPPINGS = {"BV Model Patcher": BVModelPatcher}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Model Patcher": "🌀 BV Model Patcher"}

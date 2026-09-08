"""One Krea target-name resolver shared by header evidence and execution."""

PREFIXES = ("diffusion_model.", "transformer.", "model.", "lora_unet_", "lora_transformer_")
DIFFUSERS_PREFIXES = ("transformer_blocks.", "text_fusion.", "time_embed.", "time_mod_proj", "img_in", "txt_in.", "final_layer.")


def canonical_krea2_targets(keys, layers):
    stripped = {}
    for raw in keys:
        key = raw
        for prefix in PREFIXES:
            if key.startswith(prefix):
                key = key[len(prefix):]
                break
        stripped[raw] = key
    aliases = {}
    if any(key.startswith(DIFFUSERS_PREFIXES) for key in stripped.values()):
        from comfy.utils import krea2_to_diffusers
        aliases = krea2_to_diffusers({"layers": layers}, output_prefix="")
    return {raw: aliases.get(key + ".weight", key + ".weight").removesuffix(".weight") for raw, key in stripped.items()}

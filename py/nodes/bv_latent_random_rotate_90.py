import torch

class BVLatentRandomRotate90:
    """
    Rotates a latent by 90 degrees deterministically based on seed if enabled.
    Returns rotated (or original) latent and the new latent width/height (in latent units).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "latent": ("LATENT",),
                "seed": ("INT", {"default": 0, "min": -1125899906842624, "max": 1125899906842624}),
                "enabled": ("BOOLEAN", {"default": True}),
            }
        }

    RETURN_TYPES = ("LATENT", "INT", "INT")
    RETURN_NAMES = ("latent", "latent_width", "latent_height")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/latent"

    def run(self, latent, seed: int, enabled: bool):
        out = dict(latent)

        samples = out.get("samples", None)
        if samples is None:
            raise Exception("BVLatentRandomRotate90: latent has no 'samples' tensor.")

        if not torch.is_tensor(samples) or samples.ndim < 2:
            raise Exception(f"BVLatentRandomRotate90: expected a samples tensor with spatial dimensions, got {type(samples)} with shape {getattr(samples, 'shape', None)}.")

        # Decide rotation
        do_rotate = bool(enabled) and (int(seed) & 1) == 1

        if do_rotate:
            out["samples"] = torch.rot90(samples, k=3, dims=(-2, -1))

            # If there's a noise mask, rotate it too (usually [B, H, W] or [B, 1, H, W])
            if "noise_mask" in out and out["noise_mask"] is not None:
                nm = out["noise_mask"]
                if torch.is_tensor(nm) and nm.ndim >= 2:
                    out["noise_mask"] = torch.rot90(nm, k=3, dims=(-2, -1))

        # Return new latent dimensions (latent units)
        final_samples = out["samples"]
        latent_h = int(final_samples.shape[-2])
        latent_w = int(final_samples.shape[-1])

        return (out, latent_w, latent_h)


NODE_CLASS_MAPPINGS = {
    "BV Latent Random Rotate 90": BVLatentRandomRotate90
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Latent Random Rotate 90": "🌀 BV Latent Random Rotate 90"
}

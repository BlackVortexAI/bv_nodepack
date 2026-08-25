import torch
import torch.nn.functional as F

# BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Entire legacy latent ratio node.
# Remove the module and its node-list entry after workflows use BV Empty Latent Random Ratio.


def _pick_from_seed(seed: int, items: list):
    if not items:
        return None
    idx = abs(int(seed)) % len(items)
    return items[idx]


def _round_int(x: float) -> int:
    return int(round(float(x)))


def _clamp_int(v: int, lo: int, hi: int) -> int:
    return max(lo, min(hi, v))


class BVLatentRandomAspectRatio:
    """
    Randomly (but deterministically via seed) picks one enabled aspect ratio and
    resizes the latent to that ratio.

    Base resolution logic:
      - If a latent input is connected: base is derived from latent (1:1 base = min(H, W) in latent units).
      - If no latent is connected: base is derived from base_resolution_px (square 1:1 reference), base_lat = base_resolution_px // 8.

    The chosen ratio is scaled so that its longer side equals the base (no upscale beyond the 1:1 base size).
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed": ("INT", {"default": 0, "min": -1125899906842624, "max": 1125899906842624, "step": 8}),
                "enabled": ("BOOLEAN", {"default": True}),

                # Square 1:1 reference edge length in PIXELS (e.g. 1024 means 1024x1024 reference).
                # Used only when no latent is connected.
                "base_resolution_px": ("INT", {"default": 1024, "min": 64, "max": 16384}),

                # Candidate ratios
                "use_1_1": ("BOOLEAN", {"default": True}),
                "use_3_2": ("BOOLEAN", {"default": True}),
                "use_2_3": ("BOOLEAN", {"default": False}),
                "use_4_3": ("BOOLEAN", {"default": True}),
                "use_3_4": ("BOOLEAN", {"default": False}),
                "use_16_9": ("BOOLEAN", {"default": True}),
                "use_9_16": ("BOOLEAN", {"default": False}),
                "use_21_9": ("BOOLEAN", {"default": False}),
                "use_9_21": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                # Optional latent input. If connected, base is derived from it.
                "latent": ("LATENT",),
            }
        }

    RETURN_TYPES = ("LATENT", "INT", "INT", "STRING")
    RETURN_NAMES = ("latent", "latent_width", "latent_height", "picked_ratio")
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/latent/Deprecated Legacy Nodes"

    def run(
        self,
        seed: int,
        enabled: bool,
        base_resolution_px: int,
        use_1_1: bool,
        use_3_2: bool,
        use_2_3: bool,
        use_4_3: bool,
        use_3_4: bool,
        use_16_9: bool,
        use_9_16: bool,
        use_21_9: bool,
        use_9_21: bool,
        latent=None,
    ):
        # Build allowed ratios list: (rw, rh, label)
        ratios = []
        if use_1_1:
            ratios.append((1, 1, "1:1"))
        if use_3_2:
            ratios.append((3, 2, "3:2"))
        if use_2_3:
            ratios.append((2, 3, "2:3"))
        if use_4_3:
            ratios.append((4, 3, "4:3"))
        if use_3_4:
            ratios.append((3, 4, "3:4"))
        if use_16_9:
            ratios.append((16, 9, "16:9"))
        if use_9_16:
            ratios.append((9, 16, "9:16"))
        if use_21_9:
            ratios.append((21, 9, "21:9"))
        if use_9_21:
            ratios.append((9, 21, "9:21"))

        if not ratios:
            # If user disabled everything, fall back to 1:1 to avoid surprises
            ratios = [(1, 1, "1:1")]

        # Decide input source:
        # 1) if latent is connected -> use it (derive base from latent)
        # 2) else -> create new latent from base_resolution_px (square 1:1 reference)
        if latent is not None:
            out = dict(latent) if isinstance(latent, dict) else {"samples": latent}
            samples = out.get("samples", None)
            if samples is None or (not torch.is_tensor(samples)) or samples.ndim != 4:
                raise Exception("BVLatentRandomAspectRatio: provided latent must contain 'samples' tensor [B,C,H,W].")

            _, _, h, w = samples.shape
            base = int(min(h, w))  # 1:1 base in latent units derived from current latent
        else:
            if base_resolution_px is None or int(base_resolution_px) <= 0:
                raise Exception("BVLatentRandomAspectRatio: no latent connected and base_resolution_px is invalid.")

            # base_resolution_px is the edge length of a square 1:1 reference in PIXELS
            # Convert pixels to latent units (typically /8)
            base_lat = max(1, int(base_resolution_px) // 8)
            base = int(base_lat)

            # Create a blank latent (zeros). Channels=4 is standard.
            samples = torch.zeros((1, 4, base, base), dtype=torch.float32, device=torch.device("cpu"))
            out = {"samples": samples}

        # Disabled -> passthrough (or created square latent as-is)
        if not enabled:
            s = out["samples"]
            return (out, int(s.shape[3]), int(s.shape[2]), "disabled (passthrough)")

        # Pick ratio deterministically from seed
        rw, rh, label = _pick_from_seed(seed, ratios)

        # Scale so that the longer side equals the base (no upscale beyond 1:1 reference size)
        scale = float(base) / float(max(rw, rh))
        target_w = _round_int(float(rw) * scale)
        target_h = _round_int(float(rh) * scale)

        # Safety clamp (avoid zero)
        target_w = _clamp_int(target_w, 1, 8192)
        target_h = _clamp_int(target_h, 1, 8192)

        cur = out["samples"]
        _, _, cur_h, cur_w = cur.shape

        if target_h == cur_h and target_w == cur_w:
            return (out, int(cur_w), int(cur_h), label)

        # Resize latent samples
        resized = F.interpolate(cur, size=(target_h, target_w), mode="bilinear", align_corners=False)
        out["samples"] = resized

        # Resize noise mask if present
        if "noise_mask" in out and out["noise_mask"] is not None:
            nm = out["noise_mask"]
            if torch.is_tensor(nm):
                if nm.ndim == 3:  # [B,H,W]
                    nm_r = F.interpolate(nm.unsqueeze(1), size=(target_h, target_w), mode="nearest").squeeze(1)
                    out["noise_mask"] = nm_r
                elif nm.ndim == 4:
                    out["noise_mask"] = F.interpolate(nm, size=(target_h, target_w), mode="nearest")

        return (out, int(target_w), int(target_h), label)


NODE_CLASS_MAPPINGS = {
    "BV Latent Random Aspect Ratio": BVLatentRandomAspectRatio,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Latent Random Aspect Ratio": "🌀 BV Latent Random Aspect Ratio [Deprecated]",
}

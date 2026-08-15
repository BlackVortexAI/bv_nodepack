import secrets


SEED_MIN = -1
SEED_MAX = 0xFFFFFFFFFFFFFFFF


class BVSeed:
    _last_seeds = {}

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "seed_bv": ("INT", {
                    "default": -1,
                    "min": SEED_MIN,
                    "max": SEED_MAX,
                    "control_after_generate": False,
                    "display_name": "seed",
                }),
            },
            "hidden": {"unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("INT",)
    RETURN_NAMES = ("seed",)
    FUNCTION = "resolve"
    CATEGORY = "🌀 BV Node Pack/utils"
    DESCRIPTION = "Produces fixed or queue-controlled seeds with Subgraph-safe, exposable controls."

    @classmethod
    def IS_CHANGED(cls, seed_bv=-1, unique_id=None):
        return float("nan") if int(seed_bv) == -1 else int(seed_bv)

    @classmethod
    def _random_seed(cls):
        return secrets.randbelow(SEED_MAX + 1)

    def resolve(self, seed_bv=-1, unique_id=None, seed=None):
        key = str(unique_id or "global")
        seed_bv = min(SEED_MAX, max(SEED_MIN, int(seed_bv)))
        prompt_seed = -1 if seed is None else min(SEED_MAX, max(SEED_MIN, int(seed)))
        resolved = prompt_seed if prompt_seed != -1 else (
            self._random_seed() if seed_bv == -1 else seed_bv
        )

        self._last_seeds[key] = resolved
        # Keep the public input untouched. In particular, -1 is a persistent
        # "randomize each queue" sentinel and must not be replaced by the
        # resolved value in the frontend.
        return {"ui": {"last_seed": [resolved]}, "result": (resolved,)}


NODE_CLASS_MAPPINGS = {"BV Seed": BVSeed}
NODE_DISPLAY_NAME_MAPPINGS = {"BV Seed": "🌀 BV Seed"}

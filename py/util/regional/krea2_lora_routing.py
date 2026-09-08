"""Plan complete Krea LoRA files before choosing spatial application methods."""
from collections import Counter
from dataclasses import dataclass
import math
import re

from .krea2_token_lora import _module_lookup, _normalize_lora_state

DEFAULT_TOKEN_SCOPE = "__bv_krea2_global_residual"


def residual_token_inputs(slots, token_scopes, background_mask):
    """Global residuals affect global text, never implicitly every image token.

    Spatial influence comes exclusively from effective region/background scopes.
    A zero-token background slot also covers LoRA-only background assignments.
    """
    from dataclasses import replace
    from .krea2_attention import Krea2RegionalSlot
    scopes = {key: list(value) for key, value in token_scopes.items() if key != "global"}
    scopes[DEFAULT_TOKEN_SCOPE] = list(token_scopes.get("global", []))
    scopes.setdefault("background", list(token_scopes.get("global", [])))
    result = [replace(slot, scope=DEFAULT_TOKEN_SCOPE, mask=background_mask * 0) if slot.scope == "global" else slot for slot in slots]
    if not any(slot.scope == "background" for slot in result):
        result.append(Krea2RegionalSlot("background", background_mask, 1., 0, "background"))
    return result, scopes


@dataclass
class Krea2LoRAPlan:
    common: tuple
    token_scopes: dict
    multipass_scopes: dict
    clip_scopes: dict
    reasons: dict
    states: dict


def _classify(model, state):
    # Normalization deliberately ignores incomplete pairs; routing must not.
    pairs = {}
    for key in state:
        match = re.match(r"^(.*?)\.(lora_A|lora_down|lora_B|lora_up)\.weight$", str(key))
        if match:
            pairs.setdefault(match[1], set()).add("down" if match[2] in {"lora_A", "lora_down"} else "up")
        if str(key).endswith(".lokr_t2"):
            raise ValueError("Krea LoRA routing does not support convolutional LoKr adapters")
    if any(parts != {"down", "up"} for parts in pairs.values()):
        raise ValueError("Krea LoRA contains an incomplete down/up pair")
    diffusion = model.get_model_object("diffusion_model")
    normalized = _normalize_lora_state(state, diffusion)
    normalized_bases = {adapter["original_key"] for adapter in normalized.values()}
    for raw_key in state:
        key = str(raw_key)
        if key.startswith(("lora_te", "text_encoder", "clip_")):
            continue
        match = re.match(r"^(.*?)\.(?:lora_A\.weight|lora_B\.weight|lora_down\.weight|lora_up\.weight|alpha|lokr_w1|lokr_w1_a|lokr_w1_b|lokr_w2|lokr_w2_a|lokr_w2_b)$", key)
        if not match or match[1] not in normalized_bases:
            raise ValueError(f"Krea LoRA contains an unsupported or incomplete adapter field: {key}")
    maskable, all_linear = _module_lookup(diffusion)
    modules = dict(diffusion.named_modules())
    matched, unmaskable = 0, []
    for key, adapter in normalized.items():
        if not math.isfinite(float(adapter.get("alpha", adapter.get("alpha_scale", 1.)))):
            raise ValueError(f"Krea LoRA has a non-finite alpha at {key}")
        path = all_linear.get(key) or all_linear.get(key.replace(".", "_"))
        if path is None:
            # CLIP adapters are handled independently by the native CLIP loader.
            if str(adapter["original_key"]).startswith(("lora_te", "text_encoder", "clip_")):
                continue
            raise ValueError(f"Krea LoRA model layer cannot be resolved: {key}")
        shape = tuple(modules[path].weight.shape)
        if adapter["kind"] == "lora":
            down, up = adapter["down"], adapter["up"]
            valid = down.ndim == up.ndim == 2 and down.shape[0] > 0 and up.shape[1] == down.shape[0] and (up.shape[0], down.shape[1]) == shape
        else:
            w1, w2 = adapter["w1"], adapter["w2"]
            valid = (w1.shape[0] * w2.shape[0], w1.shape[1] * w2.shape[1]) == shape
        if not valid:
            raise ValueError(f"Krea LoRA shape mismatch at {key}")
        matched += 1
        if key not in maskable and key.replace(".", "_") not in maskable:
            unmaskable.append(key)
    if not matched:
        raise ValueError("Krea LoRA matched no model layers; cannot choose a safe application route")
    return "non-spatial layers: " + ", ".join(unmaskable[:3]) if unmaskable else "token-compatible"


def plan_krea2_lora_routes(model, scope_stacks, active_scopes, *, load_state=None):
    scopes = list(dict.fromkeys(active_scopes))
    if not scopes:
        scopes = ["global"]
    entries = {scope: [(str(path), float(ms), float(cs)) for path, ms, cs in scope_stacks.get(scope, [])] for scope in scopes}
    if any(not math.isfinite(ms) or not math.isfinite(cs) for stack in entries.values() for _, ms, cs in stack):
        raise ValueError("LoRA strengths must be finite")
    counts = [Counter((path, ms) for path, ms, _ in stack if ms != 0) for stack in entries.values()]
    shared = counts[0].copy()
    for count in counts[1:]:
        shared &= count
    common = []
    remaining = shared.copy()
    for path, ms, _ in entries.get("global", []):
        if ms != 0 and remaining[(path, ms)] > 0:
            common.append((path, ms, 0.))
            remaining[(path, ms)] -= 1
    common_counts = Counter((path, ms) for path, ms, _ in common)
    plan = Krea2LoRAPlan(tuple(common), {}, {}, {}, {}, {})
    for scope, stack in entries.items():
        remove = common_counts.copy()
        plan.token_scopes[scope], plan.multipass_scopes[scope] = [], []
        plan.clip_scopes[scope] = [(path, 0., cs) for path, _, cs in stack if cs != 0]
        for path, ms, _ in stack:
            if ms == 0:
                continue
            if remove[(path, ms)] > 0:
                remove[(path, ms)] -= 1
                continue
            if path not in plan.states:
                if load_state is None:
                    import comfy.utils
                    state = comfy.utils.load_torch_file(path, safe_load=True)
                else:
                    state = load_state(path)
                plan.states[path] = state
                plan.reasons[path] = _classify(model, state)
            target = plan.token_scopes if plan.reasons[path] == "token-compatible" else plan.multipass_scopes
            target[scope].append((path, ms, 0.))
    return plan

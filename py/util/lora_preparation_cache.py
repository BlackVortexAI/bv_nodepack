"""Bounded native LoRA preparation reuse, shared by regional model consumers."""
from pathlib import Path


class _UnsupportedState(TypeError):
    pass


def _plain(value):
    """Snapshot simple options; opaque extension state must bypass this cache."""
    if value is None or type(value) in (bool, int, float, str):
        return value
    if type(value) in (list, tuple):
        return (type(value).__name__, tuple(_plain(item) for item in value))
    if type(value) is dict:
        return tuple((key, _plain(item)) for key, item in sorted(value.items()))
    raise _UnsupportedState("opaque_option")


def _object_patch_state(patches):
    """Native clones share values: accept only immutable, explicitly typed values."""
    if type(patches) is not dict or any(type(key) is not str for key in patches):
        raise _UnsupportedState("object_patches")
    result = []
    for name, value in sorted(patches.items()):
        if value is None or type(value) in (bool, int, float, str):
            token = (type(value).__name__, value)
        else:
            import torch
            if not isinstance(value, torch.dtype):
                raise _UnsupportedState("object_patches")
            token = ("torch.dtype", str(value))
        result.append((name, token))
    return tuple(result)


def _lllite_options(patcher):
    """Split one exact native LLLite group; unknown extension layouts stay opaque."""
    options = getattr(patcher, "model_options", {})
    if type(options) is not dict:
        return None
    transformer = options.get("transformer_options", {})
    if type(transformer) is not dict:
        return None
    patches = transformer.get("patches", {})
    names = ("post_input", "attn1_patch", "attn2_patch", "mlp_patch")
    if type(patches) is not dict or set(patches) != set(names):
        return None
    try:
        from comfy.model_patcher import ModelPatcher, ModelPatcherDynamic
        from comfy.ldm.anima.lllite import AnimaLLLitePatch, AnimaLLLiteAttentionPatch, AnimaLLLiteMLPPatch
    except ImportError:
        return None
    if type(patcher) not in (ModelPatcher, ModelPatcherDynamic):
        return None
    if any(type(patches[name]) is not list or len(patches[name]) != 1 for name in names):
        return None
    root, attn1, attn2, mlp = (patches[name][0] for name in names)
    if (type(root) is not AnimaLLLitePatch or type(attn1) is not AnimaLLLiteAttentionPatch
            or type(attn2) is not AnimaLLLiteAttentionPatch or type(mlp) is not AnimaLLLiteMLPPatch):
        return None
    if any(getattr(item, "patch", None) is not root for item in (attn1, attn2, mlp)):
        return None
    if (attn1.targets != {"q": "self_attn_q_proj", "k": "self_attn_k_proj", "v": "self_attn_v_proj"}
            or attn2.targets != {"q": "cross_attn_q_proj"}):
        return None
    clean = dict(options)
    clean["transformer_options"] = dict(transformer)
    del clean["transformer_options"]["patches"]
    _plain(clean)
    return clean, {name: patches[name][0] for name in names}


def _patcher_state(patcher, lllite=None):
    if patcher is None:
        return None
    # Native clones can share extension payloads. Do not retain such models.
    for name in ("attachments", "weight_wrapper_patches",
                 "additional_models", "injections", "hook_patches",
                 "current_hooks", "forced_hooks"):
        if getattr(patcher, name, None):
            raise _UnsupportedState(name)
    for name in ("callbacks", "wrappers"):
        if any(any(values.values()) for values in getattr(patcher, name, {}).values()):
            raise _UnsupportedState(name)
    identity = id(patcher) if lllite is None else (
        "native_lllite", type(patcher), str(getattr(patcher, "clone_base_uuid", None)),
        getattr(patcher, "is_multigpu_base_clone", None), id(getattr(patcher, "cached_patcher_init", None)),
        getattr(patcher, "is_clip", None))
    return (identity, id(getattr(patcher, "model", None)), str(getattr(patcher, "patches_uuid", None)),
            _object_patch_state(getattr(patcher, "object_patches", {})),
            _plain(lllite[0] if lllite is not None else getattr(patcher, "model_options", {})),
            tuple(str(getattr(patcher, name, None)) for name in
                  ("load_device", "offload_device", "force_cast_weights",
                   "weight_inplace_update", "hook_mode", "is_injected", "skip_injection")))


class LoraPreparationCache:
    """One entry per consumer node; preserve native patch UUIDs on cache hits."""
    def __init__(self):
        self.clear()

    def clear(self):
        self._entry = None

    def apply(self, model, clip, entries, prepare):
        try:
            files = []
            for path, ms, cs in entries:
                stat = Path(path).stat()
                files.append((str(path), stat.st_mtime_ns, stat.st_ctime_ns,
                              stat.st_size, stat.st_ino, ms, cs))
            lllite = _lllite_options(model)
            model_state = _patcher_state(model, lllite)
            clip_state = _patcher_state(clip.patcher if clip else None)
            key = (model_state, clip_state,
                   id(clip), id(getattr(clip, "cond_stage_model", None)), id(getattr(clip, "tokenizer", None)),
                   _plain({name: getattr(clip, name, None) for name in
                       ("layer_idx", "tokenizer_options", "use_clip_schedule", "apply_hooks_to_conds")}),
                   tuple(files))
        except (TypeError, ValueError, OSError, RecursionError):
            self.clear()
            return prepare(model, clip, entries)
        if self._entry is None or self._entry[0] != key:
            self.clear()
            preparation_model = model
            if lllite is not None:
                from comfy.utils import deepcopy_list_dict
                preparation_model = model.clone()
                preparation_model.model_options = deepcopy_list_dict(lllite[0])
            prepared = prepare(preparation_model, clip, entries)
            # Retain inputs to prevent identity reuse after garbage collection.
            self._entry = (key, model, clip, prepared)
        result = tuple(item.clone() if item is not None else None for item in self._entry[3])
        if lllite is not None:
            for name, patch in lllite[1].items():
                result[0].set_model_patch(patch, name)
        return result

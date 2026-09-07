"""Native static LoRA stacks for full-image, spatially blended edit passes.

Uses the public sampler wrapper and model loading seams, never conditional
WeightHooks. See docs/design/krea2-identity-edit.md for supported boundaries.
"""
import contextvars
import threading
import uuid

import torch

from .lora_hooks import apply_static_lora_stack

WRAPPER_KEY = "bv_edit_lora_passes"
PASS_KEY = "bv_edit_lora_pass"
OWNER_KEY = "bv_edit_lora_owner"
_LOCK = threading.RLock()
_ACTIVE = contextvars.ContextVar("bv_edit_lora_active", default=False)


class EditLoRAPasses:
    def __init__(self, model, clip, stacks, image):
        self.model, self.clip, self.stacks, self.image = model, clip, stacks, image
        self.models, self.clips, self.keys = [], {}, {}
        self.owner = str(uuid.uuid4())

    def variant(self, scope, entries=None):
        if entries is None:
            entries = self.stacks.get(scope, self.stacks.get("global", []))
        entries = [(str(path), float(ms), float(cs)) for path, ms, cs in entries if ms != 0 or cs != 0]
        key = tuple((path, ms) for path, ms, _ in entries if ms != 0)
        clip_key = tuple((path, cs) for path, _, cs in entries if cs != 0) if self.clip is not None else ()
        new_model, new_clip = key not in self.keys, clip_key not in self.clips
        if new_model and new_clip:
            model, clip = apply_static_lora_stack(self.model, self.clip, entries)
        elif new_model:
            model, _ = apply_static_lora_stack(self.model, None, [(path, ms, 0.) for path, ms in key])
        elif new_clip:
            _, clip = apply_static_lora_stack(None, self.clip, [(path, 0., cs) for path, cs in clip_key])
        if new_model:
            self.keys[key] = len(self.models)
            self.models.append(model)
        if new_clip:
            self.clips[clip_key] = clip
        return self.keys[key]

    def prepare_model(self):
        """Use ComfyUI's native delegate once, outside all sampling steps.

        AIMDO's dynamically staged host buffers are unsuitable for repeated
        static stack switching. All variants share one non-dynamic base, not
        a full checkpoint copy per region. Single MODEL stacks retain AIMDO.
        """
        self.variant("global")
        baseline = self.models[0]
        if len(self.models) > 1 and getattr(baseline, "is_dynamic", lambda: False)():
            delegate = baseline.get_non_dynamic_delegate()
            shared = delegate.get_clone_model_override()
            self.models = [delegate] + [variant.clone(disable_dynamic=True, model_override=shared) for variant in self.models[1:]]
        return self.models[0]

    def encode(self, scope, text, *, entries=None):
        from .krea2_identity_edit import grounded_encode
        self.variant("global")
        index = self.variant(scope, entries)
        selected = self.stacks.get(scope, self.stacks.get("global", [])) if entries is None else entries
        clip_key = tuple((str(path), float(cs)) for path, _, cs in selected if cs != 0) if self.clip is not None else ()
        result = grounded_encode(self.clips[clip_key], *text, self.image)
        return tuple([[embedding, {**metadata, PASS_KEY: index, OWNER_KEY: self.owner}] for embedding, metadata in branch] for branch in result)

    def install(self, model, positive, negative):
        if len(self.models) <= 1:
            # Preserve the native global/identical-stack path without a wrapper.
            for branch in (positive, negative):
                for _, metadata in branch:
                    metadata.pop(PASS_KEY, None)
                    metadata.pop(OWNER_KEY, None)
            return model
        import comfy.patcher_extension
        result = model.clone()
        comfy.patcher_extension.add_wrapper_with_key(
            comfy.patcher_extension.WrappersMP.CALC_COND_BATCH, WRAPPER_KEY,
            StaticEditPassRouter(tuple(self.models), self.owner), result.model_options, is_model_options=True)
        return result


class StaticEditPassRouter:
    def __init__(self, models, owner):
        self.models = models
        self.owner = owner
        self.patch_id = models[0].patches_uuid
        self.object_patches = {key: id(value) for key, value in models[0].object_patches.items()}

    def __call__(self, executor, model, conds, x, timestep, model_options):
        import comfy.model_management
        from comfy.samplers import get_area_and_mult
        if _ACTIVE.get():
            raise ValueError("Regional edit LoRAs do not support recursive sampler calls")
        original = model.current_patcher
        if original.patches_uuid != self.patch_id or {key: id(value) for key, value in original.object_patches.items()} != self.object_patches:
            raise ValueError("Apply additional MODEL LoRAs and model patches before the Identity Edit Attention node, or select them in the Regional Editor")
        if model_options.get("multigpu_clones") or model_options.get("context_handler") or model_options.get("model_function_wrapper"):
            raise ValueError("Regional edit LoRAs currently require single-device, full-image sampling")
        from .krea2_identity_edit import require_compatible_patches
        require_compatible_patches(model_options.get("transformer_options", {}), installed=True)
        groups = {}
        for branch_index, branch in enumerate(conds):
            for cond in branch or []:
                if any(cond.get(key) is not None for key in ("default", "area", "control", "hooks", "gligen", "additional_models")):
                    raise ValueError("Regional edit LoRAs require full-image BV conditioning without ControlNet, default areas or weight hooks")
                index = cond.get(PASS_KEY)
                if cond.get(OWNER_KEY) != self.owner or type(index) is not int or not 0 <= index < len(self.models):
                    raise ValueError("Regional edit LoRAs need the positive and negative outputs from the same Attention node")
                group = groups.setdefault(index, [[] if branch is not None else None for branch in conds])
                group[branch_index].append(cond)
        with _LOCK:
            token = _ACTIVE.set(True)
            sums = [torch.zeros_like(x, dtype=torch.float32) for _ in conds]
            counts = [torch.zeros_like(x[:, :1], dtype=torch.float32) for _ in conds]
            def activate(patcher):
                memory = model.memory_required(list(x.shape))
                comfy.model_management.load_models_gpu([patcher], memory_required=memory)
                patcher.pre_run()
            try:
                for index, group in groups.items():
                    weights = [torch.zeros_like(x[:, :1], dtype=torch.float32) for _ in conds]
                    for b, branch in enumerate(group):
                        for cond in branch or []:
                            area = get_area_and_mult(cond, x, timestep)
                            if area is not None:
                                # Native mask multipliers are identical across channels.
                                weights[b].add_(area.mult[:, :1].float())
                    if not any(torch.any(weight != 0) for weight in weights):
                        continue
                    activate(self.models[index])
                    outputs = executor(model, group, x, timestep, model_options)
                    for b, output in enumerate(outputs):
                        sums[b].add_(output.float() * weights[b])
                        counts[b].add_(weights[b])
                return [(total / count.clamp_min(1e-37)).to(x.dtype) for total, count in zip(sums, counts)]
            finally:
                try:
                    activate(original)
                finally:
                    _ACTIVE.reset(token)

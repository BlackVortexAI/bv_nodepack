"""Shared native static-weight switching for spatial conditioning passes."""
import contextvars
import threading

import torch

_LOCK = threading.RLock()
_ACTIVE = contextvars.ContextVar("bv_static_lora_active", default=False)


def prepare_static_models(models):
    """One native non-dynamic delegate shared by every weight variant."""
    if len(models) > 1 and getattr(models[0], "is_dynamic", lambda: False)():
        delegate = models[0].get_non_dynamic_delegate()
        shared = delegate.get_clone_model_override()
        return [delegate] + [variant.clone(disable_dynamic=True, model_override=shared) for variant in models[1:]]
    return list(models)


class StaticLoRAPassRouter:
    def __init__(self, models, owner, *, pass_key, owner_key, validate_options, label="Regional LoRAs"):
        self.pass_key, self.owner_key = pass_key, owner_key
        self.validate_options, self.label = validate_options, label
        self.models = models
        self.owner = owner
        self.patch_id = models[0].patches_uuid
        self.object_patches = {key: id(value) for key, value in models[0].object_patches.items()}

    def __call__(self, executor, model, conds, x, timestep, model_options):
        import comfy.model_management
        from comfy.samplers import get_area_and_mult
        if _ACTIVE.get():
            raise ValueError(f"{self.label} LoRAs do not support recursive sampler calls")
        original = model.current_patcher
        if original.patches_uuid != self.patch_id or {key: id(value) for key, value in original.object_patches.items()} != self.object_patches:
            raise ValueError(f"Apply additional MODEL LoRAs and model patches before the {self.label} Attention node, or select them in the Regional Editor")
        if model_options.get("multigpu_clones") or model_options.get("context_handler") or model_options.get("model_function_wrapper"):
            raise ValueError(f"{self.label} LoRAs currently require single-device, full-image sampling")
        self.validate_options(model_options.get("transformer_options", {}))
        groups = {}
        for branch_index, branch in enumerate(conds):
            for cond in branch or []:
                if any(cond.get(key) is not None for key in ("default", "area", "control", "hooks", "gligen", "additional_models")):
                    raise ValueError(f"{self.label} LoRAs require full-image BV conditioning without ControlNet, default areas or weight hooks")
                index = cond.get(self.pass_key)
                if cond.get(self.owner_key) != self.owner or type(index) is not int or not 0 <= index < len(self.models):
                    raise ValueError(f"{self.label} LoRAs need the positive and negative outputs from the same Attention node")
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

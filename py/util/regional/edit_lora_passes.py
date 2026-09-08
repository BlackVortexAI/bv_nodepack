"""Native static LoRA stacks for full-image, spatially blended edit passes.

Uses the public sampler wrapper and model loading seams, never conditional
WeightHooks. See the design note krea2-identity-edit.md in the private
bv_nodepack_agents workspace (source-repositories/bv_nodepack/docs/design/) for
supported boundaries.
"""
import uuid

from .lora_hooks import apply_static_lora_stack
from .static_lora_passes import StaticLoRAPassRouter, prepare_static_models

WRAPPER_KEY = "bv_edit_lora_passes"
PASS_KEY = "bv_edit_lora_pass"
OWNER_KEY = "bv_edit_lora_owner"


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
        self.models = prepare_static_models(self.models)
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


class StaticEditPassRouter(StaticLoRAPassRouter):
    def __init__(self, models, owner):
        from .krea2_identity_edit import require_compatible_patches
        super().__init__(models, owner, pass_key=PASS_KEY, owner_key=OWNER_KEY,
                         validate_options=lambda options: require_compatible_patches(options, installed=True), label="Identity Edit")

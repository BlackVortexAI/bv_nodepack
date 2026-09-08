"""Hybrid Krea generation: shared weights, token deltas and spatial static passes."""
import copy
import logging
import uuid

import torch

from .document import region_used_for
from .krea2_attention import compile_krea2_attention, apply_krea2_attention_patch, Krea2AttentionPatch
from .krea2_token_lora import apply_krea2_token_lora_patch, WRAPPER_KEY as TOKEN_WRAPPER
from .krea2_lora_routing import plan_krea2_lora_routes, residual_token_inputs
from .lora_hooks import apply_static_lora_stack, create_hook_groups, apply_attention_hook_passes, _conditionings_with_pass
from .mask_renderer import render_selection
from .static_lora_passes import StaticLoRAPassRouter, prepare_static_models

WRAPPER_KEY = "bv_krea2_generation_lora_passes"
PASS_KEY = "bv_krea2_generation_lora_pass"
OWNER_KEY = "bv_krea2_generation_lora_owner"


def _validate_options(options):
    patches = options.get("patches", {})
    if any(key != "attn1_patch" or any(not isinstance(patch, Krea2AttentionPatch) for patch in values) for key, values in patches.items()):
        raise ValueError("Krea hybrid LoRAs require the native BV Krea attention layout without foreign attention patches")
    if options.get("patches_replace"):
        raise ValueError("Krea hybrid LoRAs do not support replacement attention patches")
    for kind, entries in options.get("wrappers", {}).items():
        for key, value in entries.items():
            if value and not (len(value) == 1 and ((kind == "diffusion_model" and key == TOKEN_WRAPPER) or (kind == "calc_cond_batch" and key == WRAPPER_KEY))):
                raise ValueError("Krea hybrid LoRAs cannot be combined with foreign sampler/model wrappers")


def compile_krea2_generation_loras(model, clip, document, scope_stacks, attention_strength, start_percent, end_percent):
    width, height = document["canvas"]["width"], document["canvas"]["height"]
    occupied = torch.zeros((1, height, width), dtype=torch.float32)
    active_regions = []
    for region in document["regions"]:
        if not region_used_for(region, "generation"):
            continue
        mask = render_selection({"document": document, "scope": "region", "region_id": region["id"]}, width, height).detach().float().clamp(0., 1.)
        if bool(torch.any(mask > 0)):
            active_regions.append(region)
            occupied = torch.maximum(occupied, mask)
    background_mask = 1. - occupied
    effective = dict(scope_stacks)
    effective.setdefault("background", effective.get("global", []))
    active_scopes = ["global", *[region["id"] for region in active_regions]]
    if bool(torch.any(background_mask > 0)):
        active_scopes.append("background")
    plan = plan_krea2_lora_routes(model, effective, active_scopes)
    common_model, _ = apply_static_lora_stack(model, None, plan.common)
    # CLIP sees complete effective stacks once, independently of MODEL routing.
    clip_scopes = {scope: [(path, 0., cs) for path, _, cs in entries if cs != 0] for scope, entries in effective.items()}
    hooks = create_hook_groups(clip_scopes)
    positive, negative, slots, aspect_ratio = compile_krea2_attention(document, clip, hooks)

    residual = dict(plan.multipass_scopes)
    # The uncovered image area follows an explicit Background stack if provided.
    residual["global"] = residual.get("background", residual.get("global", []))
    keys, models, indices = {}, [], {}
    for scope in ["global", *[region["id"] for region in active_regions]]:
        entries = residual.get(scope, [])
        key = tuple(entries)
        if key not in keys:
            variant, _ = apply_static_lora_stack(common_model, None, entries)
            keys[key] = len(models)
            models.append(variant)
        indices[scope] = keys[key]
    models = prepare_static_models(models)
    patched = apply_krea2_attention_patch(models[0], slots, aspect_ratio, attention_strength, start_percent, end_percent)
    token_slots, token_scopes = residual_token_inputs(slots, plan.token_scopes, background_mask)
    if any(token_scopes.values()):
        patched = apply_krea2_token_lora_patch(patched, token_slots, aspect_ratio, document, token_scopes, loaded_states=plan.states)
    logging.info("BV Krea generation LoRA routing: shared-static=%s; token-files=%s; spatial-static-variants=%d; residual-routes=%s",
                 [(path, strength) for path, strength, _ in plan.common],
                 sorted({entry[0] for entries in plan.token_scopes.values() for entry in entries}), len(models), plan.reasons)
    if len(models) == 1:
        return patched, positive, negative
    # Every variant uses the exact same token modules and attention runtime.
    # Only native weight patches differ. The delegate above shares one base model.
    for index in range(1, len(models)):
        for path, value in patched.object_patches.items():
            models[index].add_object_patch(path, value)
        models[index].model_options = copy.deepcopy(patched.model_options)
    models[0] = patched
    owner = str(uuid.uuid4())
    def tagged(conditioning, index, mask=None):
        return [[embedding, {**metadata, PASS_KEY: index, OWNER_KEY: owner}]
                for embedding, metadata in _conditionings_with_pass(conditioning, None, mask)]
    active_document = {**document, "regions": active_regions}
    positive, negative = apply_attention_hook_passes(positive, negative, active_document, residual, indices, pass_builder=tagged)
    import comfy.patcher_extension
    result = patched.clone()
    router = StaticLoRAPassRouter(tuple(models), owner, pass_key=PASS_KEY, owner_key=OWNER_KEY, validate_options=_validate_options, label="Krea generation")
    comfy.patcher_extension.add_wrapper_with_key(comfy.patcher_extension.WrappersMP.CALC_COND_BATCH,
        WRAPPER_KEY, router, result.model_options, is_model_options=True)
    return result, positive, negative

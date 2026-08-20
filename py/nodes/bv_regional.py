from __future__ import annotations

import json

from nodes import PreviewImage, SaveImage

from ..util.regional.document import (
    REGIONAL,
    SELECTION,
    default_document,
    parse_document,
    region_used_for,
    select_scope,
    selection_prompts,
    serialize_document,
)
from ..util.regional.mask_renderer import mask_bbox, render_selection
from ..util.regional.anima_adapter import ANIMA_REGIONS, compile_anima_adapter
from ..util.regional.color_control import compile_color_control
from ..util.regional.native_conditioning import compile_detailer_conditioning, compile_native_conditioning
from ..util.regional.lora_hooks import (
    BINDINGS,
    REGISTRY,
    add_named_stack,
    apply_attention_hook_passes,
    create_hook_groups,
    default_bindings,
    reconcile_bindings,
    resolve_stack_paths,
    resolve_scope_stacks,
)
from ..util.regional.sdxl_attention import compile_sdxl_attention, apply_sdxl_attention_patch
from ..util.regional.zimage_attention import compile_zimage_attention, apply_zimage_attention_patch
from ..util.regional.flux2_klein_attention import (
    compile_flux2_klein_attention,
    apply_flux2_klein_attention_patch,
)
from ..util.regional.krea2_attention import compile_krea2_attention, apply_krea2_attention_patch
from ..util.regional.krea2_token_lora import apply_krea2_token_lora_patch


AST = "BV_AST"
CATEGORY_ROOT = "🌀 BV Node Pack/regional"
CATEGORY_CORE = f"{CATEGORY_ROOT}/core"
CATEGORY_OUTPUT = f"{CATEGORY_ROOT}/output"
CATEGORY_INTEGRATIONS = f"{CATEGORY_ROOT}/integrations"
CATEGORY_INTEGRATION_IMPACT = f"{CATEGORY_INTEGRATIONS}/Impact Pack"
CATEGORY_MODELS = f"{CATEGORY_ROOT}/models"
CATEGORY_MODEL_GENERIC = f"{CATEGORY_MODELS}/Generic"
CATEGORY_MODEL_SDXL = f"{CATEGORY_MODELS}/SDXL"
CATEGORY_MODEL_ZIMAGE = f"{CATEGORY_MODELS}/Z-Image"
CATEGORY_MODEL_FLUX2_KLEIN = f"{CATEGORY_MODELS}/FLUX.2 Klein 9B"
CATEGORY_MODEL_KREA2 = f"{CATEGORY_MODELS}/Krea 2"
CATEGORY_MODEL_ANIMA = f"{CATEGORY_MODELS}/Anima"
DEFAULT_JSON = json.dumps(default_document(), ensure_ascii=False, separators=(",", ":"))
DEFAULT_LORA_BINDINGS_JSON = json.dumps(default_bindings(), ensure_ascii=False, separators=(",", ":"))


def apply_anima_token_lora_patch(*args, **kwargs):
    from ..util.regional.anima_token_lora import apply_anima_token_lora_patch as apply_patch

    return apply_patch(*args, **kwargs)


class BVRegionalPromptNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional_json": (
                    "STRING",
                    {"default": DEFAULT_JSON, "multiline": True, "dynamicPrompts": False},
                ),
            },
            "optional": {
                "lora_bindings_json": (
                    "STRING",
                    {"default": DEFAULT_LORA_BINDINGS_JSON, "multiline": True, "dynamicPrompts": False},
                ),
            },
        }

    RETURN_TYPES = (REGIONAL, BINDINGS)
    RETURN_NAMES = ("regional", "lora_bindings")
    FUNCTION = "build"
    CATEGORY = CATEGORY_CORE

    def build(self, regional_json, lora_bindings_json=None):
        document = parse_document(regional_json)
        return document, reconcile_bindings(lora_bindings_json, document)


class BVNamedLoraStackNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lora_stack": ("LORA_STACK", {}),
                "name": ("STRING", {"default": "LoRA Stack", "multiline": False}),
                "stack_id": ("STRING", {"default": "", "multiline": False}),
            },
            "optional": {"registry": (REGISTRY, {})},
        }

    RETURN_TYPES = (REGISTRY,)
    RETURN_NAMES = ("registry",)
    FUNCTION = "register"
    CATEGORY = CATEGORY_CORE
    DESCRIPTION = "Names an external LORA_STACK and adds it to a chainable BV regional registry."

    def register(self, lora_stack, name, stack_id, registry=None):
        return (add_named_stack(registry, stack_id, name, lora_stack),)


class BVRegionalDebugNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"regional": (REGIONAL, {})},
            "optional": {"pretty": ("BOOLEAN", {"default": True})},
        }

    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("regional_json", "summary", "document_id")
    OUTPUT_NODE = True
    FUNCTION = "run"
    CATEGORY = CATEGORY_CORE

    def run(self, regional, pretty=True):
        document = parse_document(regional)
        enabled = sum(1 for region in document["regions"] if region["enabled"])
        summary = (
            f"{document['title']} | {document['canvas']['width']}x{document['canvas']['height']} | "
            f"{len(document['regions'])} regions ({enabled} enabled) | overlap={document['overlap']['mode']}"
        )
        text = serialize_document(document, pretty=bool(pretty))
        return {"ui": {"regional_json": [text], "summary": [summary]}, "result": (text, summary, document["document_id"])}


class BVRegionalSelectNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL, {}),
                "scope": (["global", "background", "region"], {"default": "region"}),
                "region": ("STRING", {"default": "", "multiline": False}),
            }
        }

    RETURN_TYPES = (SELECTION, "STRING", "STRING")
    RETURN_NAMES = ("selection", "selected_id", "selected_name")
    FUNCTION = "select"
    CATEGORY = CATEGORY_CORE

    def select(self, regional, scope, region):
        selection = select_scope(regional, scope, region)
        if selection["region_id"] is None:
            return selection, scope, scope.title()
        selected = next(item for item in selection["document"]["regions"] if item["id"] == selection["region_id"])
        return selection, selected["id"], selected["name"]


class BVRegionalDeconstructorNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL, {}),
                "scope": (["global", "background", "region"], {"default": "region"}),
                "region": ("STRING", {"default": "", "multiline": False}),
            }
        }

    RETURN_TYPES = (SELECTION, AST, "STRING", "STRING", AST, "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = (
        "selection",
        "positive_ast",
        "positive_text",
        "positive_source",
        "negative_ast",
        "negative_text",
        "negative_source",
        "selected_id",
        "selected_name",
    )
    FUNCTION = "deconstruct"
    CATEGORY = CATEGORY_CORE

    def deconstruct(self, regional, scope, region):
        selection = select_scope(regional, scope, region)
        positive, negative = selection_prompts(selection)
        if selection["region_id"] is None:
            selected_id, selected_name = scope, scope.title()
        else:
            selected = next(
                item for item in selection["document"]["regions"] if item["id"] == selection["region_id"]
            )
            selected_id, selected_name = selected["id"], selected["name"]
        return (
            selection,
            positive["ast"],
            positive["text"],
            positive["source"],
            negative["ast"],
            negative["text"],
            negative["source"],
            selected_id,
            selected_name,
        )


class BVRegionalPromptExtractNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"selection": (SELECTION, {})}}

    RETURN_TYPES = (AST, "STRING", "STRING", AST, "STRING", "STRING")
    RETURN_NAMES = (
        "positive_ast",
        "positive_text",
        "positive_source",
        "negative_ast",
        "negative_text",
        "negative_source",
    )
    FUNCTION = "extract"
    CATEGORY = CATEGORY_CORE

    def extract(self, selection):
        positive, negative = selection_prompts(selection)
        return (
            positive["ast"],
            positive["text"],
            positive["source"],
            negative["ast"],
            negative["text"],
            negative["source"],
        )


class BVRegionalMaskRenderNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "selection": (SELECTION, {}),
                "width": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 1}),
                "height": ("INT", {"default": 1024, "min": 1, "max": 16384, "step": 1}),
            }
        }

    RETURN_TYPES = ("MASK", "INT", "INT", "INT", "INT")
    RETURN_NAMES = ("mask", "x", "y", "width", "height")
    FUNCTION = "render"
    CATEGORY = CATEGORY_CORE

    def render(self, selection, width, height):
        mask = render_selection(selection, int(width), int(height))
        return (mask,) + mask_bbox(mask)


class BVRegionalDetailerMaskNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL, {}),
                "image": ("IMAGE", {}),
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "vae": ("VAE", {}),
                "region": ("STRING", {"default": "", "multiline": False}),
                "global_influence": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05},
                ),
                "background_influence": (
                    "FLOAT",
                    {"default": 0.35, "min": 0.0, "max": 2.0, "step": 0.05},
                ),
                "primary_region_influence": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 2.0, "step": 0.05},
                ),
                "context_regions_json": (
                    "STRING",
                    {"default": "[]", "multiline": False},
                ),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "BASIC_PIPE", "CONDITIONING", "CONDITIONING", "STRING", "STRING", "STRING", "STRING", "INT", "INT", "INT", "INT", "STRING", "STRING")
    RETURN_NAMES = ("image", "mask", "basic_pipe", "positive", "negative", "positive_text", "negative_text", "positive_weighted_text", "negative_weighted_text", "x", "y", "width", "height", "region_id", "region_name")
    FUNCTION = "render"
    CATEGORY = CATEGORY_INTEGRATION_IMPACT
    DESCRIPTION = (
        "Renders one named BV region, compiles Global + Region conditioning and builds "
        "an Impact-compatible BASIC_PIPE for MaskDetailer workflows."
    )

    def render(
        self, regional, image, model, clip, vae, region,
        global_influence=1.0, background_influence=0.35,
        primary_region_influence=1.0, context_regions_json="[]",
    ):
        shape = getattr(image, "shape", None)
        if shape is None or len(shape) != 4 or int(shape[-1]) not in (1, 3, 4):
            raise ValueError("BV Regional Detailer Mask requires an IMAGE shaped B,H,W,C")
        if int(shape[0]) != 1:
            raise ValueError(
                "BV Regional Detailer Mask requires a single IMAGE because Impact detailers "
                "do not accept image batches"
            )
        selection = select_scope(regional, "region", region)
        selected = next(
            item for item in selection["document"]["regions"]
            if item["id"] == selection["region_id"]
        )
        if not region_used_for(selected, "detailer"):
            raise ValueError(
                f"Region '{selected['name']}' is not enabled for detailer output; "
                "set its usage to detailer or both"
            )
        mask = render_selection(selection, int(shape[2]), int(shape[1]))
        try:
            context_regions = json.loads(context_regions_json or "[]")
        except json.JSONDecodeError as exc:
            raise ValueError(f"context_regions_json contains invalid JSON: {exc}") from exc
        if not isinstance(context_regions, list):
            raise ValueError("context_regions_json must contain an array")
        positive, negative, positive_text, negative_text, positive_weighted_text, negative_weighted_text = compile_detailer_conditioning(
            selection["document"], clip, selected["id"], global_influence,
            background_influence, primary_region_influence, context_regions,
        )
        basic_pipe = (model, clip, vae, positive, negative)
        return (
            image, mask, basic_pipe, positive, negative, positive_text, negative_text,
            positive_weighted_text, negative_weighted_text,
        ) + mask_bbox(mask) + (selected["id"], selected["name"])


class BVRegionalNativeConditioningNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL, {}),
                "clip": ("CLIP", {}),
                "region_strength_multiplier": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 10.0, "step": 0.05},
                ),
                "native_composition": (
                    ["blend", "exclusive", "hybrid", "mask_bounds"],
                    {
                        "default": "blend",
                        "tooltip": "mask_bounds requires a 2D image latent and is not supported by Anima; use blend or exclusive for Anima.",
                    },
                ),
                "hybrid_blend_ratio": (
                    "FLOAT",
                    {
                        "default": 0.35,
                        "min": 0.0,
                        "max": 1.0,
                        "step": 0.05,
                        "tooltip": "Used only by hybrid: 0 is exclusive, 1 is blend.",
                    },
                ),
            },
            "optional": {
                "lora_registry": (REGISTRY, {}),
                "lora_bindings": (BINDINGS, {}),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "compile"
    CATEGORY = CATEGORY_MODEL_GENERIC
    DESCRIPTION = (
        "Compiles BV Regional into blend, exclusive, hybrid or mask-bounds native ComfyUI conditioning for a standard KSampler. "
        "mask_bounds requires a 2D image latent and is rejected for Anima with a compatibility error."
    )

    def compile(self, regional, clip, region_strength_multiplier=1.0, native_composition="blend", hybrid_blend_ratio=0.35, lora_registry=None, lora_bindings=None):
        document = parse_document(regional)
        scope_stacks = resolve_stack_paths(
            resolve_scope_stacks(lora_registry, lora_bindings, document)
        )
        hook_groups = create_hook_groups(scope_stacks)
        return compile_native_conditioning(
            document, clip, region_strength_multiplier, hook_groups,
            composition_mode=native_composition, hybrid_blend_ratio=hybrid_blend_ratio,
        )


class BVRegionalSDXLAttentionNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "regional": (REGIONAL, {}),
                "attention_strength": (
                    "FLOAT",
                    {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01},
                ),
                "start_percent": (
                    "FLOAT",
                    {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001},
                ),
                "end_percent": (
                    "FLOAT",
                    {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.001},
                ),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_SDXL
    DESCRIPTION = (
        "SDXL cross-attention routing backend for Illustrious, Pony XL "
        "and other SDXL-family checkpoints. Uses a standard KSampler."
    )

    def apply(self, model, clip, regional, attention_strength, start_percent, end_percent):
        positive, negative, slots, aspect_ratio = compile_sdxl_attention(regional, clip)
        patched_model = apply_sdxl_attention_patch(
            model,
            slots,
            aspect_ratio,
            attention_strength,
            start_percent,
            end_percent,
        )
        return patched_model, positive, negative


class BVRegionalZImageAttentionNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "regional": (REGIONAL, {}),
                "attention_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_ZIMAGE
    DESCRIPTION = "Joint-attention regional routing backend for Z-Image Turbo. Uses a standard KSampler."

    def apply(self, model, clip, regional, attention_strength, start_percent, end_percent):
        positive, negative, slots, _ = compile_zimage_attention(regional, clip)
        patched_model = apply_zimage_attention_patch(
            model, slots, attention_strength, start_percent, end_percent
        )
        return patched_model, positive, negative


class BVRegionalFlux2KleinAttentionNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "regional": (REGIONAL, {}),
                "attention_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_FLUX2_KLEIN
    DESCRIPTION = (
        "Joint-attention regional routing for the exact FLUX.2 Klein 9B architecture. "
        "The distilled profile uses zero negative conditioning and a standard KSampler."
    )

    def apply(self, model, clip, regional, attention_strength, start_percent, end_percent):
        positive, negative, slots, aspect_ratio = compile_flux2_klein_attention(regional, clip)
        patched_model = apply_flux2_klein_attention_patch(
            model,
            slots,
            aspect_ratio,
            attention_strength,
            start_percent,
            end_percent,
        )
        return patched_model, positive, negative


class BVRegionalKrea2AttentionNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "regional": (REGIONAL, {}),
                "attention_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.001}),
                "regional_lora_mode": (["multipass_legacy", "token_gated_singlepass"], {
                    "default": "token_gated_singlepass",
                    "tooltip": "Legacy evaluates one masked model pass per distinct LoRA stack. "
                               "Token-gated single-pass is experimental and changes results.",
                }),
            },
            "optional": {
                "lora_registry": (REGISTRY, {}),
                "lora_bindings": (BINDINGS, {}),
            },
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_KREA2
    EXPERIMENTAL = True
    DESCRIPTION = (
        "Experimental joint-attention regional routing for Krea 2 Raw and Turbo. "
        "Routes the 28 main DiT blocks with a standard KSampler; Krea's four upstream "
        "text-fusion blocks remain global. Turbo negatives require a sampler CFG branch. "
        "Regional LoRAs default to token-gated single-pass; the previous multi-pass "
        "execution remains available as multipass_legacy."
    )

    def apply(
        self,
        model,
        clip,
        regional,
        attention_strength,
        start_percent,
        end_percent,
        regional_lora_mode="token_gated_singlepass",
        lora_registry=None,
        lora_bindings=None,
    ):
        if regional_lora_mode not in {"multipass_legacy", "token_gated_singlepass"}:
            raise ValueError("regional_lora_mode must be multipass_legacy or token_gated_singlepass")
        document = parse_document(regional)
        scope_stacks = resolve_stack_paths(
            resolve_scope_stacks(lora_registry, lora_bindings, document)
        )
        hook_groups = create_hook_groups(scope_stacks)
        positive, negative, slots, aspect_ratio = compile_krea2_attention(
            document, clip, hook_groups
        )
        if regional_lora_mode == "multipass_legacy":
            positive, negative = apply_attention_hook_passes(
                positive, negative, document, scope_stacks, hook_groups
            )
        patched_model = apply_krea2_attention_patch(
            model, slots, aspect_ratio, attention_strength, start_percent, end_percent
        )
        if regional_lora_mode == "token_gated_singlepass":
            patched_model = apply_krea2_token_lora_patch(
                patched_model, slots, aspect_ratio, document, scope_stacks
            )
        return patched_model, positive, negative


class BVRegionalAnimaAdapterNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL, {}),
                "clip": ("CLIP", {}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", ANIMA_REGIONS, "CONDITIONING")
    RETURN_NAMES = ("positive", "negative", "regions", "background")
    FUNCTION = "compile"
    CATEGORY = CATEGORY_MODEL_ANIMA
    DESCRIPTION = "Compiles BV Regional for Comfyui-Anima-Regional-Conditioning without a per-region node chain."

    def compile(self, regional, clip):
        return compile_anima_adapter(regional, clip)


class BVRegionalAnimaConditioningNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL", {}),
                "clip": ("CLIP", {}),
                "regional": (REGIONAL, {}),
                "base_mode": (["disabled", "uncovered_only", "global"], {"default": "disabled"}),
                "base_strength": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 10.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 0.35, "min": 0.0, "max": 1.0, "step": 0.001}),
                "cross_mask_strength": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "self_mask_strength": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.01}),
                "base_ratio": ("FLOAT", {"default": 0.1, "min": 0.0, "max": 1.0, "step": 0.01}),
                "cross_inject_every_n_blocks": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
                "self_inject_every_n_blocks": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
                "regional_lora_mode": (["multipass_legacy", "token_gated_singlepass"], {
                    "default": "multipass_legacy",
                    "tooltip": "Legacy preserves published Anima results. Single-pass is an experimental token-gated model-LoRA path.",
                }),
            },
            "optional": {
                "lora_registry": (REGISTRY, {}),
                "lora_bindings": (BINDINGS, {}),
            },
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_ANIMA
    DESCRIPTION = (
        "Compiles BV Regional and applies the built-in Anima attention patch for a standard KSampler. "
        "Legacy regional LoRA hook passes preserve published results; token-gated single-pass is experimental."
    )

    def apply(
        self,
        model,
        clip,
        regional,
        base_mode,
        base_strength,
        start_percent,
        end_percent,
        cross_mask_strength,
        self_mask_strength,
        base_ratio,
        cross_inject_every_n_blocks,
        self_inject_every_n_blocks,
        regional_lora_mode="multipass_legacy",
        lora_registry=None,
        lora_bindings=None,
    ):
        if regional_lora_mode not in {"multipass_legacy", "token_gated_singlepass"}:
            raise ValueError("regional_lora_mode must be multipass_legacy or token_gated_singlepass")
        try:
            from ..util.regional.anima_patcher import ApplyAnimaRegionalConditioningPatch
        except ImportError as error:
            raise RuntimeError(
                "BV Regional Anima Conditioning could not load its model-specific backend. "
                "Update ComfyUI and verify the dependencies reported by the original import error."
            ) from error

        document = parse_document(regional)
        scope_stacks = resolve_stack_paths(
            resolve_scope_stacks(lora_registry, lora_bindings, document)
        )
        hook_groups = create_hook_groups(scope_stacks)
        positive, negative, regions, background = compile_anima_adapter(document, clip, hook_groups)
        if regional_lora_mode == "multipass_legacy":
            positive, negative = apply_attention_hook_passes(
                positive, negative, document, scope_stacks, hook_groups
            )
        patched_model = ApplyAnimaRegionalConditioningPatch().apply(
            model=model,
            regions=regions,
            base_mode=base_mode,
            base_strength=base_strength,
            start_percent=start_percent,
            end_percent=end_percent,
            cross_mask_strength=cross_mask_strength,
            self_mask_strength=self_mask_strength,
            base_ratio=base_ratio,
            cross_inject_every_n_blocks=cross_inject_every_n_blocks,
            self_inject_every_n_blocks=self_inject_every_n_blocks,
            background_conditioning=background,
        )[0]
        if regional_lora_mode == "token_gated_singlepass":
            patched_model = apply_anima_token_lora_patch(patched_model, scope_stacks)
        return patched_model, positive, negative


class BVRegionalColorControlImageNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"regional": (REGIONAL, {})}}

    RETURN_TYPES = ("IMAGE", "STRING")
    RETURN_NAMES = ("control_image", "legend_json")
    FUNCTION = "compile"
    CATEGORY = CATEGORY_MODEL_ANIMA
    DESCRIPTION = "Compiles BV Regional into a solid RGB region-control image and a deterministic color legend."

    def compile(self, regional):
        image, legend = compile_color_control(regional)
        return image, json.dumps(legend, ensure_ascii=False, sort_keys=True)


class BVRegionalAnimaLLLiteNode:
    @classmethod
    def INPUT_TYPES(cls):
        try:
            import folder_paths

            model_patches = folder_paths.get_filename_list("model_patches")
        except (ImportError, KeyError):
            model_patches = []
        return {
            "required": {
                "model": ("MODEL", {}),
                "regional": (REGIONAL, {}),
                "model_patch_name": (model_patches,),
                "strength": ("FLOAT", {"default": 1.0, "min": -10.0, "max": 10.0, "step": 0.01}),
                "start_percent": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.001}),
                "end_percent": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.001}),
            }
        }

    RETURN_TYPES = ("MODEL", "IMAGE", "STRING")
    RETURN_NAMES = ("patched_model", "control_image", "legend_json")
    FUNCTION = "apply"
    CATEGORY = CATEGORY_MODEL_ANIMA
    DESCRIPTION = (
        "Loads a local Anima LLLite MODEL_PATCH, compiles BV Regional into its color control image, "
        "and applies it through ComfyUI's native model-patch runtime."
    )

    def apply(self, model, regional, model_patch_name, strength, start_percent, end_percent):
        if start_percent > end_percent:
            raise ValueError("start_percent must not exceed end_percent")
        try:
            from comfy_extras.nodes_model_patch import AnimaLLLiteApply, ModelPatchLoader
        except ImportError as error:
            raise RuntimeError(
                "BV Regional Anima LLLite requires a current ComfyUI build with "
                "ModelPatchLoader and AnimaLLLiteApply support."
            ) from error

        control_image, legend = compile_color_control(regional)
        model_patch = ModelPatchLoader().load_model_patch(model_patch_name)[0]
        patched_model = AnimaLLLiteApply().apply_patch(
            model,
            model_patch,
            control_image,
            float(strength),
            float(start_percent),
            float(end_percent),
        )[0]
        return patched_model, control_image, json.dumps(legend, ensure_ascii=False, sort_keys=True)


class _BVRegionalImageTargetMixin:
    @staticmethod
    def _validate_target(document_id):
        target = str(document_id).strip()
        if not target:
            raise ValueError("document_id is required; select a BV Regional Prompt target")
        return target

    @staticmethod
    def _targeted_output(output, images, target):
        output["ui"]["bv_regional_background"] = [{"document_id": target}]
        output["result"] = (images,)
        return output


class BVRegionalImageSendNode(_BVRegionalImageTargetMixin, PreviewImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {}),
                "document_id": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "send"
    OUTPUT_NODE = True
    CATEGORY = CATEGORY_OUTPUT
    DESCRIPTION = "Previews an image, sends it to a selected BV Regional Editor, and passes the image through."

    def send(self, images, document_id, prompt=None, extra_pnginfo=None):
        target = self._validate_target(document_id)
        output = self.save_images(images, "bv_regional_background", prompt, extra_pnginfo)
        return self._targeted_output(output, images, target)


class BVRegionalImageSaveNode(_BVRegionalImageTargetMixin, SaveImage):
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE", {}),
                "filename_prefix": ("STRING", {"default": "BV_Regional"}),
                "document_id": ("STRING", {"default": "", "multiline": False}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO"},
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = CATEGORY_OUTPUT
    DESCRIPTION = "Saves an image, sends the saved result to a selected BV Regional Editor, and passes the image through."

    def save(self, images, filename_prefix, document_id, prompt=None, extra_pnginfo=None):
        target = self._validate_target(document_id)
        output = self.save_images(images, filename_prefix, prompt, extra_pnginfo)
        return self._targeted_output(output, images, target)


NODE_CLASS_MAPPINGS = {
    "BV Regional Prompt": BVRegionalPromptNode,
    "BV Named LoRA Stack": BVNamedLoraStackNode,
    "BV Regional Debug": BVRegionalDebugNode,
    "BV Regional Select": BVRegionalSelectNode,
    "BV Regional Deconstructor": BVRegionalDeconstructorNode,
    "BV Regional Prompt Extract": BVRegionalPromptExtractNode,
    "BV Regional Mask Render": BVRegionalMaskRenderNode,
    "BV Regional Detailer Mask": BVRegionalDetailerMaskNode,
    "BV Regional Native Conditioning": BVRegionalNativeConditioningNode,
    "BV Regional SDXL Attention": BVRegionalSDXLAttentionNode,
    "BV Regional Z-Image Attention": BVRegionalZImageAttentionNode,
    "BV Regional FLUX.2 Klein 9B Attention": BVRegionalFlux2KleinAttentionNode,
    "BV Regional Krea 2 Attention": BVRegionalKrea2AttentionNode,
    "BV Regional Anima Adapter": BVRegionalAnimaAdapterNode,
    "BV Regional Anima Conditioning": BVRegionalAnimaConditioningNode,
    "BV Regional Color Control Image": BVRegionalColorControlImageNode,
    "BV Regional Anima LLLite": BVRegionalAnimaLLLiteNode,
    "BV Regional Image Send": BVRegionalImageSendNode,
    "BV Regional Image Save": BVRegionalImageSaveNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Regional Prompt": "🌀 BV Regional Prompt",
    "BV Named LoRA Stack": "🌀 BV Named LoRA Stack",
    "BV Regional Debug": "🌀 BV Regional Debug",
    "BV Regional Select": "🌀 BV Regional Select",
    "BV Regional Deconstructor": "🌀 BV Regional Deconstructor",
    "BV Regional Prompt Extract": "🌀 BV Regional Prompt Extract",
    "BV Regional Mask Render": "🌀 BV Regional Mask Render",
    "BV Regional Detailer Mask": "🌀 BV Regional Detailer Mask",
    "BV Regional Native Conditioning": "🌀 BV Regional Native Conditioning",
    "BV Regional SDXL Attention": "🌀 BV Regional SDXL Attention",
    "BV Regional Z-Image Attention": "🌀 BV Regional Z-Image Attention",
    "BV Regional FLUX.2 Klein 9B Attention": "🌀 BV Regional FLUX.2 Klein 9B Attention",
    "BV Regional Krea 2 Attention": "🌀 BV Regional Krea 2 Attention (Experimental)",
    "BV Regional Anima Adapter": "🌀 BV Regional Anima Adapter",
    "BV Regional Anima Conditioning": "🌀 BV Regional Anima Conditioning",
    "BV Regional Color Control Image": "🌀 BV Regional Color Control Image",
    "BV Regional Anima LLLite": "🌀 BV Regional Anima LLLite",
    "BV Regional Image Send": "🌀 BV Regional Preview Send",
    "BV Regional Image Save": "🌀 BV Regional Save Send",
}

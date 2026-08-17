from __future__ import annotations

import json

from nodes import PreviewImage, SaveImage

from ..util.regional.document import (
    REGIONAL,
    SELECTION,
    default_document,
    parse_document,
    select_scope,
    selection_prompts,
    serialize_document,
)
from ..util.regional.mask_renderer import mask_bbox, render_selection
from ..util.regional.anima_adapter import ANIMA_REGIONS, compile_anima_adapter
from ..util.regional.native_conditioning import compile_native_conditioning


AST = "BV_AST"
CATEGORY = "🌀 BV Node Pack/regional"
DEFAULT_JSON = json.dumps(default_document(), ensure_ascii=False, separators=(",", ":"))


class BVRegionalPromptNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional_json": (
                    "STRING",
                    {"default": DEFAULT_JSON, "multiline": True, "dynamicPrompts": False},
                ),
            }
        }

    RETURN_TYPES = (REGIONAL,)
    RETURN_NAMES = ("regional",)
    FUNCTION = "build"
    CATEGORY = CATEGORY

    def build(self, regional_json):
        return (parse_document(regional_json),)


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
    CATEGORY = CATEGORY

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
    CATEGORY = CATEGORY

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
    CATEGORY = CATEGORY

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
    CATEGORY = CATEGORY

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
    CATEGORY = CATEGORY

    def render(self, selection, width, height):
        mask = render_selection(selection, int(width), int(height))
        return (mask,) + mask_bbox(mask)


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
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("positive", "negative")
    FUNCTION = "compile"
    CATEGORY = CATEGORY
    DESCRIPTION = "Compiles BV Regional into native ComfyUI masked conditioning for a standard KSampler."

    def compile(self, regional, clip, region_strength_multiplier=1.0):
        return compile_native_conditioning(regional, clip, region_strength_multiplier)


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
    CATEGORY = CATEGORY
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
                "self_mask_strength": ("FLOAT", {"default": 0.2, "min": 0.0, "max": 1.0, "step": 0.01}),
                "base_ratio": ("FLOAT", {"default": 0.1, "min": 0.0, "max": 1.0, "step": 0.01}),
                "cross_inject_every_n_blocks": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
                "self_inject_every_n_blocks": ("INT", {"default": 1, "min": 1, "max": 100, "step": 1}),
            }
        }

    RETURN_TYPES = ("MODEL", "CONDITIONING", "CONDITIONING")
    RETURN_NAMES = ("patched_model", "positive", "negative")
    FUNCTION = "apply"
    CATEGORY = CATEGORY
    DESCRIPTION = "Compiles BV Regional and applies the built-in Anima attention patch for a standard KSampler."

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
    ):
        try:
            from ..util.regional.anima_patcher import ApplyAnimaRegionalConditioningPatch
        except ImportError as error:
            raise RuntimeError(
                "BV Regional Anima Conditioning could not load its model-specific backend. "
                "Update ComfyUI and verify the dependencies reported by the original import error."
            ) from error

        positive, negative, regions, background = compile_anima_adapter(regional, clip)
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
        return patched_model, positive, negative


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
    CATEGORY = CATEGORY
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
    CATEGORY = CATEGORY
    DESCRIPTION = "Saves an image, sends the saved result to a selected BV Regional Editor, and passes the image through."

    def save(self, images, filename_prefix, document_id, prompt=None, extra_pnginfo=None):
        target = self._validate_target(document_id)
        output = self.save_images(images, filename_prefix, prompt, extra_pnginfo)
        return self._targeted_output(output, images, target)


NODE_CLASS_MAPPINGS = {
    "BV Regional Prompt": BVRegionalPromptNode,
    "BV Regional Debug": BVRegionalDebugNode,
    "BV Regional Select": BVRegionalSelectNode,
    "BV Regional Deconstructor": BVRegionalDeconstructorNode,
    "BV Regional Prompt Extract": BVRegionalPromptExtractNode,
    "BV Regional Mask Render": BVRegionalMaskRenderNode,
    "BV Regional Native Conditioning": BVRegionalNativeConditioningNode,
    "BV Regional Anima Adapter": BVRegionalAnimaAdapterNode,
    "BV Regional Anima Conditioning": BVRegionalAnimaConditioningNode,
    "BV Regional Image Send": BVRegionalImageSendNode,
    "BV Regional Image Save": BVRegionalImageSaveNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Regional Prompt": "🌀 BV Regional Prompt",
    "BV Regional Debug": "🌀 BV Regional Debug",
    "BV Regional Select": "🌀 BV Regional Select",
    "BV Regional Deconstructor": "🌀 BV Regional Deconstructor",
    "BV Regional Prompt Extract": "🌀 BV Regional Prompt Extract",
    "BV Regional Mask Render": "🌀 BV Regional Mask Render",
    "BV Regional Native Conditioning": "🌀 BV Regional Native Conditioning",
    "BV Regional Anima Adapter": "🌀 BV Regional Anima Adapter",
    "BV Regional Anima Conditioning": "🌀 BV Regional Anima Conditioning",
    "BV Regional Image Send": "🌀 BV Regional Preview Send",
    "BV Regional Image Save": "🌀 BV Regional Save Send",
}

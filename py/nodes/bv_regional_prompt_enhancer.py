from __future__ import annotations

import json

from ..util.regional.document import REGIONAL
from ..util.regional.prompt_enhancer import (
    ENHANCEMENT_RESULT,
    LLM_PROVIDER,
    ComfyClipGenerateProvider,
    apply_enhancement,
    build_request,
    build_repair_request,
    enhancement_result,
    preservation_issues,
    prompt_bundle_fingerprint,
    regional_policy_issues,
    regional_source_warnings,
)


CATEGORY = "🌀 BV Node Pack/regional/prompt enhancement"


class BVComfyClipLLMProviderNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"clip": ("CLIP",)}}

    RETURN_TYPES = (LLM_PROVIDER,)
    RETURN_NAMES = ("provider",)
    FUNCTION = "build"
    CATEGORY = CATEGORY
    DESCRIPTION = "Wraps a compatible generative ComfyUI CLIP and fails before inference when generation is unavailable."

    def build(self, clip):
        return (ComfyClipGenerateProvider(clip),)


class BVRegionalPromptEnhancerNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "regional": (REGIONAL,),
                "provider": (LLM_PROVIDER,),
                "instruction": (
                    "STRING",
                    {
                        "default": "Improve clarity, visual specificity, and coherence while preserving intent and BV markup.",
                        "multiline": True,
                    },
                ),
                "max_output_tokens": ("INT", {"default": 2048, "min": 128, "max": 32768, "step": 64}),
                "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFFFFFFFFFF}),
            }
        }

    RETURN_TYPES = (ENHANCEMENT_RESULT, "STRING", "STRING")
    RETURN_NAMES = ("enhancement", "diff_json", "diagnostics")
    FUNCTION = "enhance"
    CATEGORY = CATEGORY
    DESCRIPTION = "Produces verified prompt-only changes without mutating the source BV_REGIONAL document."

    @classmethod
    def IS_CHANGED(cls, **_kwargs):
        return prompt_bundle_fingerprint()

    def enhance(self, regional, provider, instruction, max_output_tokens, seed):
        if not callable(getattr(provider, "generate", None)):
            raise ValueError("provider is not a valid BV_LLM_PROVIDER")
        request = build_request(regional, instruction, max_output_tokens, seed)
        source_warnings = regional_source_warnings(regional)
        response = provider.generate(request)
        result = enhancement_result(regional, response, request)
        validation_issues = list(result["diagnostics"])
        if result["valid"]:
            validation_issues = [
                *preservation_issues(regional, result["proposal"], request.policy_id),
                *regional_policy_issues(regional, result["proposal"], request.policy_id),
            ]
        initial_validation_issues = list(validation_issues)
        repaired = False
        if validation_issues:
            repaired = True
            repair_request = build_repair_request(request, response.raw_text, validation_issues)
            repair_response = provider.generate(repair_request)
            result = enhancement_result(regional, repair_response, repair_request)
            validation_issues = list(result["diagnostics"])
            if result["valid"]:
                validation_issues = [
                    *preservation_issues(regional, result["proposal"], request.policy_id),
                    *regional_policy_issues(regional, result["proposal"], request.policy_id),
                ]
            if validation_issues:
                result["valid"] = False
                result["proposal"] = None
                result["diff"] = []
                result["diagnostics"] = ["repair attempt failed", *validation_issues]
            else:
                result["diagnostics"] = ["repaired after initial rejection", *initial_validation_issues]
        bundle_label = f"bundle v{request.prompt_bundle_version} {request.prompt_bundle_hash[:12]} · {request.policy_id}"
        if result["valid"]:
            diagnostics = f"OK{' · repaired' if repaired else ''} · {bundle_label}"
            if repaired and initial_validation_issues:
                diagnostics += "\nInitial rejection:\n- " + "\n- ".join(initial_validation_issues)
            if source_warnings:
                diagnostics += "\nSource warnings:\n- " + "\n- ".join(source_warnings)
                result["diagnostics"].extend(source_warnings)
        else:
            diagnostics = f"Rejected · {bundle_label}:\n- " + "\n- ".join(result["diagnostics"])
            if source_warnings:
                diagnostics += "\nSource warnings:\n- " + "\n- ".join(source_warnings)
        return result, json.dumps(result["diff"], ensure_ascii=False, indent=2), diagnostics


class BVApplyRegionalEnhancementNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"regional": (REGIONAL,), "enhancement": (ENHANCEMENT_RESULT,)}}

    RETURN_TYPES = (REGIONAL,)
    RETURN_NAMES = ("regional",)
    FUNCTION = "apply"
    CATEGORY = CATEGORY
    DESCRIPTION = "Applies a verified result; invalid, stale, or mismatched results return the source unchanged."

    def apply(self, regional, enhancement):
        return (apply_enhancement(regional, enhancement),)


NODE_CLASS_MAPPINGS = {
    "BV Comfy CLIP LLM Provider": BVComfyClipLLMProviderNode,
    "BV Regional Prompt Enhancer": BVRegionalPromptEnhancerNode,
    "BV Apply Regional Enhancement": BVApplyRegionalEnhancementNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV Comfy CLIP LLM Provider": "🌀 BV Comfy CLIP LLM Provider",
    "BV Regional Prompt Enhancer": "🌀 BV Regional Prompt Enhancer",
    "BV Apply Regional Enhancement": "🌀 BV Apply Regional Enhancement",
}

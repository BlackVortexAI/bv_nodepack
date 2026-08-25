from __future__ import annotations

import copy
import hashlib
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

from .document import RegionalValidationError, parse_document
from .context import context_document, is_v3_context, normalize_context


LLM_PROVIDER = "BV_LLM_PROVIDER"
ENHANCEMENT_RESULT = "BV_ENHANCEMENT_RESULT"
MAX_RESPONSE_BYTES = 262_144
MAX_JSON_DEPTH = 16
MAX_PROMPT_CHARS = 32_768
MAX_TOTAL_PROMPT_CHARS = 131_072
PROMPT_BUNDLE_PATH = Path(__file__).resolve().parents[3] / "data" / "ai" / "prompts" / "regional_enhancer_v1.json"
PRESERVATION_GRAMMAR_WORDS = frozenset({
    "a", "an", "and", "at", "by", "in", "is", "of", "on", "the", "their", "to", "with", "wearing",
})
PRESERVATION_REMOVABLE_WORDS = frozenset()
PRESERVATION_EQUIVALENTS = {
    "boy": "man",
    "duplicated": "duplicate",
    "duplicates": "duplicate",
    "girl": "woman",
    "place": "place",
    "places": "place",
    "position": "place",
    "positions": "place",
    "seated": "sitting",
    "wooden": "wood",
    "woman": "woman",
    "man": "man",
}
SPATIAL_WORDS = frozenset({
    "bottom", "center", "centered", "central", "left", "lower", "middle", "right", "top", "upper",
})


class EnhancementVerificationError(ValueError):
    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__("Invalid BV enhancement response:\n- " + "\n- ".join(issues))


@dataclass(frozen=True)
class LLMCapabilities:
    structured_output: str
    deterministic_seed: bool
    media: frozenset[str]
    local_execution: bool
    model_identity: str


@dataclass(frozen=True)
class LLMRequest:
    system_prompt: str
    user_prompt: str
    repair_protocol: str
    max_output_tokens: int
    seed: int
    prompt_bundle_version: int
    prompt_bundle_hash: str
    policy_id: str
    prompt_language: str = "hybrid_tags_and_language"
    creativity: float = 0.5


@dataclass(frozen=True)
class LLMResponse:
    raw_text: str
    provider_id: str
    model_identity: str
    finish_reason: str | None = None
    warnings: tuple[str, ...] = ()


class LLMProvider(Protocol):
    provider_id: str
    capabilities: LLMCapabilities

    def generate(self, request: LLMRequest) -> LLMResponse: ...


@dataclass(frozen=True)
class PromptBundle:
    version: int
    default_policy: str
    structure_protocol: str
    repair_protocol: str
    policies: dict[str, str]
    sha256: str


class PromptBundleError(ValueError):
    pass


def load_prompt_bundle(path: Path | None = None) -> PromptBundle:
    bundle_path = path or PROMPT_BUNDLE_PATH
    try:
        raw = bundle_path.read_bytes()
    except OSError as error:
        raise PromptBundleError(f"Cannot read BV prompt bundle '{bundle_path}': {error}") from error
    try:
        value = json.loads(raw.decode("utf-8"), object_pairs_hook=_object_no_duplicates)
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
        raise PromptBundleError(f"Invalid BV prompt bundle JSON in '{bundle_path}': {error}") from error
    required = {"schema", "version", "default_policy", "structure_protocol", "repair_protocol", "policies"}
    if not isinstance(value, dict) or set(value) != required:
        raise PromptBundleError(
            "BV prompt bundle must contain exactly schema, version, default_policy, structure_protocol, repair_protocol, policies"
        )
    if value["schema"] != "bv.ai.regional_enhancer_prompts" or value["version"] != 1:
        raise PromptBundleError("BV prompt bundle schema/version is unsupported")
    if not isinstance(value["structure_protocol"], str) or not value["structure_protocol"].strip():
        raise PromptBundleError("BV prompt bundle structure_protocol must be a non-empty string")
    if not isinstance(value["repair_protocol"], str) or not value["repair_protocol"].strip():
        raise PromptBundleError("BV prompt bundle repair_protocol must be a non-empty string")
    policies = value["policies"]
    if not isinstance(policies, dict) or not policies:
        raise PromptBundleError("BV prompt bundle policies must be a non-empty object")
    if any(not isinstance(key, str) or not key or not isinstance(text, str) or not text.strip() for key, text in policies.items()):
        raise PromptBundleError("BV prompt bundle policies must have non-empty string IDs and text")
    default_policy = value["default_policy"]
    if not isinstance(default_policy, str) or default_policy not in policies:
        raise PromptBundleError("BV prompt bundle default_policy must reference an existing policy")
    return PromptBundle(
        version=1,
        default_policy=default_policy,
        structure_protocol=value["structure_protocol"].strip(),
        repair_protocol=value["repair_protocol"].strip(),
        policies=dict(policies),
        sha256=hashlib.sha256(raw).hexdigest(),
    )


def prompt_bundle_fingerprint(path: Path | None = None) -> str:
    return load_prompt_bundle(path).sha256


def _prompt_words(text: str) -> set[str]:
    words: set[str] = set()
    for token in re.findall(r"[A-Za-z]+", text.casefold()):
        normalized = PRESERVATION_EQUIVALENTS.get(token, token)
        words.add(normalized)
        if normalized.endswith("s") and len(normalized) > 3:
            words.add(normalized[:-1])
    return words


def _anima_persona_contract(document: dict[str, Any]) -> tuple[str, ...]:
    global_positive = document["prompts"]["global"]["positive_source"]
    if not re.search(r"\btwo\b", global_positive, re.IGNORECASE) or not re.search(
        r"\bpeople\b", global_positive, re.IGNORECASE
    ):
        return ()
    personas: list[tuple[str, str]] = []
    tags = {"woman": "1girl", "man": "1boy"}
    for region in document["regions"]:
        if not region["enabled"]:
            continue
        positive = region["prompts"]["positive_source"].strip()
        if not positive:
            continue
        leading_clause = re.split(r"[,.;!?]", positive, maxsplit=1)[0]
        subjects = {subject for subject in tags if subject in _prompt_words(leading_clause)}
        if len(subjects) != 1:
            continue
        subject = next(iter(subjects))
        personas.append((subject, tags[subject]))
    if sorted(subject for subject, _clause in personas) != ["man", "woman"]:
        return ()
    return tuple(clause for _subject, clause in personas)


def preservation_issues(
    document: Any,
    proposal: dict[str, Any],
    policy_id: str = "balanced_v1",
    creativity: float = 0.0,
) -> list[str]:
    clean = context_document(document)
    creative_level = _normalized_creativity(creativity)
    semantic_rewrite_allowed = (
        policy_id in {"anima_hybrid_v1", "natural_language_v1"}
        and creative_level >= 0.4
    )
    issues: list[str] = []

    def check(path: str, before: str, after: str, allowed_context_words: frozenset[str] = frozenset()) -> None:
        before_words = _prompt_words(before)
        after_words = _prompt_words(after)
        source_words = before_words | PRESERVATION_GRAMMAR_WORDS | allowed_context_words
        introduced = sorted(after_words - source_words)
        if not semantic_rewrite_allowed:
            allowed_additions = _creative_word_budget(policy_id, creative_level)
            if introduced and allowed_additions is not None and len(introduced) > allowed_additions:
                issues.append(
                    f"{path} introduces {len(introduced)} creative terms, exceeding the "
                    f"creativity budget of {allowed_additions}: {', '.join(introduced)}"
                )
        required_source_words = before_words - PRESERVATION_REMOVABLE_WORDS - PRESERVATION_GRAMMAR_WORDS
        removed = sorted(required_source_words - after_words)
        if removed and not semantic_rewrite_allowed:
            issues.append(f"{path} removes source-supported terms: {', '.join(removed)}")

    for scope in ("global", "background"):
        for key in ("positive_source", "negative_source"):
            context_words = (
                frozenset().union(*(_prompt_words(clause) for clause in _anima_persona_contract(clean)))
                if policy_id == "anima_hybrid_v1" and scope == "global" and key == "positive_source"
                else frozenset()
            )
            check(
                f"prompts.{scope}.{key}",
                clean["prompts"][scope][key],
                proposal["prompts"][scope][key],
                context_words,
            )
    for index, region in enumerate(clean["regions"]):
        context_words = _region_spatial_words(_region_bounds(region))
        for key in ("positive_source", "negative_source"):
            check(
                f"regions[{index}].prompts.{key}",
                region["prompts"][key],
                proposal["regions"][index][key],
                context_words,
            )
    return issues


def _normalized_creativity(value: float) -> float:
    try:
        numeric = float(value)
    except (TypeError, ValueError) as error:
        raise ValueError("creativity must be a number between 0.0 and 1.0") from error
    if not 0.0 <= numeric <= 1.0:
        raise ValueError("creativity must be between 0.0 and 1.0")
    return round(numeric, 3)


def _creative_word_budget(policy_id: str, creativity: float) -> int | None:
    """Defence-in-depth ceiling; semantic permission remains in the prompt policy."""
    if policy_id == "tag_only_v1":
        creativity = min(creativity, 0.3)
    if creativity <= 0.1:
        return 0
    if creativity <= 0.3:
        return 3
    if creativity <= 0.6:
        return 8
    if creativity <= 0.85:
        return 16
    return None


def _creativity_protocol(prompt_language: str, creativity: float) -> str:
    level = _normalized_creativity(creativity)
    if prompt_language == "tag_only":
        level = min(level, 0.3)
    if level <= 0.1:
        permission = (
            "Correct spelling, grammar, punctuation, and sentence flow only. Do not add visual facts, "
            "style, atmosphere, lighting, composition, objects, actions, or relationships."
        )
    elif level <= 0.3:
        permission = (
            "Make conservative clarity improvements and resolve obvious wording collisions. Add only tiny "
            "connective details that are directly implied by the source or supplied geometry."
        )
    elif level <= 0.6:
        permission = (
            "Create a coherent scene description and cautiously add visual specificity such as plausible "
            "lighting, material, atmosphere, or composition details when they support the supplied scene."
        )
    elif level <= 0.85:
        permission = (
            "Actively enhance the imagined scene with coherent lighting, materials, atmosphere, composition, "
            "gestures, and interactions. Additions must reinforce rather than replace source facts."
        )
    else:
        permission = (
            "Use the full creative enhancement range: reconstruct the scene as one coherent image and enrich "
            "its visual storytelling, camera, lighting, materials, atmosphere, and interactions."
        )
    return (
        f"Creativity contract: {level:.3f} on a closed 0.0 to 1.0 scale. {permission} "
        "At every level, preserve subject count, identity, gender, named appearance, colors, clothing, central "
        "objects, ownership, explicit actions, explicit relationships, negative constraints, and all immutable "
        "regional context. Creativity may elaborate these facts but never contradict, remove, or reassign them."
    )


def regional_policy_issues(
    document: Any,
    proposal: dict[str, Any],
    policy_id: str = "balanced_v1",
    creativity: float = 0.0,
) -> list[str]:
    clean = context_document(document)
    creative_level = _normalized_creativity(creativity)
    issues: list[str] = []
    if policy_id == "anima_hybrid_v1":
        contract = _anima_persona_contract(clean)
        if contract:
            source_global = clean["prompts"]["global"]["positive_source"]
            expected_suffix = f"; {'; '.join(contract)}"
            proposed_global = proposal["prompts"]["global"]["positive_source"]
            contract_is_valid = (
                proposed_global.endswith(expected_suffix)
                and all(
                    len(re.findall(
                        rf"(?<![A-Za-z0-9]){re.escape(anchor)}(?![A-Za-z0-9])",
                        proposed_global,
                    )) == 1
                    for anchor in contract
                )
            )
            if creative_level <= 0.1:
                contract_is_valid = proposed_global == f"{source_global}{expected_suffix}"
            if not contract_is_valid:
                issues.append(
                    "prompts.global.positive_source must end with the exact region-supported Anima persona contract: "
                    f"{'; '.join(contract)}"
                )
    for index, region in enumerate(clean["regions"]):
        source = region["prompts"]["positive_source"]
        if not region["enabled"]:
            for key in ("positive_source", "negative_source"):
                if proposal["regions"][index][key] != region["prompts"][key]:
                    issues.append(
                        f"regions[{index}].prompts.{key} disabled region prompts must remain unchanged"
                    )
            continue
        if policy_id == "anima_hybrid_v1":
            continue
        if not source:
            continue
        horizontal = _region_spatial_words(_region_bounds(region)) & {"left", "right"}
        if len(horizontal) != 1:
            continue
        expected = next(iter(horizontal))
        source_words = _prompt_words(source)
        proposed = proposal["regions"][index]["positive_source"]
        proposed_words = _prompt_words(proposed)
        if {"left", "right"} & source_words:
            continue
        path = f"regions[{index}].prompts.positive_source"
        if expected not in proposed_words:
            issues.append(f"{path} must add geometry-supported horizontal term: {expected}")
        elif "," in source and expected not in _prompt_words(proposed.split(",", 1)[0]):
            issues.append(f"{path} must place geometry-supported horizontal term in leading subject segment: {expected}")
    return issues


def normalize_model_contracts(
    document: Any,
    proposal: dict[str, Any],
    policy_id: str,
) -> tuple[dict[str, Any], tuple[str, ...]]:
    """Apply deterministic model syntax after structural verification, without another LLM call."""
    clean = context_document(document)
    normalized = copy.deepcopy(proposal)
    changes: list[str] = []
    if policy_id != "anima_hybrid_v1":
        return normalized, ()
    contract = _anima_persona_contract(clean)
    if not contract:
        return normalized, ()
    path = "prompts.global.positive_source"
    text = normalized["prompts"]["global"]["positive_source"]
    if contract == ("1girl", "1boy"):
        text = re.sub(
            r"\s*[,;]\s*1girl\s*;\s*1boy\s*$",
            "",
            text,
            flags=re.IGNORECASE,
        )
        pair_separator = r"\s*(?:,?\s*(?:and|&)\s*|[,;/+]\s*)"
        for first, second in (("1girl", "1boy"), ("1boy", "1girl")):
            text = re.sub(
                rf"(?<![A-Za-z0-9]){first}{pair_separator}{second}(?![A-Za-z0-9])",
                "two people",
                text,
                flags=re.IGNORECASE,
            )
    for anchor in contract:
        anchor_pattern = rf"(?<![A-Za-z0-9]){re.escape(anchor)}(?![A-Za-z0-9])"
        text = re.sub(rf"\s*[,;]\s*{anchor_pattern}", "", text)
        text = re.sub(anchor_pattern, "", text)
    text = re.sub(r"(?:\s*[,;.!?]\s*)+$", "", text).strip()
    expected = f"{text}; {'; '.join(contract)}"
    if normalized["prompts"]["global"]["positive_source"] != expected:
        normalized["prompts"]["global"]["positive_source"] = expected
        changes.append(f"locally normalized deterministic Anima persona contract in {path}")
    return normalized, tuple(changes)


def regional_source_warnings(document: Any) -> list[str]:
    clean = context_document(document)
    warnings: list[str] = []
    for index, region in enumerate(clean["regions"]):
        source = region["prompts"]["positive_source"]
        bounds = _region_bounds(region)
        if not region["enabled"] or not source or bounds is None:
            continue
        words = _prompt_words(source)
        geometry_horizontal = _axis_label((bounds[0] + bounds[2]) / 2, "left", "center", "right")
        geometry_vertical = _axis_label((bounds[1] + bounds[3]) / 2, "upper", "middle", "lower")
        prompt_horizontal = ({"left", "right"} & words)
        prompt_vertical: set[str] = set()
        if {"upper", "top"} & words:
            prompt_vertical.add("upper")
        if {"lower", "bottom"} & words:
            prompt_vertical.add("lower")
        if "middle" in words:
            prompt_vertical.add("middle")
        path = f"regions[{index}].prompts.positive_source"
        if len(prompt_horizontal) == 1:
            stated = next(iter(prompt_horizontal))
            if stated != geometry_horizontal:
                warnings.append(
                    f"{path} source conflict: geometry indicates {geometry_horizontal}, prompt explicitly says {stated}"
                )
        if len(prompt_vertical) == 1:
            stated = next(iter(prompt_vertical))
            if stated != geometry_vertical:
                warnings.append(
                    f"{path} source conflict: geometry indicates {geometry_vertical}, prompt explicitly says {stated}"
                )
    return warnings


def build_repair_request(base: LLMRequest, invalid_output: str, issues: list[str]) -> LLMRequest:
    issue_text = "\n".join(f"- {issue}" for issue in issues)
    repair_prompt = (
        f"{base.user_prompt}\n\n"
        "BV repair protocol (subordinate to the immutable structural protocol):\n"
        f"{base.repair_protocol}\n"
        f"Validation errors:\n{issue_text}\n\n"
        f"Rejected response:\n{invalid_output}"
    )
    return LLMRequest(
        system_prompt=base.system_prompt,
        user_prompt=repair_prompt,
        repair_protocol=base.repair_protocol,
        max_output_tokens=base.max_output_tokens,
        seed=base.seed,
        prompt_bundle_version=base.prompt_bundle_version,
        prompt_bundle_hash=base.prompt_bundle_hash,
        policy_id=base.policy_id,
        prompt_language=base.prompt_language,
        creativity=base.creativity,
    )


def _provider_identity(clip: Any) -> str:
    model = getattr(clip, "cond_stage_model", None)
    tokenizer = getattr(clip, "tokenizer", None)
    model_name = type(model).__name__ if model is not None else "missing-cond-stage-model"
    tokenizer_name = type(tokenizer).__name__ if tokenizer is not None else "missing-tokenizer"
    clip_name = getattr(tokenizer, "clip_name", None)
    suffix = f" ({clip_name})" if isinstance(clip_name, str) and clip_name else ""
    return f"{model_name}/{tokenizer_name}{suffix}"


class ComfyClipGenerateProvider:
    provider_id = "comfy_clip_generate"

    def __init__(self, clip: Any):
        identity = _provider_identity(clip)
        missing = [name for name in ("tokenize", "generate", "decode") if not callable(getattr(clip, name, None))]
        model = getattr(clip, "cond_stage_model", None)
        if not callable(getattr(model, "generate", None)):
            missing.append("cond_stage_model.generate")
        if missing:
            raise ValueError(
                f"CLIP encoder '{identity}' is not generative; missing capability: {', '.join(missing)}"
            )
        self._clip = clip
        self.capabilities = LLMCapabilities(
            structured_output="prompt_only",
            deterministic_seed=True,
            media=frozenset(),
            local_execution=True,
            model_identity=identity,
        )

    def generate(self, request: LLMRequest) -> LLMResponse:
        combined_prompt = (
            "Immutable BV structural protocol:\n"
            f"{request.system_prompt}\n\n"
            f"{request.user_prompt}"
        )
        tokens = self._clip.tokenize(
            combined_prompt,
            image=None,
            skip_template=False,
            min_length=1,
            thinking=False,
            video=None,
            audio=None,
        )
        generated_ids = self._clip.generate(
            tokens,
            do_sample=False,
            max_length=request.max_output_tokens,
            temperature=1.0,
            top_k=50,
            top_p=1.0,
            min_p=0.0,
            repetition_penalty=1.0,
            presence_penalty=0.0,
            seed=request.seed,
        )
        return LLMResponse(
            raw_text=self._clip.decode(generated_ids),
            provider_id=self.provider_id,
            model_identity=self.capabilities.model_identity,
        )


def source_digest(document: Any) -> str:
    clean = context_document(document)
    encoded = json.dumps(clean, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _shape_bounds(shape: dict[str, Any]) -> tuple[float, float, float, float] | None:
    if shape.get("enabled", True) is False:
        return None
    shape_type = shape.get("type")
    if shape_type in {"rect", "ellipse", "raster_mask"}:
        return (shape["x"], shape["y"], shape["x"] + shape["width"], shape["y"] + shape["height"])
    points = shape.get("points")
    if shape_type in {"polygon", "brush_stroke"} and points:
        xs = [point["x"] for point in points]
        ys = [point["y"] for point in points]
        radius = shape.get("size", 0.0) / 2 if shape_type == "brush_stroke" else 0.0
        return (
            max(0.0, min(xs) - radius),
            max(0.0, min(ys) - radius),
            min(1.0, max(xs) + radius),
            min(1.0, max(ys) + radius),
        )
    return None


def _region_bounds(region: dict[str, Any]) -> tuple[float, float, float, float] | None:
    additive = [
        bounds
        for shape in region["geometry"]
        if shape.get("operation") == "add" and (bounds := _shape_bounds(shape)) is not None
    ]
    if not additive:
        return None
    return (
        min(bounds[0] for bounds in additive),
        min(bounds[1] for bounds in additive),
        max(bounds[2] for bounds in additive),
        max(bounds[3] for bounds in additive),
    )


def _axis_label(value: float, low: str, middle: str, high: str) -> str:
    if value < 0.4:
        return low
    if value > 0.6:
        return high
    return middle


def _region_spatial_words(bounds: tuple[float, float, float, float] | None) -> frozenset[str]:
    if bounds is None:
        return frozenset()
    center_x = (bounds[0] + bounds[2]) / 2
    center_y = (bounds[1] + bounds[3]) / 2
    horizontal = _axis_label(center_x, "left", "center", "right")
    vertical = _axis_label(center_y, "upper", "middle", "lower")
    words = {horizontal, vertical}
    if horizontal == "center":
        words.update({"centered", "central"})
    if vertical == "upper":
        words.add("top")
    elif vertical == "lower":
        words.add("bottom")
    return frozenset(words)


def _bounds_overlap(first: tuple[float, float, float, float] | None, second: tuple[float, float, float, float] | None) -> bool:
    if first is None or second is None:
        return False
    return min(first[2], second[2]) > max(first[0], second[0]) and min(first[3], second[3]) > max(first[1], second[1])


def _regional_context(document: dict[str, Any]) -> dict[str, Any]:
    bounds_by_id = {region["id"]: _region_bounds(region) for region in document["regions"]}
    regions: list[dict[str, Any]] = []
    for region in document["regions"]:
        bounds = bounds_by_id[region["id"]]
        spatial_words = sorted(_region_spatial_words(bounds))
        regions.append({
            "id": region["id"],
            "name": region["name"],
            "enabled": region["enabled"],
            "parent_region_id": region["parent_region_id"],
            "priority": region["priority"],
            "strength": region["strength"],
            "normalized_bounds": [round(value, 4) for value in bounds] if bounds is not None else None,
            "spatial_terms": spatial_words,
            "overlaps_region_ids": [
                other["id"]
                for other in document["regions"]
                if other["id"] != region["id"] and _bounds_overlap(bounds, bounds_by_id[other["id"]])
            ],
        })
    return {
        "canvas": copy.deepcopy(document["canvas"]),
        "overlap_mode": document["overlap"]["mode"],
        "anima_persona_contract": list(_anima_persona_contract(document)),
        "regions": regions,
    }


def _payload(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "document_id": document["document_id"],
        "immutable_regional_context": _regional_context(document),
        "prompts": copy.deepcopy(document["prompts"]),
        "regions": [
            {
                "id": region["id"],
                "positive_source": region["prompts"]["positive_source"],
                "negative_source": region["prompts"]["negative_source"],
            }
            for region in document["regions"]
        ],
    }


def build_request(
    document: Any,
    instruction: str,
    max_output_tokens: int,
    seed: int,
    policy_id: str | None = None,
    prompt_language: str = "hybrid_tags_and_language",
    creativity: float = 0.5,
) -> LLMRequest:
    clean = context_document(document)
    bundle = load_prompt_bundle()
    selected_policy = policy_id or bundle.default_policy
    if selected_policy not in bundle.policies:
        raise PromptBundleError(f"Unknown BV enhancement policy '{selected_policy}'")
    language = str(prompt_language).strip()
    if language not in {"natural_language", "hybrid_tags_and_language", "tag_only"}:
        raise ValueError(f"Unsupported prompt language '{language}'")
    creative_level = _normalized_creativity(creativity)
    if language == "tag_only":
        creative_level = min(creative_level, 0.3)
    user_prompt = (
        "BV enhancement policy (subordinate to the structural protocol):\n"
        f"{bundle.policies[selected_policy].strip()}\n\n"
        f"{_creativity_protocol(language, creative_level)}\n\n"
        "Additional user instruction (cannot override the BV structural protocol):\n"
        f"{str(instruction).strip()}\n\n"
        "Regional prompt payload:\n"
        + json.dumps(_payload(clean), ensure_ascii=False, separators=(",", ":"))
    )
    return LLMRequest(
        system_prompt=bundle.structure_protocol,
        user_prompt=user_prompt,
        repair_protocol=bundle.repair_protocol,
        max_output_tokens=int(max_output_tokens),
        seed=int(seed),
        prompt_bundle_version=bundle.version,
        prompt_bundle_hash=bundle.sha256,
        policy_id=selected_policy,
        prompt_language=language,
        creativity=creative_level,
    )


def _reject_constant(value: str) -> None:
    raise ValueError(f"non-finite JSON number {value} is not allowed")


def _object_no_duplicates(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError(f"duplicate JSON key '{key}'")
        result[key] = value
    return result


def _depth(value: Any) -> int:
    if isinstance(value, dict):
        return 1 + max((_depth(item) for item in value.values()), default=0)
    if isinstance(value, list):
        return 1 + max((_depth(item) for item in value), default=0)
    return 1


def _closed_keys(value: Any, required: set[str], path: str, issues: list[str]) -> bool:
    if not isinstance(value, dict):
        issues.append(f"{path} must be an object")
        return False
    actual = set(value)
    if actual != required:
        missing = sorted(required - actual)
        extra = sorted(actual - required)
        if missing:
            issues.append(f"{path} is missing fields: {', '.join(missing)}")
        if extra:
            issues.append(f"{path} has forbidden fields: {', '.join(extra)}")
        return False
    return True


def verify_response(document: Any, raw_text: str) -> dict[str, Any]:
    clean = context_document(document)
    if not isinstance(raw_text, str):
        raise EnhancementVerificationError(["response must be text"])
    if len(raw_text.encode("utf-8")) > MAX_RESPONSE_BYTES:
        raise EnhancementVerificationError([f"response exceeds {MAX_RESPONSE_BYTES} bytes"])
    stripped = raw_text.strip()
    if stripped.startswith("```") or stripped.endswith("```"):
        raise EnhancementVerificationError(["Markdown code fences are not allowed"])
    try:
        proposal = json.loads(
            stripped,
            object_pairs_hook=_object_no_duplicates,
            parse_constant=_reject_constant,
        )
    except (json.JSONDecodeError, ValueError) as error:
        raise EnhancementVerificationError([f"invalid strict JSON: {error}"]) from error
    if _depth(proposal) > MAX_JSON_DEPTH:
        raise EnhancementVerificationError([f"response nesting exceeds {MAX_JSON_DEPTH} levels"])

    issues: list[str] = []
    if not _closed_keys(proposal, {"schema_version", "document_id", "prompts", "regions"}, "response", issues):
        raise EnhancementVerificationError(issues)
    if proposal["schema_version"] != 1:
        issues.append("schema_version must be 1")
    if proposal["document_id"] != clean["document_id"]:
        issues.append("document_id does not match the source document")

    prompt_pair_keys = {"positive_source", "negative_source"}
    if _closed_keys(proposal["prompts"], {"global", "background"}, "prompts", issues):
        for scope in ("global", "background"):
            pair = proposal["prompts"][scope]
            if _closed_keys(pair, prompt_pair_keys, f"prompts.{scope}", issues):
                for key in prompt_pair_keys:
                    if not isinstance(pair[key], str):
                        issues.append(f"prompts.{scope}.{key} must be a string")

    regions = proposal["regions"]
    expected_ids = [region["id"] for region in clean["regions"]]
    if not isinstance(regions, list):
        issues.append("regions must be an array")
    else:
        actual_ids: list[Any] = []
        for index, region in enumerate(regions):
            path = f"regions[{index}]"
            if _closed_keys(region, {"id", "positive_source", "negative_source"}, path, issues):
                actual_ids.append(region["id"])
                for key in prompt_pair_keys:
                    if not isinstance(region[key], str):
                        issues.append(f"{path}.{key} must be a string")
        if actual_ids != expected_ids:
            issues.append("regions must contain each source region exactly once in canonical order")

    if not issues:
        strings = [proposal["prompts"][scope][key] for scope in ("global", "background") for key in prompt_pair_keys]
        strings.extend(region[key] for region in regions for key in prompt_pair_keys)
        if any(len(value) > MAX_PROMPT_CHARS for value in strings):
            issues.append(f"a prompt exceeds {MAX_PROMPT_CHARS} characters")
        if sum(len(value) for value in strings) > MAX_TOTAL_PROMPT_CHARS:
            issues.append(f"combined prompts exceed {MAX_TOTAL_PROMPT_CHARS} characters")
        source = _payload(clean)
        for scope in ("global", "background"):
            for key in prompt_pair_keys:
                if source["prompts"][scope][key] == "" and proposal["prompts"][scope][key] != "":
                    issues.append(f"empty prompts.{scope}.{key} must remain empty")
        for index, region in enumerate(regions):
            for key in prompt_pair_keys:
                if source["regions"][index][key] == "" and region[key] != "":
                    issues.append(f"empty regions[{index}].{key} must remain empty")
    if not issues:
        candidate = copy.deepcopy(clean)
        candidate["prompts"] = copy.deepcopy(proposal["prompts"])
        for index, region in enumerate(candidate["regions"]):
            region["prompts"] = {
                "positive_source": proposal["regions"][index]["positive_source"],
                "negative_source": proposal["regions"][index]["negative_source"],
            }
        try:
            parse_document(candidate)
        except RegionalValidationError as error:
            issues.extend(f"proposed prompt is invalid: {issue}" for issue in error.issues)
    if issues:
        raise EnhancementVerificationError(issues)
    return proposal


def _diff(document: dict[str, Any], proposal: dict[str, Any]) -> list[dict[str, str]]:
    changes: list[dict[str, str]] = []
    for scope in ("global", "background"):
        for key in ("positive_source", "negative_source"):
            before, after = document["prompts"][scope][key], proposal["prompts"][scope][key]
            if before != after:
                changes.append({"path": f"prompts.{scope}.{key}", "before": before, "after": after})
    for index, region in enumerate(document["regions"]):
        for key in ("positive_source", "negative_source"):
            before, after = region["prompts"][key], proposal["regions"][index][key]
            if before != after:
                changes.append({"path": f"regions[{index}].prompts.{key}", "before": before, "after": after})
    return changes


def enhancement_result(document: Any, response: LLMResponse, request: LLMRequest | None = None) -> dict[str, Any]:
    clean = context_document(document)
    base = {
        "schema": "bv.regional.enhancement_result",
        "version": 1,
        "document_id": clean["document_id"],
        "source_digest": source_digest(clean),
        "provider": {"id": response.provider_id, "model_identity": response.model_identity},
        "prompt_bundle": (
            {
                "version": request.prompt_bundle_version,
                "sha256": request.prompt_bundle_hash,
                "policy_id": request.policy_id,
                "prompt_language": request.prompt_language,
                "creativity": request.creativity,
            }
            if request is not None
            else None
        ),
        "valid": False,
        "proposal": None,
        "diff": [],
        "diagnostics": [],
    }
    try:
        proposal = verify_response(clean, response.raw_text)
    except EnhancementVerificationError as error:
        base["diagnostics"] = list(error.issues)
        return base
    normalization_warnings: tuple[str, ...] = ()
    if request is not None:
        proposal, normalization_warnings = normalize_model_contracts(clean, proposal, request.policy_id)
    base["valid"] = True
    base["proposal"] = proposal
    base["diff"] = _diff(clean, proposal)
    base["diagnostics"] = [*response.warnings, *normalization_warnings]
    return base


def apply_enhancement(document: Any, result: Any) -> dict[str, Any]:
    context = normalize_context(document) if is_v3_context(document) else None
    clean = context_document(context if context is not None else document)
    unchanged = context.to_dict() if context is not None else clean
    if not isinstance(result, dict) or not result.get("valid"):
        return unchanged
    if result.get("schema") != "bv.regional.enhancement_result" or result.get("version") != 1:
        return unchanged
    if result.get("document_id") != clean["document_id"] or result.get("source_digest") != source_digest(clean):
        return unchanged
    try:
        proposal = verify_response(clean, json.dumps(result.get("proposal"), ensure_ascii=False, separators=(",", ":")))
    except EnhancementVerificationError:
        return unchanged
    enhanced = copy.deepcopy(clean)
    enhanced["prompts"] = copy.deepcopy(proposal["prompts"])
    for index, region in enumerate(enhanced["regions"]):
        region["prompts"] = {
            "positive_source": proposal["regions"][index]["positive_source"],
            "negative_source": proposal["regions"][index]["negative_source"],
        }
    enhanced = parse_document(enhanced)
    if context is None:
        return enhanced
    core = {
        "version": 1,
        **{key: value for key, value in enhanced.items() if key not in {"schema", "version"}},
    }
    return context.with_core(core).to_dict()

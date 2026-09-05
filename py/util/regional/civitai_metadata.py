from __future__ import annotations

import hashlib
import json
import os
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .context import normalize_context
from .lora_v3 import LORA_CAPABILITY_REGISTRY, materialized_lora_scopes
from .v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY
from ..prompt.category import ast_to_plain_text, parse_prompt_to_ast


SAMPLER_TYPES = {"KSampler", "KSamplerAdvanced"}
CORE_LORA_TYPES = {"LoraLoader", "LoraLoaderModelOnly"}


def _text(value: Any) -> str:
    source = str(value or "").strip()
    return ast_to_plain_text(parse_prompt_to_ast(source)).strip() if source else ""


def _prompt_sections(core: dict[str, Any], polarity: str) -> str:
    key = f"{polarity}_source"
    sections: list[str] = []
    global_text = _text(core["prompts"]["global"].get(key))
    if global_text:
        sections.append(global_text)
    background = _text(core["prompts"]["background"].get(key))
    if background:
        sections.append(f"[Background]\n{background}")
    regions = sorted(core["regions"], key=lambda item: (int(item.get("priority", 0)), item["name"], item["id"]))
    for region in regions:
        if not region.get("enabled", True) or region.get("usage") not in {"generation", "both"}:
            continue
        value = _text(region["prompts"].get(key))
        if value:
            sections.append(f"[Region: {region['name']} | strength={float(region.get('strength', 1)):g}]\n{value}")
    return "\n\n".join(sections)


def _links(value: Any):
    if isinstance(value, list) and len(value) == 2 and isinstance(value[0], (str, int)):
        yield str(value[0])
    elif isinstance(value, list):
        for child in value:
            yield from _links(child)
    elif isinstance(value, dict):
        for child in value.values():
            yield from _links(child)


def _ancestors(prompt: dict[str, Any], node_id: str) -> list[tuple[str, dict[str, Any]]]:
    found: list[tuple[str, dict[str, Any]]] = []
    queue = [str(node_id)]
    seen: set[str] = set()
    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        node = prompt.get(current)
        if not isinstance(node, dict):
            continue
        found.append((current, node))
        queue.extend(link for link in _links(node.get("inputs", {})) if link not in seen)
    return found


def _linked_scalar(prompt: dict[str, Any], value: Any) -> Any:
    if not (isinstance(value, list) and len(value) == 2):
        return value
    node = prompt.get(str(value[0]))
    if not isinstance(node, dict):
        return value
    inputs = node.get("inputs", {})
    if node.get("class_type") == "BV Seed" and int(value[1]) == 0:
        return inputs.get("seed", inputs.get("seed_bv", value))
    return value


def _sampler_info(prompt: Any, unique_id: Any) -> dict[str, Any] | None:
    if not isinstance(prompt, dict) or unique_id is None:
        return None
    ancestors = _ancestors(prompt, str(unique_id))
    samplers = [node for _, node in ancestors if node.get("class_type") in SAMPLER_TYPES]
    if len(samplers) != 1:
        return None
    inputs = samplers[0].get("inputs", {})
    steps = inputs.get("steps")
    if steps is None:
        return None
    model = next((node for _, node in ancestors if any(key in node.get("inputs", {}) for key in ("ckpt_name", "unet_name", "model_name"))), None)
    model_inputs = model.get("inputs", {}) if model else {}
    model_name = next((_text(model_inputs.get(key)) for key in ("ckpt_name", "unet_name", "model_name") if _text(model_inputs.get(key))), None)
    global_loras: list[list[Any]] = []
    for _, node in ancestors:
        if node.get("class_type") not in CORE_LORA_TYPES:
            continue
        lora_inputs = node.get("inputs", {})
        lora_name = _text(lora_inputs.get("lora_name"))
        if not lora_name:
            continue
        model_strength = lora_inputs.get("strength_model", 1.0)
        clip_strength = lora_inputs.get("strength_clip", model_strength)
        global_loras.append([lora_name, model_strength, clip_strength])
    return {
        "steps": steps,
        "sampler": _text(inputs.get("sampler_name")) or None,
        "scheduler": _text(inputs.get("scheduler")) or None,
        "cfg": inputs.get("cfg"),
        "seed": _linked_scalar(prompt, inputs.get("seed", inputs.get("noise_seed"))),
        "denoise": inputs.get("denoise"),
        "model": model_name,
        "global_loras": global_loras,
    }


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _resolved_resources(scopes: dict[str, list[list[Any]]], resolver: Callable[[str], str | None], hasher: Callable[[str], str]) -> list[dict[str, Any]]:
    resources: dict[str, dict[str, Any]] = {}
    for scope, entries in scopes.items():
        for name, model_strength, clip_strength in entries:
            source = str(name)
            path = source if Path(source).is_file() else resolver(source)
            if not path or not Path(path).is_file():
                continue
            canonical = os.path.normcase(os.path.abspath(path))
            try:
                digest = hasher(path)
            except OSError:
                continue
            item = resources.setdefault(canonical, {"name": Path(path).stem, "path": source, "sha256": digest, "scopes": []})
            item["scopes"].append({"scope": scope, "model_strength": float(model_strength), "clip_strength": float(clip_strength)})
    return list(resources.values())


def build_regional_metadata(
    regional: Any,
    *,
    prompt: Any = None,
    unique_id: Any = None,
    width: int | None = None,
    height: int | None = None,
    lora_resolver: Callable[[str], str | None] | None = None,
    model_resolver: Callable[[str], str | None] | None = None,
    hasher: Callable[[str], str] = _sha256,
) -> tuple[str | None, dict[str, Any]]:
    context = normalize_context(regional, registry=REGIONAL_V3_CAPABILITY_REGISTRY)
    core = context.core
    scopes = materialized_lora_scopes(context, registry=LORA_CAPABILITY_REGISTRY)
    if lora_resolver is None:
        try:
            import folder_paths
            lora_resolver = lambda name: folder_paths.get_full_path("loras", name)
            model_resolver = model_resolver or (lambda name: next((folder_paths.get_full_path(kind, name) for kind in ("checkpoints", "diffusion_models", "unet") if folder_paths.get_full_path(kind, name)), None))
        except Exception:
            lora_resolver = lambda _name: None
            model_resolver = model_resolver or (lambda _name: None)
    if model_resolver is None:
        model_resolver = lambda _name: None
    sampler = _sampler_info(prompt, unique_id)
    if sampler is not None and sampler["global_loras"]:
        scopes = dict(scopes)
        scopes.setdefault("global", []).extend(sampler["global_loras"])
    resources = _resolved_resources(scopes, lora_resolver, hasher)
    positive = _prompt_sections(core, "positive")
    negative = _prompt_sections(core, "negative")
    parameters = None
    model_metadata = None
    if sampler is not None and sampler["model"]:
        model_path = model_resolver(sampler["model"]) if model_resolver else None
        model_metadata = {"name": Path(str(sampler["model"])).stem, "path": sampler["model"], "sha256": None}
        if model_path and Path(model_path).is_file():
            try:
                model_metadata["sha256"] = hasher(model_path)
            except OSError:
                pass
    if sampler is not None:
        lines = [positive]
        if negative:
            lines.append(f"Negative prompt: {negative}")
        values: list[str] = [f"Steps: {sampler['steps']}"]
        if sampler["sampler"]:
            values.append(f"Sampler: {sampler['sampler']}")
        if sampler["scheduler"]:
            values.append(f"Schedule type: {sampler['scheduler']}")
        if sampler["cfg"] is not None:
            values.append(f"CFG scale: {sampler['cfg']}")
        if sampler["seed"] is not None:
            values.append(f"Seed: {sampler['seed']}")
        if width and height:
            values.append(f"Size: {width}x{height}")
        if sampler["model"]:
            values.append(f"Model: {Path(str(sampler['model'])).stem}")
        if model_metadata and model_metadata["sha256"]:
            values.append(f"Model hash: {model_metadata['sha256'][:10]}")
        if sampler["denoise"] is not None and float(sampler["denoise"]) != 1.0:
            values.append(f"Denoising strength: {sampler['denoise']}")
        if resources:
            hashes = ", ".join(f"{item['name']}: {item['sha256'][:10]}" for item in resources)
            values.append(f'Lora hashes: "{hashes}"')
        values.append("Version: ComfyUI / BV Node Pack")
        lines.append(", ".join(values))
        parameters = "\n".join(lines)
    metadata = {
        "schema": "bv.regional-generation",
        "version": 1,
        "context": context.to_dict(),
        "prompts": {"positive": positive, "negative": negative},
        "model": model_metadata,
        "loras": resources,
    }
    return parameters, metadata


def metadata_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

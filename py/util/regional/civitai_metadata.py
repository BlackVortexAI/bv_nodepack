from __future__ import annotations

import hashlib
import json
import os
from collections import OrderedDict
from collections.abc import Callable
from pathlib import Path
from typing import Any
from threading import Lock

from .context import normalize_context
from .lora_hooks import lora_path_approver
from ..path_roots import configured_roots, contained_file
from .lora_v3 import LORA_CAPABILITY_REGISTRY, materialized_lora_scopes
from .v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY
from ..prompt.category import ast_to_plain_text, parse_prompt_to_ast


SAMPLER_TYPES = {"KSampler", "KSamplerAdvanced"}
CORE_LORA_TYPES = {"LoraLoader", "LoraLoaderModelOnly"}
# Only verified MODEL output 0 contracts; unknown wrappers/merges stay unknown.
MODEL_LOADERS = {"CheckpointLoaderSimple": "ckpt_name", "CheckpointLoader": "ckpt_name", "UNETLoader": "unet_name"}
MODEL_WRAPPERS = {
    "BV Regional SDXL Attention", "BV Regional Z-Image Attention",
    "BV Regional FLUX.2 Klein 9B Attention", "BV Regional Krea 2 Attention",
    "BV Regional Anima Conditioning", "BV Regional Anima LLLite",
}
HASH_CACHE_MAX_ENTRIES = 128
_HASH_CACHE: OrderedDict[tuple[str, int, int], str] = OrderedDict()
_HASH_CACHE_LOCK = Lock()


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


def _model_provenance(prompt: dict[str, Any], link: Any) -> tuple[str | None, str | None, list[list[Any]]]:
    """Trace MODEL ownership; strengths are loader settings, not CLIP reachability."""
    loras: list[list[Any]] = []
    seen: set[str] = set()
    while isinstance(link, list) and len(link) == 2 and type(link[1]) is int and link[1] == 0:
        node_id = str(link[0])
        if node_id in seen:
            break
        seen.add(node_id)
        node = prompt.get(node_id)
        if not isinstance(node, dict) or not isinstance(node.get("inputs"), dict):
            break
        kind, inputs = node.get("class_type"), node["inputs"]
        if kind in MODEL_LOADERS:
            name = inputs.get(MODEL_LOADERS[kind])
            if isinstance(name, str) and name.strip():
                category = "diffusion_models" if kind == "UNETLoader" else "checkpoints"
                return name.strip(), category, list(reversed(loras))
            break
        if kind in CORE_LORA_TYPES:
            name = inputs.get("lora_name")
            model_strength = inputs.get("strength_model", 1.0)
            clip_strength = inputs.get("strength_clip", 1.0) if kind == "LoraLoader" else 0.0
            if not isinstance(name, str) or not name.strip() or not all(
                isinstance(value, (int, float)) for value in (model_strength, clip_strength)
            ):
                break
            loras.append([name.strip(), model_strength, clip_strength])
        elif kind not in MODEL_WRAPPERS:
            break
        link = inputs.get("model")
    # Do not present partial chains as complete provenance.
    return None, None, []


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
    model_name, model_category, global_loras = _model_provenance(prompt, inputs.get("model"))
    return {
        "steps": steps,
        "sampler": _text(inputs.get("sampler_name")) or None,
        "scheduler": _text(inputs.get("scheduler")) or None,
        "cfg": inputs.get("cfg"),
        "seed": _linked_scalar(prompt, inputs.get("seed", inputs.get("noise_seed"))),
        "denoise": inputs.get("denoise"),
        "model": model_name,
        "model_category": model_category,
        "global_loras": global_loras,
    }


def _canonical_path(path: str) -> str:
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


def _file_identity(stat: os.stat_result) -> tuple[int, int, int, int]:
    return stat.st_dev, stat.st_ino, stat.st_size, stat.st_mtime_ns


def _sha256(path: str) -> str:
    """Bounded RAM cache; same-size edits preserving mtime cannot be detected.

    This is change detection for metadata, not a tamper-proof integrity check.
    No persistent cache and no file handles or model data are retained.
    """
    canonical = _canonical_path(path)
    before = os.stat(canonical)
    key = (canonical, before.st_size, before.st_mtime_ns)
    with _HASH_CACHE_LOCK:
        cached = _HASH_CACHE.get(key)
        if cached is not None:
            _HASH_CACHE.move_to_end(key)
    if cached is not None:
        if _file_identity(os.stat(canonical)) != _file_identity(before):
            raise OSError("Resource changed while checking cached SHA-256")
        return cached
    digest = hashlib.sha256()
    with open(canonical, "rb") as handle:
        if _file_identity(os.fstat(handle.fileno())) != _file_identity(before):
            raise OSError("Resource changed before hashing")
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
        after = os.fstat(handle.fileno())
    if _file_identity(after) != _file_identity(before) or _file_identity(os.stat(canonical)) != _file_identity(before):
        raise OSError("Resource changed during hashing")
    result = digest.hexdigest()
    with _HASH_CACHE_LOCK:
        _HASH_CACHE[key] = result
        _HASH_CACHE.move_to_end(key)
        while len(_HASH_CACHE) > HASH_CACHE_MAX_ENTRIES:
            _HASH_CACHE.popitem(last=False)
    return result


def _lora_approver(allowed_roots: Any = None) -> Callable[[Path], Path]:
    """Same containment rule as LoRA loading; fail closed when the roots are unknown.

    Metadata is best-effort, so an unavailable ComfyUI folder registry must not
    abort the image save. It must also never widen what may be read: without
    known roots no workflow-supplied path is hashed.
    """
    try:
        return lora_path_approver(allowed_roots)
    except Exception:
        def reject(candidate: Path) -> Path:
            raise ValueError("LoRA folders are unavailable; metadata hashing is disabled")

        return reject


def _resolved_resources(
    scopes: dict[str, list[list[Any]]],
    resolver: Callable[[str], str | None],
    hasher: Callable[[str], str],
    approve: Callable[[Path], Path] | None = None,
) -> list[dict[str, Any]]:
    # Workflow-supplied names may only reach files inside the configured LoRA
    # folders. Anything else is skipped, never read.
    if approve is None:
        approve = _lora_approver()
    resources: dict[str, dict[str, Any]] = {}
    attempted: set[str] = set()
    for scope, entries in scopes.items():
        for name, model_strength, clip_strength in entries:
            source = str(name)
            candidate = Path(source)
            if not candidate.is_absolute():
                found = resolver(source)
                if not found:
                    continue
                candidate = Path(found)
            try:
                path = str(approve(candidate))
            except ValueError:
                continue
            canonical = _canonical_path(path)
            if canonical not in attempted:
                attempted.add(canonical)
                try:
                    digest = hasher(canonical)
                except OSError:
                    continue
                resources[canonical] = {"name": Path(path).stem, "path": source, "sha256": digest, "scopes": []}
            item = resources.get(canonical)
            if item is None:
                continue
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
    allowed_lora_roots: Any = None,
    allowed_model_roots: Any = None,
) -> tuple[str | None, dict[str, Any]]:
    context = normalize_context(regional, registry=REGIONAL_V3_CAPABILITY_REGISTRY)
    core = context.core
    scopes = materialized_lora_scopes(context, registry=LORA_CAPABILITY_REGISTRY)
    sampler = _sampler_info(prompt, unique_id)
    if lora_resolver is None or model_resolver is None:
        try:
            import folder_paths
            lora_resolver = lora_resolver or (lambda name: folder_paths.get_full_path("loras", name))
            model_resolver = model_resolver or (lambda name: folder_paths.get_full_path(sampler["model_category"], name) if sampler and sampler["model_category"] else None)
        except Exception:
            lora_resolver = lora_resolver or (lambda _name: None)
            model_resolver = model_resolver or (lambda _name: None)
    if model_resolver is None:
        model_resolver = lambda _name: None
    if sampler is not None and sampler["global_loras"]:
        scopes = dict(scopes)
        scopes.setdefault("global", []).extend(sampler["global_loras"])
    # Deduplicate across both resource categories for this metadata operation,
    # including failed reads; injected hashers receive the same guarantee.
    hashes: dict[str, str | OSError] = {}

    def hash_once(path: str) -> str:
        canonical = _canonical_path(path)
        if canonical not in hashes:
            try:
                hashes[canonical] = hasher(canonical)
            except OSError as error:
                hashes[canonical] = error
        value = hashes[canonical]
        if isinstance(value, OSError):
            raise value
        return value

    resources = _resolved_resources(scopes, lora_resolver, hash_once, _lora_approver(allowed_lora_roots))
    positive = _prompt_sections(core, "positive")
    negative = _prompt_sections(core, "negative")
    parameters = None
    model_metadata = None
    if sampler is not None and sampler["model"]:
        model_path = model_resolver(sampler["model"]) if model_resolver else None
        model_metadata = {"name": Path(str(sampler["model"])).stem, "path": sampler["model"], "sha256": None}
        # Model hashes obey the same containment as LoRAs: inside the configured folders of the
        # model's category, links resolved; unknown folders mean no hash rather than a read.
        model_roots = allowed_model_roots
        if model_roots is None and sampler["model_category"]:
            try:
                import folder_paths
                model_roots = configured_roots(folder_paths, sampler["model_category"])
            except Exception:  # noqa: BLE001 - no ComfyUI folder registry available
                model_roots = None
        contained = contained_file(Path(model_path), model_roots) if model_path else None
        if contained is not None:
            try:
                model_metadata["sha256"] = hash_once(str(contained))
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
    if sampler is not None and sampler["global_loras"]:
        metadata["global_lora_strength_semantics"] = (
            "Core MODEL-chain LoRA strengths are configured loader values; "
            "CLIP-output use by sampler conditioning is not inferred."
        )
    return parameters, metadata


def metadata_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))

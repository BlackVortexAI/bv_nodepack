from __future__ import annotations

import html
import json
import math
import re
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote, urlsplit
from uuid import UUID

from .path_roots import configured_roots, contained_file, resolve_within_roots


CONFIG_SCHEMA = "bv.lora_registry_config"
CONFIG_VERSION = 2
CATALOG_SCHEMA = "bv.lora_catalog"
CATALOG_VERSION = 1
MAX_SIDECAR_BYTES = 2 * 1024 * 1024
PREVIEW_SUFFIXES = (".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp")
MANAGER_PREVIEW_SUFFIXES = (".png", ".jpg", ".jpeg", ".webp")
VIDEO_PREVIEW_SUFFIXES = (".preview.mp4", ".mp4")


def _uuid(value: Any, label: str) -> str:
    text = str(value or "").strip()
    try:
        return str(UUID(text))
    except (ValueError, AttributeError) as error:
        raise ValueError(f"{label} must be a UUID") from error


def _logical_name(value: Any, label: str = "LoRA name") -> str:
    text = str(value or "").strip().replace("\\", "/")
    path = PurePosixPath(text)
    if not text or path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts) or ":" in path.parts[0]:
        raise ValueError(f"{label} must be a ComfyUI-relative LoRA name")
    if path.suffix.casefold() != ".safetensors":
        raise ValueError(f"{label} must reference a .safetensors file")
    return path.as_posix()


def parse_lora_registry_config(value: Any) -> dict[str, Any]:
    try:
        candidate = json.loads(value) if isinstance(value, str) else dict(value)
    except (json.JSONDecodeError, TypeError, ValueError) as error:
        raise ValueError("LoRA registry configuration is invalid JSON") from error
    if candidate.get("schema") != CONFIG_SCHEMA or candidate.get("version") not in (1, CONFIG_VERSION):
        raise ValueError("LoRA registry configuration must be bv.lora_registry_config v1 or v2")
    if set(candidate).difference({"schema", "version", "registry_id", "stacks"}):
        raise ValueError("LoRA registry configuration contains unsupported fields")
    if not isinstance(candidate.get("registry_id"), str):
        raise ValueError("registry_id must be a string UUID")
    registry_id = _uuid(candidate.get("registry_id"), "registry_id")
    source_stacks = candidate.get("stacks")
    if not isinstance(source_stacks, list):
        raise ValueError("LoRA registry stacks must be an array")
    stacks: list[dict[str, Any]] = []
    stack_ids: set[str] = set()
    stack_names: set[str] = set()
    for stack_index, source_stack in enumerate(source_stacks):
        if not isinstance(source_stack, dict):
            raise ValueError(f"stacks[{stack_index}] must be an object")
        if set(source_stack).difference({"id", "name", "enabled", "entries", "role"}):
            raise ValueError(f"stacks[{stack_index}] contains unsupported fields")
        if source_stack.get("role", "normal") not in ("normal", "basis", "global"):
            raise ValueError(f"stacks[{stack_index}].role must be normal, basis or global")
        if not isinstance(source_stack.get("id"), str) or not isinstance(source_stack.get("name"), str):
            raise ValueError(f"stacks[{stack_index}] id and name must be strings")
        if "enabled" in source_stack and not isinstance(source_stack["enabled"], bool):
            raise ValueError(f"stacks[{stack_index}].enabled must be a boolean")
        stack_id = _uuid(source_stack.get("id"), f"stacks[{stack_index}].id")
        name = str(source_stack.get("name", "")).strip()
        if not name:
            raise ValueError(f"stacks[{stack_index}].name is required")
        if stack_id in stack_ids:
            raise ValueError(f"Duplicate LoRA stack ID: {stack_id}")
        folded = name.casefold()
        if folded in stack_names:
            raise ValueError(f"Duplicate LoRA stack name: {name}")
        stack_ids.add(stack_id)
        stack_names.add(folded)
        source_entries = source_stack.get("entries")
        if not isinstance(source_entries, list):
            raise ValueError(f"stacks[{stack_index}].entries must be an array")
        entries: list[dict[str, Any]] = []
        entry_ids: set[str] = set()
        for entry_index, source_entry in enumerate(source_entries):
            label = f"stacks[{stack_index}].entries[{entry_index}]"
            if not isinstance(source_entry, dict) or set(source_entry).difference({"id", "lora_name", "enabled", "model_strength", "clip_strength"}):
                raise ValueError(f"{label} must be a LoRA entry")
            if not isinstance(source_entry.get("id"), str) or not isinstance(source_entry.get("lora_name"), str):
                raise ValueError(f"{label} id and lora_name must be strings")
            if "enabled" in source_entry and not isinstance(source_entry["enabled"], bool):
                raise ValueError(f"{label}.enabled must be a boolean")
            entry_id = _uuid(source_entry.get("id"), f"{label}.id")
            if entry_id in entry_ids:
                raise ValueError(f"Duplicate LoRA entry ID: {entry_id}")
            entry_ids.add(entry_id)
            lora_name = _logical_name(source_entry.get("lora_name"), f"{label}.lora_name")
            raw_model_strength = source_entry.get("model_strength", 1.0)
            raw_clip_strength = source_entry.get("clip_strength", 1.0)
            if isinstance(raw_model_strength, bool) or not isinstance(raw_model_strength, (int, float)) or isinstance(raw_clip_strength, bool) or not isinstance(raw_clip_strength, (int, float)):
                raise ValueError(f"{label} strengths must be JSON numbers")
            model_strength = float(raw_model_strength)
            clip_strength = float(raw_clip_strength)
            if not math.isfinite(model_strength) or not math.isfinite(clip_strength):
                raise ValueError(f"{label} strengths must be finite")
            entries.append({
                "id": entry_id,
                "lora_name": lora_name,
                "enabled": source_entry.get("enabled", True) is not False,
                "model_strength": model_strength,
                "clip_strength": clip_strength,
            })
        stacks.append({
            "id": stack_id,
            **({"role": source_stack["role"]} if source_stack.get("role") in ("basis", "global") else {}),
            "name": name,
            "enabled": source_stack.get("enabled", True) is not False,
            "entries": entries,
        })
    globals_ = [stack for stack in stacks if stack.get("role") == "global"]
    if len(globals_) > 1:
        raise ValueError("LoRA Registry has more than one automatic Global stack")
    if not globals_:
        # Stable across frontend/backend normalization and repeated old-workflow reload.
        global_id = str(UUID(int=UUID(registry_id).int ^ 1))
        if global_id in stack_ids:
            raise ValueError("Automatic Global stack identity collides with an existing stack")
        name = "Global"
        while name.casefold() in stack_names:
            name += " · Automatically applied"
        enabled = candidate["version"] == 1 and any(stack.get("role") == "basis" and stack["enabled"] and any(entry["enabled"] for entry in stack["entries"]) for stack in stacks)
        stacks.insert(0, {"id": global_id, "name": name, "role": "global", "enabled": enabled, "entries": []})
    return {"schema": CONFIG_SCHEMA, "version": CONFIG_VERSION, "registry_id": registry_id, "stacks": stacks}


def serialize_lora_registry_config(value: Any) -> str:
    return json.dumps(parse_lora_registry_config(value), ensure_ascii=False, separators=(",", ":"))


def lora_registry_diagnostics(value: Any) -> tuple[int, str]:
    config = parse_lora_registry_config(value)
    if not config["stacks"]:
        return 0, "No LoRAs configured"
    active_total = 0
    summary: list[str] = []
    global_enabled = next(stack["enabled"] for stack in config["stacks"] if stack.get("role") == "global")
    for stack in config["stacks"]:
        automatic_disabled = stack.get("role") in ("basis", "global") and not global_enabled
        active = sum(1 for entry in stack["entries"] if stack["enabled"] and entry["enabled"] and not automatic_disabled)
        active_total += active
        disabled = " · stack disabled" if not stack["enabled"] else ""
        if automatic_disabled and stack.get("role") == "basis":
            disabled += " · Registry Global disabled"
        summary.append(f'{stack["name"]}: {active}/{len(stack["entries"])} active{disabled}')
    return active_total, "\n".join(summary)


def lora_roots(folder_paths_module=None) -> list[str] | None:
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    return configured_roots(folder_paths_module, "loras")


def resolve_lora_path(logical_name: Any, folder_paths_module=None) -> tuple[str, Path]:
    logical = _logical_name(logical_name)
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    resolved = folder_paths_module.get_full_path("loras", logical)
    if not resolved:
        raise ValueError(f"LoRA file not found through ComfyUI: {logical}")
    roots = lora_roots(folder_paths_module)
    if roots is None:
        raise ValueError("LoRA folders are unknown; ComfyUI folder registry unavailable")
    # Containment first (links inside a LoRA folder must not lead outside it), then
    # the file itself: same order as loading.
    path = resolve_within_roots(Path(resolved), roots, "LoRA path")
    if not path.is_file() or path.suffix.casefold() != ".safetensors":
        raise ValueError(f"LoRA file not found through ComfyUI: {logical}")
    return logical, path


def materialize_lora_registry(value: Any, folder_paths_module=None) -> tuple[dict[str, Any], str]:
    config = parse_lora_registry_config(value)
    stacks: dict[str, Any] = {}
    global_enabled = next(stack["enabled"] for stack in config["stacks"] if stack.get("role") == "global")
    for stack in config["stacks"]:
        active: list[tuple[str, float, float]] = []
        entry_ids = []
        if stack["enabled"] and (stack.get("role") not in ("basis", "global") or global_enabled):
            for entry in stack["entries"]:
                if not entry["enabled"]:
                    continue
                logical, _path = resolve_lora_path(entry["lora_name"], folder_paths_module)
                active.append((logical, entry["model_strength"], entry["clip_strength"]))
                entry_ids.append(entry["id"])
        stacks[stack["id"]] = {"id": stack["id"], "name": stack["name"], "stack": active,
                               "origin_provider_id": config["registry_id"], "entry_ids": entry_ids,
                               **({"role": stack["role"]} if stack.get("role") in ("basis", "global") else {})}
        if stack.get("role") in ("basis", "global"):
            stacks[stack["id"]]["global_enabled"] = global_enabled
    return {"schema": "bv.lora_stack_registry", "version": 1, "stacks": stacks}, config["registry_id"]


def _load_sidecar(path: Path, roots: list[str] | None = None) -> dict[str, Any]:
    # Sidecars are read only from inside the LoRA folders; a link that leaves them is ignored.
    path = contained_file(path, roots) if roots is not None else path
    if path is None:
        return {}
    try:
        if not path.is_file() or path.stat().st_size > MAX_SIDECAR_BYTES:
            return {}
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, UnicodeError, json.JSONDecodeError):
        return {}


def _first(*values: Any) -> Any:
    return next((value for value in values if value not in (None, "", [])), None)


def _strings(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    result: list[str] = []
    for item in value:
        text = str(item or "").strip()
        if text and text.casefold() not in {existing.casefold() for existing in result}:
            result.append(text)
    return result


def _plain_text(value: Any, limit: int = 2000) -> str:
    text = str(value or "")
    text = re.sub(r"<[^>]+>", " ", text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()[:limit]


def _preview_path(resolved_lora: Path, roots: list[str] | None) -> Path | None:
    # Served over HTTP, so a preview must be a regular file that resolves inside the LoRA folders.
    for suffix in (*PREVIEW_SUFFIXES, *MANAGER_PREVIEW_SUFFIXES, *VIDEO_PREVIEW_SUFFIXES):
        candidate = contained_file(resolved_lora.with_name(f"{resolved_lora.stem}{suffix}"), roots)
        if candidate is not None:
            return candidate
    return None


def lora_preview_path(logical_name: Any, folder_paths_module=None) -> Path | None:
    _logical, resolved = resolve_lora_path(logical_name, folder_paths_module)
    return _preview_path(resolved, lora_roots(folder_paths_module))


def _preview_is_safe(metadata: dict[str, Any], cm_info: dict[str, Any]) -> bool:
    level = metadata.get("preview_nsfw_level")
    if isinstance(level, int) and not isinstance(level, bool) and level >= 0:
        return level < 2
    return cm_info.get("Nsfw") is False


def _catalog_item(logical: str, resolved: Path, compatibility_checker=None, roots: list[str] | None = None) -> dict[str, Any]:
    metadata = _load_sidecar(resolved.with_name(f"{resolved.stem}.metadata.json"), roots)
    cm_info = _load_sidecar(resolved.with_name(f"{resolved.stem}.cm-info.json"), roots)
    civitai = metadata.get("civitai") if isinstance(metadata.get("civitai"), dict) else {}
    creator = civitai.get("creator") if isinstance(civitai.get("creator"), dict) else {}
    display_name = str(_first(metadata.get("model_name"), cm_info.get("ModelName"), resolved.stem))
    base_model = str(_first(metadata.get("base_model"), civitai.get("baseModel"), cm_info.get("BaseModel"), "") or "")
    triggers = _strings(_first(metadata.get("trainedWords"), civitai.get("trainedWords"), cm_info.get("TrainedWords")))
    tags = _strings(_first(metadata.get("tags"), cm_info.get("Tags")))
    model_metadata = civitai.get("model") if isinstance(civitai.get("model"), dict) else {}
    model_tags = _strings(model_metadata.get("tags"))
    if not tags:
        tags = model_tags
    author = str(_first(creator.get("username"), cm_info.get("AuthorUsername"), "") or "")
    description = _plain_text(_first(metadata.get("notes"), metadata.get("modelDescription"), cm_info.get("ModelDescription"), civitai.get("description")))
    preview = _preview_path(resolved, roots)
    preview_safe = _preview_is_safe(metadata, cm_info)
    sources = [name for name, value in (("metadata", metadata), ("cm-info", cm_info)) if value]
    directory = PurePosixPath(logical).parent.as_posix()
    if directory == ".":
        directory = ""
    local_type = str(_first(model_metadata.get("type"), cm_info.get("ModelType"), "LoRA") or "LoRA")
    category = str(_first(model_tags[0] if model_tags else None, tags[0] if tags else None, directory.split("/")[0] if directory else None, "Uncategorized"))
    preview_revision = None
    if preview:
        preview_stat = preview.stat()
        preview_revision = f"{preview_stat.st_mtime_ns:x}-{preview_stat.st_size:x}"
    return {
        "name": logical,
        "display_name": display_name,
        "base_model": base_model,
        "tags": tags,
        "trigger_words": triggers,
        "author": author,
        "description": description,
        "size": resolved.stat().st_size,
        "preview_url": f"/bv_nodepack/loras/preview?name={quote(logical, safe='')}&v={preview_revision}" if preview_revision else None,
        "preview_safe": preview_safe,
        "preview_media_type": "video" if preview and preview.suffix.casefold() == ".mp4" else "image",
        "metadata_sources": sources,
        "type": local_type,
        "category": category,
        "directory": directory,
        "civitai_url": _civitai_url(metadata, cm_info),
        "compatibility": (compatibility_checker or _header_compatibility)(resolved),
    }


def _civitai_url(metadata, cm_info):
    """Local LoRA Manager and Comfy metadata only; never use a download URL."""
    civitai = metadata.get("civitai") if isinstance(metadata.get("civitai"), dict) else {}
    for value in (metadata.get("civitai_url"), metadata.get("url"), cm_info.get("ModelUrl"), cm_info.get("ModelURL"), cm_info.get("Url")):
        if not isinstance(value, str) or any(ord(char) < 33 for char in value):
            continue
        try:
            parsed = urlsplit(value)
            if (parsed.scheme.lower() in {"http", "https"} and parsed.hostname in {"civitai.com", "www.civitai.com"}
                    and parsed.username is None and parsed.password is None and parsed.port in {None, 80, 443}
                    and re.fullmatch(r"/models/[1-9]\d*(?:/[A-Za-z0-9_-]+)?/?", parsed.path)):
                return value
        except ValueError:
            continue
    def identifier(*values):
        for value in values:
            if not isinstance(value, bool) and re.fullmatch(r"[1-9]\d*", str(value)):
                return str(value)
        return None
    model = civitai.get("model") if isinstance(civitai.get("model"), dict) else {}
    model_id = identifier(civitai.get("modelId"), model.get("id"), cm_info.get("ModelId"), cm_info.get("ModelID"))
    version_id = identifier(civitai.get("id"), cm_info.get("VersionId"), cm_info.get("VersionID"))
    if model_id:
        return f"https://civitai.com/models/{model_id}" + (f"?modelVersionId={version_id}" if version_id else "")
    return None


def _header_compatibility(path, *, raise_transient=False):
    """Bounded header-only routing evidence, never a target-model compatibility claim."""
    unknown = {"status": "unknown", "family": None, "reason": "Unknown: target model and adapter support have not been verified.", "target_model": "unknown"}
    try:
        file_size = path.stat().st_size
        with path.open("rb") as stream:
            length = int.from_bytes(stream.read(8), "little")
            if not 2 <= length <= 8 * 1024 * 1024 or length > file_size - 8:
                return unknown
            header = json.loads(stream.read(length))
        if not isinstance(header, dict):
            return unknown
        pairs = {}
        ranges = []
        for key, tensor in header.items():
            if key == "__metadata__":
                continue
            match = re.fullmatch(r"(.+)\.(lora_A\.weight|lora_B\.weight|lora_down\.weight|lora_up\.weight|alpha)", key)
            if not match or not isinstance(tensor, dict):
                return unknown
            shape = tensor.get("shape")
            offsets = tensor.get("data_offsets")
            if not isinstance(shape, list) or any(not isinstance(n, int) or isinstance(n, bool) or n < 1 for n in shape):
                return unknown
            if not isinstance(offsets, list) or len(offsets) != 2 or any(not isinstance(n, int) or isinstance(n, bool) for n in offsets) or not 0 <= offsets[0] <= offsets[1] <= file_size - 8 - length:
                return unknown
            width = {"F16": 2, "BF16": 2, "F32": 4, "F64": 8}.get(tensor.get("dtype"))
            if width is None or offsets[1] - offsets[0] != math.prod(shape) * width:
                return unknown
            ranges.append(tuple(offsets))
            part = "alpha" if match[2] == "alpha" else ("down" if match[2] in {"lora_A.weight", "lora_down.weight"} else "up")
            group = pairs.setdefault(match[1], {})
            if part in group:
                return unknown
            group[part] = shape
        if not pairs:
            return unknown
        ranges.sort()
        if any(left[1] > right[0] for left, right in zip(ranges, ranges[1:])):
            return unknown
        for group in pairs.values():
            down, up = group.get("down", []), group.get("up", [])
            if len(down) != 2 or len(up) != 2 or down[0] != up[1] or ("alpha" in group and group["alpha"] not in ([], [1])):
                return unknown
        from .regional.krea2_lora_names import canonical_krea2_targets
        layers = max((int(match[1]) + 1 for key in pairs for match in [re.search(r"(?:blocks[._]|transformer_blocks\.)(\d+)", key)] if match), default=0)
        if layers > 256:
            return unknown
        names = [name.replace(".", "_") for name in canonical_krea2_targets(pairs, layers).values()]
        spatial = re.compile(r"(?:blocks_\d+|txtfusion_(?:layerwise|refiner)_blocks_\d+)_(?:attn_(?:wq|wk|wv|gate|wo)|mlp_(?:gate|up|down))|(?:first|last_linear|txtmlp_[13]|txtfusion_projector)")
        temporal = {"tmlp_0", "tmlp_2", "tproj_1"}
        if len(set(names)) != len(names) or any(not spatial.fullmatch(name) and name not in temporal for name in names):
            return unknown
        if not any(name.startswith(("blocks_", "txtfusion_")) for name in names):
            return unknown
        if any(name in temporal for name in names):
            return {"status": "multipass", "family": "Krea 2", "reason": "Validated Krea target pairs include non-spatial time conditioning. Regional use requires multipass; target-model shapes are checked at execution.", "target_model": "unknown"}
        return {"status": "token_candidate", "family": "Krea 2", "reason": "Validated Krea target pairs are token-gate candidates. Exact target-model compatibility is checked at execution.", "target_model": "unknown"}
    except (OSError, ImportError):
        if raise_transient:
            raise
    except (ValueError, UnicodeError, OverflowError, AttributeError, TypeError):
        pass
    return unknown


def discover_loras(folder_paths_module=None, *, header_cache_path=None) -> dict[str, Any]:
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    try:
        names = folder_paths_module.get_filename_list("loras")
    except Exception:
        names = []
    from .lora_header_cache import HeaderCheckCache, default_header_cache_path
    cache = HeaderCheckCache(default_header_cache_path(folder_paths_module) if header_cache_path is None else header_cache_path)
    def compatibility(path):
        try:
            return cache.resolve(path, lambda item: _header_compatibility(item, raise_transient=True))
        except (OSError, ImportError):
            return {"status": "unknown", "family": None, "reason": "Unknown: target model and adapter support have not been verified.", "target_model": "unknown"}
    items: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    seen_paths: set[Path] = set()
    roots = lora_roots(folder_paths_module)
    for value in sorted(names, key=lambda item: str(item).casefold()):
        try:
            logical, resolved = resolve_lora_path(value, folder_paths_module)
        except (ValueError, OSError):
            continue
        key = logical.casefold()
        if key in seen_names or resolved in seen_paths:
            continue
        seen_names.add(key)
        seen_paths.add(resolved)
        items.append(_catalog_item(logical, resolved, compatibility, roots))
    cache.save()
    return {"schema": CATALOG_SCHEMA, "version": CATALOG_VERSION, "items": items}

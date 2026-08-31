from __future__ import annotations

import html
import json
import math
import re
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import quote
from uuid import UUID


CONFIG_SCHEMA = "bv.lora_registry_config"
CONFIG_VERSION = 1
CATALOG_SCHEMA = "bv.lora_catalog"
CATALOG_VERSION = 1
MAX_SIDECAR_BYTES = 2 * 1024 * 1024
PREVIEW_SUFFIXES = (".preview.png", ".preview.jpg", ".preview.jpeg", ".preview.webp")


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
    if candidate.get("schema") != CONFIG_SCHEMA or candidate.get("version") != CONFIG_VERSION:
        raise ValueError("LoRA registry configuration must be bv.lora_registry_config v1")
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
        if set(source_stack).difference({"id", "name", "enabled", "entries"}):
            raise ValueError(f"stacks[{stack_index}] contains unsupported fields")
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
            "name": name,
            "enabled": source_stack.get("enabled", True) is not False,
            "entries": entries,
        })
    return {"schema": CONFIG_SCHEMA, "version": CONFIG_VERSION, "registry_id": registry_id, "stacks": stacks}


def serialize_lora_registry_config(value: Any) -> str:
    return json.dumps(parse_lora_registry_config(value), ensure_ascii=False, separators=(",", ":"))


def lora_registry_diagnostics(value: Any) -> tuple[int, str]:
    config = parse_lora_registry_config(value)
    if not config["stacks"]:
        return 0, "No LoRAs configured"
    active_total = 0
    summary: list[str] = []
    for stack in config["stacks"]:
        active = sum(1 for entry in stack["entries"] if stack["enabled"] and entry["enabled"])
        active_total += active
        disabled = " · stack disabled" if not stack["enabled"] else ""
        summary.append(f'{stack["name"]}: {active}/{len(stack["entries"])} active{disabled}')
    return active_total, "\n".join(summary)


def resolve_lora_path(logical_name: Any, folder_paths_module=None) -> tuple[str, Path]:
    logical = _logical_name(logical_name)
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    resolved = folder_paths_module.get_full_path("loras", logical)
    if not resolved:
        raise ValueError(f"LoRA file not found through ComfyUI: {logical}")
    path = Path(resolved)
    if not path.is_file() or path.suffix.casefold() != ".safetensors":
        raise ValueError(f"LoRA file not found through ComfyUI: {logical}")
    return logical, path.resolve()


def materialize_lora_registry(value: Any, folder_paths_module=None) -> tuple[dict[str, Any], str]:
    config = parse_lora_registry_config(value)
    stacks: dict[str, Any] = {}
    for stack in config["stacks"]:
        active: list[tuple[str, float, float]] = []
        if stack["enabled"]:
            for entry in stack["entries"]:
                if not entry["enabled"]:
                    continue
                logical, _path = resolve_lora_path(entry["lora_name"], folder_paths_module)
                active.append((logical, entry["model_strength"], entry["clip_strength"]))
        stacks[stack["id"]] = {"id": stack["id"], "name": stack["name"], "stack": active}
    return {"schema": "bv.lora_stack_registry", "version": 1, "stacks": stacks}, config["registry_id"]


def _load_sidecar(path: Path) -> dict[str, Any]:
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


def _preview_path(resolved_lora: Path) -> Path | None:
    for suffix in PREVIEW_SUFFIXES:
        candidate = resolved_lora.with_name(f"{resolved_lora.stem}{suffix}")
        if candidate.is_file():
            return candidate.resolve()
    return None


def lora_preview_path(logical_name: Any, folder_paths_module=None) -> Path | None:
    _logical, resolved = resolve_lora_path(logical_name, folder_paths_module)
    return _preview_path(resolved)


def _catalog_item(logical: str, resolved: Path) -> dict[str, Any]:
    metadata = _load_sidecar(resolved.with_name(f"{resolved.stem}.metadata.json"))
    cm_info = _load_sidecar(resolved.with_name(f"{resolved.stem}.cm-info.json"))
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
    preview = _preview_path(resolved)
    preview_safe = metadata.get("preview_nsfw_level") == 0 or cm_info.get("Nsfw") is False
    sources = [name for name, value in (("metadata", metadata), ("cm-info", cm_info)) if value]
    directory = PurePosixPath(logical).parent.as_posix()
    if directory == ".":
        directory = ""
    local_type = str(_first(model_metadata.get("type"), cm_info.get("ModelType"), "LoRA") or "LoRA")
    category = str(_first(model_tags[0] if model_tags else None, tags[0] if tags else None, directory.split("/")[0] if directory else None, "Uncategorized"))
    return {
        "name": logical,
        "display_name": display_name,
        "base_model": base_model,
        "tags": tags,
        "trigger_words": triggers,
        "author": author,
        "description": description,
        "size": resolved.stat().st_size,
        "preview_url": f"/bv_nodepack/loras/preview?name={quote(logical, safe='')}" if preview else None,
        "preview_safe": preview_safe,
        "metadata_sources": sources,
        "type": local_type,
        "category": category,
        "directory": directory,
    }


def discover_loras(folder_paths_module=None) -> dict[str, Any]:
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    try:
        names = folder_paths_module.get_filename_list("loras")
    except Exception:
        names = []
    items: list[dict[str, Any]] = []
    seen_names: set[str] = set()
    seen_paths: set[Path] = set()
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
        items.append(_catalog_item(logical, resolved))
    return {"schema": CATALOG_SCHEMA, "version": CATALOG_VERSION, "items": items}

from __future__ import annotations

import copy
import base64
import binascii
import json
import math
import uuid
from typing import Any

from ..prompt.category import ast_to_plain_text, parse_prompt_to_ast


REGIONAL = "BV_REGIONAL"
SELECTION = "BV_REGIONAL_SELECTION"
SUPPORTED_OVERLAP_MODES = frozenset({"joint"})
LATEST_VERSION = 2
REGION_USAGES = frozenset({"generation", "detailer", "both"})


class RegionalValidationError(ValueError):
    def __init__(self, issues: list[str]):
        self.issues = issues
        super().__init__("Invalid BV Regional document:\n- " + "\n- ".join(issues))


def default_document(width: int = 1024, height: int = 1024) -> dict[str, Any]:
    return {
        "schema": "bv.regional",
        "version": LATEST_VERSION,
        "document_id": str(uuid.uuid4()),
        "title": "Regional Prompt",
        "canvas": {"width": int(width), "height": int(height)},
        "prompts": {
            "global": {"positive_source": "", "negative_source": ""},
            "background": {"positive_source": "", "negative_source": ""},
        },
        "negative_mode": "auto",
        "overlap": {"mode": "joint"},
        "regions": [],
    }


def _finite_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _check_prompt_pair(value: Any, path: str, issues: list[str]) -> None:
    if not isinstance(value, dict):
        issues.append(f"{path} must be an object")
        return
    for key in ("positive_source", "negative_source"):
        source = value.get(key)
        if not isinstance(source, str):
            issues.append(f"{path}.{key} must be a string")
            continue
        try:
            parse_prompt_to_ast(source)
        except ValueError as exc:
            issues.append(f"{path}.{key}: {exc}")


def validate_document(document: Any, *, executable: bool = True) -> list[str]:
    issues: list[str] = []
    if not isinstance(document, dict):
        return ["document must be an object"]
    if document.get("schema") != "bv.regional":
        issues.append("schema must be 'bv.regional'")
    if document.get("version") != LATEST_VERSION:
        issues.append(f"version must be {LATEST_VERSION}")
    try:
        uuid.UUID(str(document.get("document_id")))
    except (ValueError, TypeError, AttributeError):
        issues.append("document_id must be a UUID")

    canvas = document.get("canvas")
    if not isinstance(canvas, dict):
        issues.append("canvas must be an object")
    else:
        for key in ("width", "height"):
            value = canvas.get(key)
            if not isinstance(value, int) or isinstance(value, bool) or value < 1:
                issues.append(f"canvas.{key} must be a positive integer")

    prompts = document.get("prompts")
    if not isinstance(prompts, dict):
        issues.append("prompts must be an object")
    else:
        _check_prompt_pair(prompts.get("global"), "prompts.global", issues)
        _check_prompt_pair(prompts.get("background"), "prompts.background", issues)

    if document.get("negative_mode") not in {"auto", "prompt", "zero_out"}:
        issues.append("negative_mode must be auto, prompt, or zero_out")
    overlap = document.get("overlap")
    mode = overlap.get("mode") if isinstance(overlap, dict) else None
    if mode not in {"joint", "normalized", "priority", "exclusive"}:
        issues.append("overlap.mode is invalid")
    elif executable and mode not in SUPPORTED_OVERLAP_MODES:
        issues.append(f"overlap.mode '{mode}' is reserved but not executable in v1")

    regions = document.get("regions")
    if not isinstance(regions, list):
        issues.append("regions must be an array")
        return issues

    all_ids: set[str] = {str(document.get("document_id"))}
    region_ids: set[str] = set()
    parents: dict[str, str | None] = {}
    for index, region in enumerate(regions):
        path = f"regions[{index}]"
        if not isinstance(region, dict):
            issues.append(f"{path} must be an object")
            continue
        region_id = region.get("id")
        try:
            uuid.UUID(str(region_id))
        except (ValueError, TypeError, AttributeError):
            issues.append(f"{path}.id must be a UUID")
        if str(region_id) in all_ids:
            issues.append(f"{path}.id must be globally unique")
        all_ids.add(str(region_id))
        region_ids.add(str(region_id))
        parents[str(region_id)] = region.get("parent_region_id")
        if not isinstance(region.get("name"), str) or not region.get("name", "").strip():
            issues.append(f"{path}.name must be a non-empty string")
        for key in ("enabled",):
            if not isinstance(region.get(key), bool):
                issues.append(f"{path}.{key} must be boolean")
        if region.get("usage") not in REGION_USAGES:
            issues.append(f"{path}.usage must be generation, detailer, or both")
        strength = region.get("strength")
        if not _finite_number(strength) or not 0 <= strength <= 10:
            issues.append(f"{path}.strength must be a finite number between 0 and 10")
        priority = region.get("priority")
        if not isinstance(priority, int) or isinstance(priority, bool):
            issues.append(f"{path}.priority must be an integer")
        _check_prompt_pair(region.get("prompts"), f"{path}.prompts", issues)
        mask = region.get("mask")
        if not isinstance(mask, dict) or not _finite_number(mask.get("feather")) or not 0 <= mask.get("feather", -1) <= 0.5:
            issues.append(f"{path}.mask.feather must be between 0 and 0.5")

        geometry = region.get("geometry")
        if not isinstance(geometry, list):
            issues.append(f"{path}.geometry must be an array")
            continue
        for shape_index, shape in enumerate(geometry):
            shape_path = f"{path}.geometry[{shape_index}]"
            if not isinstance(shape, dict):
                issues.append(f"{shape_path} must be an object")
                continue
            shape_id = str(shape.get("id"))
            try:
                uuid.UUID(shape_id)
            except (ValueError, TypeError, AttributeError):
                issues.append(f"{shape_path}.id must be a UUID")
            if shape_id in all_ids:
                issues.append(f"{shape_path}.id must be globally unique")
            all_ids.add(shape_id)
            if shape.get("operation") not in {"add", "subtract"}:
                issues.append(f"{shape_path}.operation must be add or subtract")
            if "layer_id" in shape:
                try:
                    uuid.UUID(str(shape["layer_id"]))
                except (ValueError, TypeError, AttributeError):
                    issues.append(f"{shape_path}.layer_id must be a UUID")
            if "mask_group_id" in shape:
                try:
                    uuid.UUID(str(shape["mask_group_id"]))
                except (ValueError, TypeError, AttributeError):
                    issues.append(f"{shape_path}.mask_group_id must be a UUID")
            if "enabled" in shape and not isinstance(shape["enabled"], bool):
                issues.append(f"{shape_path}.enabled must be boolean")
            authoring = shape.get("authoring")
            if authoring is not None and (
                not isinstance(authoring, dict)
                or not isinstance(authoring.get("name"), str)
                or not authoring.get("name", "").strip()
                or not isinstance(authoring.get("visible"), bool)
                or not isinstance(authoring.get("locked"), bool)
            ):
                issues.append(f"{shape_path}.authoring is invalid")
            shape_type = shape.get("type")
            if shape_type in {"rect", "ellipse"}:
                values = [shape.get(key) for key in ("x", "y", "width", "height")]
                if not all(_finite_number(value) for value in values):
                    issues.append(f"{shape_path} {shape_type} values must be finite numbers")
                elif not (0 <= values[0] <= 1 and 0 <= values[1] <= 1 and values[2] > 0 and values[3] > 0 and values[0] + values[2] <= 1 + 1e-9 and values[1] + values[3] <= 1 + 1e-9):
                    issues.append(f"{shape_path} {shape_type} must stay inside normalized canvas")
            elif shape_type == "polygon":
                points = shape.get("points")
                if not isinstance(points, list) or len(points) < 3:
                    issues.append(f"{shape_path}.points must contain at least three vertices")
                else:
                    for point_index, point in enumerate(points):
                        if not isinstance(point, dict) or any(not _finite_number(point.get(k)) or not 0 <= point.get(k) <= 1 for k in ("x", "y", "pressure")):
                            issues.append(f"{shape_path}.points[{point_index}] must contain normalized x, y, pressure")
            elif shape_type == "brush_stroke":
                if shape.get("shape", "round") not in {"round", "square"}:
                    issues.append(f"{shape_path}.shape must be round or square")
                if shape.get("pressure_mode", "constant") not in {"constant", "stylus"}:
                    issues.append(f"{shape_path}.pressure_mode must be constant or stylus")
                if not _finite_number(shape.get("size")) or not 0 < shape.get("size", 0) <= 1:
                    issues.append(f"{shape_path}.size must be greater than 0 and at most 1")
                for key in ("hardness", "opacity"):
                    value = shape.get(key)
                    if not _finite_number(value) or not 0 <= value <= 1:
                        issues.append(f"{shape_path}.{key} must be between 0 and 1")
                points = shape.get("points")
                if not isinstance(points, list) or not points:
                    issues.append(f"{shape_path}.points must be a non-empty array")
                else:
                    for point_index, point in enumerate(points):
                        if not isinstance(point, dict) or any(not _finite_number(point.get(k)) or not 0 <= point.get(k) <= 1 for k in ("x", "y", "pressure")):
                            issues.append(f"{shape_path}.points[{point_index}] must contain normalized x, y, pressure")
            elif shape_type == "raster_mask":
                values = [shape.get(key) for key in ("x", "y", "width", "height")]
                if not all(_finite_number(value) for value in values) or not (0 <= values[0] <= 1 and 0 <= values[1] <= 1 and values[2] > 0 and values[3] > 0 and values[0] + values[2] <= 1 + 1e-9 and values[1] + values[3] <= 1 + 1e-9):
                    issues.append(f"{shape_path} raster bounds must stay inside normalized canvas")
                for key in ("pixel_width", "pixel_height"):
                    value = shape.get(key)
                    if not isinstance(value, int) or isinstance(value, bool) or not 1 <= value <= 65536:
                        issues.append(f"{shape_path}.{key} must be an integer between 1 and 65536")
                data_url = shape.get("data_url")
                if not isinstance(data_url, str) or not data_url.startswith("data:image/png;base64,") or len(data_url) > 67_108_864:
                    issues.append(f"{shape_path}.data_url must be a PNG data URL no larger than 64 MiB")
                else:
                    try:
                        payload = base64.b64decode(data_url.split(",", 1)[1], validate=True)
                        if not payload.startswith(b"\x89PNG\r\n\x1a\n"):
                            issues.append(f"{shape_path}.data_url must contain PNG data")
                    except (binascii.Error, ValueError):
                        issues.append(f"{shape_path}.data_url contains invalid base64")
            else:
                issues.append(f"{shape_path}.type is unsupported")

    for region_id, parent_id in parents.items():
        if parent_id is not None and str(parent_id) not in region_ids:
            issues.append(f"region {region_id} references missing parent {parent_id}")
    for start in region_ids:
        seen: set[str] = set()
        current: str | None = start
        while current is not None and current in parents:
            if current in seen:
                issues.append(f"parent_region_id cycle contains {current}")
                break
            seen.add(current)
            parent = parents[current]
            current = str(parent) if parent is not None else None
    return list(dict.fromkeys(issues))


def migrate_document(document: Any) -> dict[str, Any]:
    migrated = copy.deepcopy(document)
    if not isinstance(migrated, dict) or migrated.get("schema") != "bv.regional":
        return migrated
    version = migrated.get("version")
    if version == 1:
        for region in migrated.get("regions", []):
            if isinstance(region, dict):
                region["usage"] = "generation"
        migrated["version"] = LATEST_VERSION
    return migrated


def region_used_for(region: dict[str, Any], consumer: str) -> bool:
    if not region.get("enabled", False):
        return False
    usage = region.get("usage", "generation")
    return usage == consumer or usage == "both"


def parse_document(value: Any, *, executable: bool = True) -> dict[str, Any]:
    try:
        document = json.loads(value) if isinstance(value, str) else copy.deepcopy(value)
    except json.JSONDecodeError as exc:
        raise RegionalValidationError([f"invalid JSON: {exc}"]) from exc
    document = migrate_document(document)
    issues = validate_document(document, executable=executable)
    if issues:
        raise RegionalValidationError(issues)
    return document


def serialize_document(document: Any, *, pretty: bool = False) -> str:
    clean = parse_document(document)
    return json.dumps(clean, ensure_ascii=False, sort_keys=True, indent=2 if pretty else None, separators=None if pretty else (",", ":"))


def select_scope(document: Any, scope: str, region: str = "") -> dict[str, Any]:
    from .context import context_document

    clean = context_document(document)
    if scope in {"global", "background"}:
        return {"document": clean, "scope": scope, "region_id": None}
    if scope != "region":
        raise ValueError("scope must be global, background, or region")
    matches = [item for item in clean["regions"] if item["id"] == region or item["name"] == region]
    if len(matches) != 1:
        raise ValueError(f"region selector must match exactly one id or name; got {len(matches)}")
    return {"document": clean, "scope": "region", "region_id": matches[0]["id"]}


def selection_prompts(selection: Any) -> tuple[dict[str, Any], dict[str, Any]]:
    document = selection["document"]
    if selection["scope"] == "region":
        prompt_pair = next(region["prompts"] for region in document["regions"] if region["id"] == selection["region_id"])
    else:
        prompt_pair = document["prompts"][selection["scope"]]
    positive_ast = parse_prompt_to_ast(prompt_pair["positive_source"])
    negative_ast = parse_prompt_to_ast(prompt_pair["negative_source"])
    return (
        {"ast": positive_ast, "text": ast_to_plain_text(positive_ast).strip(), "source": prompt_pair["positive_source"]},
        {"ast": negative_ast, "text": ast_to_plain_text(negative_ast).strip(), "source": prompt_pair["negative_source"]},
    )

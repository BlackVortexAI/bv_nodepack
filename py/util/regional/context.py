from __future__ import annotations

import copy
import json
import math
import re
from collections.abc import Callable, Iterator, Mapping
from dataclasses import dataclass, field
from types import MappingProxyType
from typing import Any

from .document import RegionalValidationError, parse_document


ENVELOPE_VERSION = 3
CORE_VERSION = 1
_PACK_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
_LOCAL_KEY = re.compile(r"^[a-z0-9]+(?:[._-][a-z0-9]+)*$")


class RegionalContextError(ValueError):
    pass


class RegistryCollisionError(RegionalContextError):
    pass


class UnsupportedCapabilityVersionError(RegionalContextError):
    pass


Validator = Callable[[dict[str, Any]], None]
Migration = Callable[[dict[str, Any]], dict[str, Any]]
Operation = Callable[[dict[str, Any], Any], dict[str, Any]]


@dataclass(frozen=True)
class CapabilityRegistration:
    version: int
    validator: Validator
    version_validators: Mapping[int, Validator] = field(default_factory=dict)
    migrations: Mapping[int, Migration] = field(default_factory=dict)
    operations: Mapping[str, Operation] = field(default_factory=dict)
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if not isinstance(self.version, int) or isinstance(self.version, bool) or self.version < 1:
            raise RegionalContextError("capability version must be a positive integer")
        unsupported = set(self.operations) - {"replace", "merge", "subtract", "clear"}
        if unsupported:
            raise RegionalContextError(f"unsupported capability operations: {sorted(unsupported)}")
        object.__setattr__(self, "version_validators", MappingProxyType(dict(self.version_validators)))
        object.__setattr__(self, "migrations", MappingProxyType(dict(self.migrations)))
        object.__setattr__(self, "operations", MappingProxyType(dict(self.operations)))
        object.__setattr__(self, "metadata", MappingProxyType(_json_copy(dict(self.metadata), path="capability metadata")))


@dataclass(frozen=True)
class ResourceRegistration:
    validator: Callable[[dict[str, Any]], None]
    metadata: Mapping[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        object.__setattr__(self, "metadata", MappingProxyType(_json_copy(dict(self.metadata), path="resource metadata")))


def _normalized_pack_id(pack_id: str) -> str:
    normalized = re.sub(r"[-_.\s]+", "-", pack_id.strip().lower())
    if not _PACK_ID.fullmatch(normalized):
        raise RegionalContextError(f"invalid provider pack id: {pack_id!r}")
    return normalized


def _registry_key(pack_id: str, local_key: str) -> str:
    normalized_local = local_key.strip().lower()
    if not _LOCAL_KEY.fullmatch(normalized_local):
        raise RegionalContextError(f"invalid local registry key: {local_key!r}")
    return f"{_normalized_pack_id(pack_id)}.{normalized_local}"


class CapabilityRegistry:
    """Internal, explicitly owned capability registry with fail-closed collisions."""

    def __init__(self) -> None:
        self._entries: dict[str, tuple[CapabilityRegistration, str]] = {}

    def register(self, pack_id: str, local_key: str, registration: CapabilityRegistration, *, source: str) -> str:
        key = _registry_key(pack_id, local_key)
        if key in self._entries:
            first_source = self._entries[key][1]
            raise RegistryCollisionError(
                f"capability {key!r} already registered by {first_source!r}; rejected {source!r}"
            )
        self._entries[key] = (registration, source)
        return key

    def get(self, key: str) -> CapabilityRegistration | None:
        entry = self._entries.get(key)
        return entry[0] if entry else None

    def source(self, key: str) -> str | None:
        entry = self._entries.get(key)
        return entry[1] if entry else None

    def keys(self) -> tuple[str, ...]:
        return tuple(self._entries)


class ResourceRegistry:
    """Internal registry for serializable resource-reference types, never runtime objects."""

    def __init__(self) -> None:
        self._entries: dict[str, tuple[ResourceRegistration, str]] = {}

    def register(self, pack_id: str, local_key: str, registration: ResourceRegistration, *, source: str) -> str:
        key = _registry_key(pack_id, local_key)
        if key in self._entries:
            first_source = self._entries[key][1]
            raise RegistryCollisionError(
                f"resource type {key!r} already registered by {first_source!r}; rejected {source!r}"
            )
        self._entries[key] = (registration, source)
        return key

    def get(self, key: str) -> ResourceRegistration | None:
        entry = self._entries.get(key)
        return entry[0] if entry else None

    def validate(self, key: str, reference: Any) -> dict[str, Any]:
        registration = self.get(key)
        if registration is None:
            raise RegionalContextError(f"unregistered resource type: {key}")
        clean = _json_copy(reference, path=f"resource[{key}]")
        if not isinstance(clean, dict):
            raise RegionalContextError(f"resource[{key}] must be an object")
        registration.validator(clean)
        return clean

    def keys(self) -> tuple[str, ...]:
        return tuple(self._entries)


def _json_copy(value: Any, *, path: str = "context") -> Any:
    def visit(item: Any, item_path: str) -> None:
        if item is None or isinstance(item, (str, bool)):
            return
        if isinstance(item, int) and not isinstance(item, bool):
            return
        if isinstance(item, float):
            if math.isfinite(item):
                return
            raise RegionalContextError(f"{item_path} contains a non-finite number")
        if isinstance(item, list):
            for index, child in enumerate(item):
                visit(child, f"{item_path}[{index}]")
            return
        if isinstance(item, dict):
            for key, child in item.items():
                if not isinstance(key, str):
                    raise RegionalContextError(f"{item_path} contains a non-string object key")
                visit(child, f"{item_path}.{key}")
            return
        raise RegionalContextError(f"{item_path} contains non-JSON value {type(item).__name__}")

    visit(value, path)
    return copy.deepcopy(value)


def _only_keys(value: Any, allowed: set[str], path: str) -> None:
    if not isinstance(value, dict):
        return
    unknown = sorted(set(value) - allowed)
    if unknown:
        raise RegionalContextError(f"{path} contains unknown fields: {unknown}")


def _validate_core_shape(core: Any) -> dict[str, Any]:
    clean = _json_copy(core, path="core")
    if not isinstance(clean, dict):
        raise RegionalContextError("core must be an object")
    core_keys = {"version", "document_id", "title", "canvas", "prompts", "negative_mode", "overlap", "regions"}
    _only_keys(clean, core_keys, "core")
    missing = sorted(core_keys - set(clean))
    if missing:
        raise RegionalContextError(f"core is missing required fields: {missing}")
    if clean.get("version") != CORE_VERSION:
        raise RegionalContextError(f"core.version must be {CORE_VERSION}")
    if not isinstance(clean.get("title"), str):
        raise RegionalContextError("core.title must be a string")
    _only_keys(clean.get("canvas"), {"width", "height"}, "core.canvas")
    _only_keys(clean.get("prompts"), {"global", "background"}, "core.prompts")
    prompts = clean.get("prompts")
    if isinstance(prompts, dict):
        for scope in ("global", "background"):
            _only_keys(prompts.get(scope), {"positive_source", "negative_source"}, f"core.prompts.{scope}")
    _only_keys(clean.get("overlap"), {"mode"}, "core.overlap")
    regions = clean.get("regions")
    if isinstance(regions, list):
        region_keys = {"id", "name", "parent_region_id", "enabled", "usage", "strength", "priority", "prompts", "mask", "geometry", "authoring"}
        geometry_common = {"id", "layer_id", "mask_group_id", "type", "operation", "enabled", "authoring"}
        geometry_specific = {
            "rect": {"x", "y", "width", "height"}, "ellipse": {"x", "y", "width", "height"},
            "polygon": {"points"}, "brush_stroke": {"shape", "pressure_mode", "size", "hardness", "opacity", "points"},
            "raster_mask": {"x", "y", "width", "height", "pixel_width", "pixel_height", "data_url"},
        }
        for index, region in enumerate(regions):
            path = f"core.regions[{index}]"
            _only_keys(region, region_keys, path)
            if not isinstance(region, dict):
                continue
            _only_keys(region.get("prompts"), {"positive_source", "negative_source"}, f"{path}.prompts")
            _only_keys(region.get("mask"), {"feather"}, f"{path}.mask")
            _only_keys(region.get("authoring"), {"visible", "locked", "color"}, f"{path}.authoring")
            geometry = region.get("geometry")
            if isinstance(geometry, list):
                for shape_index, shape in enumerate(geometry):
                    shape_path = f"{path}.geometry[{shape_index}]"
                    shape_type = shape.get("type") if isinstance(shape, dict) else None
                    _only_keys(shape, geometry_common | geometry_specific.get(shape_type, set()), shape_path)
                    if isinstance(shape, dict):
                        _only_keys(shape.get("authoring"), {"name", "visible", "locked"}, f"{shape_path}.authoring")
                        points = shape.get("points")
                        if isinstance(points, list):
                            for point_index, point in enumerate(points):
                                _only_keys(point, {"x", "y", "pressure"}, f"{shape_path}.points[{point_index}]")
    legacy = {"schema": "bv.regional", "version": 2, **{key: value for key, value in clean.items() if key != "version"}}
    try:
        parse_document(legacy)
    except RegionalValidationError as exc:
        raise RegionalContextError(str(exc).replace("BV Regional document", "BV Regional core")) from exc
    return clean


def _normalize_registered_capability(key: str, payload: Any, registry: CapabilityRegistry | None) -> dict[str, Any]:
    clean = _json_copy(payload, path=f"capabilities.{key}")
    if not isinstance(clean, dict):
        raise RegionalContextError(f"capabilities.{key} must be an object")
    version = clean.get("version")
    if not isinstance(version, int) or isinstance(version, bool) or version < 1:
        raise RegionalContextError(f"capabilities.{key}.version must be a positive integer")
    registration = registry.get(key) if registry else None
    if registration is None or version > registration.version:
        return clean
    while version < registration.version:
        migration = registration.migrations.get(version)
        if migration is None:
            raise RegionalContextError(f"capability {key} has no migration from version {version}")
        clean = _json_copy(migration(copy.deepcopy(clean)), path=f"capabilities.{key}")
        if not isinstance(clean, dict) or clean.get("version") != version + 1:
            raise RegionalContextError(f"capability {key} migration {version} must produce version {version + 1}")
        version += 1
        step_validator = registration.version_validators.get(version)
        if step_validator is not None:
            step_validator(copy.deepcopy(clean))
    registration.validator(copy.deepcopy(clean))
    return clean


class RegionalContext(Mapping[str, Any]):
    """Immutable-by-interface v3 context facade with copy-on-write transforms."""

    __slots__ = ("__wire", "__registry")

    def __init__(self, wire: dict[str, Any], registry: CapabilityRegistry | None = None) -> None:
        clean = _json_copy(wire)
        if not isinstance(clean, dict):
            raise RegionalContextError("regional context must be an object")
        if clean.get("schema") != "bv.regional" or clean.get("version") != ENVELOPE_VERSION:
            raise RegionalContextError("RegionalContext requires a BV Regional v3 envelope")
        _only_keys(clean, {"schema", "version", "core", "capabilities"}, "context")
        capabilities = clean.get("capabilities")
        if not isinstance(capabilities, dict):
            raise RegionalContextError("capabilities must be an object")
        normalized_capabilities: dict[str, Any] = {}
        for key, payload in capabilities.items():
            if "." not in key:
                raise RegionalContextError(f"capability key must be namespaced: {key!r}")
            normalized_capabilities[key] = _normalize_registered_capability(key, payload, registry)
        self.__wire = {
            "schema": "bv.regional",
            "version": ENVELOPE_VERSION,
            "core": _validate_core_shape(clean.get("core")),
            "capabilities": normalized_capabilities,
        }
        self.__registry = registry

    def __getitem__(self, key: str) -> Any:
        return copy.deepcopy(self.__wire[key])

    def __iter__(self) -> Iterator[str]:
        return iter(self.__wire)

    def __len__(self) -> int:
        return len(self.__wire)

    def to_dict(self) -> dict[str, Any]:
        return copy.deepcopy(self.__wire)

    @property
    def core(self) -> dict[str, Any]:
        return copy.deepcopy(self.__wire["core"])

    @property
    def capabilities(self) -> dict[str, Any]:
        return copy.deepcopy(self.__wire["capabilities"])

    def with_core(self, core: Any) -> RegionalContext:
        wire = self.to_dict()
        wire["core"] = _validate_core_shape(core)
        return RegionalContext(wire, self.__registry)

    def with_capability(self, key: str, payload: Any) -> RegionalContext:
        if not isinstance(key, str) or "." not in key:
            raise RegionalContextError("capability key must be namespaced")
        wire = self.to_dict()
        wire["capabilities"][key] = _normalize_registered_capability(key, payload, self.__registry)
        return RegionalContext(wire, self.__registry)

    def without_capability(self, key: str) -> RegionalContext:
        wire = self.to_dict()
        wire["capabilities"].pop(key, None)
        return RegionalContext(wire, self.__registry)

    def require_capability(self, key: str) -> dict[str, Any]:
        payload = self.__wire["capabilities"].get(key)
        if payload is None:
            raise RegionalContextError(f"required capability is missing: {key}")
        registration = self.__registry.get(key) if self.__registry else None
        if registration is None:
            raise RegionalContextError(f"required capability is unregistered: {key}")
        if payload["version"] > registration.version:
            raise UnsupportedCapabilityVersionError(
                f"capability {key} version {payload['version']} is newer than supported version {registration.version}"
            )
        registration.validator(copy.deepcopy(payload))
        return copy.deepcopy(payload)


def normalize_context(value: Any, *, registry: CapabilityRegistry | None = None) -> RegionalContext:
    if isinstance(value, RegionalContext):
        value = value.to_dict()
    try:
        parsed = json.loads(value) if isinstance(value, str) else _json_copy(value)
    except json.JSONDecodeError as exc:
        raise RegionalContextError(f"invalid JSON: {exc}") from exc
    if not isinstance(parsed, dict):
        raise RegionalContextError("regional context must be an object")
    if parsed.get("schema") != "bv.regional":
        raise RegionalContextError("schema must be 'bv.regional'")
    version = parsed.get("version")
    if version in {1, 2}:
        document = parse_document(parsed)
        core = {"version": CORE_VERSION, **{key: value for key, value in document.items() if key not in {"schema", "version"}}}
        wire = {"schema": "bv.regional", "version": ENVELOPE_VERSION, "core": _validate_core_shape(core), "capabilities": {}}
        return RegionalContext(wire, registry)
    if version != ENVELOPE_VERSION:
        raise RegionalContextError(f"unsupported BV Regional envelope version: {version}")
    _only_keys(parsed, {"schema", "version", "core", "capabilities"}, "context")
    capabilities = parsed.get("capabilities")
    if not isinstance(capabilities, dict):
        raise RegionalContextError("capabilities must be an object")
    normalized_capabilities: dict[str, Any] = {}
    for key, payload in capabilities.items():
        if not isinstance(key, str) or "." not in key:
            raise RegionalContextError(f"capability key must be namespaced: {key!r}")
        normalized_capabilities[key] = _normalize_registered_capability(key, payload, registry)
    wire = {
        "schema": "bv.regional",
        "version": ENVELOPE_VERSION,
        "core": _validate_core_shape(parsed.get("core")),
        "capabilities": normalized_capabilities,
    }
    return RegionalContext(wire, registry)


def serialize_context(value: Any, *, registry: CapabilityRegistry | None = None, pretty: bool = False) -> str:
    clean = normalize_context(value, registry=registry).to_dict()
    return json.dumps(clean, ensure_ascii=False, sort_keys=True, indent=2 if pretty else None, separators=None if pretty else (",", ":"))

from __future__ import annotations

import json
import uuid

from ..util.lut_prototype import LUT_TYPE
from .bv_lut_prototype import DOWNLOAD_MORE, BVLutLoaderPrototype, _canonical_lut_choice, _lut_choices


LUT_REGISTRY = "BV_LUT_REGISTRY"
RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"
LUT_RESOURCE_TYPE = "bv-nodepack.lut"
CATEGORY = "🌀 BV Node Pack/regional/LUT"


def _required_text(value, field):
    clean = str(value or "").strip()
    if not clean:
        raise ValueError(f"{field} must be non-empty")
    return clean


def _required_uuid(value, field):
    clean = _required_text(value, field)
    try:
        uuid.UUID(clean)
    except ValueError as error:
        raise ValueError(f"{field} must be a UUID") from error
    return clean


def register_lut_resource(registry, resource_id, name, lut):
    if not isinstance(lut, dict) or lut.get("schema") != "bv.lut.prototype":
        raise ValueError("lut must be a BV LUT")
    clean_id = _required_text(resource_id, "resource_id")
    clean_name = _required_text(name, "name")
    entries = dict(registry.get("entries", {})) if isinstance(registry, dict) else {}
    entries[clean_id] = {"name": clean_name, "lut": lut}
    return {"schema": "bv.lut_registry", "version": 1, "entries": entries}


def build_lut_provider(collector_id, registry):
    provider_id = _required_uuid(collector_id, "collector_id")
    if not isinstance(registry, dict) or registry.get("schema") != "bv.lut_registry" or registry.get("version") != 1:
        raise ValueError("registry must be a BV LUT registry")
    resources = {
        resource_id: entry["lut"]
        for resource_id, entry in registry.get("entries", {}).items()
    }
    return {
        "schema": "bv.runtime_resource_provider", "version": 1,
        "provider_id": provider_id, "resource_type": LUT_RESOURCE_TYPE,
        "resources": resources,
        "metadata": {
            resource_id: {"name": entry["name"]}
            for resource_id, entry in registry.get("entries", {}).items()
        },
    }


class BVNamedLutNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "lut": (LUT_TYPE, {}),
                "name": ("STRING", {"default": "LUT", "multiline": False}),
                "resource_id": ("STRING", {"default": "lut", "multiline": False}),
            },
            "optional": {"registry": (LUT_REGISTRY, {})},
        }

    RETURN_TYPES = (LUT_REGISTRY,)
    RETURN_NAMES = ("registry",)
    FUNCTION = "register"
    CATEGORY = CATEGORY
    DESCRIPTION = "Names a LUT and appends it to a chainable BV Regional LUT registry."

    def register(self, lut, name, resource_id, registry=None):
        return (register_lut_resource(registry, resource_id, name, lut),)


class BVLutCollectorNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "lut_registry": (LUT_REGISTRY, {}),
            "collector_id": ("STRING", {"default": "", "multiline": False}),
        }}

    RETURN_TYPES = (RUNTIME_PROVIDER,)
    RETURN_NAMES = ("resource_provider",)
    FUNCTION = "collect"
    CATEGORY = CATEGORY
    DESCRIPTION = "Exposes named LUTs through the typed BV Regional v3 resource-provider contract."

    def collect(self, lut_registry, collector_id):
        return (build_lut_provider(collector_id, lut_registry),)


class BVLutRegistryNode:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"config_json": ("STRING", {"default": "", "multiline": True})}}

    RETURN_TYPES = ("INT", "STRING", RUNTIME_PROVIDER)
    RETURN_NAMES = ("lut_count", "registry_summary", "resource_provider")
    FUNCTION = "collect"
    CATEGORY = CATEGORY
    DESCRIPTION = "Loads and names multiple LUTs in one Regional V3 registry."

    def collect(self, config_json=""):
        try:
            parsed = json.loads(config_json) if str(config_json).strip() else {}
        except json.JSONDecodeError as error:
            raise ValueError("LUT registry configuration is invalid JSON") from error
        if parsed.get("schema") != "bv.lut_registry_config" or parsed.get("version") != 1:
            raise ValueError("LUT registry configuration must be bv.lut_registry_config v1")
        collector_id = _required_uuid(parsed.get("collector_id"), "collector_id")
        entries = parsed.get("luts")
        if not isinstance(entries, list):
            raise ValueError("LUT registry luts must be an array")
        registry = None
        names = []
        loader = BVLutLoaderPrototype()
        available = set(_lut_choices()) - {DOWNLOAD_MORE}
        for index, entry in enumerate(entries):
            if not isinstance(entry, dict):
                raise ValueError(f"luts[{index}] must be an object")
            resource_id = _required_text(entry.get("id"), f"luts[{index}].id")
            lut_name = _canonical_lut_choice(_required_text(entry.get("lut_name"), f"luts[{index}].lut_name"))
            if lut_name not in available:
                raise ValueError(f"LUT not found: {lut_name}")
            lut, _info = loader.load(lut_name)
            registry = register_lut_resource(registry, resource_id, resource_id, lut)
            names.append(f"{resource_id} · {lut_name}")
        if registry is None:
            registry = {"schema": "bv.lut_registry", "version": 1, "entries": {}}
        provider = build_lut_provider(collector_id, registry)
        return len(names), "\n".join(names) or "No LUTs configured", provider


NODE_CLASS_MAPPINGS = {
    "BV LUT Registry": BVLutRegistryNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BV LUT Registry": "🌀 BV LUT Registry",
}

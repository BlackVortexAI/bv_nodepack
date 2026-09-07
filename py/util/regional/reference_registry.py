"""Serializable reference identities and execution-local native media providers."""
from __future__ import annotations

import json
import re
import uuid

import torch

from .context import CapabilityRegistration, RegionalContextError, normalize_context

REFERENCE_RESOURCE_TYPE = "bv-nodepack.reference"
REFERENCE_CAPABILITY = "bv-nodepack.references"
RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"
MEDIA_TYPES = {"IMAGE": "Image", "AUDIO": "Audio", "VIDEO": "Video"}
MAX_REFERENCES = 100


def _uuid(value, path):
    if not isinstance(value, str):
        raise RegionalContextError(f"{path} must be a UUID")
    try:
        parsed = uuid.UUID(value)
    except ValueError as error:
        raise RegionalContextError(f"{path} must be a UUID") from error
    if str(parsed) != value:
        raise RegionalContextError(f"{path} must be a canonical UUID")
    return value


def parse_reference_config(value):
    try:
        config = json.loads(value) if isinstance(value, str) else value
    except json.JSONDecodeError as error:
        raise RegionalContextError("Invalid reference registry JSON") from error
    if not isinstance(config, dict) or set(config) not in ({"schema", "version", "collector_id", "entries"}, {"schema", "version", "collector_id", "entries", "places"}) or config.get("schema") != "bv.reference_registry_config" or type(config.get("version")) is not int or config["version"] != 1:
        raise RegionalContextError("Expected bv.reference_registry_config v1")
    _uuid(config["collector_id"], "collector_id")
    if not isinstance(config["entries"], list) or len(config["entries"]) > MAX_REFERENCES:
        raise RegionalContextError("Reference entries must be an array of at most 100 entries")
    ids, slots = set(), set()
    for entry in config["entries"]:
        if not isinstance(entry, dict) or set(entry) not in ({"id", "slot"}, {"id", "slot", "media_type"}):
            raise RegionalContextError("Reference entry requires id and slot")
        if "media_type" in entry and entry["media_type"] not in MEDIA_TYPES:
            raise RegionalContextError("Invalid reference place media type")
        resource_id = _uuid(entry["id"], "entry.id")
        slot = entry["slot"]
        if not isinstance(slot, str) or not re.fullmatch(r"media([0-9]|[1-9][0-9])", slot):
            raise RegionalContextError("Invalid reference media slot")
        if resource_id in ids or slot in slots:
            raise RegionalContextError("Duplicate reference identity or slot")
        ids.add(resource_id)
        slots.add(slot)
    if "places" in config:
        places = config["places"]
        parse_reference_config({key: val for key, val in {**config, "entries": places}.items() if key != "places"})
        if any(entry not in places for entry in config["entries"]):
            raise RegionalContextError("Active entries must match their logical reference places")
    return config


def media_type(value):
    if isinstance(value, torch.Tensor) and value.ndim == 4 and value.shape[-1] in (1, 3, 4) and all(value.shape):
        return "IMAGE"
    if isinstance(value, dict) and isinstance(value.get("waveform"), torch.Tensor):
        waveform, rate = value["waveform"], value.get("sample_rate")
        if waveform.ndim == 3 and all(waveform.shape) and type(rate) is int and rate > 0:
            return "AUDIO"
    # The public native VideoInput interface is lazy: never decode for cataloging.
    try:
        from comfy_api.input import VideoInput
    except ImportError:
        VideoInput = ()
    if isinstance(value, VideoInput):
        return "VIDEO"
    raise RegionalContextError("Reference must be native IMAGE, AUDIO or VIDEO")


def build_reference_provider(config_json, media):
    config = parse_reference_config(config_json)
    if not isinstance(media, dict):
        raise RegionalContextError("Reference media must be an input map")
    entries = {entry["slot"]: entry for entry in config["entries"]}
    if set(media) != set(entries):
        raise RegionalContextError("Connected media and persisted reference entries differ")
    resources, metadata, counts = {}, {}, {}
    names = {}
    for place in config.get("places", config["entries"]):
        kind = media_type(media[place["slot"]]) if place["slot"] in media else place.get("media_type")
        if kind:
            counts[kind] = counts.get(kind, 0) + 1
            names[place["id"]] = f"{MEDIA_TYPES[kind]} {counts[kind]}"
    for entry in config["entries"]:
        value = media[entry["slot"]]
        kind = media_type(value)
        resources[entry["id"]] = value
        metadata[entry["id"]] = {"name": names[entry["id"]], "media_type": kind}
    return {"schema": "bv.runtime_resource_provider", "version": 1,
            "provider_id": config["collector_id"], "resource_type": REFERENCE_RESOURCE_TYPE,
            "resources": resources, "metadata": metadata}


def reference_catalog(provider):
    if not isinstance(provider, dict) or provider.get("schema") != "bv.runtime_resource_provider" or type(provider.get("version")) is not int or provider["version"] != 1 or provider.get("resource_type") != REFERENCE_RESOURCE_TYPE:
        raise RegionalContextError("Expected a BV reference resource provider")
    collector = _uuid(provider.get("provider_id"), "provider_id")
    resources, metadata = provider.get("resources"), provider.get("metadata")
    if not isinstance(resources, dict) or not isinstance(metadata, dict) or set(resources) != set(metadata) or len(resources) > MAX_REFERENCES:
        raise RegionalContextError("Invalid reference provider resources/metadata")
    catalog = []
    for resource_id, value in resources.items():
        _uuid(resource_id, "resource_id")
        info = metadata[resource_id]
        if not isinstance(info, dict) or set(info) != {"name", "media_type"} or not isinstance(info["name"], str) or not info["name"].strip() or info["media_type"] != media_type(value):
            raise RegionalContextError("Reference metadata does not match its native media")
        catalog.append({"collector_id": collector, "resource_id": resource_id, **info})
    return {"version": 1, "entries": catalog}


def validate_reference_capability(payload):
    if not isinstance(payload, dict) or set(payload) != {"version", "entries"} or type(payload.get("version")) is not int or payload["version"] != 1 or not isinstance(payload["entries"], list):
        raise RegionalContextError("Invalid references capability")
    seen = set()
    for entry in payload["entries"]:
        if not isinstance(entry, dict) or set(entry) != {"collector_id", "resource_id", "name", "media_type"}:
            raise RegionalContextError("Invalid reference catalog entry")
        key = (_uuid(entry["collector_id"], "collector_id"), _uuid(entry["resource_id"], "resource_id"))
        if key in seen or entry["media_type"] not in MEDIA_TYPES or not isinstance(entry["name"], str) or not entry["name"].strip():
            raise RegionalContextError("Invalid or duplicate reference catalog entry")
        seen.add(key)


REFERENCE_REGISTRATION = CapabilityRegistration(version=1, validator=validate_reference_capability,
    version_validators={1: validate_reference_capability}, metadata={"display_name": "References"})


def attach_reference_catalog(regional, provider, *, registry):
    return normalize_context(regional, registry=registry).with_capability(
        REFERENCE_CAPABILITY, reference_catalog(provider)).to_dict()


def materialize_reference_catalog(regional, selection, providers, *, registry):
    """Resolve selected collectors through the existing managed provider channels."""
    if isinstance(selection, str):
        selection = json.loads(selection)
    if not isinstance(selection, dict) or set(selection) != {"version", "collector_ids"} or type(selection["version"]) is not int or selection["version"] != 1 or not isinstance(selection["collector_ids"], list) or len(selection["collector_ids"]) > 20:
        raise RegionalContextError("Invalid reference collector selection")
    ids = [_uuid(value, "collector_id") for value in selection["collector_ids"]]
    if len(set(ids)) != len(ids):
        raise RegionalContextError("Duplicate selected reference collector")
    catalogs = {}
    for name, provider in providers.items():
        if not re.fullmatch(r"reference_resource_provider_([1-9]|1\d|20)", name) or provider is None:
            continue
        catalog = reference_catalog(provider)
        collector = provider["provider_id"]
        if collector in catalogs:
            raise RegionalContextError("Ambiguous connected reference collector")
        catalogs[collector] = catalog
    if set(catalogs) != set(ids):
        raise RegionalContextError("Selected reference collectors do not match connected providers")
    if not ids:
        return regional
    return normalize_context(regional, registry=registry).with_capability(REFERENCE_CAPABILITY,
        {"version": 1, "entries": [entry for collector in ids for entry in catalogs[collector]["entries"]]}).to_dict()


def resolve_reference(provider, collector_id, resource_id, *, expected_type=None):
    """Resolve only inside the supplied execution-local provider, without copying media."""
    reference_catalog(provider)
    if provider["provider_id"] != _uuid(collector_id, "collector_id"):
        raise RegionalContextError("Reference collector is not connected")
    _uuid(resource_id, "resource_id")
    if resource_id not in provider["resources"]:
        raise RegionalContextError("Reference resource is missing")
    if expected_type is not None and provider["metadata"][resource_id]["media_type"] != expected_type:
        raise RegionalContextError("Reference media type mismatch")
    return provider["resources"][resource_id]

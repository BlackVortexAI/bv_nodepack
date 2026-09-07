"""Serializable reference assignments and execution-local Collector resolution."""
import uuid

def validate_reference_images(value, issues):
    if value is None:
        return
    if not isinstance(value, list) or len(value) > 1:
        issues.append("reference_images must contain at most one source image")
        return
    for item in value:
        if not isinstance(item, dict) or set(item) != {"collector_id", "resource_id", "role"} or item.get("role") != "source":
            issues.append("reference_images requires collector_id, resource_id and role=source")
            continue
        for key in ("collector_id", "resource_id"):
            try:
                if str(uuid.UUID(item[key])) != item[key]:
                    raise ValueError()
            except (ValueError, TypeError, AttributeError):
                issues.append(f"reference_images.{key} must be a canonical UUID")


def resolve_source_image(regional, document, providers):
    from .reference_registry import REFERENCE_CAPABILITY, resolve_reference
    from .context import normalize_context
    from .v3_contracts import REGIONAL_V3_CAPABILITY_REGISTRY
    images = document.get("reference_images", [])
    if document.get("tool_settings", {}).get("references") is False or len(images) != 1:
        raise ValueError("Identity Edit requires References enabled and one source image selected in the global References tab")
    selected = images[0]
    catalog = normalize_context(regional, registry=REGIONAL_V3_CAPABILITY_REGISTRY).require_capability(REFERENCE_CAPABILITY)["entries"]
    if not any(all(entry.get(key) == selected[key] for key in ("collector_id", "resource_id")) and entry.get("media_type") == "IMAGE" for entry in catalog):
        raise ValueError("Selected source image is missing from the Regional reference catalog")
    matches = [value for value in providers.values() if isinstance(value, dict) and value.get("provider_id") == selected["collector_id"]]
    if len(matches) != 1:
        raise ValueError("Selected reference Collector must be connected exactly once to Krea Attention through Registry routing")
    return resolve_reference(matches[0], selected["collector_id"], selected["resource_id"], expected_type="IMAGE")

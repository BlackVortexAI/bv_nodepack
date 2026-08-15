import json

from .bv_smart_pipe import SMART_PIPE


MAX_SOURCES = 16


def _unique_name(base_name, used_names):
    if base_name not in used_names:
        return base_name
    suffix = 2
    while f"{base_name}_{suffix}" in used_names:
        suffix += 1
    return f"{base_name}_{suffix}"


def _provenance_for(pipe, slot_id):
    path = list(pipe.get("provenance", {}).get(slot_id) or [])
    writer = pipe.get("writers", {}).get(slot_id)
    return path or ([writer] if writer else [])


def _is_strict_prefix(prefix, path):
    return len(prefix) < len(path) and path[:len(prefix)] == prefix


def _normalized_name(slot):
    return str(slot.get("name") or "").strip().casefold()


def _compatible_types(left, right):
    return not left or not right or left == "*" or right == "*" or left == right


def merge_smart_pipes(pipes):
    schema_by_id = {}
    slot_order = []
    values = {}
    writers = {}
    provenance = {}
    aliases = {}

    for pipe in pipes:
        if not pipe:
            continue
        pipe_schema = pipe.get("schema", [])
        pipe_values = pipe.get("values", {})
        pipe_writers = pipe.get("writers", {})
        for slot in pipe_schema:
            slot_id = slot.get("id")
            if not slot_id:
                continue
            canonical_id = aliases.get(slot_id, slot_id)
            if canonical_id not in schema_by_id:
                matching_id = next((candidate_id for candidate_id in slot_order
                    if _normalized_name(schema_by_id[candidate_id]) == _normalized_name(slot)
                    and _compatible_types(schema_by_id[candidate_id].get("type"), slot.get("type"))), None)
                canonical_id = matching_id or slot_id
                aliases[slot_id] = canonical_id
            if canonical_id not in schema_by_id:
                schema_by_id[canonical_id] = {**slot, "id": canonical_id}
                slot_order.append(canonical_id)
            elif schema_by_id[canonical_id].get("type") == "*" and slot.get("type") not in (None, "*"):
                schema_by_id[canonical_id]["type"] = slot["type"]
            if slot_id in pipe_values:
                incoming_path = _provenance_for(pipe, slot_id)
                current_path = provenance.get(canonical_id, [])
                # A later branch that only inherited an ancestor value must not
                # erase a genuine downstream write from another branch. For
                # divergent writes, the configured source order still wins.
                if canonical_id in values and _is_strict_prefix(incoming_path, current_path):
                    continue
                values[canonical_id] = pipe_values[slot_id]
                provenance[canonical_id] = incoming_path
                if slot_id in pipe_writers:
                    writers[canonical_id] = pipe_writers[slot_id]

    used_names = set()
    schema = []
    for ordinal, slot_id in enumerate(slot_order, start=1):
        slot = schema_by_id[slot_id]
        name = _unique_name(str(slot.get("name") or "slot"), used_names)
        used_names.add(name)
        schema.append({
            **slot,
            "id": slot_id,
            "name": name,
            "ordinal": ordinal,
            "missing": False,
            "dormant": False,
        })

    return {
        "version": 2,
        "schema": schema,
        "values": values,
        "writers": writers,
        "provenance": provenance,
        "aliases": {slot_id: canonical_id for slot_id, canonical_id in aliases.items() if slot_id != canonical_id},
    }


class BVSmartPipeMerge:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "bv_smart_pipe_merge_json": ("STRING", {"default": "[]", "multiline": True}),
            },
            "optional": {
                **{f"pipe_{index:03d}": (SMART_PIPE,) for index in range(1, MAX_SOURCES + 1)},
            },
        }

    RETURN_TYPES = (SMART_PIPE,)
    RETURN_NAMES = ("pipe",)
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/pipe"
    DESCRIPTION = "Merges ordered wired and wireless Smart Pipe branches. Genuine branch writes beat inherited base values; later divergent writes win."

    @classmethod
    def VALIDATE_INPUTS(cls, bv_smart_pipe_merge_json, **kwargs):
        try:
            sources = json.loads(bv_smart_pipe_merge_json)
        except (TypeError, json.JSONDecodeError) as error:
            return f"BV Smart Pipe Merge configuration is invalid: {error}"
        if not isinstance(sources, list) or len(sources) > MAX_SOURCES:
            return f"BV Smart Pipe Merge needs a list with at most {MAX_SOURCES} sources."
        keys = []
        addresses = []
        for source in sources:
            key = source.get("key") if isinstance(source, dict) else None
            if key not in {f"pipe_{index:03d}" for index in range(1, MAX_SOURCES + 1)}:
                return f"Invalid BV Smart Pipe Merge source: {key}"
            keys.append(key)
            address = source.get("address")
            if address:
                addresses.append(address)
        if len(keys) != len(set(keys)):
            return "BV Smart Pipe Merge source keys must be unique."
        if len(addresses) != len(set(addresses)):
            return "BV Smart Pipe Merge cannot use the same source more than once."
        return True

    def run(self, bv_smart_pipe_merge_json, **kwargs):
        sources = json.loads(bv_smart_pipe_merge_json)
        missing = [source["key"] for source in sources if kwargs.get(source["key"]) is None]
        if missing:
            raise ValueError(f"BV Smart Pipe Merge sources are missing: {', '.join(missing)}")
        ordered_pipes = [kwargs[source["key"]] for source in sources]
        return (merge_smart_pipes(ordered_pipes),)


NODE_CLASS_MAPPINGS = {"BV Smart Pipe Merge": BVSmartPipeMerge}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Smart Pipe Merge": "🌀 BV Smart Pipe Merge"}

import json


SMART_PIPE = "BV_SMART_PIPE"
MAX_SLOTS = 100


class AnyType(str):
    def __ne__(self, value):
        return False


ANY = AnyType("*")


class BVSmartPipe:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "bv_smart_pipe_schema_json": ("STRING", {"default": "[]", "multiline": True}),
                "bv_smart_pipe_route_json": ("STRING", {"default": "{}", "multiline": True}),
            },
            "optional": {
                "pipe": (SMART_PIPE,),
                **{f"v_{index:03d}": (ANY,) for index in range(1, MAX_SLOTS + 1)},
            },
        }

    RETURN_TYPES = (SMART_PIPE,) + (ANY,) * MAX_SLOTS
    RETURN_NAMES = ("pipe",) + tuple(f"out_{index:03d}" for index in range(1, MAX_SLOTS + 1))
    FUNCTION = "run"
    CATEGORY = "🌀 BV Node Pack/pipe"
    DESCRIPTION = "Carries an independently configurable, chain-growing set of values identified by stable slot IDs."

    @classmethod
    def VALIDATE_INPUTS(cls, bv_smart_pipe_schema_json, bv_smart_pipe_route_json="{}", **kwargs):
        try:
            schema = json.loads(bv_smart_pipe_schema_json)
        except (TypeError, json.JSONDecodeError) as error:
            return f"BV Smart Pipe schema is invalid: {error}"
        if not isinstance(schema, list) or len(schema) > MAX_SLOTS:
            return f"BV Smart Pipe schema must be a list with at most {MAX_SLOTS} slots."
        ids = set()
        names = set()
        for slot in schema:
            if not isinstance(slot, dict) or not slot.get("id") or not slot.get("name"):
                return "Every BV Smart Pipe slot needs an id and name."
            if slot["id"] in ids:
                return f"Duplicate BV Smart Pipe slot id: {slot['id']}"
            if slot["name"] in names:
                return f"BV Smart Pipe enthält den Slot-Namen „{slot['name']}“ mehrfach. Prüfe die Merge-Konfiguration oder benenne einen inkompatiblen Slot um."
            if slot.get("missing") and slot.get("connected"):
                return f"Missing BV Smart Pipe slot is still used: {slot['name']}"
            ids.add(slot["id"])
            names.add(slot["name"])
        try:
            route = json.loads(bv_smart_pipe_route_json)
        except (TypeError, json.JSONDecodeError) as error:
            return f"BV Smart Pipe routing metadata is invalid: {error}"
        if not isinstance(route, dict) or not route.get("nodeId") or not route.get("name"):
            return "BV Smart Pipe routing metadata needs a nodeId and name."
        return True

    def run(self, bv_smart_pipe_schema_json, bv_smart_pipe_route_json="{}", pipe=None, **kwargs):
        schema = json.loads(bv_smart_pipe_schema_json)
        upstream_values = (pipe or {}).get("values", {})
        values = {}
        outputs = [None] * MAX_SLOTS

        for slot in schema:
            ordinal = int(slot["ordinal"])
            key = f"v_{ordinal:03d}"
            if key in kwargs:
                value = kwargs[key]
            else:
                value = upstream_values.get(slot["id"])
            values[slot["id"]] = value
            outputs[ordinal - 1] = value

        route = json.loads(bv_smart_pipe_route_json)
        upstream_writers = (pipe or {}).get("writers", {})
        upstream_provenance = (pipe or {}).get("provenance", {})
        writers = {}
        provenance = {}
        for slot in schema:
            key = f"v_{int(slot['ordinal']):03d}"
            slot_id = slot["id"]
            inherited_path = list(upstream_provenance.get(slot_id) or [])
            if not inherited_path and upstream_writers.get(slot_id):
                inherited_path = [upstream_writers[slot_id]]
            if key in kwargs:
                writer = route.get("nodeId")
                writers[slot_id] = writer
                provenance[slot_id] = [*inherited_path, writer] if writer else inherited_path
            else:
                writers[slot_id] = upstream_writers.get(slot_id)
                provenance[slot_id] = inherited_path
        out_pipe = {
            "version": 2,
            "schema": schema,
            "values": values,
            "writers": writers,
            "provenance": provenance,
        }
        return (out_pipe, *outputs)


NODE_CLASS_MAPPINGS = {"BV Smart Pipe": BVSmartPipe}

NODE_DISPLAY_NAME_MAPPINGS = {"BV Smart Pipe": "🌀 BV Smart Pipe"}

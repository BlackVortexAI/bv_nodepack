import json


RESOURCE_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER_M0"
MAX_MULTI_COLLECTORS = 20
RESOURCE_IDS = (
    "a1bdeceb-76ae-4e45-ae36-e5c2664819ce",
    "d97a4268-c02c-42a3-8793-8e578e12e12c",
)


class BVM0FakeResourceCollector:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "runtime_value": ("INT", {"default": 1, "min": 0, "max": 100000}),
            "collector_id": ("STRING", {"default": ""}),
            "resource_a_id": ("STRING", {"default": RESOURCE_IDS[0]}),
            "resource_b_id": ("STRING", {"default": RESOURCE_IDS[1]}),
        }}

    RETURN_TYPES = (RESOURCE_PROVIDER,)
    RETURN_NAMES = ("resource_provider",)
    FUNCTION = "collect"
    CATEGORY = "🌀 BV Node Pack/experimental"

    @classmethod
    def IS_CHANGED(cls, runtime_value, collector_id, resource_a_id, resource_b_id):
        return runtime_value, collector_id, resource_a_id, resource_b_id

    def collect(self, runtime_value, collector_id, resource_a_id, resource_b_id):
        return ({
            "schema": "bv.m0.fake_resource_provider", "version": 1,
            "collector_id": collector_id,
            "resources": {
                resource_a_id: {"name": "Alpha", "value": runtime_value},
                resource_b_id: {"name": "Beta", "value": runtime_value * 10},
            },
        },)


class BVM0FakeResourceConsumer:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "collector_id": ("STRING", {"default": ""}),
            "resource_id": ("STRING", {"default": ""}),
        }, "optional": {"resource_provider": (RESOURCE_PROVIDER, {"forceInput": True})}}

    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("value", "selection")
    OUTPUT_NODE = True
    FUNCTION = "consume"
    CATEGORY = "🌀 BV Node Pack/experimental"

    def consume(self, collector_id, resource_id, resource_provider=None):
        if resource_provider is None:
            raise ValueError(f"BV M0 resource collector is missing for collector_id {collector_id!r}")
        actual = resource_provider.get("collector_id")
        if not collector_id or actual != collector_id:
            raise ValueError(f"BV M0 resource collector is missing or mismatched: expected {collector_id!r}, received {actual!r}")
        resource = resource_provider.get("resources", {}).get(resource_id)
        if resource is None:
            raise ValueError(f"BV M0 resource is unresolved: {resource_id!r} in collector {collector_id!r}")
        return resource["value"], f"{collector_id}/{resource_id}"


class BVM0FakeMultiResourceConsumer:
    """M0-only fan-in spike. Every provider remains an ordinary graph input."""

    @classmethod
    def INPUT_TYPES(cls):
        providers = {
            f"resource_provider_{index}": (RESOURCE_PROVIDER, {"forceInput": True})
            for index in range(1, MAX_MULTI_COLLECTORS + 1)
        }
        return {
            "required": {"resource_bindings": ("STRING", {"default": "[]"})},
            "optional": providers,
        }

    RETURN_TYPES = ("INT", "STRING")
    RETURN_NAMES = ("sum", "selections")
    OUTPUT_NODE = True
    FUNCTION = "consume"
    CATEGORY = "🌀 BV Node Pack/experimental"

    def consume(self, resource_bindings, **providers):
        try:
            bindings = json.loads(resource_bindings)
        except (TypeError, json.JSONDecodeError) as exc:
            raise ValueError("BV M0 multi-resource bindings are invalid JSON") from exc
        if not isinstance(bindings, list):
            raise ValueError("BV M0 multi-resource bindings must be a list")
        if len(bindings) > MAX_MULTI_COLLECTORS:
            raise ValueError(f"BV M0 supports at most {MAX_MULTI_COLLECTORS} collector bindings")

        total = 0
        selections = []
        for index, binding in enumerate(bindings, 1):
            if not isinstance(binding, dict):
                raise ValueError(f"BV M0 binding {index} is invalid")
            collector_id = str(binding.get("collector_id", ""))
            resource_id = str(binding.get("resource_id", ""))
            provider = providers.get(f"resource_provider_{index}")
            if provider is None:
                raise ValueError(
                    f"BV M0 resource collector is missing for binding {index} "
                    f"with collector_id {collector_id!r}"
                )
            actual = provider.get("collector_id")
            if not collector_id or actual != collector_id:
                raise ValueError(
                    f"BV M0 binding {index} collector is missing or mismatched: "
                    f"expected {collector_id!r}, received {actual!r}"
                )
            resource = provider.get("resources", {}).get(resource_id)
            if resource is None:
                raise ValueError(
                    f"BV M0 binding {index} resource is unresolved: "
                    f"{resource_id!r} in collector {collector_id!r}"
                )
            total += resource["value"]
            selections.append(f"{collector_id}/{resource_id}")
        return total, " | ".join(selections)


NODE_CLASS_MAPPINGS = {
    "BV M0 Fake Resource Collector": BVM0FakeResourceCollector,
    "BV M0 Fake Resource Consumer": BVM0FakeResourceConsumer,
    "BV M0 Fake Multi Resource Consumer": BVM0FakeMultiResourceConsumer,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "BV M0 Fake Resource Collector": "BV M0 Fake Resource Collector",
    "BV M0 Fake Resource Consumer": "BV M0 Fake Resource Consumer",
    "BV M0 Fake Multi Resource Consumer": "BV M0 Fake Multi Resource Consumer",
}

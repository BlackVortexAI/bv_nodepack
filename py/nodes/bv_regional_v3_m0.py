RESOURCE_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER_M0"
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


NODE_CLASS_MAPPINGS = {
    "BV M0 Fake Resource Collector": BVM0FakeResourceCollector,
    "BV M0 Fake Resource Consumer": BVM0FakeResourceConsumer,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "BV M0 Fake Resource Collector": "BV M0 Fake Resource Collector",
    "BV M0 Fake Resource Consumer": "BV M0 Fake Resource Consumer",
}

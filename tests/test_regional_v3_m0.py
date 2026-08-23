import unittest
from py.nodes.bv_regional_v3_m0 import (
    BVM0FakeMultiResourceConsumer,
    BVM0FakeResourceCollector,
    BVM0FakeResourceConsumer,
    MAX_MULTI_COLLECTORS,
    RESOURCE_IDS,
    RESOURCE_PROVIDER,
)

class RegionalV3M0Tests(unittest.TestCase):
    def test_typed_provider_and_stable_ids(self):
        self.assertEqual(BVM0FakeResourceCollector.RETURN_TYPES, (RESOURCE_PROVIDER,))
        self.assertTrue(BVM0FakeResourceConsumer.INPUT_TYPES()["optional"]["resource_provider"][1]["forceInput"])
        self.assertEqual(len(set(RESOURCE_IDS)), 2)
    def test_runtime_value_changes_provider_and_cache_key(self):
        node=BVM0FakeResourceCollector(); first=node.collect(2,"c",*RESOURCE_IDS)[0]; second=node.collect(3,"c",*RESOURCE_IDS)[0]
        self.assertNotEqual(first,second); self.assertNotEqual(node.IS_CHANGED(2,"c",*RESOURCE_IDS),node.IS_CHANGED(3,"c",*RESOURCE_IDS))
    def test_consumer_resolves_only_ids(self):
        provider=BVM0FakeResourceCollector().collect(4,"c",*RESOURCE_IDS)[0]
        self.assertEqual(BVM0FakeResourceConsumer().consume("c",RESOURCE_IDS[1],provider)[0],40)
        with self.assertRaisesRegex(ValueError,"unresolved"): BVM0FakeResourceConsumer().consume("c","Alpha",provider)
        with self.assertRaisesRegex(ValueError,"mismatched"): BVM0FakeResourceConsumer().consume("Collector",RESOURCE_IDS[0],provider)
        with self.assertRaisesRegex(ValueError,"collector is missing"): BVM0FakeResourceConsumer().consume("c",RESOURCE_IDS[0])

    def test_multi_consumer_uses_one_native_typed_input_per_binding(self):
        optional = BVM0FakeMultiResourceConsumer.INPUT_TYPES()["optional"]
        self.assertEqual(len(optional), MAX_MULTI_COLLECTORS)
        self.assertTrue(all(spec[0] == RESOURCE_PROVIDER for spec in optional.values()))
        self.assertTrue(all(spec[1]["forceInput"] for spec in optional.values()))

        first = BVM0FakeResourceCollector().collect(2, "c1", *RESOURCE_IDS)[0]
        second = BVM0FakeResourceCollector().collect(3, "c2", *RESOURCE_IDS)[0]
        bindings = '[{"collector_id":"c1","resource_id":"%s"},{"collector_id":"c2","resource_id":"%s"}]' % RESOURCE_IDS
        result = BVM0FakeMultiResourceConsumer().consume(
            bindings, resource_provider_1=first, resource_provider_2=second
        )
        self.assertEqual(result[0], 32)
        self.assertIn("c1/", result[1])
        self.assertIn("c2/", result[1])

    def test_multi_consumer_fails_closed_without_positional_provider(self):
        bindings = '[{"collector_id":"c1","resource_id":"%s"}]' % RESOURCE_IDS[0]
        with self.assertRaisesRegex(ValueError, "missing for binding 1"):
            BVM0FakeMultiResourceConsumer().consume(bindings)

    def test_twenty_provider_stress_path_preserves_order(self):
        bindings=[];providers={}
        for index in range(1,MAX_MULTI_COLLECTORS+1):
            collector_id=f"c{index}"
            bindings.append({"collector_id":collector_id,"resource_id":RESOURCE_IDS[0]})
            providers[f"resource_provider_{index}"]=BVM0FakeResourceCollector().collect(index,collector_id,*RESOURCE_IDS)[0]
        import json
        total,selections=BVM0FakeMultiResourceConsumer().consume(json.dumps(bindings),**providers)
        self.assertEqual(total,sum(range(1,MAX_MULTI_COLLECTORS+1)))
        self.assertEqual(len(selections.split(" | ")),MAX_MULTI_COLLECTORS)

if __name__ == "__main__": unittest.main()

import unittest
from py.nodes.bv_regional_v3_m0 import BVM0FakeResourceCollector, BVM0FakeResourceConsumer, RESOURCE_IDS, RESOURCE_PROVIDER

class RegionalV3M0Tests(unittest.TestCase):
    def test_typed_provider_and_stable_ids(self):
        self.assertEqual(BVM0FakeResourceCollector.RETURN_TYPES, (RESOURCE_PROVIDER,))
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

if __name__ == "__main__": unittest.main()

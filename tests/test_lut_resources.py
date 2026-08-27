import unittest

from py.nodes.bv_lut_resources import BVLutRegistryNode, build_lut_provider, register_lut_resource
from py.util.lut_prototype import builtin_lut


class LutResourceTests(unittest.TestCase):
    def test_registry_is_chainable_and_provider_preserves_live_luts(self):
        warm = builtin_lut("Warm Contrast")
        cool = builtin_lut("Cool Graphite")
        first = register_lut_resource(None, "warm", "Warm", warm)
        second = register_lut_resource(first, "cool", "Cool", cool)
        provider = build_lut_provider("11111111-1111-4111-8111-111111111111", second)

        self.assertEqual(list(first["entries"]), ["warm"])
        self.assertEqual(set(second["entries"]), {"warm", "cool"})
        self.assertIs(provider["resources"]["warm"], warm)
        self.assertEqual(provider["resource_type"], "bv-nodepack.lut")
        self.assertEqual(provider["metadata"]["cool"]["name"], "Cool")

    def test_collector_rejects_non_uuid_identity(self):
        registry = register_lut_resource(None, "warm", "Warm", builtin_lut("Warm Contrast"))
        with self.assertRaisesRegex(ValueError, "UUID"):
            build_lut_provider("not-stable", registry)

    def test_single_registry_loads_multiple_luts_without_a_chain(self):
        config = '{"schema":"bv.lut_registry_config","version":1,"collector_id":"11111111-1111-4111-8111-111111111111","luts":[{"id":"warm","lut_name":"Built-in: Warm Contrast"},{"id":"cool","lut_name":"Built-in: Cool Graphite"}]}'
        count, summary, provider = BVLutRegistryNode().collect(config)
        self.assertEqual(count, 2)
        self.assertIn("warm", summary)
        self.assertEqual(set(provider["resources"]), {"warm", "cool"})


if __name__ == "__main__":
    unittest.main()

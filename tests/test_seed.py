import math
import unittest
from unittest.mock import patch

from py.nodes.bv_seed import BVSeed, SEED_MAX


class SeedTests(unittest.TestCase):
    def setUp(self):
        BVSeed._last_seeds.clear()

    def result(self, seed, unique_id="node"):
        return BVSeed().resolve(seed, unique_id)["result"][0]

    def test_fixed_seed_is_passed_through(self):
        self.assertEqual(self.result(123), 123)

    @patch("py.nodes.bv_seed.secrets.randbelow", return_value=456)
    def test_random_mode_generates_each_queue(self, random):
        self.assertEqual(self.result(-1), 456)
        random.assert_called_once_with(SEED_MAX + 1)

    def test_random_sentinel_disables_cache(self):
        self.assertEqual(BVSeed.IS_CHANGED(4), 4)
        self.assertTrue(math.isnan(BVSeed.IS_CHANGED(-1)))

    @patch("py.nodes.bv_seed.secrets.randbelow", return_value=789)
    def test_resolved_seed_is_reported_without_overwriting_seed_input(self, _random):
        response = BVSeed().resolve(-1, "node")
        self.assertNotIn("seed", response["ui"])
        self.assertEqual(response["ui"]["last_seed"], [789])
        self.assertEqual(response["result"], (789,))


if __name__ == "__main__":
    unittest.main()

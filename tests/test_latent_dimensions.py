import unittest

from py.util.latent_dimensions import combine_ratios, dimensions_for_area, parse_ratios


class LatentDimensionTests(unittest.TestCase):
    def test_normalizes_ratios(self):
        self.assertEqual([(16, 9), (1, 1)], parse_ratios("32:18\n1:1"))

    def test_rejects_normalized_duplicates(self):
        with self.assertRaisesRegex(ValueError, "Duplicate aspect ratio"):
            parse_ratios("16:9\n32:18")

    def test_requires_a_ratio(self):
        with self.assertRaisesRegex(ValueError, "At least one"):
            parse_ratios("\n  \n")

    def test_combines_standard_and_custom_ratios(self):
        self.assertEqual([(1, 1), (16, 9), (5, 4)], combine_ratios([(1, 1), (16, 9)], "5:4"))

    def test_combined_ratios_ignore_custom_standard_duplicates(self):
        self.assertEqual([(1, 1), (16, 9)], combine_ratios([(1, 1)], "1:1\n16:9"))

    def test_combined_ratios_require_one_enabled_value(self):
        with self.assertRaisesRegex(ValueError, "enabled or entered"):
            combine_ratios([], "")

    def test_preserves_approximate_square_area_and_alignment(self):
        width, height = dimensions_for_area(1024, (16, 9), 64)
        self.assertEqual((1344, 768), (width, height))
        self.assertLess(abs(width * height - 1024 * 1024), 0.02 * 1024 * 1024)


if __name__ == "__main__":
    unittest.main()

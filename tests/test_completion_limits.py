from pathlib import Path
import tempfile
import unittest

from py.util.completion.service import MAX_SELECTED_DATASETS, MAX_TERM_LENGTH, CompletionService


class CompletionLimitTests(unittest.TestCase):
    def test_repeated_and_padded_dataset_selections_search_each_dataset_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "a.csv").write_text("tag,category\nalpha,general\n", encoding="utf-8")
            (root / "b.csv").write_text("tag,category\nalpha2,general\n", encoding="utf-8")
            service = CompletionService(root)
            selected = ["a.csv"] * 500 + ["missing.csv", "b.csv", "a.csv"]
            paths = service.resolve_paths(selected)
            self.assertEqual([path.name for path in paths], ["a.csv"], "duplicates collapse and the slice limit applies before b.csv")
            self.assertEqual([path.name for path in service.resolve_paths(["b.csv", "a.csv", "b.csv"])], ["b.csv", "a.csv"])
            self.assertLessEqual(len(service.resolve_paths(["a.csv", "b.csv"] * 100)), MAX_SELECTED_DATASETS)
            results = service.search("al", 20, ["a.csv", "a.csv", "b.csv"])
            self.assertEqual(sorted(item["insert_text"] for item in results), ["alpha", "alpha2"])

    def test_search_term_is_truncated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "a.csv").write_text("tag,category\nalpha,general\n", encoding="utf-8")
            service = CompletionService(root)
            self.assertEqual(service.search("al" + "x" * 10_000, 5), [])
            self.assertEqual(len("x" * MAX_TERM_LENGTH), MAX_TERM_LENGTH)


if __name__ == "__main__":
    unittest.main()

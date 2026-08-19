import tempfile
import unittest
from pathlib import Path

from py.util.completion.dataset import CompletionDataset
from py.util.completion.service import CompletionService


class CompletionDatasetTests(unittest.TestCase):
    def test_loads_legacy_four_column_csv_and_aliases(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.csv"
            path.write_text(
                "1girl,0,9259271,woman\n"
                "blue_archive,3,250000,burū_ākaibu\n",
                encoding="utf-8",
            )

            dataset = CompletionDataset(path)
            result = dataset.search("wom", limit=10)

            self.assertEqual(result[0]["insert_text"], "1girl")
            self.assertEqual(result[0]["label"], "woman → 1girl")
            self.assertEqual(result[0]["category"], "general")
            self.assertEqual(result[0]["metadata"]["usage_count"], 9259271)
            self.assertTrue(result[0]["metadata"]["is_alias"])

    def test_extended_header_preserves_unknown_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "enriched.csv"
            path.write_text(
                "tag,category,post_count,aliases,description,nsfw_score,source,custom_fact\n"
                "blue_hair,general,1234,aqua_hair,Blue colored hair,0.18,danbooru,kept\n",
                encoding="utf-8",
            )

            result = CompletionDataset(path).search("blue", limit=10)[0]

            self.assertEqual(result["detail"], "Blue colored hair")
            self.assertEqual(result["metadata"]["nsfw_score"], "0.18")
            self.assertEqual(result["metadata"]["source"], "danbooru")
            self.assertEqual(result["metadata"]["custom_fact"], "kept")

    def test_prefix_results_rank_by_exactness_then_usage(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.csv"
            path.write_text(
                "blue_hair,0,100,\n"
                "blue,0,10,\n"
                "blue_eyes,0,500,\n",
                encoding="utf-8",
            )

            results = CompletionDataset(path).search("blue", limit=2)

            self.assertEqual([item["insert_text"] for item in results], ["blue", "blue eyes"])

    def test_search_matches_inside_tags_but_keeps_prefixes_first(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.csv"
            path.write_text(
                "with,0,10,\n"
                "woman_with_woman,0,999,\n"
                "without_hat,0,500,\n",
                encoding="utf-8",
            )

            results = CompletionDataset(path).search("with", limit=10)

            self.assertEqual(
                [item["insert_text"] for item in results],
                ["with", "without hat", "woman with woman"],
            )

    def test_reads_extended_tsv(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.tsv"
            path.write_text("tag\tcategory\tdescription\nred_hair\tgeneral\tRed colored hair\n", encoding="utf-8")

            result = CompletionDataset(path).search("red", limit=10)[0]

            self.assertEqual(result["insert_text"], "red hair")
            self.assertEqual(result["detail"], "Red colored hair")

    def test_service_lists_and_combines_only_selected_datasets(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "one.csv").write_text("blue_hair,0,100,\n", encoding="utf-8")
            (root / "two.tsv").write_text("tag\tcategory\tpost_count\nblue_eyes\tgeneral\t200\n", encoding="utf-8")
            service = CompletionService(root)

            self.assertEqual([item["id"] for item in service.available_datasets()], ["one.csv", "two.tsv"])
            self.assertEqual(
                [item["insert_text"] for item in service.search("blue", selected=["one.csv"])],
                ["blue hair"],
            )
            self.assertEqual(
                [item["insert_text"] for item in service.search("blue")],
                ["blue eyes", "blue hair"],
            )

    def test_insertion_uses_spaces_but_preserves_the_canonical_tag(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "tags.csv"
            path.write_text("very_long_hair,0,100,\n", encoding="utf-8")

            result = CompletionDataset(path).search("very long", limit=10)[0]

            self.assertEqual(result["insert_text"], "very long hair")
            self.assertEqual(result["label"], "very long hair")
            self.assertEqual(result["metadata"]["canonical_tag"], "very_long_hair")

    def test_selected_dataset_order_is_duplicate_priority(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "first.csv").write_text(
                "tag,category,post_count,description\nblue_hair,general,1,First source\n",
                encoding="utf-8",
            )
            (root / "second.csv").write_text(
                "tag,category,post_count,description\nblue_hair,general,999,Second source\n",
                encoding="utf-8",
            )
            service = CompletionService(root)

            result = service.search("blue", selected=["first.csv", "second.csv"])

            self.assertEqual(result[0]["detail"], "First source")
            self.assertEqual(
                [path.name for path in service.resolve_paths(["second.csv", "first.csv"])],
                ["second.csv", "first.csv"],
            )


if __name__ == "__main__":
    unittest.main()

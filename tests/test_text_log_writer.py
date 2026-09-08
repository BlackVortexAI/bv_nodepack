from pathlib import Path
import tempfile
import unittest

from py.util.text_log import safe_log_name, write_text_log


class TextLogWriterTests(unittest.TestCase):
    def test_safe_log_name_removes_paths_and_reserved_names(self):
        self.assertEqual(safe_log_name("../../enhancer diff.json"), "enhancer_diff.json")
        self.assertEqual(safe_log_name("CON"), "_CON.txt")

    def test_safe_log_name_accepts_only_text_suffixes(self):
        self.assertEqual(safe_log_name("run"), "run.txt")
        self.assertEqual(safe_log_name("run.LOG"), "run.LOG")
        for name in ("payload.pt", "payload.py", "payload.html", "page.htm", "report.v2"):
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, "must end with one of"):
                safe_log_name(name)

    def test_rejected_suffix_writes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            for mode in ("overwrite", "append", "timestamped"):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    write_text_log(directory, "payload", "payload.pt", mode)
            log_directory = Path(directory) / "bv_logs"
            self.assertEqual(list(log_directory.iterdir()) if log_directory.exists() else [], [])

    def test_overwrite_uses_stable_file_and_utf8(self):
        with tempfile.TemporaryDirectory() as directory:
            first = write_text_log(directory, "eins ä", "result.txt", "overwrite")
            second = write_text_log(directory, "zwei", "result.txt", "overwrite")
            self.assertEqual(first, second)
            self.assertEqual(second.read_text(encoding="utf-8"), "zwei")
            self.assertEqual(second.parent, Path(directory).resolve() / "bv_logs")

    def test_append_separates_runs_and_timestamped_preserves_suffix(self):
        with tempfile.TemporaryDirectory() as directory:
            appended = write_text_log(directory, "first", "diagnostics.log", "append")
            write_text_log(directory, "second", "diagnostics.log", "append")
            content = appended.read_text(encoding="utf-8")
            self.assertIn("first", content)
            self.assertIn("second", content)
            timestamped = write_text_log(directory, "{}", "diff.json", "timestamped")
            self.assertEqual(timestamped.suffix, ".json")
            self.assertTrue(timestamped.name.startswith("diff-"))

    def test_rejects_unknown_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaisesRegex(ValueError, "Unsupported BV text log mode"):
                write_text_log(directory, "text", "name", "elsewhere")

    def test_timestamped_mode_never_reuses_the_same_path(self):
        with tempfile.TemporaryDirectory() as directory:
            first = write_text_log(directory, "first", "enhancer.json", "timestamped")
            second = write_text_log(directory, "second", "enhancer.json", "timestamped")
            self.assertNotEqual(first, second)
            self.assertEqual(first.read_text(encoding="utf-8"), "first")
            self.assertEqual(second.read_text(encoding="utf-8"), "second")


if __name__ == "__main__":
    unittest.main()

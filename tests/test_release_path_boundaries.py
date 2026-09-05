import os
from pathlib import Path
import tempfile
import types
import unittest
from unittest.mock import patch

from py.util.text_log import write_text_log
from py.util.regional.lora_hooks import resolve_stack_paths


class ReleasePathBoundaryTests(unittest.TestCase):
    def test_existing_hardlink_never_changes_external_log(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside.txt"
            outside.write_text("sentinel")
            (root / "bv_logs").mkdir()
            os.link(outside, root / "bv_logs" / "log.txt")
            for mode in ("append", "overwrite"):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    write_text_log(root, "mutation", "log.txt", mode)
                self.assertEqual(outside.read_text(), "sentinel")
            result = write_text_log(root, "new", "log.txt", "timestamped")
            self.assertEqual(result.read_text(), "new")
            self.assertEqual(outside.read_text(), "sentinel")

    def _symlink(self, link, target, is_directory=False):
        try:
            link.symlink_to(target, target_is_directory=is_directory)
        except OSError as error:
            self.skipTest(f"Symlink privilege unavailable: {error}")

    def test_file_symlink_is_rejected_without_changing_target(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside.txt"
            outside.write_text("sentinel")
            (root / "bv_logs").mkdir()
            self._symlink(root / "bv_logs" / "log.txt", outside)
            for mode in ("append", "overwrite"):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    write_text_log(root, "mutation", "log.txt", mode)
                self.assertEqual(outside.read_text(), "sentinel")

    def test_directory_symlink_is_rejected_for_every_mode(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            outside = root / "outside"
            outside.mkdir()
            self._symlink(root / "bv_logs", outside, True)
            for mode in ("append", "overwrite", "timestamped"):
                with self.subTest(mode=mode), self.assertRaises(ValueError):
                    write_text_log(root, "mutation", "log.txt", mode)
            self.assertEqual(list(outside.iterdir()), [])

    def test_default_lora_resolver_preserves_configured_absolute_and_named_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            model = root / "model.safetensors"
            model.write_text("dummy")
            folders = types.SimpleNamespace(get_folder_paths=lambda kind: [str(root)],
                get_full_path=lambda kind, name: str(model) if name == model.name else None)
            with patch.dict("sys.modules", {"folder_paths": folders}):
                stacks = resolve_stack_paths({"a": [(str(model), 1, 0)], "b": [(model.name, 1, 0)]})
            self.assertEqual(stacks["a"], stacks["b"])

    def test_lora_outside_root_and_finder_escape_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            models = root / "models"
            models.mkdir()
            outside = root / "outside.safetensors"
            outside.write_text("dummy")
            for source in (str(outside), "outside.safetensors"):
                with self.subTest(source=source), self.assertRaisesRegex(ValueError, "outside configured"):
                    resolve_stack_paths({"a": [(source, 1, 0)]}, lambda name: str(outside), allowed_roots=[models])

    def test_existing_relative_cwd_file_does_not_bypass_finder(self):
        with self.assertRaisesRegex(ValueError, "not found"):
            resolve_stack_paths({"a": [("pyproject.toml", 1, 0)]}, lambda name: None, allowed_roots=[Path.cwd()])

    def test_lora_symlink_escape_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            models = root / "models"
            models.mkdir()
            outside = root / "outside.safetensors"
            outside.write_text("dummy")
            link = models / "alias.safetensors"
            self._symlink(link, outside)
            with self.assertRaisesRegex(ValueError, "resolves outside"):
                resolve_stack_paths({"a": [(str(link), 1, 0)]}, lambda name: str(link), allowed_roots=[models])

    def test_configured_symlink_model_root_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            external = root / "external"
            external.mkdir()
            model = external / "model.safetensors"
            model.write_text("dummy")
            link = root / "configured"
            self._symlink(link, external, True)
            result = resolve_stack_paths({"a": [(str(link / model.name), 1, 0)]}, lambda name: None, allowed_roots=[link])
            self.assertEqual(result["a"][0][0], str(model.resolve()))


if __name__ == "__main__":
    unittest.main()

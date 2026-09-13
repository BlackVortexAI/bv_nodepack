"""The publish job's archive comparison: raw bytes decide, line endings are only diagnosed."""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / ".github" / "scripts" / "registry_manifest.py"
spec = importlib.util.spec_from_file_location("registry_manifest_under_test", SCRIPT)
manifest_module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(manifest_module)


def manifest_for(files: dict[str, bytes]) -> dict:
    return {"commit": "deadbeef", "files": [
        {"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
         "sha256_normalised": manifest_module.normalised_digest(data)}
        for name, data in files.items()]}


def archive_of(members: list[tuple[str, bytes]]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as zipped:
        for name, data in members:
            zipped.writestr(name, data)
    return buffer.getvalue()


class ArchiveComparisonTests(unittest.TestCase):
    def compare(self, files, members):
        with tempfile.TemporaryDirectory() as directory:
            report_path = Path(directory) / "report.json"
            code = manifest_module.compare_archive_bytes(archive_of(members), manifest_for(files), {}, report_path)
            return code, json.loads(report_path.read_text(encoding="utf-8"))

    def test_identical_archive_passes(self):
        files = {"__init__.py": b"print(1)\n", "docs/a.png": b"\x89PNG\r\n\x1a\n\x00\x01"}
        code, report = self.compare(files, list(files.items()))
        self.assertEqual(code, 0)
        self.assertTrue(report["result"].startswith("uploaded archive is byte-identical"))
        self.assertEqual(report["content_differs"], [])

    def test_binary_file_with_changed_bytes_fails_even_if_only_crlf_differs(self):
        files = {"docs/a.png": b"\x89PNG\r\n\x1a\n\x00\x01"}
        code, report = self.compare(files, [("docs/a.png", b"\x89PNG\n\x1a\n\x00\x01")])
        self.assertEqual(code, 1)
        self.assertEqual(report["content_differs"], ["docs/a.png"])
        self.assertEqual(report["differs_only_in_line_endings"], [])

    def test_text_file_with_crlf_is_still_a_mismatch_but_diagnosed(self):
        files = {"__init__.py": b"a\nb\n"}
        code, report = self.compare(files, [("__init__.py", b"a\r\nb\r\n")])
        self.assertEqual(code, 1)
        self.assertEqual(report["content_differs"], ["__init__.py"])
        self.assertEqual(report["differs_only_in_line_endings"], ["__init__.py"])

    def test_duplicate_members_and_extra_or_missing_files_fail(self):
        files = {"__init__.py": b"x", "README.md": b"y"}
        code, report = self.compare(files, [("__init__.py", b"x"), ("__init__.py", b"z"), ("extra.py", b"e")])
        self.assertEqual(code, 1)
        self.assertEqual(report["duplicate_members"], ["__init__.py"])
        self.assertEqual(report["only_in_archive"], ["extra.py"])
        self.assertEqual(report["only_in_manifest"], ["README.md"])


class InputManifestTests(unittest.TestCase):
    def test_forbidden_paths_are_detected(self):
        names = ["tests/x.py", "ui/src/a.ts", ".github/workflows/p.yml", "secret.pem", "remote_llm_secrets.json",
                 "py/ok.py", "js/model.d.ts"]
        flagged = [n for n in names if n.startswith(manifest_module.FORBIDDEN_PREFIXES)
                   or n.endswith(manifest_module.FORBIDDEN_SUFFIXES) or Path(n).name in manifest_module.FORBIDDEN_NAMES]
        self.assertEqual(flagged, ["tests/x.py", "ui/src/a.ts", ".github/workflows/p.yml", "secret.pem",
                                   "remote_llm_secrets.json", "js/model.d.ts"])


if __name__ == "__main__":
    unittest.main()

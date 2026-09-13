"""The file set ``comfy node publish`` packs (git-tracked minus ``.comfyignore``).

Guards the release artifact's shape: development trees and build inputs stay out,
runtime files and the notices stay in. This reads the working tree through
``git ls-files``; it says nothing about an archive that was actually uploaded.
"""
from __future__ import annotations

import unittest
from pathlib import Path

from test_registry_scan_oracle import ROOT, packaged_files

REQUIRED = {
    "__init__.py",
    "pyproject.toml",
    "README.md",
    "SECURITY.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "node_list.json",
    "js/bv_nodepack.core.js",
    "py/util/lut_catalog.json",
    "data/completion/README.md",
    "docs/assets/registry/bv-nodepack-banner.png",
}
EXCLUDED_PREFIXES = ("tests/", "ui/", ".github/", ".tmp/", "user/", "docs/design/", "docs/assets/brand/",
                     "docs/assets/publishing/")
EXCLUDED_FILES = {".comfyignore", ".gitignore", "js/bv_smart_pipe_merge_model.d.ts",
                  "docs/assets/bv-nodepack-hero.svg", "docs/assets/registry/bv-nodepack-banner.svg",
                  "docs/assets/registry/bv-nodepack-icon.svg"}
EXCLUDED_SUFFIXES = (".d.ts", ".ts", ".tsx", ".mjs", ".pem", ".key", ".env")


class RegistryPackageSetTests(unittest.TestCase):
    def setUp(self):
        files = packaged_files(ROOT)
        self.assertIsNotNone(files, "packaged file set unavailable (git missing or unsupported .comfyignore pattern)")
        self.files = set(files)

    def test_runtime_files_and_notices_are_packaged(self):
        missing = sorted(REQUIRED - self.files)
        self.assertEqual(missing, [], f"required files missing from the package: {missing}")

    def test_development_trees_and_build_inputs_are_excluded(self):
        leaked = sorted(name for name in self.files
                        if name.startswith(EXCLUDED_PREFIXES) or name in EXCLUDED_FILES
                        or name.endswith(EXCLUDED_SUFFIXES))
        self.assertEqual(leaked, [], f"development or build-only files would be packaged: {leaked}")

    def test_readme_relative_images_stay_in_the_package(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        referenced = {token for token in readme.split("(") if token.startswith("docs/assets")}
        referenced = {token.split(")")[0].strip() for token in referenced}
        missing = sorted(referenced - self.files)
        self.assertEqual(missing, [], f"README references images that the package would not contain: {missing}")

    def test_every_packaged_file_exists_on_disk(self):
        absent = sorted(name for name in self.files if not (ROOT / name).is_file())
        self.assertEqual(absent, [], f"tracked but missing on disk: {absent}")


if __name__ == "__main__":
    unittest.main()

import asyncio
import builtins
import importlib.util
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import hashlib

from py.util.lut_catalog import install_catalog_lut, load_lut_catalog
from py.util.lut_catalog import catalog_with_install_state


IDENTITY = b"""TITLE \"Identity\"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n0 0 1\n0 1 0\n0 1 1\n1 0 0\n1 0 1\n1 1 0\n1 1 1\n"""


class LutCatalogTests(unittest.TestCase):
    def test_catalog_module_import_does_not_require_aiohttp(self):
        original_import = builtins.__import__

        def import_without_aiohttp(name, *args, **kwargs):
            if name == "aiohttp":
                raise ModuleNotFoundError("No module named 'aiohttp'")
            return original_import(name, *args, **kwargs)

        module_name = "py.util._lut_catalog_without_aiohttp"
        module_path = Path(__file__).parents[1] / "py" / "util" / "lut_catalog.py"
        spec = importlib.util.spec_from_file_location(module_name, module_path)
        module = importlib.util.module_from_spec(spec)
        self.addCleanup(sys.modules.pop, module_name, None)
        sys.modules[module_name] = module
        with patch("builtins.__import__", side_effect=import_without_aiohttp):
            spec.loader.exec_module(module)
        self.assertEqual(module.load_lut_catalog()["version"], 1)

    def test_catalog_is_versioned_and_uses_curated_https_cube_entries(self):
        catalog = load_lut_catalog()
        self.assertEqual(catalog["version"], 1)
        self.assertGreaterEqual(len(catalog["entries"]), 1)
        self.assertTrue(all(item["download_url"].startswith("https://") for item in catalog["entries"]))
        self.assertTrue(all(item["filename"].endswith(".cube") for item in catalog["entries"]))
        self.assertTrue(all(len(item["sha256"]) == 64 for item in catalog["entries"]))

    @staticmethod
    def _catalog_for(payload):
        catalog = deepcopy(load_lut_catalog())
        catalog["entries"][0]["sha256"] = hashlib.sha256(payload).hexdigest()
        return catalog

    def test_installer_validates_and_writes_under_models_luts_downloaded(self):
        async def fetch(_url):
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={"luts": object()})
            fake.cache_helper = SimpleNamespace(clear=lambda: None)
            with patch("py.util.lut_catalog.load_lut_catalog", return_value=self._catalog_for(IDENTITY)):
                result = asyncio.run(install_catalog_lut("lumix-fieldnote", fetch=fetch, folder_paths_module=fake))
            target = Path(root) / "luts" / "downloaded" / "Fieldnote.cube"
            self.assertTrue(target.is_file())
            self.assertEqual(result["cube_size"], 2)
            self.assertNotIn("luts", fake.filename_list_cache)

    def test_installer_refuses_overwrite(self):
        async def fetch(_url):
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={})
            fake.cache_helper = SimpleNamespace(clear=lambda: None)
            with patch("py.util.lut_catalog.load_lut_catalog", return_value=self._catalog_for(IDENTITY)):
                asyncio.run(install_catalog_lut("lumix-fieldnote", fetch=fetch, folder_paths_module=fake))
                with self.assertRaises(FileExistsError):
                    asyncio.run(install_catalog_lut("lumix-fieldnote", fetch=fetch, folder_paths_module=fake))

    def test_installer_rejects_payload_with_wrong_checksum(self):
        async def fetch(_url):
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={})
            with self.assertRaisesRegex(ValueError, "checksum"):
                asyncio.run(install_catalog_lut("lumix-fieldnote", fetch=fetch, folder_paths_module=fake))

    def test_catalog_reports_installed_entries(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "luts" / "downloaded"
            target.mkdir(parents=True)
            (target / "Fieldnote.cube").write_bytes(IDENTITY)
            fake = SimpleNamespace(models_dir=root)
            catalog = catalog_with_install_state(folder_paths_module=fake)
            states = {entry["id"]: entry["installed"] for entry in catalog["entries"]}
            self.assertTrue(states["lumix-fieldnote"])
            self.assertFalse(states["lumix-matinee"])

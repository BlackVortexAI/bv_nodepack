import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from py.util import lut_catalog, remote_llm, user_storage
from py.util.lora_header_cache import default_header_cache_path
from py.util.user_storage import (
    UNAVAILABLE_MESSAGE,
    PrivateStorageUnavailable,
    legacy_root,
    migrate_legacy_storage,
    private_path,
    private_root,
    require_private_root,
)


def fake_folder_paths(root, *, system_user_api=True):
    module = types.ModuleType("folder_paths")
    module.get_user_directory = lambda: str(root)
    if system_user_api:
        def get_system_user_directory(name="system"):
            if name.startswith("_"):
                raise ValueError("System user name should not start with underscore")
            return os.path.join(str(root), f"__{name}")
        module.get_system_user_directory = get_system_user_directory
    return module


class PrivateRootTests(unittest.TestCase):
    def test_root_comes_from_the_system_user_api_only(self):
        with tempfile.TemporaryDirectory() as directory:
            with_api = fake_folder_paths(directory)
            self.assertEqual(private_root(with_api), Path(directory) / "__bv_nodepack")
            self.assertEqual(private_path("a", "b.json", folder_paths_module=with_api), Path(directory) / "__bv_nodepack" / "a" / "b.json")
            self.assertEqual(legacy_root(with_api), Path(directory) / "default" / "bv_nodepack")
            without_api = fake_folder_paths(directory, system_user_api=False)
            self.assertIsNone(private_root(without_api))
            self.assertIsNone(private_path("a", folder_paths_module=without_api))
            with self.assertRaisesRegex(PrivateStorageUnavailable, "private storage is unavailable"):
                require_private_root(without_api)

    def test_root_without_system_prefix_is_rejected(self):
        module = fake_folder_paths("x")
        module.get_system_user_directory = lambda name="system": os.path.join("x", name)
        self.assertIsNone(private_root(module))

    def test_no_comfyui_means_no_storage_and_no_cwd_fallback(self):
        with patch.dict(sys.modules, {"folder_paths": None}):
            self.assertIsNone(private_root())
            self.assertIsNone(legacy_root())
            self.assertIsNone(default_header_cache_path(None))


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.legacy = self.root / "default" / "bv_nodepack"
        self.private = self.root / "__bv_nodepack"
        (self.legacy / "cache" / "remote_llm" / "v1").mkdir(parents=True)
        self.files = {
            "remote_llm_secrets.json": b'{"schema":"bv.remote_llm.secrets","version":2,"api_keys":{"openai":"dummy"},"endpoints":{"openai":"https://api.openai.com/v1/chat/completions"}}\n',
            "remote_llm_settings.json": b'{"schema":"bv.remote_llm.settings","version":1,"default_profile_id":"openai","profile_defaults":{}}\n',
            "lut_catalog.json": b'{"schema":"bv.lut-download-catalog","version":1}\n',
            "lut_catalog_settings.json": b'{"schema":"bv.lut-catalog.settings","version":1,"selected_channel":"stable"}\n',
            "cache/lora_header_checks.json": b'{"version":1,"entries":{}}\n',
        }
        for relative, payload in self.files.items():
            (self.legacy / relative).write_bytes(payload)
        (self.legacy / "cache" / "remote_llm" / "v1" / "abc.json").write_text("{}")

    def test_files_move_verified_and_public_copies_disappear(self):
        report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertEqual(sorted(report["migrated"]), sorted(self.files))
        self.assertEqual(report["failed"], [])
        for relative, payload in self.files.items():
            self.assertEqual((self.private / relative).read_bytes(), payload)
            self.assertFalse((self.legacy / relative).exists())
        self.assertFalse((self.legacy / "cache" / "remote_llm").exists())
        self.assertFalse(self.legacy.exists(), "empty public tree is removed")
        self.assertEqual(migrate_legacy_storage(legacy=self.legacy, private=self.private), {"migrated": [], "removed": [], "recovered": [], "kept": [], "failed": []})

    def test_identical_private_copy_makes_the_public_file_redundant(self):
        self.private.mkdir(parents=True)
        (self.private / "remote_llm_secrets.json").write_bytes(self.files["remote_llm_secrets.json"])
        report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertFalse((self.legacy / "remote_llm_secrets.json").exists())
        self.assertTrue(any(entry.startswith("remote_llm_secrets.json") for entry in report["removed"]))
        self.assertEqual(report["recovered"], [])
        self.assertEqual([p.name for p in self.private.glob("*.recovered")], [])

    def test_differing_private_state_is_kept_and_public_bytes_land_in_a_recovery_file(self):
        self.private.mkdir(parents=True)
        (self.private / "remote_llm_secrets.json").write_bytes(b"private-newer")
        (self.private / "lut_catalog.json").mkdir()  # a directory in the way must not be touched either
        report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertEqual((self.private / "remote_llm_secrets.json").read_bytes(), b"private-newer")
        self.assertTrue((self.private / "lut_catalog.json").is_dir())
        for relative in ("remote_llm_secrets.json", "lut_catalog.json"):
            self.assertFalse((self.legacy / relative).exists(), relative)
            recoveries = list(self.private.glob(f"{relative}.legacy-*{user_storage.RECOVERY_SUFFIX}"))
            self.assertEqual(len(recoveries), 1, relative)
            self.assertEqual(recoveries[0].read_bytes(), self.files[relative])
        self.assertEqual(len(report["recovered"]), 2)
        self.assertIn("remote_llm_settings.json", report["migrated"])
        self.assertEqual(report["failed"], [])

    def test_failed_publish_leaves_no_private_file_and_keeps_the_public_file(self):
        # The write reaches the disk partially (fsync fails after the data was written).
        with patch.object(os, "fsync", side_effect=OSError("device error")):
            report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertEqual(report["migrated"], [])
        self.assertEqual(len(report["failed"]), len(self.files))
        for relative in self.files:
            self.assertTrue((self.legacy / relative).exists(), relative)
        self.assertFalse((self.private / "remote_llm_secrets.json").exists(), "half-written private file was not removed")
        # The retry after the failure succeeds from the same state.
        report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertEqual(sorted(report["migrated"]), sorted(self.files))

    def test_source_removal_failure_after_publish_is_safe_to_retry(self):
        original_unlink = Path.unlink
        public_secrets = self.legacy / "remote_llm_secrets.json"
        state = {"failed": False}

        def unlink_once(path, *args, **kwargs):
            if path == public_secrets and not state["failed"]:
                state["failed"] = True
                raise OSError("locked")
            return original_unlink(path, *args, **kwargs)

        with patch.object(Path, "unlink", unlink_once):
            first = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertTrue(any(entry.startswith("remote_llm_secrets.json") for entry in first["failed"]))
        self.assertEqual((self.private / "remote_llm_secrets.json").read_bytes(), self.files["remote_llm_secrets.json"], "verified private copy stays")
        self.assertTrue((self.legacy / "remote_llm_secrets.json").exists(), "public file stays until the retry")
        second = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertTrue(any(entry.startswith("remote_llm_secrets.json") for entry in second["removed"]), "identical private copy makes the retry a plain removal")
        self.assertFalse((self.legacy / "remote_llm_secrets.json").exists())
        self.assertEqual(list(self.private.glob("*.recovered")), [])

    def test_readback_mismatch_removes_the_created_file(self):
        target = self.private / "remote_llm_secrets.json"
        with patch.object(Path, "read_bytes", return_value=b"tampered"):
            with self.assertRaisesRegex(OSError, "verification failed"):
                user_storage._publish_exclusive(target, b"payload")
        self.assertFalse(target.exists())

    def test_concurrent_publication_never_overwrites_the_other_process(self):
        original = user_storage._publish_exclusive

        def racing_publish(target, payload):
            if target.name == "remote_llm_secrets.json" and not target.exists():
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(b"published-by-other-process")  # lands between our checks and our create
            return original(target, payload)

        with patch.object(user_storage, "_publish_exclusive", racing_publish):
            report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertEqual((self.private / "remote_llm_secrets.json").read_bytes(), b"published-by-other-process")
        self.assertFalse((self.legacy / "remote_llm_secrets.json").exists())
        recoveries = list(self.private.glob(f"remote_llm_secrets.json.legacy-*{user_storage.RECOVERY_SUFFIX}"))
        self.assertEqual([r.read_bytes() for r in recoveries], [self.files["remote_llm_secrets.json"]])
        self.assertEqual(len(report["recovered"]), 1)

    def test_symbolic_link_in_public_tree_is_left_alone(self):
        target = self.root / "outside.json"
        target.write_text("{}")
        link = self.legacy / "remote_llm_settings.json"
        link.unlink()
        try:
            link.symlink_to(target)
        except OSError as error:
            self.skipTest(f"Symlink privilege unavailable: {error}")
        report = migrate_legacy_storage(legacy=self.legacy, private=self.private)
        self.assertTrue(link.is_symlink())
        self.assertTrue(target.exists())
        self.assertTrue(any(entry.startswith("remote_llm_settings.json") for entry in report["kept"]))
        self.assertFalse((self.private / "remote_llm_settings.json").exists())

    def test_startup_hook_never_raises(self):
        with patch.object(user_storage, "migrate_legacy_storage", side_effect=RuntimeError("boom")):
            report = user_storage.run_startup_migration()
        self.assertEqual(report["failed"], ["boom"])


class FailClosedTests(unittest.TestCase):
    """Without private storage nothing falls back to user/default."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.public = root / "default" / "bv_nodepack"
        self.public.mkdir(parents=True)
        (self.public / "remote_llm_secrets.json").write_text(json.dumps({
            "schema": "bv.remote_llm.secrets", "version": 2,
            "api_keys": {"openai-compatible": "leaked-dummy"},
            "endpoints": {"openai-compatible": "https://compatible.invalid/v1/chat/completions"},
        }))
        (self.public / "remote_llm_settings.json").write_text(json.dumps({
            "schema": "bv.remote_llm.settings", "version": 1, "default_profile_id": "venice", "profile_defaults": {},
        }))
        self.module = fake_folder_paths(root, system_user_api=False)
        patcher = patch.dict(sys.modules, {"folder_paths": self.module})
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_public_secrets_and_settings_are_never_read(self):
        self.assertEqual(remote_llm.remote_api_key_status(), {})
        self.assertIsNone(remote_llm.remote_api_key_endpoint("openai-compatible"))
        defaults = remote_llm.load_user_defaults(remote_llm.load_provider_catalog(), create_if_missing=True)
        self.assertEqual(defaults.profile_id, "openai-compatible", "catalog default, not the public settings file")
        self.assertFalse((self.public / "cache").exists())

    def test_writes_and_bearer_custom_profile_are_refused(self):
        with self.assertRaisesRegex(ValueError, "private storage is unavailable"):
            remote_llm.set_remote_api_key("openai", "dummy")
        with self.assertRaisesRegex(ValueError, "private storage is unavailable"):
            remote_llm.delete_remote_api_key("openai")
        with self.assertRaisesRegex(ValueError, "private storage is unavailable"):
            remote_llm.build_remote_provider("OpenAI Compatible", "model", "none", 60)
        self.assertEqual(sorted(self.public.iterdir()), sorted([self.public / "remote_llm_secrets.json", self.public / "remote_llm_settings.json"]))

    def test_fixed_and_local_profiles_keep_working_without_cache(self):
        provider = remote_llm.build_remote_provider("Venice", "model", "none", 60, api_key_resolver=lambda: "dummy")
        self.assertEqual(provider.endpoint, "https://api.venice.ai/api/v1/chat/completions")
        self.assertIsNone(provider._cache_directory)
        local = remote_llm.build_remote_provider("Local OpenAI Compatible (Custom)", "model", "none", 60)
        self.assertEqual(local.endpoint, "http://127.0.0.1:1234/v1/chat/completions")

    def test_lut_service_serves_bundled_catalog_read_only(self):
        service = lut_catalog.LutCatalogService()
        self.assertIsNone(service.working_paths)
        self.assertIsNone(service.settings_path)
        self.assertEqual(service.selected_channel(), "stable")
        self.assertEqual(service.catalog("stable")["channel"], "stable")
        self.assertFalse(service.status()["private_storage"])
        self.assertFalse(service.request_startup_refresh()["accepted"])
        with self.assertRaisesRegex(lut_catalog.LutCatalogError, "private storage is unavailable"):
            service.request_refresh("stable")
        with self.assertRaisesRegex(lut_catalog.LutCatalogError, "private storage is unavailable"):
            service.set_selected_channel("experimental")
        self.assertEqual(sorted(self.public.iterdir()), sorted([self.public / "remote_llm_secrets.json", self.public / "remote_llm_settings.json"]))

    def test_private_storage_is_used_when_available(self):
        module = fake_folder_paths(Path(self.temp.name))
        with patch.dict(sys.modules, {"folder_paths": module}):
            secrets = remote_llm.default_user_secrets_path()
            self.assertEqual(secrets, Path(self.temp.name) / "__bv_nodepack" / "remote_llm_secrets.json")
            remote_llm.set_remote_api_key("openai", "dummy")
            self.assertTrue(secrets.exists())
            self.assertEqual(remote_llm.remote_api_key_status(), {"openai": True})
            self.assertEqual(default_header_cache_path(module), Path(self.temp.name) / "__bv_nodepack" / "cache" / "lora_header_checks.json")
            service = lut_catalog.LutCatalogService()
            self.assertTrue(service.has_private_storage())
        self.assertEqual((self.public / "remote_llm_secrets.json").read_text()[:10], '{"schema":', "public file untouched by writes")


if __name__ == "__main__":
    unittest.main()

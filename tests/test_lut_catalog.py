import asyncio
import builtins
import importlib.util
import json
import sys
import tempfile
import threading
import time
import unittest
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
import hashlib

from py.util.lut_catalog import (
    CATALOG_PATH,
    EXPERIMENTAL_CATALOG_PATH,
    MAX_CATALOG_BYTES,
    REMOTE_CATALOG_URLS,
    LutCatalogConflictError,
    LutCatalogError,
    LutCatalogService,
    _catalog_from_bytes,
    catalog_with_install_state,
    install_catalog_lut,
    load_lut_catalog,
)


IDENTITY = b"""TITLE \"Identity\"\nLUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n0 0 0\n0 0 1\n0 1 0\n0 1 1\n1 0 0\n1 0 1\n1 1 0\n1 1 1\n"""


class LutCatalogTests(unittest.TestCase):
    @staticmethod
    def _document(channel="stable", catalog_version=1, entries=None):
        source = deepcopy(load_lut_catalog(CATALOG_PATH, channel="stable"))
        source["channel"] = channel
        source["catalog_version"] = catalog_version
        source["entries"] = deepcopy(source["entries"] if entries is None else entries)
        return source

    @staticmethod
    def _write(path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value), encoding="utf-8")

    def _service(self, root, *, fetch=lambda _url, _limit: b"{}", selected=None):
        root = Path(root)
        bundled = {channel: root / "bundled" / f"{channel}.json" for channel in ("stable", "experimental")}
        working = {channel: root / "working" / f"{channel}.json" for channel in ("stable", "experimental")}
        settings = root / "working" / "settings.json"
        self._write(bundled["stable"], self._document("stable"))
        self._write(bundled["experimental"], self._document("experimental", entries=[]))
        if selected is not None:
            self._write(settings, {"schema": "bv.lut-catalog.settings", "version": 1, "selected_channel": selected})
        service = LutCatalogService(
            bundled_paths=bundled,
            working_paths=working,
            settings_path=settings,
            remote_urls={"stable": "https://example.test/stable.json", "experimental": "https://example.test/experimental.json"},
            fetch=fetch,
        )
        return service, bundled, working, settings

    @staticmethod
    def _wait(service):
        deadline = time.monotonic() + 2
        while service.status()["worker_running"] and time.monotonic() < deadline:
            time.sleep(.01)
        if service.status()["worker_running"]:
            raise AssertionError("catalog worker did not finish")

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
        catalog = load_lut_catalog(CATALOG_PATH, channel="stable")
        self.assertEqual(catalog["version"], 1)
        self.assertEqual(catalog["catalog_version"], 1)
        self.assertEqual(catalog["channel"], "stable")
        self.assertGreaterEqual(len(catalog["entries"]), 1)
        self.assertTrue(all(item["download_url"].startswith("https://") for item in catalog["entries"]))
        self.assertTrue(all(item["filename"].endswith(".cube") for item in catalog["entries"]))
        self.assertTrue(all(len(item["sha256"]) == 64 for item in catalog["entries"]))
        experimental = load_lut_catalog(EXPERIMENTAL_CATALOG_PATH, channel="experimental")
        self.assertEqual(experimental["channel"], "experimental")
        self.assertEqual(experimental["catalog_version"], 3)
        expected_experimental = {
            "lumix-canopy": ("85b3dc4b29906a0dc5325fc0403a9b885523b92eaa1448157fbffc64663c665e", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "lumix-heartland": ("ee2b14225ca4aad092c4d64a4ed7a0824cc76f3357041d381994948815fd3c4a", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "lumix-lowsun": ("310626bb7c23f343b56006a7eca349173035bc8349aecb8acb640c45ad98c0ff", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "lumix-meridian": ("1cf9525a9e4e4b3bbcd96018ad5bae63041a33d4f45969d70f029fa614b9be37", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "lumix-postcard": ("a3236e384c89fbc6ea8bf52c3f3570cb52316d8756a7b09bff2f0f282452c750", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "lumix-skylight": ("b734146c8a96179c80e7065a40cf3656e10dd2b776a4033df70c7eca16d58d32", "5694792f25598ec626e3e7527e2352f203a33317", "MIT"),
            "cameraluts-sony-a7iii-cine4-progamut-to-rec709-filmic": ("30225e978d7aeb36e893f448ee436a6840ad82eae7ede480d672b6fa2ccc217f", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-cine4-progamut-to-rec709-standard": ("eae3493b7ae3c8ae4b55941dfa5503aeec2f4f8f38b17c8fea7c02f289dfb06e", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-hlg3-bt2020-to-rec709-filmic": ("3607de7761f4800e6e7164bb072a95a479aab016f964547b2413973ac1b56901", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-hlg3-bt2020-to-rec709-standard": ("654af107035a739c280b159fc2f2ace0d1110eeb4f43fbb85ba4f49a361a6fe1", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog2-sgamut-to-rec709-filmic": ("f50ac8a115401c0730b06a5822bba4f094b098d53dc54309daf9ab47723f1194", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog2-sgamut-to-rec709-standard": ("6fd465c08bab785f5f3dbeeef7ac8729255999d3dccb71699ddadc8d9f7b517a", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog2-sgamut3cine-to-rec709-filmic": ("47b15ee999c30d07caba868922fe3da2d09106dbac6826ed4d2f010802c470dc", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog2-sgamut3cine-to-rec709-standard": ("ba90f7c4309fdf33b422e95e41586dabc029262b312a1e52b409680696dc3a38", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog3-sgamut3cine-to-rec709-filmic": ("7a0f36b52a90991fa3217f31643ccbc5529f0cf40caefa12c6150d08278022f2", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iii-slog3-sgamut3cine-to-rec709-standard": ("8a1750e54d5361cdebbc11c3644e948c800c52e8743a4e86c55d0072c864c696", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-cine4-progamut-to-rec709-filmic": ("f23e229952b3ae92c7bb415eefb2354dbb6822ea1c65a7935490295f41a53b59", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-cine4-progamut-to-rec709-standard": ("00570d64f3d553d22dbb40738a5d15122661b6eb36b5725aea9e161b7499c748", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-hlg3-bt2020-to-rec709-filmic": ("914a766b5bd8ee8f776aeea47621676bde3501750d53c67426fbfa45d6de1d86", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-hlg3-bt2020-to-rec709-standard": ("b8b6969371a28730ff03807e2909ae5f5aac5ff70bf8c71d4f7d10d9ffd75432", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-slog3-sgamut3-to-rec709-filmic": ("f4d669c8c033aca51f27f0f17760058d0bb722149d69cfc38dc847d27f5b7f44", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-slog3-sgamut3-to-rec709-standard": ("c4f245c8b8c33ea3fa50b44ba24118b14b16183d7379ab1646f9248334aa37c1", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-slog3-sgamut3cine-to-rec709-filmic": ("56c985c5b79a0bc4f2196f6021cca702839f58e57def33a820154022f4e90f43", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-a7iv-slog3-sgamut3cine-to-rec709-standard": ("8e1c42b0d7e2ce5d1b4dc2c61da041fd8be1143b0a485f3d6b34aaafdbe65fc5", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-fx-a7v-hlg3-bt2020-standard": ("713e216ebbd1d055df7e322308ced3444394d02be796e34aadc525181cdb83ab", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-fx-a7v-slog3-sgamut3cine-709-800": ("c22fc7c4360a763acfd52800ef54e21660617748730c91c2c4adf1cd609e89c3", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-fx-a7v-slog3-sgamut3cine-lc709typea": ("de6dc05799376dabf474b425936100e52867a1c8902ce82b29c6ca5aebed6b69", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-fx-a7v-slog3-sgamut3cine-s709": ("b61ca62eb08c74523f33dbfef7086026105e64e7570f820099fa658a0d81a7f6", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "cameraluts-sony-fx-a7v-slog3-sgamut3cine-standard": ("e0ffcda89b39d11e94ae0ee7c25bacb1acc7d0f2c1bdea55cb684f3d561bb591", "8c2f3d93573570b8ba7537e506492ab77a11248b", "MIT"),
            "dji-d-cinelike-0-3-base": ("267cd7e85f98bef7960b9cb0dd8e0b45dbbcae7b6b939f04da901a5a2894fb73", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-d-cinelike-0-3-v2-scene": ("86d6f2847ff373f436662aa069cf3767f6a8c8ea792f9b945f1907e9543ff423", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-d-cinelike-0-3-v2": ("1f058b24351696ad3df4f4eff575c666f3a26a74d5a9ec3703edbc8bc199a91f", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-base-skin": ("51681df7d490b1d83d262329161b61c0f2cd924018f709e1967832ef4ffd216d", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-base": ("b508983b80790a08736a9cc5d0ed798c70df875b32ffc3ca522463dd59728b72", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-scene-01": ("bc6caeb1aa6e760161575abba74793b3fd225d58ed98fef1eaac01898759eac5", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-scene-02": ("deb28418ccf1cd118d2df94b2737740d498ec135c07d9e725b1ec7fb8faf8690", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-skin-v2": ("96df72c68a5dea854285240a4b943ad664ab2eb8452552468f727d1c58446449", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "dji-normal-1-0-skin": ("bdd9ccc03910ec44e3f1ea4578b598ea68e11fa98046b2c4fcd5b332bfc45f8a", "1e210c0ee822fb85ca2e4c570d27be2f60539e13", "CC0-1.0"),
            "ffmpega-bleach-bypass": ("56bebf4a4f581337b696b25879c7df18f5d2a57f4c3b497c7cb2fee1aa0107f5", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-cinematic-teal-orange": ("d6b5ab18e1b03a6f256ff523a0938b1d5f5fa527d7b110432d9433c40bc65afe", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-cool-scifi": ("4e7dc65ee0cb719ffe8e556943981299e8f00e703b13523b9528b260bb0032b9", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-cross-process": ("f4955ad236da62ad16785382e048e08902938d5f92907e33fa8c3edbfe71dd72", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-film-noir": ("7b941df5128de7d9cef9c3b8bbd17be1fcd957e54b68bdd905c22066014b0f16", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-golden-hour": ("40258a9b830bf130ff129a6f77a877968d1952e8c741aac733fa8c8ab12975f0", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-neutral-clean": ("165a5f3d1b8e3ab1f11d4cefeb265ba6f837caa45fd04bf45367edd0ff20322c", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
            "ffmpega-warm-vintage": ("5240713085d7a47aebb9b865c84a76af7ee49778512d0970112d4fdb958c3d12", "0cfe2db05df104f95c98cc45e11f129fa5ef5193", "GPL-3.0"),
        }
        actual = {item["id"]: (item["sha256"], item["source_commit"], item["license_label"]) for item in experimental["entries"]}
        self.assertEqual(actual, expected_experimental)
        self.assertEqual(len({item["filename"] for item in experimental["entries"]}), len(expected_experimental))
        self.assertTrue(all(f'/{item["source_commit"]}/' in item["download_url"] for item in experimental["entries"]))
        self.assertTrue(all(f'/{item["source_commit"]}/' in item["license_url"] for item in experimental["entries"]))
        self.assertTrue(all(item["input_profile"] and item["license_note"] for item in experimental["entries"]))
        self.assertTrue(set(expected_experimental).isdisjoint(item["id"] for item in catalog["entries"]))
        self.assertEqual(REMOTE_CATALOG_URLS, {
            "stable": "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/py/util/lut_catalog.json",
            "experimental": "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/py/util/lut_catalog.experimental.json",
        })

    @staticmethod
    def _catalog_for(payload):
        catalog = deepcopy(load_lut_catalog(CATALOG_PATH, channel="stable"))
        catalog["entries"][0]["sha256"] = hashlib.sha256(payload).hexdigest()
        return catalog

    def _install_service(self, root, payload=IDENTITY, *, catalog_version=1, selected="stable"):
        service, bundled, _working, _settings = self._service(root, selected=selected)
        catalog = self._catalog_for(payload)
        catalog["catalog_version"] = catalog_version
        self._write(bundled["stable"], catalog)
        service._snapshots.clear()
        return service

    def test_installer_validates_and_writes_under_models_luts_downloaded(self):
        async def fetch(_url):
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={"luts": object()})
            fake.cache_helper = SimpleNamespace(clear=lambda: None)
            service = self._install_service(root)
            result = asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, folder_paths_module=fake, catalog_service=service))
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
            service = self._install_service(root)
            asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, folder_paths_module=fake, catalog_service=service))
            with self.assertRaises(FileExistsError):
                asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, folder_paths_module=fake, catalog_service=service))

    def test_installer_rejects_payload_with_wrong_checksum(self):
        async def fetch(_url):
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={})
            service = self._install_service(root, payload=b"different")
            with self.assertRaisesRegex(ValueError, "checksum"):
                asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, folder_paths_module=fake, catalog_service=service))

    def test_catalog_reports_installed_entries(self):
        with tempfile.TemporaryDirectory() as root:
            target = Path(root) / "luts" / "downloaded"
            target.mkdir(parents=True)
            (target / "Fieldnote.cube").write_bytes(IDENTITY)
            fake = SimpleNamespace(models_dir=root)
            service, *_ = self._service(root, selected="stable")
            with patch("py.util.lut_catalog.CATALOG_SERVICE", service):
                catalog = catalog_with_install_state(folder_paths_module=fake)
            states = {entry["id"]: entry["installed"] for entry in catalog["entries"]}
            self.assertTrue(states["lumix-fieldnote"])
            self.assertFalse(states["lumix-matinee"])

    def test_local_resolution_materializes_bundled_and_keeps_equal_or_newer_working(self):
        with tempfile.TemporaryDirectory() as root:
            service, bundled, working, _settings = self._service(root)
            selected = service.resolve_local("stable", materialize=True)
            self.assertEqual(selected["catalog_version"], 1)
            self.assertEqual(json.loads(working["stable"].read_text())["channel"], "stable")

            self._write(working["stable"], self._document("stable", 2, []))
            service._snapshots.clear()
            self.assertEqual(service.resolve_local("stable", materialize=True)["catalog_version"], 2)
            self._write(bundled["stable"], self._document("stable", 3, []))
            service._snapshots.clear()
            self.assertEqual(service.resolve_local("stable", materialize=True)["catalog_version"], 3)
            self.assertEqual(json.loads(working["stable"].read_text())["catalog_version"], 3)

    def test_invalid_working_is_repaired_but_valid_working_survives_invalid_bundled(self):
        with tempfile.TemporaryDirectory() as root:
            service, bundled, working, _settings = self._service(root)
            self._write(working["stable"], {"broken": True})
            self.assertEqual(service.resolve_local("stable", materialize=True)["catalog_version"], 1)
            self._write(working["stable"], self._document("stable", 4, []))
            bundled["stable"].write_text("not json", encoding="utf-8")
            service._snapshots.clear()
            self.assertEqual(service.resolve_local("stable", materialize=True)["catalog_version"], 4)
            working["stable"].write_text("also broken", encoding="utf-8")
            with self.assertRaisesRegex(LutCatalogError, "no valid local"):
                service.resolve_local("stable", materialize=True)

    def test_settings_default_repair_and_experimental_round_trip(self):
        with tempfile.TemporaryDirectory() as root:
            service, _bundled, _working, settings = self._service(root)
            self.assertEqual(service.selected_channel(), "stable")
            self.assertEqual(json.loads(settings.read_text())["selected_channel"], "stable")
            service.fetch = lambda _url, _limit: json.dumps(self._document("experimental", 1, [])).encode()
            result = service.set_selected_channel("experimental")
            self.assertEqual(result["selected_channel"], "experimental")
            self._wait(service)
            reloaded, *_ = self._service(root)
            self.assertEqual(reloaded.selected_channel(), "experimental")

            settings.write_text('{"selected_channel":"unknown"}', encoding="utf-8")
            repaired, *_ = self._service(root)
            self.assertEqual(repaired.selected_channel(), "stable")
            self.assertEqual(json.loads(settings.read_text())["selected_channel"], "stable")

    def test_remote_newer_updates_only_its_channel_and_older_is_ignored(self):
        with tempfile.TemporaryDirectory() as root:
            payloads = {
                "stable": json.dumps(self._document("stable", 2, [])).encode(),
                "experimental": json.dumps(self._document("experimental", 3, [])).encode(),
            }
            fetch = lambda url, _limit: payloads["experimental" if "experimental" in url else "stable"]
            service, _bundled, working, _settings = self._service(root, fetch=fetch)
            service.request_refresh("experimental")
            self._wait(service)
            self.assertFalse(working["stable"].exists())
            self.assertEqual(service.catalog("experimental")["catalog_version"], 3)
            payloads["experimental"] = json.dumps(self._document("experimental", 2, [])).encode()
            service.request_refresh("experimental")
            self._wait(service)
            self.assertEqual(service.catalog("experimental")["catalog_version"], 3)
            self.assertEqual(service.status()["channels"]["experimental"]["phase"], "up_to_date")

    def test_invalid_offline_and_oversized_remote_preserve_last_valid_catalog(self):
        for payload in (b"not json", b"x" * (MAX_CATALOG_BYTES + 1)):
            with self.subTest(size=len(payload)), tempfile.TemporaryDirectory() as root:
                service, *_ = self._service(root, fetch=lambda _url, _limit, value=payload: value)
                service.request_refresh("stable")
                self._wait(service)
                self.assertEqual(service.catalog("stable")["catalog_version"], 1)
                self.assertEqual(service.status()["channels"]["stable"]["phase"], "failed")
        with tempfile.TemporaryDirectory() as root:
            service, *_ = self._service(root, fetch=lambda _url, _limit: (_ for _ in ()).throw(TimeoutError()))
            service.request_refresh("stable")
            self._wait(service)
            self.assertEqual(service.catalog("stable")["catalog_version"], 1)

    def test_startup_and_manual_refresh_are_daemonized_non_blocking_and_coalesced(self):
        started = threading.Event()
        release = threading.Event()
        calls = []

        def fetch(url, _limit):
            calls.append(url)
            started.set()
            release.wait(2)
            return json.dumps(self._document("experimental", 1, [])).encode()

        with tempfile.TemporaryDirectory() as root:
            service, *_ = self._service(root, fetch=fetch, selected="experimental")
            before = time.monotonic()
            first = service.request_startup_refresh()
            self.assertLess(time.monotonic() - before, .2)
            self.assertTrue(started.wait(1))
            self.assertTrue(service._worker.daemon)
            second = service.request_startup_refresh()
            manual = service.request_refresh("experimental")
            self.assertTrue(second["coalesced"])
            self.assertTrue(manual["coalesced"])
            release.set()
            self._wait(service)
            self.assertEqual(len(calls), 1)
            self.assertEqual(first["channel"], "experimental")

    def test_channel_switch_queues_behind_running_refresh_without_cross_channel_publish(self):
        stable_started = threading.Event()
        release = threading.Event()

        def fetch(url, _limit):
            channel = "experimental" if "experimental" in url else "stable"
            if channel == "stable":
                stable_started.set()
                release.wait(2)
            return json.dumps(self._document(channel, 2, [])).encode()

        with tempfile.TemporaryDirectory() as root:
            service, *_ = self._service(root, fetch=fetch)
            service.request_refresh("stable")
            self.assertTrue(stable_started.wait(1))
            service.set_selected_channel("experimental")
            self.assertEqual(service.selected_channel(), "experimental")
            release.set()
            self._wait(service)
            self.assertEqual(service.catalog("stable")["catalog_version"], 2)
            self.assertEqual(service.catalog("experimental")["catalog_version"], 2)
            self.assertEqual(service.selected_channel(), "experimental")

    def test_catalog_snapshots_are_defensive_and_install_rejects_stale_version_before_fetch(self):
        with tempfile.TemporaryDirectory() as root:
            service, *_ = self._service(root)
            first = service.catalog("stable")
            first["entries"].clear()
            self.assertTrue(service.catalog("stable")["entries"])

        called = False

        async def fetch(_url):
            nonlocal called
            called = True
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            service = self._install_service(root, catalog_version=2)
            with self.assertRaises(LutCatalogConflictError):
                asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, catalog_service=service))
        self.assertFalse(called)

    def test_install_rejects_channel_changed_by_another_client_before_fetch(self):
        called = False

        async def fetch(_url):
            nonlocal called
            called = True
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            service = self._install_service(root, selected="experimental")
            with self.assertRaisesRegex(LutCatalogConflictError, "channel changed"):
                asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch, catalog_service=service))
        self.assertFalse(called)

    def test_install_rechecks_catalog_after_download_before_publish(self):
        lut_started = threading.Event()
        release_lut = threading.Event()
        outcome = []

        async def fetch_lut(_url):
            lut_started.set()
            release_lut.wait(2)
            return IDENTITY

        with tempfile.TemporaryDirectory() as root:
            fake = SimpleNamespace(models_dir=root, filename_list_cache={})
            fake.cache_helper = SimpleNamespace(clear=lambda: None)
            service = self._install_service(root)
            remote = self._catalog_for(IDENTITY)
            remote["catalog_version"] = 2
            remote["entries"] = []
            service.fetch = lambda _url, _limit: json.dumps(remote).encode()

            def run_install():
                try:
                    outcome.append(asyncio.run(install_catalog_lut("lumix-fieldnote", channel="stable", catalog_version=1, fetch=fetch_lut, folder_paths_module=fake, catalog_service=service)))
                except Exception as error:
                    outcome.append(error)

            installer = threading.Thread(target=run_install)
            installer.start()
            self.assertTrue(lut_started.wait(1))
            service.request_refresh("stable")
            self._wait(service)
            release_lut.set()
            installer.join(2)
            self.assertFalse(installer.is_alive())
            self.assertEqual(len(outcome), 1)
            self.assertIsInstance(outcome[0], LutCatalogConflictError)
            self.assertFalse((Path(root) / "luts" / "downloaded" / "Fieldnote.cube").exists())
            self.assertEqual(list((Path(root) / "luts" / "downloaded").glob(".bv-lut-*.cube")), [])

    def test_atomic_replace_failure_preserves_working_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as root:
            service, bundled, working, _settings = self._service(root)
            self._write(working["stable"], self._document("stable", 1, []))
            self._write(bundled["stable"], self._document("stable", 2, []))
            with patch("py.util.lut_catalog.os.replace", side_effect=OSError("blocked")):
                self.assertEqual(service.resolve_local("stable", materialize=True)["catalog_version"], 2)
            self.assertEqual(json.loads(working["stable"].read_text())["catalog_version"], 1)
            self.assertEqual(list(working["stable"].parent.glob("*.tmp")), [])

    def test_remote_replace_failure_preserves_snapshot_and_cleans_temporary_file(self):
        with tempfile.TemporaryDirectory() as root:
            remote = json.dumps(self._document("stable", 2, [])).encode()
            service, _bundled, working, _settings = self._service(root, fetch=lambda _url, _limit: remote)
            service.resolve_local("stable", materialize=True)
            with patch("py.util.lut_catalog.os.replace", side_effect=OSError("blocked")):
                service.request_refresh("stable")
                self._wait(service)
            self.assertEqual(service.catalog("stable")["catalog_version"], 1)
            self.assertEqual(service.status()["channels"]["stable"]["phase"], "failed")
            self.assertEqual(json.loads(working["stable"].read_text())["catalog_version"], 1)
            self.assertEqual(list(working["stable"].parent.glob("*.tmp")), [])

    def test_parallel_reader_sees_old_snapshot_until_remote_publish_finishes(self):
        started = threading.Event()
        release = threading.Event()

        def fetch(_url, _limit):
            started.set()
            release.wait(2)
            return json.dumps(self._document("stable", 2, [])).encode()

        with tempfile.TemporaryDirectory() as root:
            service, *_ = self._service(root, fetch=fetch)
            service.request_refresh("stable")
            self.assertTrue(started.wait(1))
            observed = [service.catalog("stable")["catalog_version"] for _ in range(20)]
            self.assertEqual(set(observed), {1})
            release.set()
            self._wait(service)
            self.assertEqual(service.catalog("stable")["catalog_version"], 2)

    def test_channel_mismatch_and_boolean_catalog_version_are_rejected(self):
        mismatch = json.dumps(self._document("experimental", 1, [])).encode()
        with self.assertRaisesRegex(LutCatalogError, "channel"):
            _catalog_from_bytes(mismatch, "stable")
        invalid = self._document("stable", 1)
        invalid["catalog_version"] = True
        with self.assertRaisesRegex(LutCatalogError, "positive integer"):
            _catalog_from_bytes(json.dumps(invalid).encode(), "stable")

    def test_catalog_rejects_non_https_advisory_links(self):
        invalid = self._document("stable", 1)
        invalid["entries"][0]["license_url"] = "javascript:alert(1)"
        with self.assertRaisesRegex(LutCatalogError, "license_url"):
            _catalog_from_bytes(json.dumps(invalid).encode(), "stable")

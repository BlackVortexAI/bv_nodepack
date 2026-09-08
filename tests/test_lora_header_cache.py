import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).parents[1]
UNKNOWN = {"status": "unknown", "family": None, "reason": "Unverified fixture", "target_model": "unknown"}


class LoraHeaderCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / ".tmp")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.model = self.directory / "fixture.safetensors"
        header = {"lora_unet_blocks_0_attn_wq.lora_down.weight": {"dtype": "F32", "shape": [2, 2], "data_offsets": [0, 16]},
                  "lora_unet_blocks_0_attn_wq.lora_up.weight": {"dtype": "F32", "shape": [2, 2], "data_offsets": [16, 32]}}
        encoded = json.dumps(header).encode()
        self.model.write_bytes(len(encoded).to_bytes(8, "little") + encoded + bytes(32))
        self.cache = self.directory / "cache.json"

    def test_real_catalog_reuses_header_evidence_in_a_new_process(self):
        script = '''import sys,json,pathlib,types
sys.path.insert(0,sys.argv[1])
from py.util import lora_registry as catalog
model=pathlib.Path(sys.argv[2]);calls=[];original=catalog._header_compatibility
def measured(path,**kwargs):
 calls.append(1)
 return original(path,**kwargs)
catalog._header_compatibility=measured
folders=types.SimpleNamespace(get_filename_list=lambda _: [model.name],get_full_path=lambda kind,name:str(model))
result=catalog.discover_loras(folders,header_cache_path=pathlib.Path(sys.argv[3]))
print(json.dumps({"calls":len(calls),"compatibility":result["items"][0]["compatibility"]}))'''
        def run():
            result = subprocess.run([sys.executable, "-c", script, str(ROOT), str(self.model), str(self.cache)], capture_output=True, text=True, check=True)
            return json.loads(result.stdout)
        first, second = run(), run()
        self.assertEqual(first["calls"], 1)
        self.assertEqual(second["calls"], 0)
        self.assertEqual(first["compatibility"], second["compatibility"])
        self.assertEqual(second["compatibility"]["status"], "token_candidate")

    def test_signature_and_algorithm_changes_invalidate_cached_unknown(self):
        from py.util.lora_header_cache import HeaderCheckCache
        calls = []
        def check(path):
            calls.append(path)
            return UNKNOWN.copy()
        def run(path=None, version=1):
            cache = HeaderCheckCache(self.cache, algorithm_version=version)
            value = cache.resolve(path or self.model, check)
            cache.save()
            return value
        run();run();self.assertEqual(len(calls), 1)
        old = self.model.stat();os.utime(self.model, ns=(old.st_atime_ns,old.st_mtime_ns+1_000_000));run();self.assertEqual(len(calls), 2)
        self.model.write_bytes(self.model.read_bytes()+b'x');run();self.assertEqual(len(calls), 3)
        other = self.directory / 'other.safetensors';other.write_bytes(self.model.read_bytes());run(other);self.assertEqual(len(calls), 4)
        run(version=2);self.assertEqual(len(calls), 5)

    def test_corrupt_cache_and_transient_io_error_fall_back_without_poisoning(self):
        from py.util.lora_header_cache import HeaderCheckCache
        self.cache.write_text('{broken', encoding='utf-8')
        cache = HeaderCheckCache(self.cache)
        with self.assertRaises(OSError):
            cache.resolve(self.model, lambda _: (_ for _ in ()).throw(OSError('transient')))
        cache.save()
        calls=[]
        self.assertEqual(HeaderCheckCache(self.cache).resolve(self.model, lambda p: calls.append(p) or UNKNOWN.copy()),UNKNOWN)
        self.assertEqual(len(calls),1)

    def test_invalid_schema_and_oversized_cache_are_disposable(self):
        from py.util.lora_header_cache import HeaderCheckCache, MAX_BYTES
        for payload in ('[]', '{"version":true,"entries":{}}', '{"version":1,"entries":{"x":{}}}', ' ' * (MAX_BYTES + 1)):
            self.cache.write_text(payload)
            calls = []
            self.assertEqual(HeaderCheckCache(self.cache).resolve(self.model, lambda path: calls.append(path) or UNKNOWN.copy()), UNKNOWN)
            self.assertEqual(len(calls), 1)

    def test_unwritable_destination_keeps_catalog_available_and_metadata_fresh(self):
        from types import SimpleNamespace
        from py.util.lora_registry import discover_loras
        folders = SimpleNamespace(get_filename_list=lambda _: [self.model.name], get_full_path=lambda *_: str(self.model))
        # A regular file cannot serve as a cache directory on any platform.
        blocked = self.directory / 'not-a-directory'
        blocked.write_text('occupied')
        first = discover_loras(folders, header_cache_path=blocked / 'cache.json')
        self.assertEqual(len(first['items']), 1)
        discover_loras(folders, header_cache_path=self.cache)
        self.model.with_suffix('.metadata.json').write_text(json.dumps({'model_name': 'Fresh sidecar'}))
        second = discover_loras(folders, header_cache_path=self.cache)
        self.assertEqual(second['items'][0]['display_name'], 'Fresh sidecar')

    def test_classifier_reads_only_prefix_and_header(self):
        from unittest.mock import patch
        from py.util.lora_registry import _header_compatibility
        original = Path.open
        consumed = []
        model = self.model
        class Guard:
            def __init__(self, stream): self.stream = stream
            def __enter__(self): return self
            def __exit__(self, *args): self.stream.close()
            def read(self, size=-1):
                if size < 0 or len(consumed) >= 2:
                    raise AssertionError('Tensor payload read')
                consumed.append(size)
                return self.stream.read(size)
        def guarded(path, *args, **kwargs):
            stream = original(path, *args, **kwargs)
            return Guard(stream) if path == model else stream
        with patch.object(Path, 'open', guarded):
            _header_compatibility(model)
        self.assertEqual(consumed[0], 8)
        self.assertEqual(sum(consumed), model.stat().st_size - 32)

    def test_file_change_during_check_does_not_cache_evidence(self):
        from py.util.lora_header_cache import HeaderCheckCache
        cache = HeaderCheckCache(self.cache)
        def changed(path):
            path.write_bytes(path.read_bytes() + b'x')
            return UNKNOWN.copy()
        cache.resolve(self.model, changed)
        cache.save()
        self.assertFalse(self.cache.exists())


if __name__ == '__main__':
    unittest.main()

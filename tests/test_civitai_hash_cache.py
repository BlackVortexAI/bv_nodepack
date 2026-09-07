import hashlib
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT / "py"))
from util.regional import civitai_metadata as metadata


class HashCacheTests(unittest.TestCase):
    def setUp(self):
        (ROOT / ".tmp").mkdir(exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=ROOT / ".tmp")
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / "model.bin"
        self.path.write_bytes(b"first")

    def test_lru_is_bounded_and_evicted_resource_rehashes(self):
        with patch.object(metadata, "HASH_CACHE_MAX_ENTRIES", 2), patch.object(metadata, "_HASH_CACHE", metadata.OrderedDict()):
            paths = [Path(self.directory.name) / f"{index}.bin" for index in range(3)]
            for path in paths:
                path.write_bytes(b"resource")
                metadata._sha256(str(path))
            self.assertEqual(len(metadata._HASH_CACHE), 2)
            with patch.object(metadata.hashlib, "sha256", wraps=hashlib.sha256) as digest:
                metadata._sha256(str(paths[1]))
                self.assertEqual(digest.call_count, 0)
                metadata._sha256(str(paths[0]))
                self.assertEqual(digest.call_count, 1)
            self.assertEqual(len(metadata._HASH_CACHE), 2)

    def test_preserved_size_and_mtime_is_documented_cache_limit(self):
        first = metadata._sha256(str(self.path))
        before = self.path.stat()
        self.path.write_bytes(b"other")
        os.utime(self.path, ns=(before.st_atime_ns, before.st_mtime_ns))
        self.assertEqual(metadata._sha256(str(self.path)), first)
        self.assertNotEqual(first, hashlib.sha256(self.path.read_bytes()).hexdigest())

    def test_repeated_hash_uses_cache_and_stat_changes_invalidate(self):
        with patch.object(metadata.hashlib, "sha256", wraps=hashlib.sha256) as digest:
            first = metadata._sha256(str(self.path))
            self.assertEqual(metadata._sha256(str(self.path.parent / "." / self.path.name)), first)
            self.assertEqual(digest.call_count, 1)
            before = self.path.stat()
            self.path.write_bytes(b"other")
            os.utime(self.path, ns=(before.st_atime_ns, before.st_mtime_ns + 1_000_000_000))
            self.assertNotEqual(metadata._sha256(str(self.path)), first)
            self.path.write_bytes(b"larger content")
            os.utime(self.path, ns=(before.st_atime_ns, before.st_mtime_ns + 1_000_000_000))
            self.assertEqual(metadata._sha256(str(self.path)), hashlib.sha256(b"larger content").hexdigest())
            self.assertEqual(digest.call_count, 4)  # includes expected digest above

    def test_file_changed_during_hash_is_rejected_and_not_cached(self):
        real_sha256 = hashlib.sha256
        class MutatingDigest:
            def __init__(inner):
                inner.digest = real_sha256()
            def update(inner, chunk):
                inner.digest.update(chunk)
                self.path.write_bytes(b"changed while reading")
            def hexdigest(inner):
                return inner.digest.hexdigest()
        with patch.object(metadata.hashlib, "sha256", MutatingDigest):
            with self.assertRaises(OSError):
                metadata._sha256(str(self.path))
        self.assertEqual(metadata._sha256(str(self.path)), real_sha256(self.path.read_bytes()).hexdigest())


if __name__ == "__main__":
    unittest.main()

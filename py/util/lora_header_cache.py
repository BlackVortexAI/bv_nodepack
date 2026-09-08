"""Disposable header evidence cache; metadata and previews are never cached here."""
import json
import os
from pathlib import Path
import tempfile

# Bump when header validation or canonical target mapping changes.
HEADER_CHECK_VERSION = 1
MAX_BYTES = 8 * 1024 * 1024
MAX_ENTRIES = 10000


def default_header_cache_path(folder_paths):
    # Private System User storage only; None disables persistence rather than
    # writing into the HTTP-served user/default tree.
    from .user_storage import private_path

    return private_path("cache", "lora_header_checks.json", folder_paths_module=folder_paths)


def _valid_result(value):
    return (isinstance(value, dict) and set(value) == {"status", "family", "reason", "target_model"}
            and value["status"] in ("unknown", "token_candidate", "multipass")
            and value["family"] in (None, "Krea 2") and value["target_model"] == "unknown"
            and isinstance(value["reason"], str) and len(value["reason"]) <= 2048)


class HeaderCheckCache:
    """One catalog request owns an index. Atomic replacement prevents torn writes.

    Concurrent requests may lose newly cached entries, causing harmless rechecks.
    Cache signatures use canonical path, size and nanosecond modification time.
    """
    def __init__(self, path, *, algorithm_version=HEADER_CHECK_VERSION):
        self.path = Path(path) if path else None
        self.version = algorithm_version
        self.entries = {}
        self.dirty = False
        if self.path is None:
            return
        try:
            with self.path.open("rb") as stream:
                raw = stream.read(MAX_BYTES + 1)
            if len(raw) > MAX_BYTES:
                return
            data = json.loads(raw)
            if (not isinstance(data, dict) or set(data) != {"version", "entries"}
                    or type(data["version"]) is not int or data["version"] != self.version
                    or not isinstance(data["entries"], dict) or len(data["entries"]) > MAX_ENTRIES):
                return
            for key, entry in data["entries"].items():
                if (not isinstance(key, str) or len(key) > 32768 or not isinstance(entry, dict)
                        or set(entry) != {"size", "mtime_ns", "result"}
                        or any(type(entry[name]) is not int or entry[name] < 0 for name in ("size", "mtime_ns"))
                        or not _valid_result(entry["result"])):
                    return
            self.entries = data["entries"]
        except (OSError, ValueError, UnicodeError, RecursionError):
            pass

    def resolve(self, path, checker):
        path = Path(path)
        stat = path.stat()
        key = os.path.normcase(str(path.resolve()))
        signature = {"size": stat.st_size, "mtime_ns": stat.st_mtime_ns}
        previous = self.entries.get(key)
        if previous and all(previous[name] == value for name, value in signature.items()):
            return previous["result"].copy()
        result = checker(path)
        after = path.stat()
        if (self.path is not None and _valid_result(result)
                and (after.st_size, after.st_mtime_ns) == (stat.st_size, stat.st_mtime_ns)):
            if key not in self.entries and len(self.entries) >= MAX_ENTRIES:
                self.entries.pop(next(iter(self.entries)))
            self.entries[key] = {**signature, "result": result.copy()}
            self.dirty = True
        return result

    def save(self):
        if self.path is None or not self.dirty:
            return
        temporary = None
        try:
            payload = json.dumps({"version": self.version, "entries": self.entries}, separators=(",", ":")).encode()
            if len(payload) > MAX_BYTES:
                return
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix=".lora-header-", delete=False) as stream:
                temporary = Path(stream.name)
                stream.write(payload)
            os.replace(temporary, self.path)
            self.dirty = False
        except OSError:
            pass
        finally:
            if temporary is not None:
                try:
                    temporary.unlink(missing_ok=True)
                except OSError:
                    pass

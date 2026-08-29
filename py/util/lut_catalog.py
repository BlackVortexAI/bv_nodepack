from __future__ import annotations

import hashlib
import json
import os
import tempfile
import threading
from collections import deque
from contextlib import contextmanager
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Awaitable, Callable, Literal
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .lut_prototype import parse_cube


CatalogChannel = Literal["stable", "experimental"]
CATALOG_CHANNELS: tuple[CatalogChannel, ...] = ("stable", "experimental")
MAX_LUT_BYTES = 8 * 1024 * 1024
MAX_CATALOG_BYTES = 1024 * 1024
CATALOG_TIMEOUT_SECONDS = 10
CATALOG_PATH = Path(__file__).with_name("lut_catalog.json")
EXPERIMENTAL_CATALOG_PATH = Path(__file__).with_name("lut_catalog.experimental.json")
BUNDLED_CATALOG_PATHS: dict[CatalogChannel, Path] = {
    "stable": CATALOG_PATH,
    "experimental": EXPERIMENTAL_CATALOG_PATH,
}
REMOTE_CATALOG_URLS: dict[CatalogChannel, str] = {
    "stable": "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/py/util/lut_catalog.json",
    "experimental": "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/py/util/lut_catalog.experimental.json",
}
SETTINGS_SCHEMA = "bv.lut-catalog.settings"


class LutCatalogError(ValueError):
    pass


class LutCatalogConflictError(LutCatalogError):
    pass


def _channel(value: str) -> CatalogChannel:
    if value not in CATALOG_CHANNELS:
        raise LutCatalogError(f"unsupported LUT catalog channel: {value!r}")
    return value  # type: ignore[return-value]


def _validate_lut_catalog(catalog: Any, expected_channel: CatalogChannel | None = None) -> dict[str, Any]:
    if not isinstance(catalog, dict):
        raise LutCatalogError("LUT download catalog must be an object")
    if catalog.get("schema") != "bv.lut-download-catalog" or catalog.get("version") != 1:
        raise LutCatalogError("unsupported LUT download catalog")
    catalog_version = catalog.get("catalog_version")
    if isinstance(catalog_version, bool) or not isinstance(catalog_version, int) or catalog_version < 1:
        raise LutCatalogError("LUT download catalog_version must be a positive integer")
    catalog_channel = _channel(str(catalog.get("channel") or ""))
    if expected_channel is not None and catalog_channel != expected_channel:
        raise LutCatalogError("LUT download catalog channel does not match its source")
    entries = catalog.get("entries")
    if not isinstance(entries, list):
        raise LutCatalogError("LUT download catalog entries must be an array")
    seen: set[str] = set()
    for entry in entries:
        required = {"id", "name", "download_url", "filename", "source_url", "license_label", "license_url", "sha256"}
        if not isinstance(entry, dict) or not required.issubset(entry):
            raise LutCatalogError("invalid LUT download catalog entry")
        entry_id = entry["id"]
        if not isinstance(entry_id, str) or not entry_id or entry_id in seen:
            raise LutCatalogError(f"duplicate or invalid LUT catalog id: {entry_id!r}")
        seen.add(entry_id)
        for field in ("download_url", "source_url", "license_url"):
            if urlparse(str(entry[field])).scheme != "https":
                raise LutCatalogError(f"LUT catalog {field} must use HTTPS: {entry_id}")
        checksum = entry["sha256"]
        if not isinstance(checksum, str) or len(checksum) != 64 or any(char not in "0123456789abcdefABCDEF" for char in checksum):
            raise LutCatalogError(f"invalid LUT catalog checksum: {entry_id}")
        filename = Path(str(entry["filename"]))
        if filename.name != entry["filename"] or filename.suffix.lower() != ".cube":
            raise LutCatalogError(f"unsafe LUT catalog filename: {entry_id}")
    return catalog


def _catalog_from_bytes(payload: bytes, expected_channel: CatalogChannel | None = None) -> dict[str, Any]:
    if len(payload) > MAX_CATALOG_BYTES:
        raise LutCatalogError("LUT download catalog exceeds the size limit")
    try:
        value = json.loads(payload.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise LutCatalogError("LUT download catalog is not valid UTF-8 JSON") from error
    return _validate_lut_catalog(value, expected_channel)


def _read_catalog(path: Path, expected_channel: CatalogChannel | None = None) -> tuple[dict[str, Any], bytes]:
    payload = path.read_bytes()
    return _catalog_from_bytes(payload, expected_channel), payload


def _user_root() -> Path:
    try:
        import folder_paths

        return Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        return Path.cwd() / "user"


def default_working_catalog_paths() -> dict[CatalogChannel, Path]:
    root = _user_root() / "default" / "bv_nodepack"
    return {
        "stable": root / "lut_catalog.json",
        "experimental": root / "lut_catalog.experimental.json",
    }


def default_catalog_settings_path() -> Path:
    return _user_root() / "default" / "bv_nodepack" / "lut_catalog_settings.json"


def _atomic_write_bytes(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _atomic_write_json(path: Path, value: dict[str, Any]) -> None:
    _atomic_write_bytes(path, (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))


def download_catalog_bytes(url: str, max_bytes: int = MAX_CATALOG_BYTES) -> bytes:
    source = urlparse(url)
    if source.scheme != "https" or source.hostname != "raw.githubusercontent.com":
        raise LutCatalogError("LUT catalog source must use HTTPS")
    request = Request(url, headers={"User-Agent": "BV-NodePack-LUT-Catalog/1"})
    with urlopen(request, timeout=CATALOG_TIMEOUT_SECONDS) as response:
        final = urlparse(response.geturl())
        if final.scheme != "https" or final.hostname != "raw.githubusercontent.com":
            raise LutCatalogError("LUT catalog redirect left the approved HTTPS host")
        declared = response.headers.get("Content-Length")
        if declared is not None and int(declared) > max_bytes:
            raise LutCatalogError("LUT download catalog exceeds the size limit")
        payload = response.read(max_bytes + 1)
    if len(payload) > max_bytes:
        raise LutCatalogError("LUT download catalog exceeds the size limit")
    return payload


def _timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def _status_error(error: BaseException) -> str:
    if isinstance(error, LutCatalogError):
        return str(error)[:240]
    if isinstance(error, OSError):
        return "Catalog update is unavailable; the local catalog remains active."
    return "Catalog update failed; the local catalog remains active."


class LutCatalogService:
    def __init__(self, *, bundled_paths=None, working_paths=None, settings_path=None, remote_urls=None, fetch=download_catalog_bytes) -> None:
        self.bundled_paths = dict(bundled_paths or BUNDLED_CATALOG_PATHS)
        self.working_paths = dict(working_paths or default_working_catalog_paths())
        self.settings_path = settings_path or default_catalog_settings_path()
        self.remote_urls = dict(remote_urls or REMOTE_CATALOG_URLS)
        self.fetch: Callable[[str, int], bytes] = fetch
        self._lock = threading.RLock()
        self._snapshots: dict[CatalogChannel, dict[str, Any]] = {}
        self._sources: dict[CatalogChannel, str] = {}
        self._selected_channel: CatalogChannel | None = None
        self._pending: deque[CatalogChannel] = deque()
        self._running: set[CatalogChannel] = set()
        self._worker: threading.Thread | None = None
        self._startup_requested = False
        self._generation = 0
        self._status: dict[CatalogChannel, dict[str, Any]] = {channel: {
            "phase": "idle", "generation": 0, "effective_source": None,
            "effective_version": None, "bundled_version": None, "working_version": None,
            "last_remote_version": None, "started_at": None, "finished_at": None,
            "last_success_at": None, "last_error": None,
        } for channel in CATALOG_CHANNELS}

    def _load_selected_channel(self, *, repair=True) -> CatalogChannel:
        if self._selected_channel is not None:
            return self._selected_channel
        selected: CatalogChannel = "stable"
        valid = False
        try:
            value = json.loads(self.settings_path.read_text(encoding="utf-8"))
            valid = isinstance(value, dict) and value.get("schema") == SETTINGS_SCHEMA and value.get("version") == 1 and value.get("selected_channel") in CATALOG_CHANNELS
            if valid:
                selected = _channel(value["selected_channel"])
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            pass
        if repair and not valid:
            try:
                _atomic_write_json(self.settings_path, {"schema": SETTINGS_SCHEMA, "version": 1, "selected_channel": selected})
            except OSError:
                pass
        self._selected_channel = selected
        return selected

    def selected_channel(self) -> CatalogChannel:
        with self._lock:
            return self._load_selected_channel()

    def set_selected_channel(self, channel: str) -> dict[str, Any]:
        selected = _channel(channel)
        with self._lock:
            _atomic_write_json(self.settings_path, {"schema": SETTINGS_SCHEMA, "version": 1, "selected_channel": selected})
            self._selected_channel = selected
        self.resolve_local(selected, materialize=True)
        return {"version": 1, "selected_channel": selected, "refresh": self.request_refresh(selected)}

    def resolve_local(self, channel: str, *, materialize: bool) -> dict[str, Any]:
        selected = _channel(channel)
        bundled = working = None
        bundled_payload = None
        try:
            bundled, bundled_payload = _read_catalog(self.bundled_paths[selected], selected)
        except (OSError, LutCatalogError):
            pass
        try:
            working, _ = _read_catalog(self.working_paths[selected], selected)
        except (OSError, LutCatalogError):
            pass
        if bundled is None and working is None:
            raise LutCatalogError(f"no valid local {selected} LUT catalog is available")
        use_working = working is not None and (bundled is None or working["catalog_version"] >= bundled["catalog_version"])
        catalog = working if use_working else bundled
        source = "working" if use_working else "bundled"
        if not use_working and materialize and bundled_payload is not None:
            try:
                _atomic_write_bytes(self.working_paths[selected], bundled_payload)
                source = "working"
                working = bundled
            except OSError:
                pass
        assert catalog is not None
        with self._lock:
            self._snapshots[selected] = deepcopy(catalog)
            self._sources[selected] = source
            self._status[selected].update({
                "effective_source": source, "effective_version": catalog["catalog_version"],
                "bundled_version": bundled and bundled["catalog_version"],
                "working_version": working and working["catalog_version"],
            })
        return deepcopy(catalog)

    def catalog(self, channel: str | None = None) -> dict[str, Any]:
        selected = _channel(channel) if channel is not None else self.selected_channel()
        with self._lock:
            snapshot = self._snapshots.get(selected)
        return deepcopy(snapshot) if snapshot is not None else self.resolve_local(selected, materialize=False)

    def installation_snapshot(self, entry_id: str, channel: str, catalog_version: int) -> dict[str, Any]:
        selected = _channel(channel)
        with self._lock:
            if selected != self._load_selected_channel():
                raise LutCatalogConflictError("LUT catalog channel changed; refresh the list before installing")
            catalog = self.catalog(selected)
            if isinstance(catalog_version, bool) or not isinstance(catalog_version, int) or catalog["catalog_version"] != catalog_version:
                raise LutCatalogConflictError("LUT catalog changed; refresh the list before installing")
            entry = next((item for item in catalog["entries"] if item["id"] == entry_id), None)
            if entry is None:
                raise KeyError(f"unknown LUT catalog id: {entry_id}")
            return deepcopy(entry)

    @contextmanager
    def install_publish_guard(self, entry: dict[str, Any], channel: str, catalog_version: int):
        with self._lock:
            try:
                current = self.installation_snapshot(entry["id"], channel, catalog_version)
            except KeyError as error:
                raise LutCatalogConflictError("LUT catalog entry changed; refresh the list before installing") from error
            if current != entry:
                raise LutCatalogConflictError("LUT catalog entry changed; refresh the list before installing")
            yield

    def status(self) -> dict[str, Any]:
        with self._lock:
            return {"version": 1, "selected_channel": self._load_selected_channel(), "worker_running": bool(self._worker and self._worker.is_alive()), "channels": deepcopy(self._status)}

    def request_refresh(self, channel: str | None = None) -> dict[str, Any]:
        selected = _channel(channel) if channel is not None else self.selected_channel()
        self.resolve_local(selected, materialize=True)
        with self._lock:
            coalesced = selected in self._running or selected in self._pending
            if not coalesced:
                self._generation += 1
                self._status[selected].update({"phase": "queued", "generation": self._generation, "last_error": None})
                self._pending.append(selected)
            if self._worker is None or not self._worker.is_alive():
                self._worker = threading.Thread(target=self._worker_loop, name="bv-lut-catalog-refresh", daemon=True)
                self._worker.start()
            return {"accepted": True, "coalesced": coalesced, "channel": selected, "generation": self._status[selected]["generation"]}

    def request_startup_refresh(self) -> dict[str, Any]:
        with self._lock:
            selected = self._load_selected_channel()
            if self._startup_requested:
                return {"accepted": True, "coalesced": True, "channel": selected, "generation": self._status[selected]["generation"]}
            self._startup_requested = True
        return self.request_refresh(selected)

    def _worker_loop(self) -> None:
        while True:
            with self._lock:
                if not self._pending:
                    self._worker = None
                    return
                channel = self._pending.popleft()
                self._running.add(channel)
                self._status[channel].update({"phase": "checking", "started_at": _timestamp(), "finished_at": None})
            self._refresh_channel(channel)
            with self._lock:
                self._running.discard(channel)

    def _refresh_channel(self, channel: CatalogChannel) -> None:
        try:
            self.resolve_local(channel, materialize=True)
            payload = self.fetch(self.remote_urls[channel], MAX_CATALOG_BYTES)
            remote = _catalog_from_bytes(payload, channel)
            with self._lock:
                current = self._snapshots[channel]
                status = self._status[channel]
                status["last_remote_version"] = remote["catalog_version"]
                if remote["catalog_version"] <= current["catalog_version"]:
                    now = _timestamp()
                    status.update({"phase": "up_to_date", "finished_at": now, "last_success_at": now, "last_error": None})
                    return
                _atomic_write_bytes(self.working_paths[channel], payload)
                self._snapshots[channel] = deepcopy(remote)
                self._sources[channel] = "working"
                now = _timestamp()
                status.update({"phase": "updated", "effective_source": "working", "effective_version": remote["catalog_version"], "working_version": remote["catalog_version"], "finished_at": now, "last_success_at": now, "last_error": None})
        except Exception as error:
            message = _status_error(error)
            with self._lock:
                self._status[channel].update({"phase": "failed", "finished_at": _timestamp(), "last_error": message})
            print(f"BV Node Pack: {channel} LUT catalog refresh unavailable: {message}")


CATALOG_SERVICE = LutCatalogService()


def load_lut_catalog(path: Path | None = None, *, channel: str | None = None) -> dict[str, Any]:
    if path is not None:
        return deepcopy(_read_catalog(path, _channel(channel) if channel is not None else None)[0])
    return CATALOG_SERVICE.catalog(channel)


def lut_catalog_status() -> dict[str, Any]:
    return CATALOG_SERVICE.status()


def select_lut_catalog_channel(channel: str) -> dict[str, Any]:
    return CATALOG_SERVICE.set_selected_channel(channel)


def request_lut_catalog_refresh(channel: str | None = None) -> dict[str, Any]:
    return CATALOG_SERVICE.request_refresh(channel)


def start_lut_catalog_refresh() -> dict[str, Any]:
    return CATALOG_SERVICE.request_startup_refresh()


async def download_bytes(url: str, max_bytes: int = MAX_LUT_BYTES) -> bytes:
    import aiohttp
    timeout = aiohttp.ClientTimeout(total=45)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, allow_redirects=True) as response:
            response.raise_for_status()
            if response.content_length is not None and response.content_length > max_bytes:
                raise ValueError("LUT download exceeds the size limit")
            chunks: list[bytes] = []
            size = 0
            async for chunk in response.content.iter_chunked(64 * 1024):
                size += len(chunk)
                if size > max_bytes:
                    raise ValueError("LUT download exceeds the size limit")
                chunks.append(chunk)
            return b"".join(chunks)


def _install_root(folder_paths_module=None) -> Path:
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    root = Path(folder_paths_module.models_dir) / "luts" / "downloaded"
    root.mkdir(parents=True, exist_ok=True)
    return root


def catalog_with_install_state(*, channel: str | None = None, folder_paths_module=None) -> dict[str, Any]:
    catalog = load_lut_catalog(channel=channel)
    root = _install_root(folder_paths_module)
    models_luts = root.parent
    for entry in catalog["entries"]:
        existing = next((path for path in models_luts.rglob(entry["filename"]) if path.is_file()), None)
        entry["installed"] = existing is not None
        entry["installed_path"] = existing.relative_to(models_luts).as_posix() if existing else None
    status = lut_catalog_status()
    catalog["selected_channel"] = status["selected_channel"]
    catalog["refresh_status"] = status["channels"][catalog["channel"]]
    return catalog


def _refresh_lut_cache(folder_paths_module) -> None:
    cache = getattr(folder_paths_module, "filename_list_cache", None)
    if isinstance(cache, dict):
        cache.pop("luts", None)
    helper = getattr(folder_paths_module, "cache_helper", None)
    if helper is not None and hasattr(helper, "clear"):
        helper.clear()


async def install_catalog_lut(entry_id: str, *, channel: str, catalog_version: int, fetch: Callable[[str], Awaitable[bytes]] = download_bytes, folder_paths_module=None, catalog_service: LutCatalogService | None = None) -> dict[str, Any]:
    service = catalog_service or CATALOG_SERVICE
    selected = _channel(channel)
    entry = service.installation_snapshot(entry_id, selected, catalog_version)
    payload = await fetch(entry["download_url"])
    if len(payload) > MAX_LUT_BYTES:
        raise ValueError("LUT download exceeds the size limit")
    digest = hashlib.sha256(payload).hexdigest()
    if digest.lower() != entry["sha256"].lower():
        raise ValueError("LUT checksum does not match the catalog")
    root = _install_root(folder_paths_module)
    target = root / entry["filename"]
    descriptor, temporary_name = tempfile.mkstemp(prefix=".bv-lut-", suffix=".cube", dir=root)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
        parsed = parse_cube(temporary)
        with service.install_publish_guard(entry, selected, catalog_version):
            if target.exists():
                raise FileExistsError(f"LUT already exists: {target.name}")
            temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    _refresh_lut_cache(folder_paths_module)
    return {"id": entry["id"], "filename": target.name, "relative_path": f"downloaded/{target.name}", "sha256": digest, "cube_size": parsed["size"], "channel": selected, "catalog_version": catalog_version}

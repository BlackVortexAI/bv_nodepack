from __future__ import annotations

import hashlib
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlparse

from .lut_prototype import parse_cube


MAX_LUT_BYTES = 8 * 1024 * 1024
CATALOG_PATH = Path(__file__).with_name("lut_catalog.json")


def load_lut_catalog(path: Path = CATALOG_PATH) -> dict[str, Any]:
    catalog = json.loads(path.read_text(encoding="utf-8"))
    if catalog.get("schema") != "bv.lut-download-catalog" or catalog.get("version") != 1:
        raise ValueError("unsupported LUT download catalog")
    entries = catalog.get("entries")
    if not isinstance(entries, list):
        raise ValueError("LUT download catalog entries must be an array")
    seen: set[str] = set()
    for entry in entries:
        required = {"id", "name", "download_url", "filename", "source_url", "license_label", "license_url", "sha256"}
        if not isinstance(entry, dict) or not required.issubset(entry):
            raise ValueError("invalid LUT download catalog entry")
        if entry["id"] in seen:
            raise ValueError(f"duplicate LUT catalog id: {entry['id']}")
        seen.add(entry["id"])
        if urlparse(entry["download_url"]).scheme != "https":
            raise ValueError(f"LUT catalog download must use HTTPS: {entry['id']}")
        checksum = entry["sha256"]
        if not isinstance(checksum, str) or len(checksum) != 64 or any(char not in "0123456789abcdefABCDEF" for char in checksum):
            raise ValueError(f"invalid LUT catalog checksum: {entry['id']}")
        filename = Path(entry["filename"])
        if filename.name != entry["filename"] or filename.suffix.lower() != ".cube":
            raise ValueError(f"unsafe LUT catalog filename: {entry['id']}")
    return catalog


async def download_bytes(url: str, max_bytes: int = MAX_LUT_BYTES) -> bytes:
    import aiohttp

    timeout = aiohttp.ClientTimeout(total=45)
    async with aiohttp.ClientSession(timeout=timeout) as session:
        async with session.get(url, allow_redirects=True) as response:
            response.raise_for_status()
            declared = response.content_length
            if declared is not None and declared > max_bytes:
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


def catalog_with_install_state(*, folder_paths_module=None) -> dict[str, Any]:
    catalog = load_lut_catalog()
    root = _install_root(folder_paths_module)
    models_luts = root.parent
    for entry in catalog["entries"]:
        target = root / entry["filename"]
        existing = next((path for path in models_luts.rglob(entry["filename"]) if path.is_file()), None)
        entry["installed"] = existing is not None
        entry["installed_path"] = existing.relative_to(models_luts).as_posix() if existing else None
    return catalog


def _refresh_lut_cache(folder_paths_module) -> None:
    cache = getattr(folder_paths_module, "filename_list_cache", None)
    if isinstance(cache, dict):
        cache.pop("luts", None)
    helper = getattr(folder_paths_module, "cache_helper", None)
    if helper is not None and hasattr(helper, "clear"):
        helper.clear()


async def install_catalog_lut(
    entry_id: str,
    *,
    fetch: Callable[[str], Awaitable[bytes]] = download_bytes,
    folder_paths_module=None,
) -> dict[str, Any]:
    catalog = load_lut_catalog()
    entry = next((item for item in catalog["entries"] if item["id"] == entry_id), None)
    if entry is None:
        raise KeyError(f"unknown LUT catalog id: {entry_id}")
    payload = await fetch(entry["download_url"])
    if len(payload) > MAX_LUT_BYTES:
        raise ValueError("LUT download exceeds the size limit")
    expected = entry["sha256"]
    digest = hashlib.sha256(payload).hexdigest()
    if digest.lower() != expected.lower():
        raise ValueError("LUT checksum does not match the catalog")

    root = _install_root(folder_paths_module)
    target = root / entry["filename"]
    if target.exists():
        raise FileExistsError(f"LUT already exists: {target.name}")
    descriptor, temporary_name = tempfile.mkstemp(prefix=".bv-lut-", suffix=".cube", dir=root)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
        parsed = parse_cube(temporary)
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)
    if folder_paths_module is None:
        import folder_paths as folder_paths_module
    _refresh_lut_cache(folder_paths_module)
    return {
        "id": entry["id"], "filename": target.name,
        "relative_path": f"downloaded/{target.name}", "sha256": digest,
        "cube_size": parsed["size"],
    }

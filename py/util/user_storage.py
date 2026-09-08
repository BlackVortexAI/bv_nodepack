"""Private runtime storage for BV Node Pack.

Trusted runtime data (Remote LLM settings and secrets, the response cache, LUT
working catalogs and channel selection, the LoRA header cache) lives below
ComfyUI's System User directory ``user/__bv_nodepack/``. ComfyUI never serves
System User directories through its ``/userdata`` HTTP API, unlike
``user/default/`` where versions up to 1.4.1 stored the same files.

Without ComfyUI's System User API the pack fails closed: nothing is read from or
written to the public ``user/default/bv_nodepack/`` tree, and the features that
need trusted storage report why they are unavailable instead of falling back.
"""
from __future__ import annotations

import os
import shutil
import tempfile
from pathlib import Path
from typing import Any


PRIVATE_USER_NAME = "bv_nodepack"
LEGACY_SUBPATH = ("default", "bv_nodepack")
UNAVAILABLE_MESSAGE = (
    "BV Node Pack private storage is unavailable: this ComfyUI has no System User directory API "
    "(folder_paths.get_system_user_directory). Update ComfyUI to use Remote LLM API keys, custom "
    "provider settings, LUT catalog updates and persistent caches; other nodes keep working."
)
# Files that earlier versions kept in the public user tree, relative to that tree.
LEGACY_FILES = (
    "remote_llm_settings.json",
    "remote_llm_secrets.json",
    "lut_catalog.json",
    "lut_catalog.experimental.json",
    "lut_catalog_settings.json",
    "cache/lora_header_checks.json",
)
# Regenerable data is deleted from the public tree, never copied.
LEGACY_REGENERABLE_DIRS = ("cache/remote_llm",)


class PrivateStorageUnavailable(RuntimeError):
    pass


def _folder_paths(module: Any = None) -> Any:
    if module is not None:
        return module
    try:
        import folder_paths
    except ImportError:
        return None
    return folder_paths


def private_root(folder_paths_module: Any = None) -> Path | None:
    """The private storage root, or None when ComfyUI cannot provide one."""
    module = _folder_paths(folder_paths_module)
    getter = getattr(module, "get_system_user_directory", None) if module is not None else None
    if getter is None:
        return None
    try:
        root = Path(getter(PRIVATE_USER_NAME))
    except (ValueError, TypeError, OSError):
        return None
    # The protection rests on ComfyUI excluding this prefix from public user paths.
    if not root.name.startswith("__"):
        return None
    return root


def require_private_root(folder_paths_module: Any = None) -> Path:
    root = private_root(folder_paths_module)
    if root is None:
        raise PrivateStorageUnavailable(UNAVAILABLE_MESSAGE)
    return root


def private_path(*parts: str, folder_paths_module: Any = None) -> Path | None:
    root = private_root(folder_paths_module)
    return None if root is None else root.joinpath(*parts)


def legacy_root(folder_paths_module: Any = None) -> Path | None:
    module = _folder_paths(folder_paths_module)
    getter = getattr(module, "get_user_directory", None) if module is not None else None
    if getter is None:
        return None
    try:
        return Path(getter()).joinpath(*LEGACY_SUBPATH)
    except (TypeError, OSError):
        return None


def _atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = source.read_bytes()
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=target.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)
    if target.read_bytes() != payload:
        raise OSError(f"verification failed for {target}")


def migrate_legacy_storage(*, legacy: Path | None = None, private: Path | None = None) -> dict[str, list[str]]:
    """Move trusted files from the public tree into private storage, once and verifiably.

    Contract: an existing private file is never overwritten by a public one. A public
    file is removed only after its private copy was verified byte for byte, or when a
    private file already exists (the public copy is then redundant and must not stay
    readable). Regenerable caches are deleted, not copied. Symbolic links are left
    alone and reported. A failure leaves the public file in place so the next start
    retries. Never raises.
    """
    report: dict[str, list[str]] = {"migrated": [], "removed": [], "kept": [], "failed": []}
    legacy = legacy if legacy is not None else legacy_root()
    private = private if private is not None else private_root()
    if legacy is None or private is None or not legacy.is_dir() or legacy.is_symlink():
        return report
    try:
        if legacy.resolve() == private.resolve():
            return report
    except OSError:
        return report
    for relative in LEGACY_FILES:
        source = legacy / relative
        target = private / relative
        try:
            if source.is_symlink():
                report["kept"].append(f"{relative}: symbolic link left in place")
                continue
            if not source.is_file():
                continue
            if target.exists():
                source.unlink()
                report["removed"].append(f"{relative}: private copy already present")
                continue
            _atomic_copy(source, target)
            source.unlink()
            report["migrated"].append(relative)
        except OSError as error:
            report["failed"].append(f"{relative}: {error}")
    for relative in LEGACY_REGENERABLE_DIRS:
        path = legacy / relative
        try:
            if path.is_dir() and not path.is_symlink():
                shutil.rmtree(path)
                report["removed"].append(f"{relative}: regenerable cache")
        except OSError as error:
            report["failed"].append(f"{relative}: {error}")
    for path in (legacy / "cache", legacy):
        try:
            if path.is_dir() and not path.is_symlink() and not any(path.iterdir()):
                path.rmdir()
        except OSError:
            pass
    return report


def run_startup_migration() -> dict[str, list[str]]:
    """Startup hook: migrate once, report, never break node registration."""
    try:
        report = migrate_legacy_storage()
    except Exception as error:  # noqa: BLE001 - startup must not fail on storage problems
        print(f"BV Node Pack: private storage migration failed: {error}")
        return {"migrated": [], "removed": [], "kept": [], "failed": [str(error)]}
    if private_root() is None:
        print(f"BV Node Pack: {UNAVAILABLE_MESSAGE}")
    for kind in ("migrated", "removed", "kept", "failed"):
        for entry in report[kind]:
            print(f"BV Node Pack: private storage {kind}: {entry}")
    return report

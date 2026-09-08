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
import secrets
import shutil
import time
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


RECOVERY_SUFFIX = ".recovered"
STAGING_MARKER = ".staging-"


def _publish_exclusive(target: Path, payload: bytes) -> None:
    """Publish ``payload`` under ``target`` atomically and exclusively.

    The bytes are written, synced and verified in a uniquely named staging file
    first; the final name is then created with a hard link, which fails when the
    name already exists and never replaces anything. Other processes therefore
    only ever see a complete, verified file under the final name, and a crash
    can leave at most a staging file behind (never loaded, cleaned on the next
    run). Once published, the file is never removed by this function.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    staging = target.with_name(f".{target.name}{STAGING_MARKER}{secrets.token_hex(6)}")
    descriptor = os.open(staging, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        if staging.read_bytes() != payload:
            raise OSError(f"verification failed for {staging}")
        os.link(staging, target)  # FileExistsError when the name is taken; no replace
    finally:
        # Only this call's own staging file is removed. Staging files left by a crashed
        # process stay where they are: they are never loaded and another process cannot
        # tell them apart from a stage that is still being written.
        try:
            staging.unlink(missing_ok=True)
        except OSError:
            pass


def _recovery_path(target: Path) -> Path:
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    return target.with_name(f"{target.name}.legacy-{stamp}-{secrets.token_hex(4)}{RECOVERY_SUFFIX}")


def _migrate_file(source: Path, target: Path) -> tuple[str, str]:
    """Return (outcome, detail) for one public file; raises OSError on failure.

    Outcomes: ``migrated`` (published privately, source removed), ``removed`` (private
    file already held the same bytes, source removed), ``recovered`` (private file
    differs or is not a regular file; source preserved as a private recovery file that
    is never loaded automatically, then removed).
    """
    payload = source.read_bytes()
    try:
        _publish_exclusive(target, payload)
    except FileExistsError:
        pass
    else:
        source.unlink(missing_ok=True)
        return "migrated", ""
    # Whatever holds the final name was published complete and verified (by this
    # code or by the user); it is never touched here.
    if target.is_file() and not target.is_symlink() and target.read_bytes() == payload:
        source.unlink(missing_ok=True)
        return "removed", "private copy holds the same bytes"
    recovery = _recovery_path(target)
    _publish_exclusive(recovery, payload)
    source.unlink(missing_ok=True)
    return "recovered", f"private copy differs; public file kept as {recovery.name}"


def migrate_legacy_storage(*, legacy: Path | None = None, private: Path | None = None) -> dict[str, list[str]]:
    """Move trusted files from the public tree into private storage, once and verifiably.

    Contract: private files are never overwritten or replaced, not even by a
    concurrent migration (staging file, then exclusive hard-link publication), and
    a name that exists in private storage always holds a complete file. A public
    file is removed only after its bytes are verified in private storage: as the
    new private file, as an identical existing private file, or as a uniquely
    named recovery file that is never loaded automatically. Regenerable caches are
    deleted, not copied. Symbolic links are left alone and reported. A failure
    leaves the public file in place; at most a staging file (never loaded, never
    promoted, never removed by another process) remains. Never raises.
    """
    report: dict[str, list[str]] = {"migrated": [], "removed": [], "recovered": [], "kept": [], "failed": []}
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
            outcome, detail = _migrate_file(source, target)
            report[outcome].append(relative if not detail else f"{relative}: {detail}")
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
        return {"migrated": [], "removed": [], "recovered": [], "kept": [], "failed": [str(error)]}
    if private_root() is None:
        print(f"BV Node Pack: {UNAVAILABLE_MESSAGE}")
    for kind in ("migrated", "removed", "recovered", "kept", "failed"):
        for entry in report[kind]:
            print(f"BV Node Pack: private storage {kind}: {entry}")
    return report

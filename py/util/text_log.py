from __future__ import annotations

import os
import re
import stat
import tempfile
from datetime import datetime, timezone
from pathlib import Path


LOG_DIRECTORY_NAME = "bv_logs"
LOG_MODES = ("overwrite", "append", "timestamped")
_WINDOWS_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{index}" for index in range(1, 10)),
    *(f"LPT{index}" for index in range(1, 10)),
}


def safe_log_name(value: object) -> str:
    text = str(value).strip()
    text = re.sub(r"[^A-Za-z0-9._-]+", "_", text).strip(" ._")
    text = text[:96].rstrip(" ._")
    if not text:
        text = "bv_log"
    path = Path(text)
    if path.stem.upper() in _WINDOWS_RESERVED:
        text = f"_{text}"
        path = Path(text)
    if not path.suffix:
        text += ".txt"
    return text


def _timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")


def _reject_log_alias(path: Path) -> None:
    try:
        info = path.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & 0x400:
        raise ValueError("BV text logs cannot use symbolic links or reparse points")
    if stat.S_ISREG(info.st_mode) and info.st_nlink != 1:
        raise ValueError("BV text logs cannot use hard-linked files")


def write_text_log(output_root: str | Path, text: object, log_name: object, mode: str) -> Path:
    if mode not in LOG_MODES:
        raise ValueError(f"Unsupported BV text log mode '{mode}'")
    log_directory = Path(output_root).resolve() / LOG_DIRECTORY_NAME
    _reject_log_alias(log_directory)
    log_directory.mkdir(parents=True, exist_ok=True)
    _reject_log_alias(log_directory)
    safe_name = safe_log_name(log_name)
    target = log_directory / safe_name
    content = str(text)

    if mode == "timestamped":
        suffix = target.suffix
        timestamped_stem = f"{target.stem}-{_timestamp()}"
        for collision_index in range(10_000):
            collision_suffix = "" if collision_index == 0 else f"-{collision_index:04d}"
            candidate = target.with_name(f"{timestamped_stem}{collision_suffix}{suffix}")
            try:
                with candidate.open("x", encoding="utf-8", newline="") as handle:
                    handle.write(content)
                target = candidate
                break
            except FileExistsError:
                continue
        else:
            raise RuntimeError("Could not allocate a unique BV timestamped log filename")
    elif mode == "append":
        _reject_log_alias(target)
        flags = os.O_WRONLY | os.O_CREAT | os.O_APPEND | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0)
        descriptor = os.open(target, flags, 0o600)
        try:
            info = os.fstat(descriptor)
            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                raise ValueError("BV text logs require a regular file with one link")
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
                descriptor = -1
                handle.write(f"\n--- {_timestamp()} ---\n")
                handle.write(content)
                if not content.endswith("\n"):
                    handle.write("\n")
        finally:
            if descriptor != -1:
                os.close(descriptor)
    else:
        _reject_log_alias(target)
        descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", suffix=".tmp", dir=log_directory)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8", newline="") as handle:
                handle.write(content)
            os.replace(temporary_name, target)
        except Exception:
            try:
                os.unlink(temporary_name)
            except OSError:
                pass
            raise
    return target.resolve()

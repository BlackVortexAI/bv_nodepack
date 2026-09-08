"""Shared root-containment rule for every file the pack opens on behalf of a workflow.

One implementation for LoRA loading, LoRA previews and sidecars, model hashes and
the LUT install directory: the candidate must lie inside a configured root both
lexically and after symbolic links are resolved. The lexical check runs before
any filesystem access of the candidate itself, so unrelated absolute paths (UNC
included) are refused without being touched; the real-path check then needs
``resolve()`` on the candidate. Format rules (which suffixes are allowed) stay
with the caller because they differ per consumer.
"""
from __future__ import annotations

from pathlib import Path
from typing import Any, Iterable


def resolve_within_roots(candidate: Path, allowed_roots: Iterable[Any], label: str = "path") -> Path:
    configured_roots = [Path(root).absolute() for root in allowed_roots]
    if not configured_roots:
        raise ValueError(f"{label} cannot be approved: no configured folders are known")
    real_roots = [root.resolve() for root in configured_roots]
    if not any(candidate.absolute().is_relative_to(root) for root in configured_roots + real_roots):
        raise ValueError(f"{label} is outside the configured folders; register its folder in ComfyUI")
    resolved = candidate.resolve()
    if not any(resolved.is_relative_to(root) for root in real_roots):
        raise ValueError(f"{label} resolves outside the configured folders")
    return resolved


def contained_file(candidate: Path, allowed_roots: Iterable[Any] | None) -> Path | None:
    """The resolved path when ``candidate`` is a regular file inside the roots, else None."""
    if allowed_roots is None:
        return None
    try:
        resolved = resolve_within_roots(candidate, allowed_roots)
        return resolved if resolved.is_file() else None
    except (OSError, ValueError):
        return None


def configured_roots(folder_paths_module: Any, category: str) -> list[str] | None:
    """ComfyUI's configured folders for a model category, or None when unknown."""
    getter = getattr(folder_paths_module, "get_folder_paths", None)
    if getter is None:
        return None
    try:
        roots = [str(root) for root in getter(category)]
    except Exception:  # noqa: BLE001 - unknown categories or broken modules mean "unknown"
        return None
    return roots

"""Management gate for BV routes that change server state.

Mirrors ComfyUI-Manager's local mode instead of inventing credentials: a
state-changing management request is accepted when every address ComfyUI
listens on is a loopback address and the request's own socket peer is a
loopback address. Forwarded headers are never consulted.

Known limit of this model, accepted deliberately: a reverse proxy running on
the same machine in front of a loopback-only ComfyUI satisfies both checks for
every client it forwards. Whoever operates such a proxy administers the host
and must protect or block these routes there; nothing here is an
authentication.

Operators of a ``--listen`` server opt in explicitly by writing
``{"schema": "bv.admin.settings", "version": 1, "allow_remote_management": true}``
to ``admin_settings.json`` in BV's private storage directory. That is a
deliberate opening to every client that can reach the server; the file cannot
be created through HTTP.
"""
from __future__ import annotations

import ipaddress
import json
from pathlib import Path
from typing import Any

from .user_storage import private_path


ADMIN_SETTINGS_FILENAME = "admin_settings.json"
ADMIN_SETTINGS_SCHEMA = "bv.admin.settings"
NOT_LOCAL_MESSAGE = (
    "BV Node Pack management is limited to a ComfyUI that listens on a loopback address "
    "(--listen 127.0.0.1 or ::1) and to clients on that machine. Edit the files in the "
    "private BV storage directory instead, or set allow_remote_management in "
    f"{ADMIN_SETTINGS_FILENAME} there to open management to every client that can reach this server."
)


def is_loopback(address: Any) -> bool:
    try:
        return ipaddress.ip_address(str(address).strip()).is_loopback
    except ValueError:
        return False


def listen_addresses() -> list[str] | None:
    """Addresses ComfyUI binds, or None when unknown (then nothing counts as local)."""
    try:
        from comfy.cli_args import args
    except Exception:  # noqa: BLE001 - outside ComfyUI there is no server to protect
        return None
    listen = getattr(args, "listen", None)
    if not isinstance(listen, str):
        return None
    # ComfyUI binds every comma-separated entry as given, including empty ones
    # (host ""), so nothing is filtered here: an empty entry is not loopback and
    # makes the whole listener non-local.
    return [item.strip() for item in listen.split(",")]


def server_is_local(addresses: list[str] | None = None) -> bool:
    addresses = listen_addresses() if addresses is None else addresses
    return bool(addresses) and all(is_loopback(item) for item in addresses)


def default_admin_settings_path() -> Path | None:
    return private_path(ADMIN_SETTINGS_FILENAME)


def allow_remote_management(path: Path | None = None) -> bool:
    """True only for a well-formed opt-in file in private storage; anything else is False."""
    settings_path = path if path is not None else default_admin_settings_path()
    if settings_path is None:
        return False
    try:
        value = json.loads(settings_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return False
    return (
        isinstance(value, dict)
        and value.get("schema") == ADMIN_SETTINGS_SCHEMA
        and value.get("version") == 1
        and value.get("allow_remote_management") is True
    )


def management_allowed(request: Any, *, addresses: list[str] | None = None, settings_path: Path | None = None) -> tuple[bool, str]:
    if allow_remote_management(settings_path):
        return True, "remote management enabled by the operator"
    if not server_is_local(addresses):
        return False, NOT_LOCAL_MESSAGE
    if not is_loopback(getattr(request, "remote", None)):
        return False, NOT_LOCAL_MESSAGE
    return True, "local client on a loopback-only server"


def management_state(*, addresses: list[str] | None = None, settings_path: Path | None = None) -> dict[str, Any]:
    """Server capability for the UI, not a per-request decision.

    ``allowed`` says whether this server can accept management requests from
    anyone (loopback-only listener, or operator opt-in); a particular remote
    client may still be refused by ``management_allowed``.
    """
    remote = allow_remote_management(settings_path)
    local = server_is_local(addresses)
    return {"allowed": remote or local, "local_server": local, "remote_management": remote}


def require_management(request: Any):
    """Return an aiohttp 403 response when the request may not manage BV state, else None."""
    allowed, reason = management_allowed(request)
    if allowed:
        return None
    from aiohttp import web

    return web.json_response({"error": reason}, status=403)

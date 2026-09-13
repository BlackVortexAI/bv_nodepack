from __future__ import annotations

import asyncio
from aiohttp import web
from server import PromptServer

from .admin_gate import management_state, require_management
from .http_body import RequestBodyError, body_error_response, read_json_object
from .user_storage import private_root
from .remote_llm import (
    RemoteLLMConfigurationError,
    delete_remote_api_key,
    load_provider_catalog,
    remote_api_key_status,
    remote_api_key_endpoint,
    resolve_profile_endpoint,
    set_remote_api_key,
)


routes = PromptServer.instance.routes
_assist_busy = False
# Assist carries up to 32 KiB of prompt text plus an 8 KiB style guide; a key save carries one key and one URL.
MAX_ASSIST_BODY_BYTES = 196608
MAX_API_KEY_BODY_BYTES = 16384


@routes.post("/bv_nodepack/remote_llm/assist")
async def remote_llm_assist(request):
    """Explicit editor action; serial, bounded and independent of the execution queue."""
    from .prompt_assist import assist_text, validate_assist_body
    from .remote_llm import RemoteLLMProviderError

    denied = require_management(request)
    if denied is not None:
        return denied
    global _assist_busy
    if _assist_busy:
        return web.json_response({"error": "Writing assistance is busy. Try again shortly."}, status=429)
    try:
        body = validate_assist_body(await read_json_object(request, MAX_ASSIST_BODY_BYTES))
        # Check again after awaiting the request body.
        if _assist_busy:
            return web.json_response({"error": "Writing assistance is busy. Try again shortly."}, status=429)
    except RequestBodyError as error:
        if error.status == 413:
            return web.json_response({"error": "Writing assistance request is too large"}, status=413)
        return web.json_response({"error": "Invalid writing assistance request"}, status=400)
    except (ValueError, TypeError, RecursionError):
        return web.json_response({"error": "Invalid writing assistance request"}, status=400)
    _assist_busy = True

    async def run():
        global _assist_busy
        try:
            return await asyncio.to_thread(assist_text, body)
        finally:
            _assist_busy = False

    # A disconnected browser must not free the slot while its provider is still running.
    task = asyncio.create_task(run())
    task.add_done_callback(lambda done: done.exception() if not done.cancelled() else None)
    try:
        return web.json_response({"text": await asyncio.shield(task)})
    except (ValueError, TypeError, RemoteLLMConfigurationError):
        return web.json_response({"error": "Provider configuration or response is invalid; prompt unchanged."}, status=400)
    except (RemoteLLMProviderError, OSError, RecursionError):
        return web.json_response({"error": "Writing assistance failed; check the provider and try again."}, status=502)


def _profiles_by_id():
    return {profile.id: profile for profile in load_provider_catalog()}


def _effective_endpoint(profile):
    try:
        return resolve_profile_endpoint(profile)
    except (RemoteLLMConfigurationError, ValueError, OSError):
        return None


@routes.get("/bv_nodepack/remote_llm/providers")
async def remote_llm_providers(_request):
    configured = remote_api_key_status()
    return web.json_response({
        "version": 1,
        "management": management_state(),
        "private_storage": private_root() is not None,
        "profiles": [
            {
                "id": profile.id,
                "label": profile.label,
                "endpoint": profile.endpoint,
                "allow_custom_endpoint": profile.allow_custom_endpoint,
                "default_model": profile.default_model,
                "auth_mode": profile.auth_mode,
                "configured": profile.auth_mode == "none" or configured.get(profile.id, False),
                "approved_endpoint": remote_api_key_endpoint(profile.id),
                "effective_endpoint": _effective_endpoint(profile),
            }
            for profile in load_provider_catalog()
        ],
    })


@routes.post("/bv_nodepack/remote_llm/api_key")
async def remote_llm_set_api_key(request):
    denied = require_management(request)
    if denied is not None:
        return denied
    try:
        body = await read_json_object(request, MAX_API_KEY_BODY_BYTES)
        profile_id = str(body.get("profile_id") or "").strip()
        profile = _profiles_by_id().get(profile_id)
        if profile is None:
            raise RemoteLLMConfigurationError("Unknown remote LLM provider profile")
        if profile.auth_mode == "none":
            raise RemoteLLMConfigurationError("This provider does not use an API key")
        if not isinstance(body.get("endpoint"), str) or not body["endpoint"]:
            raise RemoteLLMConfigurationError("Confirm the destination endpoint when saving the API key; refresh the browser after updating")
        set_remote_api_key(profile_id, body.get("api_key") or "", endpoint=body["endpoint"])
        return web.json_response({"version": 1, "profile_id": profile_id, "configured": True})
    except RequestBodyError as error:
        return body_error_response(error)
    except (RemoteLLMConfigurationError, ValueError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.delete("/bv_nodepack/remote_llm/api_key/{profile_id}")
async def remote_llm_delete_api_key(request):
    denied = require_management(request)
    if denied is not None:
        return denied
    profile_id = str(request.match_info.get("profile_id") or "").strip()
    if profile_id not in _profiles_by_id():
        return web.json_response({"error": "Unknown remote LLM provider profile"}, status=404)
    delete_remote_api_key(profile_id)
    return web.json_response({"version": 1, "profile_id": profile_id, "configured": False})

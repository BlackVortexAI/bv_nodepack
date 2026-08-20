from __future__ import annotations

from aiohttp import web
from server import PromptServer

from .remote_llm import (
    RemoteLLMConfigurationError,
    delete_remote_api_key,
    load_provider_catalog,
    remote_api_key_status,
    set_remote_api_key,
)


routes = PromptServer.instance.routes


def _profiles_by_id():
    return {profile.id: profile for profile in load_provider_catalog()}


@routes.get("/bv_nodepack/remote_llm/providers")
async def remote_llm_providers(_request):
    configured = remote_api_key_status()
    return web.json_response({
        "version": 1,
        "profiles": [
            {
                "id": profile.id,
                "label": profile.label,
                "endpoint": profile.endpoint,
                "allow_custom_endpoint": profile.allow_custom_endpoint,
                "default_model": profile.default_model,
                "auth_mode": profile.auth_mode,
                "configured": profile.auth_mode == "none" or configured.get(profile.id, False),
            }
            for profile in load_provider_catalog()
        ],
    })


@routes.post("/bv_nodepack/remote_llm/api_key")
async def remote_llm_set_api_key(request):
    try:
        body = await request.json()
        profile_id = str(body.get("profile_id") or "").strip()
        profile = _profiles_by_id().get(profile_id)
        if profile is None:
            raise RemoteLLMConfigurationError("Unknown remote LLM provider profile")
        if profile.auth_mode == "none":
            raise RemoteLLMConfigurationError("This provider does not use an API key")
        set_remote_api_key(profile_id, body.get("api_key") or "")
        return web.json_response({"version": 1, "profile_id": profile_id, "configured": True})
    except (RemoteLLMConfigurationError, ValueError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.delete("/bv_nodepack/remote_llm/api_key/{profile_id}")
async def remote_llm_delete_api_key(request):
    profile_id = str(request.match_info.get("profile_id") or "").strip()
    if profile_id not in _profiles_by_id():
        return web.json_response({"error": "Unknown remote LLM provider profile"}, status=404)
    delete_remote_api_key(profile_id)
    return web.json_response({"version": 1, "profile_id": profile_id, "configured": False})

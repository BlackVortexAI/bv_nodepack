from __future__ import annotations

import json

from aiohttp import web
from server import PromptServer

from .service import DebugBridgeError, debug_bridge


routes = PromptServer.instance.routes
_LOOPBACK_ADDRESSES = frozenset({"127.0.0.1", "::1", "localhost"})


def _loopback_only(request: web.Request) -> None:
    if request.remote not in _LOOPBACK_ADDRESSES:
        raise web.HTTPForbidden(text="BV Debug Bridge accepts loopback requests only")


async def _json_body(request: web.Request) -> dict:
    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError) as error:
        raise web.HTTPBadRequest(text="Request body must be valid JSON") from error
    if not isinstance(body, dict):
        raise web.HTTPBadRequest(text="Request body must be a JSON object")
    return body


@routes.get("/bv_nodepack/debug/status")
async def debug_status(request):
    _loopback_only(request)
    return web.json_response(debug_bridge.status())


@routes.post("/bv_nodepack/debug/session")
async def debug_session(request):
    _loopback_only(request)
    body = await _json_body(request)
    if set(body) != {"enabled"} or not isinstance(body["enabled"], bool):
        raise web.HTTPBadRequest(text="Body must contain exactly one boolean enabled field")
    return web.json_response(debug_bridge.set_enabled(body["enabled"]))


@routes.put("/bv_nodepack/debug/snapshot")
async def debug_snapshot_put(request):
    _loopback_only(request)
    body = await _json_body(request)
    if not set(body).issubset({"prompt", "workflow_name"}) or "prompt" not in body:
        raise web.HTTPBadRequest(text="Body must contain prompt and may contain workflow_name")
    try:
        result = debug_bridge.publish(body["prompt"], body.get("workflow_name", ""))
    except DebugBridgeError as error:
        raise web.HTTPConflict(text=str(error)) from error
    return web.json_response(result)


@routes.get("/bv_nodepack/debug/snapshot")
async def debug_snapshot_get(request):
    _loopback_only(request)
    try:
        result = debug_bridge.snapshot()
    except DebugBridgeError as error:
        raise web.HTTPConflict(text=str(error)) from error
    return web.json_response(result)

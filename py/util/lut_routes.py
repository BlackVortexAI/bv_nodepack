from __future__ import annotations

import aiohttp
from aiohttp import web
from server import PromptServer

from .admin_gate import management_state, require_management
from .http_body import RequestBodyError, body_error_response, read_json_object
from .lut_catalog import (
    LutCatalogConflictError,
    LutCatalogError,
    catalog_with_install_state,
    install_catalog_lut,
    lut_catalog_status,
    request_lut_catalog_refresh,
    select_lut_catalog_channel,
)
from ..nodes.bv_lut_prototype import DOWNLOAD_MORE, _lut_choices


routes = PromptServer.instance.routes
# Channel selection is one short name; an install names one catalog entry, channel and version.
MAX_CHANNEL_BODY_BYTES = 1024
MAX_INSTALL_BODY_BYTES = 4096


@routes.get("/bv_nodepack/luts/catalog")
async def lut_catalog(request):
    channel = request.query.get("channel")
    try:
        return web.json_response(catalog_with_install_state(channel=channel))
    except LutCatalogError as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.get("/bv_nodepack/luts/catalog/status")
async def lut_catalog_refresh_status(_request):
    return web.json_response({**lut_catalog_status(), "management": management_state()})


@routes.put("/bv_nodepack/luts/catalog/channel")
async def lut_catalog_channel(request):
    denied = require_management(request)
    if denied is not None:
        return denied
    try:
        body = await read_json_object(request, MAX_CHANNEL_BODY_BYTES)
        return web.json_response(select_lut_catalog_channel(str(body.get("channel") or "")))
    except RequestBodyError as error:
        return body_error_response(error)
    except (LutCatalogError, OSError, ValueError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.post("/bv_nodepack/luts/catalog/refresh")
async def lut_catalog_refresh(_request):
    try:
        result = request_lut_catalog_refresh()
        return web.json_response({"version": 1, **result}, status=202)
    except (LutCatalogError, OSError, ValueError, TypeError) as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.get("/bv_nodepack/luts/models")
async def lut_models(_request):
    return web.json_response({"version": 1, "luts": [item for item in _lut_choices() if item != DOWNLOAD_MORE]})


@routes.post("/bv_nodepack/luts/install")
async def lut_install(request):
    denied = require_management(request)
    if denied is not None:
        return denied
    try:
        body = await read_json_object(request, MAX_INSTALL_BODY_BYTES)
    except RequestBodyError as error:
        return body_error_response(error)
    entry_id = str(body.get("id") or "")
    try:
        result = await install_catalog_lut(
            entry_id,
            channel=str(body.get("channel") or ""),
            catalog_version=body.get("catalog_version"),
        )
    except LutCatalogConflictError as error:
        return web.json_response({"error": str(error)}, status=409)
    except KeyError as error:
        raise web.HTTPNotFound(text=str(error)) from error
    except FileExistsError as error:
        raise web.HTTPConflict(text=str(error)) from error
    except (ValueError, OSError, aiohttp.ClientError) as error:
        raise web.HTTPBadRequest(text=str(error)) from error
    return web.json_response({"version": 1, "installed": result})

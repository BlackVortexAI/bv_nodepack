from __future__ import annotations

import aiohttp
from aiohttp import web
from server import PromptServer

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


@routes.get("/bv_nodepack/luts/catalog")
async def lut_catalog(request):
    channel = request.query.get("channel")
    try:
        return web.json_response(catalog_with_install_state(channel=channel))
    except LutCatalogError as error:
        return web.json_response({"error": str(error)}, status=400)


@routes.get("/bv_nodepack/luts/catalog/status")
async def lut_catalog_refresh_status(_request):
    return web.json_response(lut_catalog_status())


@routes.put("/bv_nodepack/luts/catalog/channel")
async def lut_catalog_channel(request):
    try:
        body = await request.json()
        return web.json_response(select_lut_catalog_channel(str(body.get("channel") or "")))
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
    body = await request.json()
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

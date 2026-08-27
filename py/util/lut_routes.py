from __future__ import annotations

import aiohttp
from aiohttp import web
from server import PromptServer

from .lut_catalog import catalog_with_install_state, install_catalog_lut
from ..nodes.bv_lut_prototype import DOWNLOAD_MORE, _lut_choices


routes = PromptServer.instance.routes


@routes.get("/bv_nodepack/luts/catalog")
async def lut_catalog(_request):
    return web.json_response(catalog_with_install_state())


@routes.get("/bv_nodepack/luts/models")
async def lut_models(_request):
    return web.json_response({"version": 1, "luts": [item for item in _lut_choices() if item != DOWNLOAD_MORE]})


@routes.post("/bv_nodepack/luts/install")
async def lut_install(request):
    body = await request.json()
    entry_id = str(body.get("id") or "")
    try:
        result = await install_catalog_lut(entry_id)
    except KeyError as error:
        raise web.HTTPNotFound(text=str(error)) from error
    except FileExistsError as error:
        raise web.HTTPConflict(text=str(error)) from error
    except (ValueError, OSError, aiohttp.ClientError) as error:
        raise web.HTTPBadRequest(text=str(error)) from error
    return web.json_response({"version": 1, "installed": result})

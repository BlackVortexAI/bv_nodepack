import asyncio

import folder_paths
from aiohttp import web
from server import PromptServer

from .lora_registry import discover_loras, lora_preview_path


routes = PromptServer.instance.routes


@routes.get("/bv_nodepack/loras/catalog")
async def lora_catalog(_request):
    catalog = await asyncio.to_thread(discover_loras, folder_paths)
    return web.json_response(catalog)


@routes.get("/bv_nodepack/loras/preview")
async def lora_preview(request):
    logical_name = request.query.get("name", "")
    try:
        path = await asyncio.to_thread(lora_preview_path, logical_name, folder_paths)
    except ValueError as error:
        raise web.HTTPBadRequest(text=str(error)) from error
    if path is None:
        raise web.HTTPNotFound(text="LoRA preview not found")
    return web.FileResponse(path)

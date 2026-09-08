from __future__ import annotations

import asyncio

from aiohttp import web
from server import PromptServer

from .service import MAX_SELECTED_DATASETS, MAX_TERM_LENGTH, completion_service


routes = PromptServer.instance.routes


@routes.get("/bv_nodepack/completion/status")
async def completion_status(_request):
    return web.json_response(completion_service.status())


@routes.post("/bv_nodepack/completion/search")
async def completion_search(request):
    body = await request.json()
    term = str(body.get("term") or "")[:MAX_TERM_LENGTH]
    try:
        limit = int(body.get("limit") or 20)
    except (TypeError, ValueError):
        limit = 20
    selected = body.get("datasets")
    selected = [str(value) for value in selected[:MAX_SELECTED_DATASETS]] if isinstance(selected, list) else None
    results = await asyncio.to_thread(completion_service.search, term, limit, selected)
    return web.json_response({"version": 1, "results": results})

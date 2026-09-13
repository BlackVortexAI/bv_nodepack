from __future__ import annotations

import asyncio

from aiohttp import web
from server import PromptServer

from ..http_body import RequestBodyError, body_error_response, read_json_object
from .service import MAX_SELECTED_DATASETS, MAX_TERM_LENGTH, completion_service


routes = PromptServer.instance.routes
# A search carries one term of at most MAX_TERM_LENGTH characters plus a handful of dataset names.
MAX_SEARCH_BODY_BYTES = 16384


@routes.get("/bv_nodepack/completion/status")
async def completion_status(_request):
    return web.json_response(completion_service.status())


@routes.post("/bv_nodepack/completion/search")
async def completion_search(request):
    try:
        body = await read_json_object(request, MAX_SEARCH_BODY_BYTES)
    except RequestBodyError as error:
        return body_error_response(error)
    term = str(body.get("term") or "")[:MAX_TERM_LENGTH]
    try:
        limit = int(body.get("limit") or 20)
    except (TypeError, ValueError, OverflowError):  # OverflowError: JSON like 1e999 parses to infinity
        limit = 20
    selected = body.get("datasets")
    selected = [str(value) for value in selected[:MAX_SELECTED_DATASETS]] if isinstance(selected, list) else None
    results = await asyncio.to_thread(completion_service.search, term, limit, selected)
    return web.json_response({"version": 1, "results": results})

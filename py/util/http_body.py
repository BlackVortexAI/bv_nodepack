"""Bounded JSON request bodies for the pack's own HTTP routes.

ComfyUI applies one global upload limit to every route. The pack's routes carry
small JSON documents, so each one states its own cap and stops reading as soon as
the cap is exceeded. The body is streamed; the Content-Length header is never
trusted on its own.
"""
from __future__ import annotations

import json

from aiohttp import web


class RequestBodyError(Exception):
    """A request body that must be answered with a 4xx status before any work happens."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


async def read_json_object(request, limit: int) -> dict:
    """Return the JSON object in the request body.

    Reading stops as soon as more than ``limit`` bytes have arrived; at most one
    extra 8 KiB chunk is consumed before the request is refused with 413.
    """
    raw = bytearray()
    async for chunk in request.content.iter_chunked(8192):
        raw.extend(chunk)
        if len(raw) > limit:
            raise RequestBodyError(413, f"Request body exceeds {limit} bytes")
    try:
        value = json.loads(bytes(raw))
    except (ValueError, TypeError, RecursionError):
        raise RequestBodyError(400, "Request body is not valid JSON") from None
    if not isinstance(value, dict):
        raise RequestBodyError(400, "Request body must be a JSON object")
    return value


def body_error_response(error: RequestBodyError) -> web.Response:
    return web.json_response({"error": error.message}, status=error.status)

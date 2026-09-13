import asyncio
import json
import unittest
from types import SimpleNamespace

from py.util.http_body import RequestBodyError, body_error_response, read_json_object


def request(payload: bytes, chunk_size: int = 8192):
    consumed = []

    async def chunks(_size):
        for start in range(0, len(payload), chunk_size):
            piece = payload[start:start + chunk_size]
            consumed.append(len(piece))
            yield piece

    return SimpleNamespace(content=SimpleNamespace(iter_chunked=chunks)), consumed


class BoundedJsonBodyTests(unittest.TestCase):
    def read(self, payload, limit, chunk_size=8192):
        req, consumed = request(payload, chunk_size)
        return asyncio.run(read_json_object(req, limit)), consumed

    def test_object_within_the_limit_is_returned_unchanged(self):
        value, _ = self.read(json.dumps({"term": "rot", "limit": 5, "datasets": ["a"]}).encode(), 1024)
        self.assertEqual(value, {"term": "rot", "limit": 5, "datasets": ["a"]})

    def test_oversize_body_is_413_and_reading_stops_at_the_cap(self):
        payload = b'{"term": "' + b"x" * 100_000 + b'"}'
        req, consumed = request(payload, chunk_size=512)
        with self.assertRaises(RequestBodyError) as caught:
            asyncio.run(read_json_object(req, 1024))
        self.assertEqual(caught.exception.status, 413)
        self.assertLessEqual(sum(consumed), 1024 + 512, "reader kept consuming after the cap")

    def test_exactly_the_limit_is_still_accepted(self):
        payload = json.dumps({"k": "v" * 10}).encode()
        value, _ = self.read(payload, len(payload))
        self.assertEqual(value["k"], "v" * 10)

    def test_invalid_json_and_non_objects_are_400_without_reaching_the_route(self):
        for payload in (b"", b"{", b"[1, 2]", b'"text"', b"null", b"\xff\xfe\x00", b"1e999999" * 10):
            with self.subTest(payload=payload[:8]):
                with self.assertRaises(RequestBodyError) as caught:
                    self.read(payload, 4096)
                self.assertEqual(caught.exception.status, 400)

    def test_error_response_carries_status_and_message_only(self):
        response = body_error_response(RequestBodyError(413, "Request body exceeds 1024 bytes"))
        self.assertEqual(response.status, 413)
        self.assertEqual(json.loads(response.text), {"error": "Request body exceeds 1024 bytes"})


if __name__ == "__main__":
    unittest.main()

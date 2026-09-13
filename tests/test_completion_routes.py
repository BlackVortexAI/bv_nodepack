import asyncio
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch


class RouteTable:
    def __init__(self):
        self.handlers = {}

    def _register(self, method, path):
        def decorator(handler):
            self.handlers[(method, path)] = handler
            return handler
        return decorator

    def get(self, path):
        return self._register("GET", path)

    def post(self, path):
        return self._register("POST", path)


def request(payload: bytes):
    async def chunks(_size):
        yield payload
    return SimpleNamespace(content=SimpleNamespace(iter_chunked=chunks), remote="192.168.1.20")


class CompletionRouteTests(unittest.TestCase):
    """The public search route parses only a bounded JSON object before any work starts."""

    @classmethod
    def setUpClass(cls):
        cls.routes = RouteTable()
        server = types.ModuleType("server")
        server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=cls.routes))
        module_name = "py.util.completion._routes_contract_test"
        path = Path(__file__).parents[1] / "py" / "util" / "completion" / "routes.py"
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"server": server}):
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        cls.module = module
        cls.search = staticmethod(cls.routes.handlers[("POST", "/bv_nodepack/completion/search")])

    def test_oversize_body_is_refused_before_the_search_runs(self):
        with patch.object(self.module.completion_service, "search", side_effect=AssertionError("must not search")):
            payload = b'{"term": "' + b"x" * (self.module.MAX_SEARCH_BODY_BYTES + 1) + b'"}'
            response = asyncio.run(self.search(request(payload)))
        self.assertEqual(response.status, 413)
        self.assertIn("error", json.loads(response.text))

    def test_malformed_and_non_object_bodies_are_400(self):
        with patch.object(self.module.completion_service, "search", side_effect=AssertionError("must not search")):
            for payload in (b"", b"{", b'["term"]', b"\xff"):
                with self.subTest(payload=payload):
                    self.assertEqual(asyncio.run(self.search(request(payload))).status, 400)

    def test_infinite_or_absurd_limit_values_fall_back_instead_of_failing(self):
        seen = []
        with patch.object(self.module.completion_service, "search", side_effect=lambda t, l, s: seen.append(l) or []):
            for raw in (b'{"term": "a", "limit": 1e999}', b'{"term": "a", "limit": -1e999}',
                        b'{"term": "a", "limit": Infinity}', b'{"term": "a", "limit": NaN}',
                        b'{"term": "a", "limit": [1]}', b'{"term": "a", "limit": "x"}'):
                with self.subTest(raw=raw):
                    self.assertEqual(asyncio.run(self.search(request(raw))).status, 200)
        self.assertEqual(seen, [20] * 6)

    def test_valid_search_still_clips_term_limit_and_datasets(self):
        captured = {}

        def fake_search(term, limit, selected):
            captured.update(term=term, limit=limit, selected=selected)
            return []

        with patch.object(self.module.completion_service, "search", side_effect=fake_search):
            body = {"term": "a" * 1000, "limit": "7", "datasets": [str(i) for i in range(100)]}
            response = asyncio.run(self.search(request(json.dumps(body).encode())))
        self.assertEqual(response.status, 200)
        self.assertEqual(len(captured["term"]), self.module.MAX_TERM_LENGTH)
        self.assertEqual(captured["limit"], 7)
        self.assertEqual(len(captured["selected"]), self.module.MAX_SELECTED_DATASETS)


if __name__ == "__main__":
    unittest.main()

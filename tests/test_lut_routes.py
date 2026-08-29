import asyncio
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from py.util.lut_catalog import LutCatalogConflictError, LutCatalogError


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

    def put(self, path):
        return self._register("PUT", path)

    def post(self, path):
        return self._register("POST", path)


class Request:
    def __init__(self, body=None, query=None):
        self.body = body or {}
        self.query = query or {}

    async def json(self):
        return self.body


class EmptyPostRequest(Request):
    async def json(self):
        raise AssertionError("manual refresh must not require or parse a JSON body")


class LutRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes = RouteTable()
        server = types.ModuleType("server")
        server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=cls.routes))
        module_name = "py.util._lut_routes_contract_test"
        path = Path(__file__).parents[1] / "py" / "util" / "lut_routes.py"
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"server": server}):
            sys.modules[module_name] = module
            spec.loader.exec_module(module)
        cls.module = module

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop("py.util._lut_routes_contract_test", None)

    @staticmethod
    def body(response):
        return json.loads(response.text)

    def test_channel_catalog_and_status_routes_are_registered(self):
        expected = {
            ("GET", "/bv_nodepack/luts/catalog"),
            ("GET", "/bv_nodepack/luts/catalog/status"),
            ("PUT", "/bv_nodepack/luts/catalog/channel"),
            ("POST", "/bv_nodepack/luts/catalog/refresh"),
            ("POST", "/bv_nodepack/luts/install"),
        }
        self.assertTrue(expected.issubset(self.routes.handlers))

    def test_catalog_preview_passes_channel_without_persisting(self):
        handler = self.routes.handlers[("GET", "/bv_nodepack/luts/catalog")]
        with patch.object(self.module, "catalog_with_install_state", return_value={"channel": "experimental", "entries": []}) as catalog:
            response = asyncio.run(handler(Request(query={"channel": "experimental"})))
        self.assertEqual(response.status, 200)
        catalog.assert_called_once_with(channel="experimental")

    def test_channel_switch_returns_immediately_and_invalid_channel_is_400(self):
        handler = self.routes.handlers[("PUT", "/bv_nodepack/luts/catalog/channel")]
        result = {"selected_channel": "experimental", "refresh": {"accepted": True}}
        with patch.object(self.module, "select_lut_catalog_channel", return_value=result):
            response = asyncio.run(handler(Request({"channel": "experimental"})))
        self.assertEqual(response.status, 200)
        self.assertEqual(self.body(response)["selected_channel"], "experimental")
        with patch.object(self.module, "select_lut_catalog_channel", side_effect=LutCatalogError("bad channel")):
            response = asyncio.run(handler(Request({"channel": "invalid"})))
        self.assertEqual(response.status, 400)

    def test_manual_refresh_is_202_and_uses_backend_selected_channel(self):
        handler = self.routes.handlers[("POST", "/bv_nodepack/luts/catalog/refresh")]
        result = {"accepted": True, "coalesced": True, "channel": "stable", "generation": 4}
        with patch.object(self.module, "request_lut_catalog_refresh", return_value=result) as refresh:
            response = asyncio.run(handler(EmptyPostRequest({"channel": "experimental"})))
        self.assertEqual(response.status, 202)
        self.assertTrue(self.body(response)["coalesced"])
        self.assertEqual(self.body(response)["channel"], "stable")
        refresh.assert_called_once_with()

    def test_stale_install_is_409(self):
        handler = self.routes.handlers[("POST", "/bv_nodepack/luts/install")]
        conflict = LutCatalogConflictError("refresh first")
        with patch.object(self.module, "install_catalog_lut", new=AsyncMock(side_effect=conflict)) as install:
            response = asyncio.run(handler(Request({"id": "same", "channel": "stable", "catalog_version": 1})))
        self.assertEqual(response.status, 409)
        self.assertEqual(self.body(response)["error"], "refresh first")
        install.assert_awaited_once_with("same", channel="stable", catalog_version=1)


if __name__ == "__main__":
    unittest.main()

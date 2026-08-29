import importlib.util
from pathlib import Path
import sys
import types
import unittest

from aiohttp import web


ROOT = Path(__file__).parents[1]
sys.path.insert(0, str(ROOT.parent))


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


class LoraRouteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.routes = RouteTable()
        fake_folder_paths = types.SimpleNamespace()
        server = types.ModuleType("server")
        server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=cls.routes))
        cls.original_folder_paths = sys.modules.get("folder_paths")
        cls.original_server = sys.modules.get("server")
        sys.modules["folder_paths"] = fake_folder_paths
        sys.modules["server"] = server
        # Keep this contract test inside the already-loaded local ``py.util``
        # package.  Naming it below ``bv_nodepack`` would import the package
        # root and start unrelated startup workers during test discovery.
        module_name = "py.util._lora_routes_contract_test"
        path = ROOT / "py" / "util" / "lora_routes.py"
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        sys.modules[module_name] = module
        spec.loader.exec_module(module)
        cls.module = module
        cls.fake_folder_paths = fake_folder_paths

    @classmethod
    def tearDownClass(cls):
        sys.modules.pop("py.util._lora_routes_contract_test", None)
        if cls.original_folder_paths is None:
            sys.modules.pop("folder_paths", None)
        else:
            sys.modules["folder_paths"] = cls.original_folder_paths
        if cls.original_server is None:
            sys.modules.pop("server", None)
        else:
            sys.modules["server"] = cls.original_server

    def test_only_local_catalog_and_preview_routes_are_registered(self):
        self.assertIn(("GET", "/bv_nodepack/loras/catalog"), self.routes.handlers)
        self.assertIn(("GET", "/bv_nodepack/loras/preview"), self.routes.handlers)
        lora_paths = {path for (_method, path) in self.routes.handlers if path.startswith("/bv_nodepack/loras/")}
        self.assertEqual(lora_paths, {"/bv_nodepack/loras/catalog", "/bv_nodepack/loras/preview"})

    def test_preview_rejects_free_paths_and_reports_missing_preview(self):
        handler = self.routes.handlers[("GET", "/bv_nodepack/loras/preview")]
        original = self.module.lora_preview_path
        try:
            async def call_with(result=None, error=None):
                self.module.lora_preview_path = lambda *_args: (_ for _ in ()).throw(error) if error else result
                return await handler(types.SimpleNamespace(query={"name": "x.safetensors"}))

            import asyncio
            with self.assertRaises(web.HTTPBadRequest):
                asyncio.run(call_with(error=ValueError("relative only")))
            with self.assertRaises(web.HTTPNotFound):
                asyncio.run(call_with(result=None))
        finally:
            self.module.lora_preview_path = original


if __name__ == "__main__":
    unittest.main()

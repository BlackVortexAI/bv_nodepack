import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from py.util import admin_gate
from py.util.admin_gate import (
    allow_remote_management,
    is_loopback,
    management_allowed,
    management_state,
    server_is_local,
)


class LoopbackTests(unittest.TestCase):
    def test_only_real_loopback_addresses_count(self):
        for address in ("127.0.0.1", "127.2.3.4", "::1"):
            self.assertTrue(is_loopback(address), address)
        for address in ("0.0.0.0", "::", "192.168.1.5", "localhost", "", None, "127.0.0.1, 10.0.0.1"):
            self.assertFalse(is_loopback(address), repr(address))

    def test_server_is_local_requires_every_listen_address_to_be_loopback(self):
        self.assertTrue(server_is_local(["127.0.0.1"]))
        self.assertTrue(server_is_local(["127.0.0.1", "::1"]))
        self.assertFalse(server_is_local(["0.0.0.0", "::"]))
        self.assertFalse(server_is_local(["127.0.0.1", "192.168.1.5"]))
        self.assertFalse(server_is_local([]))
        with patch.object(admin_gate, "listen_addresses", return_value=None):
            self.assertFalse(server_is_local(), "unknown listener never counts as local")
        with patch.object(admin_gate, "listen_addresses", return_value=["127.0.0.1"]):
            self.assertTrue(server_is_local())

    def test_listen_addresses_come_from_comfy_cli_args(self):
        cli = types.ModuleType("comfy.cli_args")
        cli.args = SimpleNamespace(listen="127.0.0.1, ::1")
        comfy = types.ModuleType("comfy")
        comfy.__path__ = []
        with patch.dict(sys.modules, {"comfy": comfy, "comfy.cli_args": cli}):
            self.assertEqual(admin_gate.listen_addresses(), ["127.0.0.1", "::1"])
        with patch.dict(sys.modules, {"comfy": None, "comfy.cli_args": None}):
            self.assertIsNone(admin_gate.listen_addresses())

    def test_empty_listen_entries_make_the_server_non_local(self):
        # ComfyUI passes every split entry to TCPSite, so "127.0.0.1," also binds host "".
        comfy = types.ModuleType("comfy")
        comfy.__path__ = []
        for listen in ("127.0.0.1,", ",127.0.0.1", "127.0.0.1,,::1", " , ", ""):
            cli = types.ModuleType("comfy.cli_args")
            cli.args = SimpleNamespace(listen=listen)
            with self.subTest(listen=listen), patch.dict(sys.modules, {"comfy": comfy, "comfy.cli_args": cli}):
                addresses = admin_gate.listen_addresses()
                self.assertIn("", addresses)
                self.assertFalse(server_is_local(addresses))


class ManagementDecisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.settings = Path(self.temp.name) / "admin_settings.json"

    def request(self, remote):
        return SimpleNamespace(remote=remote)

    def test_local_server_and_local_peer_are_allowed(self):
        allowed, _ = management_allowed(self.request("127.0.0.1"), addresses=["127.0.0.1"], settings_path=self.settings)
        self.assertTrue(allowed)
        allowed, _ = management_allowed(self.request("::1"), addresses=["::1"], settings_path=self.settings)
        self.assertTrue(allowed)

    def test_remote_peer_or_network_listener_is_denied_without_opt_in(self):
        for addresses, remote in (
            (["127.0.0.1"], "192.168.1.20"),
            (["0.0.0.0", "::"], "127.0.0.1"),
            (["0.0.0.0"], "192.168.1.20"),
            (["127.0.0.1"], None),
            (None, "127.0.0.1"),
        ):
            with self.subTest(addresses=addresses, remote=remote):
                allowed, reason = management_allowed(self.request(remote), addresses=addresses if addresses is not None else [], settings_path=self.settings)
                self.assertFalse(allowed)
                self.assertIn("loopback", reason)

    def test_forwarded_headers_are_ignored(self):
        request = SimpleNamespace(remote="10.0.0.9", headers={"X-Forwarded-For": "127.0.0.1", "X-Real-IP": "127.0.0.1"})
        allowed, _ = management_allowed(request, addresses=["127.0.0.1"], settings_path=self.settings)
        self.assertFalse(allowed)

    def test_local_proxy_peer_is_the_accepted_limit_of_the_model(self):
        # A reverse proxy on the same host is a loopback peer; its forwarded origin is not consulted.
        request = SimpleNamespace(remote="127.0.0.1", headers={"X-Forwarded-For": "203.0.113.7"})
        allowed, _ = management_allowed(request, addresses=["127.0.0.1"], settings_path=self.settings)
        self.assertTrue(allowed, "documented limit: the proxy operator administers the host")

    def test_operator_opt_in_requires_a_well_formed_private_file(self):
        self.assertFalse(allow_remote_management(self.settings))
        for payload in ("{}", "[]", "not json", json.dumps({"schema": "bv.admin.settings", "version": 1, "allow_remote_management": "true"}),
                        json.dumps({"schema": "other", "version": 1, "allow_remote_management": True})):
            self.settings.write_text(payload)
            self.assertFalse(allow_remote_management(self.settings), payload)
        self.settings.write_text(json.dumps({"schema": "bv.admin.settings", "version": 1, "allow_remote_management": True}))
        self.assertTrue(allow_remote_management(self.settings))
        allowed, reason = management_allowed(self.request("203.0.113.7"), addresses=["0.0.0.0"], settings_path=self.settings)
        self.assertTrue(allowed)
        self.assertIn("operator", reason)
        self.assertEqual(management_state(addresses=["0.0.0.0"], settings_path=self.settings), {"allowed": True, "local_server": False, "remote_management": True})

    def test_opt_in_is_impossible_without_private_storage(self):
        with patch.object(admin_gate, "default_admin_settings_path", return_value=None):
            self.assertFalse(allow_remote_management())
            allowed, _ = management_allowed(self.request("127.0.0.1"), addresses=["127.0.0.1"])
            self.assertTrue(allowed, "local mode does not need the file")
            allowed, _ = management_allowed(self.request("127.0.0.1"), addresses=["0.0.0.0"])
            self.assertFalse(allowed)

    def test_require_management_returns_403_json(self):
        import asyncio

        async def run():
            with patch.object(admin_gate, "listen_addresses", return_value=["0.0.0.0"]), patch.object(admin_gate, "default_admin_settings_path", return_value=self.settings):
                return admin_gate.require_management(self.request("127.0.0.1"))

        response = asyncio.run(run())
        self.assertEqual(response.status, 403)
        self.assertIn("loopback", response.text)


if __name__ == "__main__":
    unittest.main()

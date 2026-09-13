import json
import unittest
import asyncio
import importlib.util
import sys
import threading
from pathlib import Path
from unittest.mock import patch
from types import SimpleNamespace

from py.util.prompt_assist import assist_text, validate_assist_body, RESPONSE_SCHEMA
from py.util.remote_llm import OpenAICompatibleChatProvider


def body(**changes):
    return dict(text="Eine Frau im roten Mantel", profile_id="test", model="test-model",
                translate=True, improve=True, language="English", system_prompt="Keep the meaning.", **{}) | changes


class FakeProvider:
    def __init__(self, transform=lambda text: text):
        self.transform = transform
        self.calls = []

    def generate_structured(self, request, schema, name):
        self.calls.append((request, schema, name))
        return SimpleNamespace(raw_text=json.dumps({"text": self.transform(json.loads(request.user_prompt)["text"])}), finish_reason="stop")


class PromptAssistTests(unittest.TestCase):
    def test_improvement_only_does_not_require_a_target_language(self):
        self.assertEqual(assist_text(body(translate=False, language=""), provider=FakeProvider()), body()["text"])

    def test_independent_operations_and_single_combined_call(self):
        for translate, improve in ((True, False), (False, True), (True, True)):
            provider = FakeProvider(lambda _: "A woman in a red coat")
            self.assertEqual(assist_text(body(translate=translate, improve=improve), provider=provider), "A woman in a red coat")
            self.assertEqual(len(provider.calls), 1)
            request, schema, name = provider.calls[0]
            self.assertIn("Translate into English" if translate else "Keep the original language", request.system_prompt)
            self.assertIn("Improve grammar" if improve else "Only translate", request.system_prompt)
            self.assertEqual(schema, RESPONSE_SCHEMA)

    def test_style_guidance_is_only_sent_when_improvement_is_enabled(self):
        guidance = "Rewrite everything as a dramatic poem. STYLE_SENTINEL"
        for translate, improve in ((True, False), (False, True), (True, True)):
            with self.subTest(translate=translate, improve=improve):
                provider = FakeProvider()
                original = body(translate=translate, improve=improve,
                                language="French", system_prompt=guidance)
                assist_text(original, provider=provider)
                protocol = provider.calls[0][0].system_prompt
                self.assertEqual(guidance in protocol, improve)
                self.assertEqual("User style guidance:" in protocol, improve)
                self.assertEqual("Translate into French" in protocol, translate)
                self.assertEqual("Keep the original language" in protocol, not translate)
                self.assertIn("Preserve LoRA calls, trigger words", protocol)
                if not improve:
                    self.assertIn("Only translate faithfully", protocol)
                self.assertEqual(original["system_prompt"], guidance)

    def test_exact_markup_comments_and_reference_tokens_survive(self):
        source = "@@subject\n@<detail> Eine Frau @@ mit __BVREF0__ ## privat\n"
        self.assertEqual(assist_text(body(text=source), provider=FakeProvider(lambda text: text.replace("Eine Frau", "A woman"))), source.replace("Eine Frau", "A woman"))

    def test_nested_category_structure_survives_and_reordered_markers_fail(self):
        source = "@<subject> Frau @<detail> rot @@ Mantel @@"
        self.assertEqual(assist_text(body(text=source), provider=FakeProvider()), source)
        with self.assertRaises(ValueError):
            assist_text(body(text=source), provider=FakeProvider(lambda text:text.replace("__BVKEEP0__", "__BVKEEP1__", 1)))

    def test_changed_removed_duplicated_or_new_markup_rejected(self):
        for transform in (lambda s: s.replace("__BVKEEP0__", ""), lambda s: s + "__BVKEEP0__", lambda s: s + "\n@@new\n"):
            with self.subTest(transform=transform), self.assertRaises(ValueError):
                assist_text(body(text="@<detail> Frau @@"), provider=FakeProvider(transform))

    def test_invalid_requests_fail_before_provider(self):
        for changes in ({"text":""}, {"text":"x"*32769}, {"translate":False,"improve":False}, {"translate":"true"}, {"text":"@<detail> unclosed"}, {"endpoint":"https://untrusted.invalid"}):
            provider = FakeProvider()
            with self.subTest(changes=list(changes)), self.assertRaises(ValueError):
                assist_text(body(**changes), provider=provider)
            self.assertFalse(provider.calls)
        for value in (None, [], 1):
            with self.assertRaises(ValueError):
                validate_assist_body(value)

    def test_invalid_and_truncated_responses_rejected(self):
        for raw, finish in (("{\"text\":\"a\",\"text\":\"b\"}", "stop"), ('{"text":"ok","extra":1}', "stop"), ('{"text":"partial"}', "length"), ('{"text":""}', "stop")):
            provider = SimpleNamespace(generate_structured=lambda *args: SimpleNamespace(raw_text=raw, finish_reason=finish))
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                assist_text(body(), provider=provider)

    def test_existing_transport_accepts_assist_schema_without_credentials_in_payload(self):
        calls = []
        def transport(url, headers, payload, timeout):
            calls.append(json.loads(payload))
            return 200, json.dumps({"choices":[{"message":{"content":'{"text":"A woman"}'},"finish_reason":"stop"}]}).encode()
        provider = OpenAICompatibleChatProvider("test", "http://127.0.0.1:11434/v1/chat/completions", "test", lambda:"", auth_mode="none", transport=transport, cache_directory=False)
        self.assertEqual(assist_text(body(), provider=provider), "A woman")
        self.assertEqual(calls[0]["response_format"]["json_schema"], {"name":"bv_prompt_assist", "strict":True, "schema":RESPONSE_SCHEMA})


class AssistEndpointBindingTests(unittest.TestCase):
    """The assist path can only ever reach the endpoint the stored API key was approved for."""

    APPROVED = "https://approved.invalid/v1/chat/completions"
    OTHER = "https://other.invalid/v1/chat/completions"

    def setUp(self):
        import tempfile
        from py.util import remote_llm as remote

        self.remote = remote
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        for name, target in (("default_user_secrets_path", root / "secrets.json"),
                             ("default_user_settings_path", root / "settings.json")):
            patcher = patch.object(remote, name, return_value=target)
            patcher.start()
            self.addCleanup(patcher.stop)
        self.calls = []

        self.timeouts = []

        def transport(url, headers, payload, timeout):
            self.calls.append((url, headers.get("Authorization")))
            self.timeouts.append(timeout)
            return 200, json.dumps({"choices": [{"message": {"content": '{"text":"A woman"}'}, "finish_reason": "stop"}]}).encode()

        transport_patch = patch.object(remote, "_urllib_transport", transport)
        transport_patch.start()
        self.addCleanup(transport_patch.stop)

    def test_assist_uses_only_the_approved_binding_even_when_settings_name_another_endpoint(self):
        self.remote.set_remote_api_key("openai-compatible", "dummy-key", endpoint=self.APPROVED)
        settings = Path(self.temp.name) / "settings.json"
        settings.write_text(json.dumps({"schema": "bv.remote_llm.settings", "version": 1,
                                        "default_profile_id": "openai-compatible",
                                        "profile_defaults": {"openai-compatible": {"custom_endpoint": self.OTHER}}}),
                            encoding="utf-8")
        self.assertEqual(assist_text(body(profile_id="openai-compatible", model="m")), "A woman")
        self.assertEqual(self.calls, [(self.APPROVED, "Bearer dummy-key")])

    def test_assist_uses_the_profiles_configured_timeout_as_its_budget(self):
        self.remote.set_remote_api_key("openai-compatible", "dummy-key", endpoint=self.APPROVED)
        assist_text(body(profile_id="openai-compatible", model="m"))
        self.assertEqual(self.timeouts, [60], "default budget is 60 s")
        settings = Path(self.temp.name) / "settings.json"
        settings.write_text(json.dumps({"schema": "bv.remote_llm.settings", "version": 1,
                                        "default_profile_id": "openai-compatible",
                                        "profile_defaults": {"openai-compatible": {"timeout_seconds": 240}}}),
                            encoding="utf-8")
        assist_text(body(profile_id="openai-compatible", model="m"))
        self.assertEqual(self.timeouts, [60, 240], "the operator's timeout_seconds applies to writing assistance")

    def test_assist_without_an_approved_binding_never_opens_a_connection(self):
        with self.assertRaisesRegex(ValueError, "no approved endpoint"):
            assist_text(body(profile_id="openai-compatible", model="m"))
        self.assertEqual(self.calls, [])

    def test_assist_body_cannot_carry_an_endpoint_and_unknown_profiles_fail_closed(self):
        self.remote.set_remote_api_key("openai-compatible", "dummy-key", endpoint=self.APPROVED)
        with self.assertRaises(ValueError):
            assist_text(body(profile_id="openai-compatible", model="m", endpoint=self.OTHER))
        with self.assertRaises(ValueError):
            assist_text(body(profile_id="no-such-profile", model="m"))
        self.assertEqual(self.calls, [])


class AssistRouteTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        decorators = SimpleNamespace(get=lambda _:lambda f:f, post=lambda _:lambda f:f, delete=lambda _:lambda f:f)
        server = SimpleNamespace(PromptServer=SimpleNamespace(instance=SimpleNamespace(routes=decorators)))
        spec = importlib.util.spec_from_file_location("py.util._assist_test_routes", Path(__file__).parents[1] / "py/util/remote_llm_routes.py")
        self.routes = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {"server":server}):
            spec.loader.exec_module(self.routes)

    def request(self, value=None, raw=None):
        payload = raw if raw is not None else json.dumps(body() if value is None else value).encode()
        async def chunks(_size):
            yield payload
        return SimpleNamespace(content=SimpleNamespace(iter_chunked=chunks), remote="127.0.0.1")

    async def test_denied_request_never_calls_provider(self):
        from aiohttp import web
        with patch.object(self.routes, "require_management", return_value=web.json_response({}, status=403)), patch("py.util.prompt_assist.assist_text") as call:
            self.assertEqual((await self.routes.remote_llm_assist(self.request())).status, 403)
            call.assert_not_called()

    async def test_bounded_request_and_provider_error(self):
        with patch.object(self.routes, "require_management", return_value=None), patch("py.util.prompt_assist.assist_text", side_effect=OSError("secret must not leak")) as call:
            self.assertEqual((await self.routes.remote_llm_assist(self.request(raw=b"x"*196609))).status, 413)
            self.assertEqual((await self.routes.remote_llm_assist(self.request(value=[]))).status, 400)
            call.assert_not_called()
            response = await self.routes.remote_llm_assist(self.request())
            self.assertEqual(response.status, 502)
            self.assertNotIn("secret", response.text)
            self.assertFalse(self.routes._assist_busy)

    async def test_body_cap_admits_the_largest_valid_request(self):
        """The route's byte cap must never refuse what the validator accepts: 32768 text characters
        plus an 8192-character style guide, each up to four UTF-8 bytes as browsers send them."""
        from py.util.prompt_assist import MAX_TEXT
        largest = body(text="\U0001F600" * MAX_TEXT, system_prompt="\U0001F600" * 8192, language="Z" * 80,
                       model="m" * 200, profile_id="p" * 100)
        encoded = json.dumps(largest, ensure_ascii=False).encode("utf-8")  # JSON.stringify does not escape
        self.assertLessEqual(len(encoded), self.routes.MAX_ASSIST_BODY_BYTES)
        with patch.object(self.routes, "require_management", return_value=None), \
                patch("py.util.prompt_assist.assist_text", return_value="ok") as call:
            response = await self.routes.remote_llm_assist(self.request(raw=encoded))
            self.assertEqual(response.status, 200)
            call.assert_called_once()

    async def test_success_returns_only_the_field_text(self):
        with patch.object(self.routes, "require_management", return_value=None), patch("py.util.prompt_assist.assist_text", return_value="A woman") as call:
            response = await self.routes.remote_llm_assist(self.request())
            self.assertEqual(response.status, 200)
            self.assertEqual(json.loads(response.text), {"text":"A woman"})
            call.assert_called_once()

    async def test_real_transport_budget_overrun_frees_the_slot_for_the_next_request(self):
        import socket
        import threading
        from py.util.remote_llm import OpenAICompatibleChatProvider

        stop = threading.Event()
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)

        def stall():
            try:
                conn, _ = listener.accept()
            except OSError:
                return
            with conn:
                try:
                    conn.recv(65536)
                    conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n")
                    while not stop.is_set():
                        conn.sendall(b"{")
                        stop.wait(0.2)
                except OSError:
                    pass

        threading.Thread(target=stall, daemon=True).start()
        self.addCleanup(listener.close)
        self.addCleanup(stop.set)
        url = f"http://127.0.0.1:{listener.getsockname()[1]}/v1/chat/completions"
        provider = OpenAICompatibleChatProvider("stall", url, "m", lambda: "", auth_mode="none",
                                                timeout_seconds=5, cache_directory=False)
        with patch.object(self.routes, "require_management", return_value=None), \
                patch("py.util.prompt_assist.build_remote_provider", return_value=provider), \
                patch("py.util.prompt_assist.profile_timeout_seconds", return_value=5):
            first = await self.routes.remote_llm_assist(self.request())
            self.assertEqual(first.status, 502)
            self.assertNotIn("time budget", first.text)  # generic message only
            self.assertFalse(self.routes._assist_busy)
        with patch.object(self.routes, "require_management", return_value=None), \
                patch("py.util.prompt_assist.assist_text", return_value="next"):
            second = await self.routes.remote_llm_assist(self.request())
            self.assertEqual(second.status, 200)

    async def test_worker_is_off_eventloop_and_busy_survives_browser_cancellation(self):
        started, release = threading.Event(), threading.Event()
        loop_thread = threading.get_ident()
        def worker(_body):
            self.assertNotEqual(threading.get_ident(), loop_thread)
            started.set()
            release.wait(3)
            return "A woman"
        with patch.object(self.routes, "require_management", return_value=None), patch("py.util.prompt_assist.assist_text", side_effect=worker):
            first = asyncio.create_task(self.routes.remote_llm_assist(self.request()))
            try:
                for _ in range(100):
                    if started.is_set(): break
                    await asyncio.sleep(.01)
                self.assertTrue(started.is_set())
                first.cancel()
                with self.assertRaises(asyncio.CancelledError): await first
                self.assertEqual((await self.routes.remote_llm_assist(self.request())).status, 429)
            finally:
                release.set()
            for _ in range(100):
                if not self.routes._assist_busy: break
                await asyncio.sleep(.01)
            self.assertFalse(self.routes._assist_busy)


if __name__ == "__main__":
    unittest.main()

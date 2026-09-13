import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from py.util import remote_llm as remote_llm_module
from py.util.regional.prompt_enhancer import LLMRequest
from py.util.remote_llm import (
    OpenAICompatibleChatProvider,
    RemoteLLMProviderError,
    build_remote_provider,
    ensure_user_settings_file,
    load_provider_catalog,
    load_user_defaults,
    delete_remote_api_key,
    get_remote_api_key,
    remote_api_key_status,
    set_remote_api_key,
)


OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions"
VENICE_CHAT_COMPLETIONS_URL = "https://api.venice.ai/api/v1/chat/completions"
ABACUS_CHAT_COMPLETIONS_URL = "https://routellm.abacus.ai/v1/chat/completions"
OLLAMA_CHAT_COMPLETIONS_URL = "http://127.0.0.1:11434/v1/chat/completions"


def request(seed=42):
    return LLMRequest(
        system_prompt="immutable system protocol",
        user_prompt="regional payload",
        repair_protocol="repair protocol",
        max_output_tokens=2048,
        seed=seed,
        prompt_bundle_version=1,
        prompt_bundle_hash="abc123",
        policy_id="balanced_v1",
        prompt_language="natural_language",
        creativity=0.5,
    )


class RemoteLLMProviderTests(unittest.TestCase):
    def test_venice_profile_uses_fixed_endpoint_secret_header_and_strict_schema(self):
        captured = {}

        def transport(url, headers, body, timeout):
            captured.update(url=url, headers=headers, payload=json.loads(body), timeout=timeout)
            response = {
                "choices": [
                    {
                        "message": {"content": '{"schema_version":1}'},
                        "finish_reason": "stop",
                    }
                ]
            }
            return 200, json.dumps(response).encode()

        provider = build_remote_provider(
            "Venice", "zai-org-glm-5-1",
            "low", 45, transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=False
        )
        response = provider.generate(request())

        self.assertEqual(captured["url"], VENICE_CHAT_COMPLETIONS_URL)
        self.assertEqual(captured["headers"]["Authorization"], "Bearer secret-value")
        self.assertEqual(captured["timeout"], 45)
        self.assertEqual(captured["payload"]["messages"][0], {"role": "system", "content": "immutable system protocol"})
        self.assertEqual(captured["payload"]["messages"][1], {"role": "user", "content": "regional payload"})
        self.assertTrue(captured["payload"]["response_format"]["json_schema"]["strict"])
        self.assertFalse(captured["payload"]["venice_parameters"]["include_venice_system_prompt"])
        self.assertEqual(captured["payload"]["reasoning_effort"], "low")
        self.assertEqual(captured["payload"]["seed"], 42)
        self.assertEqual(response.raw_text, '{"schema_version":1}')
        self.assertEqual(response.provider_id, "venice_chat_completions")
        self.assertEqual(response.model_identity, "zai-org-glm-5-1")

    def test_zero_seed_and_disabled_reasoning_are_omitted(self):
        captured = {}

        def transport(_url, _headers, body, _timeout):
            captured.update(json.loads(body))
            return 200, b'{"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}'

        build_remote_provider(
            "OpenAI", "model", "none", 60,
            transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=False
        ).generate(request(seed=0))

        self.assertNotIn("seed", captured)
        self.assertNotIn("reasoning_effort", captured)

    def test_missing_api_key_fails_before_transport(self):
        provider = build_remote_provider(
            "Venice", "model", "none", 60,
            transport=lambda *_args: self.fail("must not call"), api_key_resolver=lambda: "", cache_directory=False
        )
        with self.assertRaisesRegex(ValueError, "not configured"):
            provider.generate(request())

    def test_http_error_redacts_api_key(self):
        def transport(*_args):
            return 401, b'{"error":"token secret-value rejected"}'

        provider = build_remote_provider(
            "Venice", "model", "none", 60,
            transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=False
        )
        with self.assertRaises(RemoteLLMProviderError) as caught:
            provider.generate(request())

        self.assertIn("HTTP 401", str(caught.exception))
        self.assertNotIn("secret-value", str(caught.exception))
        self.assertIn("[REDACTED]", str(caught.exception))

    def test_invalid_chat_completion_shape_fails_explicitly(self):
        provider = build_remote_provider(
            "Venice", "model", "none", 60,
            transport=lambda *_args: (200, b'{"choices":[]}'), api_key_resolver=lambda: "secret-value", cache_directory=False
        )
        with self.assertRaisesRegex(RemoteLLMProviderError, "invalid Chat Completions response"):
            provider.generate(request())

    def test_openai_profile_uses_fixed_openai_endpoint(self):
        provider = build_remote_provider(
            "OpenAI", "gpt-5-mini", "none", 60
        )
        self.assertEqual(provider.endpoint, OPENAI_CHAT_COMPLETIONS_URL)
        self.assertEqual(provider.provider_id, "openai_chat_completions")

    def test_custom_bearer_profile_uses_only_the_approved_key_binding(self):
        with tempfile.TemporaryDirectory() as directory:
            secrets = Path(directory) / "secrets.json"
            with patch.object(remote_llm_module, "default_user_secrets_path", return_value=secrets):
                with self.assertRaisesRegex(ValueError, "no approved endpoint"):
                    build_remote_provider("OpenAI Compatible", "local-model", "none", 60)
                set_remote_api_key(
                    "openai-compatible", "dummy-key", endpoint="https://compatible.invalid/v1/chat/completions"
                )
                provider = build_remote_provider("OpenAI Compatible", "local-model", "none", 60)
        self.assertEqual(provider.endpoint, "https://compatible.invalid/v1/chat/completions")
        self.assertEqual(provider.provider_id, "openai-compatible_chat_completions")

    def test_custom_bearer_profile_rejects_remote_plain_http_at_key_save(self):
        with tempfile.TemporaryDirectory() as directory:
            secrets = Path(directory) / "secrets.json"
            with patch.object(remote_llm_module, "default_user_secrets_path", return_value=secrets):
                with self.assertRaisesRegex(ValueError, "HTTPS or loopback HTTP"):
                    set_remote_api_key(
                        "openai-compatible", "dummy-key", endpoint="http://example.com/v1/chat/completions"
                    )
            self.assertFalse(secrets.exists())

    def test_packaged_catalog_contains_abacus_strict_chat_profile(self):
        profiles = {profile.id: profile for profile in load_provider_catalog()}
        self.assertEqual(profiles["abacus"].endpoint, ABACUS_CHAT_COMPLETIONS_URL)
        self.assertEqual(profiles["abacus"].default_model, "route-llm")
        self.assertEqual(profiles["abacus"].adapter, "openai_chat")

    def test_abacus_profile_uses_catalog_endpoint(self):
        provider = build_remote_provider(
            "Abacus.AI", "route-llm", "none", 60
        )
        self.assertEqual(provider.endpoint, ABACUS_CHAT_COMPLETIONS_URL)
        self.assertEqual(provider.provider_id, "abacus_chat_completions")

    def test_ollama_profile_uses_loopback_without_api_key_or_authorization_header(self):
        captured = {}

        def transport(url, headers, body, _timeout):
            captured.update(url=url, headers=headers, payload=json.loads(body))
            return 200, b'{"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}'

        provider = build_remote_provider(
            "Ollama (Local)", "qwen3:4b", "none", 60,
            transport=transport, api_key_resolver=lambda: "", cache_directory=False,
        )
        response = provider.generate(request(seed=0))

        self.assertEqual(captured["url"], OLLAMA_CHAT_COMPLETIONS_URL)
        self.assertNotIn("Authorization", captured["headers"])
        self.assertEqual(captured["payload"]["model"], "qwen3:4b")
        self.assertEqual(response.provider_id, "ollama_chat_completions")
        self.assertTrue(provider.capabilities.local_execution)

    def test_packaged_catalog_contains_common_local_openai_compatible_profiles(self):
        profiles = {profile.id: profile for profile in load_provider_catalog()}
        self.assertEqual(
            {"ollama", "lm-studio", "llama-cpp", "vllm", "localai", "local-openai-compatible"},
            {profile_id for profile_id in profiles if profiles[profile_id].local_execution},
        )
        custom = profiles["local-openai-compatible"]
        self.assertTrue(custom.allow_custom_endpoint)
        self.assertEqual(custom.auth_mode, "none")

    def test_local_custom_profile_endpoint_comes_from_settings_file_only(self):
        with tempfile.TemporaryDirectory() as directory:
            settings = Path(directory) / "remote_llm_settings.json"
            default = build_remote_provider(
                "Local OpenAI Compatible (Custom)", "my-local-model", "none", 60, settings_path=settings
            )
            self.assertEqual(default.endpoint, "http://127.0.0.1:1234/v1/chat/completions")
            settings.write_text(json.dumps({
                "schema": "bv.remote_llm.settings", "version": 1, "default_profile_id": "openai-compatible",
                "profile_defaults": {"local-openai-compatible": {"custom_endpoint": "http://localhost:5000/v1/chat/completions"}},
            }), encoding="utf-8")
            provider = build_remote_provider(
                "Local OpenAI Compatible (Custom)", "my-local-model", "none", 60, settings_path=settings
            )
            self.assertEqual(provider.endpoint, "http://localhost:5000/v1/chat/completions")
            self.assertEqual(provider.auth_mode, "none")
            settings.write_text(json.dumps({
                "schema": "bv.remote_llm.settings", "version": 1, "default_profile_id": "openai-compatible",
                "profile_defaults": {"local-openai-compatible": {"custom_endpoint": "http://example.com/v1/chat/completions"}},
            }), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "HTTPS or loopback HTTP"):
                build_remote_provider(
                    "Local OpenAI Compatible (Custom)", "my-local-model", "none", 60, settings_path=settings
                )

    def test_user_settings_are_created_once_and_never_contain_secret_values(self):
        profiles = load_provider_catalog()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "remote_llm_settings.json"
            ensure_user_settings_file(path, profiles)
            original = path.read_text(encoding="utf-8")
            ensure_user_settings_file(path, profiles)
            self.assertEqual(path.read_text(encoding="utf-8"), original)

        value = json.loads(original)
        self.assertEqual(value["default_profile_id"], "openai-compatible")
        self.assertNotIn("api_key", original.casefold())

    def test_user_defaults_override_catalog_without_changing_catalog(self):
        profiles = load_provider_catalog()
        settings = {
            "schema": "bv.remote_llm.settings",
            "version": 1,
            "default_profile_id": "abacus",
            "profile_defaults": {
                "abacus": {
                    "model": "gpt-5-mini",
                    "reasoning_effort": "low",
                    "timeout_seconds": 90
                }
            }
        }
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "remote_llm_settings.json"
            path.write_text(json.dumps(settings), encoding="utf-8")
            defaults = load_user_defaults(profiles, path)

        self.assertEqual(defaults.profile_id, "abacus")
        self.assertEqual(defaults.model, "gpt-5-mini")
        self.assertEqual(defaults.timeout_seconds, 90)
        self.assertEqual(next(profile for profile in profiles if profile.id == "abacus").default_model, "route-llm")

    def test_secret_store_roundtrip_status_and_delete(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "remote_llm_secrets.json"
            set_remote_api_key("venice", "secret-value", path)
            self.assertEqual(get_remote_api_key("venice", path), "secret-value")
            self.assertEqual(remote_api_key_status(path), {"venice": True})
            delete_remote_api_key("venice", path)
            self.assertEqual(remote_api_key_status(path), {})
            with self.assertRaisesRegex(ValueError, "No API key"):
                get_remote_api_key("venice", path)

    def test_identical_request_uses_persistent_cache_without_second_transport_call(self):
        calls = 0

        def transport(*_args):
            nonlocal calls
            calls += 1
            return 200, b'{"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}'

        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / "cache"
            first = build_remote_provider(
                "Venice", "model", "none", 60,
                transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=cache,
            )
            second = build_remote_provider(
                "Venice", "model", "none", 60,
                transport=transport, api_key_resolver=lambda: "different-secret", cache_directory=cache,
            )
            self.assertEqual(first.generate(request()).raw_text, "{}")
            self.assertEqual(second.generate(request()).raw_text, "{}")
            self.assertEqual(len(list(cache.glob("*.json"))), 1)

        self.assertEqual(calls, 1)

    def test_cache_key_changes_when_effective_request_changes(self):
        calls = 0

        def transport(*_args):
            nonlocal calls
            calls += 1
            return 200, b'{"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}'

        with tempfile.TemporaryDirectory() as directory:
            provider = build_remote_provider(
                "Venice", "model", "none", 60,
                transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=Path(directory),
            )
            provider.generate(request(seed=1))
            provider.generate(request(seed=2))

        self.assertEqual(calls, 2)


if __name__ == "__main__":
    unittest.main()


class TransportDeadlineTests(unittest.TestCase):
    """The real urllib transport treats ``timeout`` as one wall-clock budget for the whole exchange."""

    def start_server(self, handler_factory):
        from http.server import ThreadingHTTPServer
        import threading

        server = ThreadingHTTPServer(("127.0.0.1", 0), handler_factory)
        server.daemon_threads = True
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        return f"http://127.0.0.1:{server.server_address[1]}/v1/chat/completions"

    def test_slow_drip_body_is_cut_off_by_the_time_budget(self):
        import threading
        import time
        from http.server import BaseHTTPRequestHandler

        stop = threading.Event()
        self.addCleanup(stop.set)

        class Drip(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", "100000")
                self.end_headers()
                try:
                    while not stop.is_set():
                        self.wfile.write(b" ")
                        self.wfile.flush()
                        stop.wait(0.2)
                except OSError:
                    pass

        url = self.start_server(Drip)
        started = time.monotonic()
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            remote_llm_module._urllib_transport(url, {"Content-Type": "application/json"}, b"{}", 1)
        self.assertLess(time.monotonic() - started, 4.0)

    def test_complete_response_is_read_whole_and_fits_the_budget(self):
        from http.server import BaseHTTPRequestHandler

        payload = json.dumps({"choices": [{"message": {"content": "x" * 200_000}, "finish_reason": "stop"}]}).encode()

        class Whole(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

        url = self.start_server(Whole)
        status, body = remote_llm_module._urllib_transport(url, {"Content-Type": "application/json"}, b"{}", 5)
        self.assertEqual((status, body), (200, payload))

    def test_provider_slot_and_error_path_survive_a_budget_overrun(self):
        import threading
        from http.server import BaseHTTPRequestHandler

        stop = threading.Event()
        self.addCleanup(stop.set)

        class Stall(BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass

            def do_POST(self):
                self.rfile.read(int(self.headers.get("Content-Length", "0")))
                self.send_response(200)
                self.send_header("Content-Length", "100000")
                self.end_headers()
                try:
                    while not stop.is_set():
                        self.wfile.write(b"{")
                        self.wfile.flush()
                        stop.wait(0.2)
                except OSError:
                    pass

        url = self.start_server(Stall)
        provider = OpenAICompatibleChatProvider(
            "budget-test", url, "model", lambda: "", auth_mode="none", timeout_seconds=5, cache_directory=False,
        )
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            provider.generate(request())
        # The provider is reusable afterwards: the failure did not leave a lock or partial state behind.
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            provider.generate(request(seed=7))


def _read_http_request(conn) -> bytes:
    """Read one HTTP request completely (headers plus Content-Length body) before answering.

    Answering after a partial read races the client's body write and can reset the
    connection, which would make a test fail for a reason unrelated to the transport.
    """
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = conn.recv(65536)
        if not chunk:
            return data
        data += chunk
    head, _, body = data.partition(b"\r\n\r\n")
    length = 0
    for line in head.split(b"\r\n"):
        if line.lower().startswith(b"content-length:"):
            length = int(line.split(b":", 1)[1].strip() or 0)
    while len(body) < length:
        chunk = conn.recv(65536)
        if not chunk:
            break
        body += chunk
    return data


class TransportBudgetPhasesTests(unittest.TestCase):
    """Every phase after name resolution ends at the budget: status line, headers, chunk framing, error bodies."""

    def start_raw_server(self, serve):
        import socket
        import threading

        stop = threading.Event()
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(10)

        def run():
            try:
                conn, _ = listener.accept()
            except OSError:
                return
            with conn:
                conn.settimeout(10)
                try:
                    _read_http_request(conn)
                    serve(conn, stop)
                except OSError:
                    pass

        thread = threading.Thread(target=run, daemon=True)
        thread.start()
        self.addCleanup(listener.close)
        self.addCleanup(stop.set)
        return f"http://127.0.0.1:{listener.getsockname()[1]}/v1/chat/completions"

    @staticmethod
    def drip(conn, stop, prefix: bytes, byte: bytes = b"a", interval: float = 0.2):
        conn.sendall(prefix)
        while not stop.is_set():
            conn.sendall(byte)
            stop.wait(interval)

    def assert_budget_error(self, url, budget=1, allowance=3.0):
        import time

        started = time.monotonic()
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            remote_llm_module._urllib_transport(url, {"Content-Type": "application/json"}, b"{}", budget)
        self.assertLess(time.monotonic() - started, budget + allowance)

    def test_status_line_that_never_completes_is_cut_off(self):
        self.assert_budget_error(self.start_raw_server(lambda c, s: self.drip(c, s, b"HTTP/1.1 20")))

    def test_headers_that_never_complete_are_cut_off(self):
        self.assert_budget_error(self.start_raw_server(
            lambda c, s: self.drip(c, s, b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nX-Slow: ")))

    def test_chunked_body_with_a_trickling_chunk_header_is_cut_off(self):
        head = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n"
        self.assert_budget_error(self.start_raw_server(lambda c, s: self.drip(c, s, head, byte=b"1")))

    def test_chunked_trailer_that_never_completes_is_cut_off(self):
        head = (b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n"
                b"Trailer: X-Sig\r\n\r\n5\r\nhello\r\n0\r\nX-Sig: ")
        self.assert_budget_error(self.start_raw_server(lambda c, s: self.drip(c, s, head)))

    def test_error_status_with_a_trickling_body_returns_within_the_budget(self):
        import time

        head = b"HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\nContent-Length: 100000\r\n\r\nfail"
        url = self.start_raw_server(lambda c, s: self.drip(c, s, head))
        started = time.monotonic()
        status, body = remote_llm_module._urllib_transport(url, {"Content-Type": "application/json"}, b"{}", 1)
        self.assertEqual(status, 500)
        self.assertLess(len(body), 4097)
        self.assertLess(time.monotonic() - started, 4.0)

    def test_complete_chunked_response_is_read_whole(self):
        payload = json.dumps({"choices": [{"message": {"content": "x" * 5000}, "finish_reason": "stop"}]}).encode()

        def serve(conn, _stop):
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n")
            for start in range(0, len(payload), 1024):
                piece = payload[start:start + 1024]
                conn.sendall(f"{len(piece):x}\r\n".encode() + piece + b"\r\n")
            conn.sendall(b"0\r\n\r\n")

        status, body = remote_llm_module._urllib_transport(self.start_raw_server(serve), {}, b"{}", 5)
        self.assertEqual((status, body), (200, payload))

    def test_watchdog_timer_is_cancelled_after_a_normal_exchange(self):
        import threading

        def serve(conn, _stop):
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\n{}")

        before = {t.name for t in threading.enumerate()}
        remote_llm_module._urllib_transport(self.start_raw_server(serve), {}, b"{}", 30)
        import time
        time.sleep(0.2)
        lingering = [t for t in threading.enumerate() if t.name not in before and isinstance(t, threading.Timer)]
        self.assertEqual(lingering, [])


class TransportBudgetTLSTests(unittest.TestCase):
    """The budget also ends TLS exchanges: stalled handshakes, status lines and framing behind TLS."""

    @classmethod
    def setUpClass(cls):
        import datetime
        import ipaddress
        import ssl
        from cryptography import x509
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.x509.oid import NameOID

        key = ec.generate_private_key(ec.SECP256R1())
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=5))
                .not_valid_after(now + datetime.timedelta(days=1))
                .add_extension(x509.SubjectAlternativeName([x509.DNSName("localhost"),
                                                            x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]), False)
                .add_extension(x509.BasicConstraints(ca=True, path_length=None), True)
                .sign(key, hashes.SHA256()))
        cls.temp = tempfile.TemporaryDirectory()
        cls.cert_path = Path(cls.temp.name) / "cert.pem"
        cls.key_path = Path(cls.temp.name) / "key.pem"
        cls.cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
        cls.key_path.write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                                   serialization.NoEncryption()))
        cls.server_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.server_context.load_cert_chain(str(cls.cert_path), str(cls.key_path))
        cls.client_context = ssl.create_default_context(cafile=str(cls.cert_path))

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def setUp(self):
        import ssl

        # The transport uses the default HTTPS context; trust the test certificate there and nowhere else.
        patcher = patch.object(ssl, "_create_default_https_context", lambda: self.client_context)
        patcher.start()
        self.addCleanup(patcher.stop)

    def start_tls_server(self, serve, handshake=True):
        import socket
        import threading

        stop = threading.Event()
        listener = socket.socket()
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        listener.settimeout(10)

        def run():
            try:
                conn, _ = listener.accept()
            except OSError:
                return
            with conn:
                conn.settimeout(10)
                try:
                    if not handshake:
                        stop.wait(10)  # hold the plain connection open, never answer the ClientHello
                        return
                    tls = self.server_context.wrap_socket(conn, server_side=True)
                    with tls:
                        _read_http_request(tls)
                        serve(tls, stop)
                except OSError:
                    pass

        threading.Thread(target=run, daemon=True).start()
        self.addCleanup(listener.close)
        self.addCleanup(stop.set)
        return f"https://localhost:{listener.getsockname()[1]}/v1/chat/completions"

    @staticmethod
    def drip(conn, stop, prefix: bytes, byte: bytes = b"a", interval: float = 0.2):
        conn.sendall(prefix)
        while not stop.is_set():
            conn.sendall(byte)
            stop.wait(interval)

    def assert_budget_error(self, url, budget=1, allowance=3.0):
        import time

        started = time.monotonic()
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            remote_llm_module._urllib_transport(url, {"Content-Type": "application/json"}, b"{}", budget)
        self.assertLess(time.monotonic() - started, budget + allowance)

    def test_stalled_tls_handshake_is_cut_off(self):
        self.assert_budget_error(self.start_tls_server(None, handshake=False))

    def test_tls_status_line_that_never_completes_is_cut_off(self):
        self.assert_budget_error(self.start_tls_server(lambda c, s: self.drip(c, s, b"HTTP/1.1 20")))

    def test_tls_chunked_body_with_trickling_chunk_header_is_cut_off(self):
        head = b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n5\r\nhello\r\n"
        self.assert_budget_error(self.start_tls_server(lambda c, s: self.drip(c, s, head, byte=b"1")))

    def test_complete_tls_response_is_read_whole(self):
        payload = json.dumps({"choices": [{"message": {"content": "x" * 3000}, "finish_reason": "stop"}]}).encode()

        def serve(conn, _stop):
            conn.sendall(b"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "
                         + str(len(payload)).encode() + b"\r\n\r\n" + payload)

        status, body = remote_llm_module._urllib_transport(self.start_tls_server(serve), {}, b"{}", 5)
        self.assertEqual((status, body), (200, payload))

    def test_untrusted_certificate_is_still_rejected(self):
        import ssl

        with patch.object(ssl, "_create_default_https_context", ssl.create_default_context):
            with self.assertRaisesRegex(RemoteLLMProviderError, "request failed"):
                remote_llm_module._urllib_transport(self.start_tls_server(lambda c, s: None), {}, b"{}", 5)

    def test_provider_over_tls_frees_after_a_budget_overrun(self):
        def stall(conn, stop):
            self.drip(conn, stop, b"HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n", byte=b"{")

        url = self.start_tls_server(stall)
        provider = OpenAICompatibleChatProvider("tls-budget", url, "model", lambda: "k", auth_mode="bearer",
                                                timeout_seconds=5, cache_directory=False)
        with self.assertRaisesRegex(RemoteLLMProviderError, "time budget"):
            provider.generate(request())


class TransportConnectPhaseTests(unittest.TestCase):
    def test_connect_to_an_unreachable_address_ends_within_the_budget(self):
        import time

        started = time.monotonic()
        with self.assertRaises(RemoteLLMProviderError):
            # TEST-NET-1 is reserved and not routed; the attempt must end when the budget does.
            remote_llm_module._urllib_transport("http://192.0.2.1:9/v1/chat/completions", {}, b"{}", 1)
        self.assertLess(time.monotonic() - started, 4.0)


class TransportConnectCandidatesTests(unittest.TestCase):
    """Deterministic connect phase: several resolved addresses share one shrinking budget."""

    def run_transport(self, candidates, fail_after, budget=10):
        """Drive the transport with a fake clock, a fake resolver and a fake socket factory.

        ``candidates`` are getaddrinfo results; ``fail_after`` is the simulated seconds
        each connection attempt burns before failing. Returns the recorded attempts.
        """
        import socket
        from types import SimpleNamespace

        clock = {"now": 1000.0}
        attempts = []

        def fake_getaddrinfo(host, port, *_args, **_kwargs):
            # IPv6 entries carry the real four-field sockaddr with a numeric scope id, as getaddrinfo does.
            return [(socket.AF_INET6 if ":" in address else socket.AF_INET, socket.SOCK_STREAM, 6, "",
                     (address, port, 0, 3) if ":" in address else (address, port)) for address in candidates]

        def fake_factory(address, timeout=None, source_address=None):
            attempts.append((address, round(timeout, 3)))
            clock["now"] += fail_after[len(attempts) - 1]
            raise OSError(111, "connection refused (simulated)")

        fake_time = SimpleNamespace(monotonic=lambda: clock["now"], sleep=lambda *_: None)
        with patch.object(remote_llm_module, "time", fake_time), \
                patch.object(socket, "getaddrinfo", fake_getaddrinfo), \
                patch.object(socket, "create_connection", fake_factory):
            with self.assertRaises(RemoteLLMProviderError) as caught:
                remote_llm_module._urllib_transport("https://provider.invalid/v1/chat/completions", {}, b"{}", budget)
        return attempts, str(caught.exception)

    def test_each_candidate_gets_only_the_remaining_budget_and_none_after_it_is_spent(self):
        attempts, message = self.run_transport(["198.51.100.1", "198.51.100.2", "198.51.100.3"], fail_after=[4.0, 7.0, 1.0])
        self.assertEqual([timeout for _address, timeout in attempts], [10.0, 6.0])  # third never tried
        self.assertEqual([address for address, _timeout in attempts],
                         [("198.51.100.1", 443), ("198.51.100.2", 443)])
        self.assertIn("time budget", message)

    def test_all_candidates_failing_within_budget_reports_the_connection_failure(self):
        attempts, message = self.run_transport(["198.51.100.1", "198.51.100.2"], fail_after=[1.0, 1.0])
        self.assertEqual(len(attempts), 2)
        self.assertIn("request failed", message)

    def test_ipv6_scope_id_from_the_sockaddr_tuple_reaches_the_connection(self):
        # getaddrinfo reports the scope as sockaddr[3]; it must be re-attached to the numeric host.
        attempts, _message = self.run_transport(["fe80::1", "198.51.100.9"], fail_after=[1.0, 1.0])
        self.assertEqual(attempts[0][0], ("fe80::1%3", 443))
        self.assertEqual(attempts[1][0], ("198.51.100.9", 443))

    def test_textually_scoped_ipv6_address_is_not_scoped_twice(self):
        attempts, _message = self.run_transport(["fe80::1%eth0"], fail_after=[1.0])
        self.assertEqual(attempts[0][0], ("fe80::1%eth0", 443))

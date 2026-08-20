import json
from pathlib import Path
import tempfile
import unittest

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
            "Venice", "https://ignored.invalid/v1/chat/completions", "zai-org-glm-5-1",
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
            "OpenAI", "https://ignored.invalid", "model", "none", 60,
            transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=False
        ).generate(request(seed=0))

        self.assertNotIn("seed", captured)
        self.assertNotIn("reasoning_effort", captured)

    def test_missing_api_key_fails_before_transport(self):
        provider = build_remote_provider(
            "Venice", "https://ignored.invalid", "model", "none", 60,
            transport=lambda *_args: self.fail("must not call"), api_key_resolver=lambda: "", cache_directory=False
        )
        with self.assertRaisesRegex(ValueError, "not configured"):
            provider.generate(request())

    def test_http_error_redacts_api_key(self):
        def transport(*_args):
            return 401, b'{"error":"token secret-value rejected"}'

        provider = build_remote_provider(
            "Venice", "https://ignored.invalid", "model", "none", 60,
            transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=False
        )
        with self.assertRaises(RemoteLLMProviderError) as caught:
            provider.generate(request())

        self.assertIn("HTTP 401", str(caught.exception))
        self.assertNotIn("secret-value", str(caught.exception))
        self.assertIn("[REDACTED]", str(caught.exception))

    def test_invalid_chat_completion_shape_fails_explicitly(self):
        provider = build_remote_provider(
            "Venice", "https://ignored.invalid", "model", "none", 60,
            transport=lambda *_args: (200, b'{"choices":[]}'), api_key_resolver=lambda: "secret-value", cache_directory=False
        )
        with self.assertRaisesRegex(RemoteLLMProviderError, "invalid Chat Completions response"):
            provider.generate(request())

    def test_openai_profile_uses_fixed_openai_endpoint(self):
        provider = build_remote_provider(
            "OpenAI", "https://attacker.invalid/v1/chat/completions", "gpt-5-mini", "none", 60
        )
        self.assertEqual(provider.endpoint, OPENAI_CHAT_COMPLETIONS_URL)
        self.assertEqual(provider.provider_id, "openai_chat_completions")

    def test_custom_profile_uses_validated_custom_endpoint(self):
        provider = build_remote_provider(
            "OpenAI Compatible", "http://127.0.0.1:1234/v1/chat/completions", "local-model", "none", 60
        )
        self.assertEqual(provider.endpoint, "http://127.0.0.1:1234/v1/chat/completions")
        self.assertEqual(provider.provider_id, "openai-compatible_chat_completions")

    def test_custom_profile_rejects_remote_plain_http(self):
        with self.assertRaisesRegex(ValueError, "HTTPS or loopback HTTP"):
            build_remote_provider(
                "OpenAI Compatible", "http://example.com/v1/chat/completions", "model", "none", 60
            )

    def test_packaged_catalog_contains_abacus_strict_chat_profile(self):
        profiles = {profile.id: profile for profile in load_provider_catalog()}
        self.assertEqual(profiles["abacus"].endpoint, ABACUS_CHAT_COMPLETIONS_URL)
        self.assertEqual(profiles["abacus"].default_model, "route-llm")
        self.assertEqual(profiles["abacus"].adapter, "openai_chat")

    def test_abacus_profile_uses_catalog_endpoint(self):
        provider = build_remote_provider(
            "Abacus.AI", "https://attacker.invalid/v1/chat/completions", "route-llm", "none", 60
        )
        self.assertEqual(provider.endpoint, ABACUS_CHAT_COMPLETIONS_URL)
        self.assertEqual(provider.provider_id, "abacus_chat_completions")

    def test_ollama_profile_uses_loopback_without_api_key_or_authorization_header(self):
        captured = {}

        def transport(url, headers, body, _timeout):
            captured.update(url=url, headers=headers, payload=json.loads(body))
            return 200, b'{"choices":[{"message":{"content":"{}"},"finish_reason":"stop"}]}'

        provider = build_remote_provider(
            "Ollama (Local)", "https://ignored.invalid", "qwen3:4b", "none", 60,
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

    def test_local_custom_profile_accepts_loopback_endpoint_without_authentication(self):
        provider = build_remote_provider(
            "Local OpenAI Compatible (Custom)",
            "http://localhost:5000/v1/chat/completions",
            "my-local-model", "none", 60,
        )
        self.assertEqual(provider.endpoint, "http://localhost:5000/v1/chat/completions")
        self.assertEqual(provider.auth_mode, "none")

    def test_user_settings_are_created_once_and_never_contain_secret_values(self):
        profiles = load_provider_catalog()
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "remote_llm_settings.json"
            ensure_user_settings_file(path, profiles)
            original = path.read_text(encoding="utf-8")
            ensure_user_settings_file(path, profiles)

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
                "Venice", "https://ignored.invalid", "model", "none", 60,
                transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=cache,
            )
            second = build_remote_provider(
                "Venice", "https://ignored.invalid", "model", "none", 60,
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
                "Venice", "https://ignored.invalid", "model", "none", 60,
                transport=transport, api_key_resolver=lambda: "secret-value", cache_directory=Path(directory),
            )
            provider.generate(request(seed=1))
            provider.generate(request(seed=2))

        self.assertEqual(calls, 2)


if __name__ == "__main__":
    unittest.main()

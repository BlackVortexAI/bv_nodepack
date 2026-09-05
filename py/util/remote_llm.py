from __future__ import annotations

import json
import hashlib
import ipaddress
import re
import tempfile
import threading
from contextlib import nullcontext
import urllib.error
import urllib.parse
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .regional.prompt_enhancer import LLMCapabilities, LLMRequest, LLMResponse


MAX_HTTP_RESPONSE_BYTES = 1_048_576
PROVIDER_CATALOG_PATH = Path(__file__).resolve().parents[2] / "data" / "ai" / "providers" / "remote_llm_providers_v1.json"
USER_SETTINGS_FILENAME = "remote_llm_settings.json"
USER_SECRETS_FILENAME = "remote_llm_secrets.json"
REMOTE_CACHE_SCHEMA = "bv.remote_llm.response-cache"
_REMOTE_CACHE_LOCK = threading.RLock()
_REMOTE_SECRETS_LOCK = threading.RLock()
SUPPORTED_ADAPTERS = frozenset({"openai_chat"})
SUPPORTED_REQUEST_PROFILES = frozenset({"standard", "venice"})
SUPPORTED_AUTH_MODES = frozenset({"bearer", "none"})

ENHANCEMENT_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "schema_version": {"type": "integer", "const": 1},
        "document_id": {"type": "string"},
        "prompts": {
            "type": "object",
            "properties": {
                scope: {
                    "type": "object",
                    "properties": {
                        "positive_source": {"type": "string"},
                        "negative_source": {"type": "string"},
                    },
                    "required": ["positive_source", "negative_source"],
                    "additionalProperties": False,
                }
                for scope in ("global", "background")
            },
            "required": ["global", "background"],
            "additionalProperties": False,
        },
        "regions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "positive_source": {"type": "string"},
                    "negative_source": {"type": "string"},
                },
                "required": ["id", "positive_source", "negative_source"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["schema_version", "document_id", "prompts", "regions"],
    "additionalProperties": False,
}


class RemoteLLMProviderError(RuntimeError):
    pass


class RemoteLLMConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class RemoteProviderProfile:
    id: str
    label: str
    adapter: str
    endpoint: str
    allow_custom_endpoint: bool
    default_model: str
    request_profile: str
    auth_mode: str
    local_execution: bool


@dataclass(frozen=True)
class RemoteLLMDefaults:
    profile_id: str
    custom_endpoint: str
    model: str
    reasoning_effort: str
    timeout_seconds: int


def _strict_object(value: Any, required: set[str], path: str) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) != required:
        raise RemoteLLMConfigurationError(f"{path} must contain exactly: {', '.join(sorted(required))}")
    return value


def _validated_endpoint(value: Any, path: str) -> str:
    endpoint = str(value)
    if any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in endpoint) or any(char in endpoint for char in "\\?#"):
        raise RemoteLLMConfigurationError(f"{path} contains unsupported URL characters")
    try:
        parsed = urllib.parse.urlsplit(endpoint)
        port = parsed.port
    except ValueError as error:
        raise RemoteLLMConfigurationError(f"{path} is not a valid endpoint") from error
    is_loopback_http = parsed.scheme == "http" and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    if (
        (parsed.scheme != "https" and not is_loopback_http)
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.query
        or parsed.fragment
    ):
        raise RemoteLLMConfigurationError(
            f"{path} must be HTTPS or loopback HTTP without credentials, query, or fragment"
        )
    host = parsed.hostname
    if "%" in host:
        raise RemoteLLMConfigurationError(f"{path} contains an unsupported hostname")
    try:
        host = ipaddress.ip_address(host).compressed
    except ValueError:
        try:
            host = host.encode("idna").decode("ascii").lower()
        except UnicodeError as error:
            raise RemoteLLMConfigurationError(f"{path} contains an invalid hostname") from error
    authority = f"[{host}]" if ":" in host else host
    if port is not None and port != (443 if parsed.scheme == "https" else 80):
        authority += f":{port}"
    return urllib.parse.urlunsplit((parsed.scheme, authority, parsed.path or "/", "", ""))


def load_provider_catalog(path: Path | None = None) -> tuple[RemoteProviderProfile, ...]:
    catalog_path = path or PROVIDER_CATALOG_PATH
    try:
        value = json.loads(catalog_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RemoteLLMConfigurationError(f"Cannot load remote LLM provider catalog '{catalog_path}': {error}") from error
    root = _strict_object(value, {"schema", "version", "profiles"}, "provider catalog")
    if root["schema"] != "bv.remote_llm.providers" or root["version"] != 1:
        raise RemoteLLMConfigurationError("Remote LLM provider catalog schema/version is unsupported")
    if not isinstance(root["profiles"], list) or not root["profiles"]:
        raise RemoteLLMConfigurationError("Remote LLM provider catalog must contain profiles")
    profiles: list[RemoteProviderProfile] = []
    seen_ids: set[str] = set()
    seen_labels: set[str] = set()
    fields = {
        "id", "label", "adapter", "endpoint", "allow_custom_endpoint", "default_model",
        "request_profile", "auth_mode", "local_execution"
    }
    for index, raw_profile in enumerate(root["profiles"]):
        raw = _strict_object(raw_profile, fields, f"profiles[{index}]")
        profile_id = str(raw["id"]).strip()
        label = str(raw["label"]).strip()
        adapter = str(raw["adapter"]).strip()
        model = str(raw["default_model"]).strip()
        request_profile = str(raw["request_profile"]).strip()
        auth_mode = str(raw["auth_mode"]).strip()
        if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", profile_id) or profile_id in seen_ids:
            raise RemoteLLMConfigurationError(f"profiles[{index}].id is invalid or duplicated")
        if not label or label in seen_labels:
            raise RemoteLLMConfigurationError(f"profiles[{index}].label is empty or duplicated")
        if adapter not in SUPPORTED_ADAPTERS:
            raise RemoteLLMConfigurationError(f"profiles[{index}].adapter is unsupported")
        if request_profile not in SUPPORTED_REQUEST_PROFILES:
            raise RemoteLLMConfigurationError(f"profiles[{index}].request_profile is unsupported")
        if auth_mode not in SUPPORTED_AUTH_MODES:
            raise RemoteLLMConfigurationError(f"profiles[{index}].auth_mode is unsupported")
        if not isinstance(raw["allow_custom_endpoint"], bool):
            raise RemoteLLMConfigurationError(f"profiles[{index}].allow_custom_endpoint must be boolean")
        if not isinstance(raw["local_execution"], bool):
            raise RemoteLLMConfigurationError(f"profiles[{index}].local_execution must be boolean")
        if not model or len(model) > 200:
            raise RemoteLLMConfigurationError(f"profiles[{index}] has invalid model")
        profiles.append(RemoteProviderProfile(
            id=profile_id,
            label=label,
            adapter=adapter,
            endpoint=_validated_endpoint(raw["endpoint"], f"profiles[{index}].endpoint"),
            allow_custom_endpoint=raw["allow_custom_endpoint"],
            default_model=model,
            request_profile=request_profile,
            auth_mode=auth_mode,
            local_execution=raw["local_execution"],
        ))
        seen_ids.add(profile_id)
        seen_labels.add(label)
    return tuple(profiles)


def default_user_settings_path() -> Path:
    try:
        import folder_paths
        user_root = Path(folder_paths.get_user_directory())
    except (ImportError, AttributeError):
        user_root = Path.cwd() / "user"
    return user_root / "default" / "bv_nodepack" / USER_SETTINGS_FILENAME


def default_user_secrets_path() -> Path:
    return default_user_settings_path().with_name(USER_SECRETS_FILENAME)


def default_remote_cache_directory() -> Path:
    return default_user_settings_path().parent / "cache" / "remote_llm" / "v1"


def _empty_secrets_document() -> dict[str, Any]:
    return {"schema": "bv.remote_llm.secrets", "version": 2, "api_keys": {}, "endpoints": {}}


def _load_secrets_document(path: Path | None = None) -> dict[str, Any]:
    secrets_path = path or default_user_secrets_path()
    if not secrets_path.exists():
        return _empty_secrets_document()
    try:
        value = json.loads(secrets_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise RemoteLLMConfigurationError(f"Cannot load remote LLM secrets '{secrets_path}': {error}") from error
    fields = {"schema", "version", "api_keys"}
    if isinstance(value, dict) and value.get("version") == 2:
        fields.add("endpoints")
    root = _strict_object(value, fields, "remote LLM secrets")
    if root["schema"] != "bv.remote_llm.secrets" or root["version"] not in {1, 2} or not isinstance(root["api_keys"], dict):
        raise RemoteLLMConfigurationError("Remote LLM secrets schema/version is unsupported")
    if any(not isinstance(key, str) or not isinstance(secret, str) for key, secret in root["api_keys"].items()):
        raise RemoteLLMConfigurationError("Remote LLM secrets contain invalid entries")
    if root["version"] == 2:
        endpoints = root["endpoints"]
        if not isinstance(endpoints, dict) or set(endpoints) != set(root["api_keys"]):
            raise RemoteLLMConfigurationError("Remote LLM secrets require matching endpoint bindings")
        for endpoint in endpoints.values():
            # Explicit null preserves an unapproved legacy key without granting it a destination.
            if endpoint is not None:
                if not isinstance(endpoint, str):
                    raise RemoteLLMConfigurationError("Invalid remote LLM endpoint binding")
                _validated_endpoint(endpoint, "Stored endpoint")
    return root


def _profile(profile_id: str) -> RemoteProviderProfile:
    profile = next((item for item in load_provider_catalog() if item.id == profile_id), None)
    if profile is None:
        raise RemoteLLMConfigurationError("Unknown remote LLM provider profile")
    return profile


def _bound_endpoint(value: dict[str, Any], profile: RemoteProviderProfile) -> str | None:
    if value["version"] == 1:
        return None if profile.allow_custom_endpoint else profile.endpoint
    return value["endpoints"].get(profile.id)


def remote_api_key_endpoint(profile_id: str, path: Path | None = None) -> str | None:
    value = _load_secrets_document(path)
    return _bound_endpoint(value, _profile(profile_id)) if value["api_keys"].get(profile_id) else None


def _upgrade_secrets(value: dict[str, Any]) -> dict[str, Any]:
    if value["version"] == 1:
        profiles = {profile.id: profile for profile in load_provider_catalog()}
        value["endpoints"] = {
            key: _bound_endpoint(value, profiles[key]) if key in profiles else None
            for key in value["api_keys"]
        }
        value["version"] = 2
    return value


def _write_secrets_document(value: dict[str, Any], path: Path | None = None) -> None:
    secrets_path = path or default_user_secrets_path()
    secrets_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_name = None
    try:
        with tempfile.NamedTemporaryFile(
            "w", encoding="utf-8", newline="\n", dir=secrets_path.parent,
            prefix=f".{secrets_path.name}.", suffix=".tmp", delete=False,
        ) as handle:
            temporary_name = handle.name
            json.dump(value, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
        Path(temporary_name).replace(secrets_path)
    except OSError as error:
        if temporary_name:
            Path(temporary_name).unlink(missing_ok=True)
        raise RemoteLLMConfigurationError(f"Cannot save remote LLM secrets '{secrets_path}': {error}") from error


def remote_api_key_status(path: Path | None = None) -> dict[str, bool]:
    return {profile_id: bool(value.strip()) for profile_id, value in _load_secrets_document(path)["api_keys"].items()}


def set_remote_api_key(profile_id: str, api_key: str, path: Path | None = None, *, endpoint: str | None = None) -> None:
    profile = str(profile_id).strip()
    secret = str(api_key).strip()
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", profile):
        raise RemoteLLMConfigurationError("Remote LLM provider profile ID is invalid")
    if not secret or len(secret) > 8192 or any(ord(char) < 32 for char in secret):
        raise RemoteLLMConfigurationError("Remote LLM API key is invalid")
    definition = _profile(profile)
    if definition.auth_mode != "bearer":
        raise RemoteLLMConfigurationError("This provider does not use an API key")
    if endpoint is None and definition.allow_custom_endpoint:
        raise RemoteLLMConfigurationError("Choose and confirm the endpoint when saving this API key")
    approved = _validated_endpoint(endpoint if endpoint is not None else definition.endpoint, "Approved endpoint")
    if not definition.allow_custom_endpoint and approved != definition.endpoint:
        raise RemoteLLMConfigurationError("This provider requires its catalog endpoint")
    with _REMOTE_SECRETS_LOCK:
        value = _upgrade_secrets(_load_secrets_document(path))
        value["api_keys"][profile] = secret
        value["endpoints"][profile] = approved
        _write_secrets_document(value, path)


def delete_remote_api_key(profile_id: str, path: Path | None = None) -> None:
    with _REMOTE_SECRETS_LOCK:
        value = _upgrade_secrets(_load_secrets_document(path))
        value["api_keys"].pop(str(profile_id).strip(), None)
        value["endpoints"].pop(str(profile_id).strip(), None)
        _write_secrets_document(value, path)


def get_remote_api_key(profile_id: str, path: Path | None = None, *, endpoint: str | None = None) -> str:
    profile = _profile(profile_id)
    value = _load_secrets_document(path)
    secret = value["api_keys"].get(profile_id, "").strip()
    if not secret:
        raise RemoteLLMConfigurationError(f"No API key is configured for remote LLM provider '{profile_id}'")
    approved = _bound_endpoint(value, profile)
    if approved is None or (endpoint is None and profile.allow_custom_endpoint):
        raise RemoteLLMConfigurationError("API key has no approved endpoint. Open Configure API Key, verify the destination and save the key again.")
    requested = _validated_endpoint(endpoint if endpoint is not None else profile.endpoint, "Request endpoint")
    if requested != _validated_endpoint(approved, "Approved endpoint"):
        raise RemoteLLMConfigurationError("API key is not approved for this endpoint. Verify the destination in Configure API Key and save the key again.")
    return secret


def _default_settings_document(profiles: tuple[RemoteProviderProfile, ...]) -> dict[str, Any]:
    first = profiles[0]
    return {
        "schema": "bv.remote_llm.settings",
        "version": 1,
        "default_profile_id": first.id,
        "profile_defaults": {},
    }


def ensure_user_settings_file(path: Path, profiles: tuple[RemoteProviderProfile, ...]) -> None:
    if path.exists():
        return
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8", newline="\n") as handle:
            json.dump(_default_settings_document(profiles), handle, ensure_ascii=False, indent=2)
            handle.write("\n")
    except FileExistsError:
        return
    except OSError as error:
        raise RemoteLLMConfigurationError(f"Cannot create remote LLM user settings '{path}': {error}") from error


def load_user_defaults(
    profiles: tuple[RemoteProviderProfile, ...],
    path: Path | None = None,
    create_if_missing: bool = False,
) -> RemoteLLMDefaults:
    settings_path = path or default_user_settings_path()
    if create_if_missing:
        ensure_user_settings_file(settings_path, profiles)
    if not settings_path.exists():
        value = _default_settings_document(profiles)
    else:
        try:
            value = json.loads(settings_path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
            raise RemoteLLMConfigurationError(f"Cannot load remote LLM user settings '{settings_path}': {error}") from error
    root = _strict_object(
        value, {"schema", "version", "default_profile_id", "profile_defaults"}, "remote LLM user settings"
    )
    if root["schema"] != "bv.remote_llm.settings" or root["version"] != 1:
        raise RemoteLLMConfigurationError("Remote LLM user settings schema/version is unsupported")
    by_id = {profile.id: profile for profile in profiles}
    profile_id = str(root["default_profile_id"]).strip()
    if profile_id not in by_id:
        raise RemoteLLMConfigurationError(f"Unknown default remote LLM profile '{profile_id}'")
    if not isinstance(root["profile_defaults"], dict):
        raise RemoteLLMConfigurationError("profile_defaults must be an object")
    unknown = set(root["profile_defaults"]) - set(by_id)
    if unknown:
        raise RemoteLLMConfigurationError(f"Unknown profile defaults: {', '.join(sorted(unknown))}")
    profile = by_id[profile_id]
    override = root["profile_defaults"].get(profile_id, {})
    allowed_override = {"custom_endpoint", "model", "reasoning_effort", "timeout_seconds"}
    if not isinstance(override, dict) or not set(override) <= allowed_override:
        raise RemoteLLMConfigurationError(f"profile_defaults.{profile_id} contains unsupported fields")
    custom_endpoint = str(override.get("custom_endpoint", profile.endpoint)).strip()
    if profile.allow_custom_endpoint:
        custom_endpoint = _validated_endpoint(custom_endpoint, f"profile_defaults.{profile_id}.custom_endpoint")
    else:
        custom_endpoint = profile.endpoint
    model = str(override.get("model", profile.default_model)).strip()
    reasoning_effort = str(override.get("reasoning_effort", "none")).strip()
    timeout_seconds = int(override.get("timeout_seconds", 60))
    if not model or len(model) > 200:
        raise RemoteLLMConfigurationError(f"profile_defaults.{profile_id} has invalid model")
    if reasoning_effort not in {"none", "low", "medium", "high"} or not 5 <= timeout_seconds <= 600:
        raise RemoteLLMConfigurationError(f"profile_defaults.{profile_id} has invalid reasoning effort or timeout")
    return RemoteLLMDefaults(
        profile_id=profile_id,
        custom_endpoint=custom_endpoint,
        model=model,
        reasoning_effort=reasoning_effort,
        timeout_seconds=timeout_seconds,
    )


HttpTransport = Callable[[str, dict[str, str], bytes, int], tuple[int, bytes]]


class _NoRemoteRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RemoteLLMProviderError("Remote LLM redirects are blocked. Configure the final endpoint directly.")


def _urllib_transport(url: str, headers: dict[str, str], body: bytes, timeout: int) -> tuple[int, bytes]:
    request = urllib.request.Request(url, data=body, headers=headers, method="POST")
    try:
        with urllib.request.build_opener(_NoRemoteRedirects()).open(request, timeout=timeout) as response:
            payload = response.read(MAX_HTTP_RESPONSE_BYTES + 1)
            return int(response.status), payload
    except urllib.error.HTTPError as error:
        return int(error.code), error.read(4097)
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        raise RemoteLLMProviderError(f"Remote LLM request failed: {error}") from error


def _safe_error_text(payload: bytes, secret: str) -> str:
    text = payload[:4096].decode("utf-8", errors="replace").strip()
    if secret:
        text = text.replace(secret, "[REDACTED]")
    return text or "empty response"


class OpenAICompatibleChatProvider:
    def __init__(
        self,
        provider_id: str,
        endpoint: str,
        model: str,
        api_key_resolver: Callable[[], str],
        reasoning_effort: str = "none",
        timeout_seconds: int = 60,
        extra_body: dict[str, Any] | None = None,
        transport: HttpTransport | None = None,
        cache_directory: Path | None | bool = None,
        auth_mode: str = "bearer",
        local_execution: bool = False,
        credential_resolver: Callable[[str], str] | None = None,
    ):
        self.provider_id = str(provider_id).strip()
        self.endpoint = str(endpoint).strip()
        self.model = str(model).strip()
        self._api_key_resolver = api_key_resolver
        self._credential_resolver = credential_resolver
        self.reasoning_effort = str(reasoning_effort).strip()
        self.timeout_seconds = int(timeout_seconds)
        self._extra_body = dict(extra_body or {})
        self._transport = transport or _urllib_transport
        self._cache_directory = None if cache_directory is False else Path(cache_directory or default_remote_cache_directory())
        self.auth_mode = str(auth_mode).strip()
        self.capabilities = LLMCapabilities(
            structured_output="json_schema",
            deterministic_seed=True,
            media=frozenset(),
            local_execution=bool(local_execution),
            model_identity=self.model,
        )
        self.validate_configuration(require_api_key=False)

    def validate_configuration(self, require_api_key: bool = True) -> None:
        _validated_endpoint(self.endpoint, "Remote LLM endpoint")
        if not self.model or len(self.model) > 200 or any(ord(char) < 32 for char in self.model):
            raise ValueError("Remote LLM model must be a non-empty model ID of at most 200 characters")
        if self.reasoning_effort not in {"none", "low", "medium", "high"}:
            raise ValueError("Remote LLM reasoning effort must be none, low, medium, or high")
        if self.auth_mode not in SUPPORTED_AUTH_MODES:
            raise ValueError("Remote LLM auth mode must be bearer or none")
        if not 5 <= self.timeout_seconds <= 600:
            raise ValueError("Remote LLM timeout must be between 5 and 600 seconds")
        if require_api_key and self.auth_mode == "bearer":
            self._resolved_api_key()

    def _resolved_api_key(self, endpoint: str | None = None) -> str:
        target = self.endpoint if endpoint is None else endpoint
        api_key = str(self._credential_resolver(target) if self._credential_resolver else self._api_key_resolver()).strip()
        if not api_key:
            raise ValueError("Remote LLM API key is not configured")
        return api_key

    def _cache_path(self, payload: dict[str, Any], endpoint: str | None = None) -> Path | None:
        if self._cache_directory is None:
            return None
        identity = {
            "schema": REMOTE_CACHE_SCHEMA,
            "version": 1,
            "provider_id": self.provider_id,
            "endpoint": self.endpoint if endpoint is None else endpoint,
            "payload": payload,
        }
        digest = hashlib.sha256(
            json.dumps(identity, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        ).hexdigest()
        return self._cache_directory / f"{digest}.json"

    def _read_cached_response(self, path: Path) -> LLMResponse | None:
        if not path.exists():
            return None
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
            if (
                value.get("schema") != REMOTE_CACHE_SCHEMA
                or value.get("version") != 1
                or value.get("provider_id") != self.provider_id
                or value.get("model_identity") != self.model
                or not isinstance(value.get("raw_text"), str)
            ):
                return None
            finish_reason = value.get("finish_reason")
            return LLMResponse(
                raw_text=value["raw_text"],
                provider_id=self.provider_id,
                model_identity=self.model,
                finish_reason=finish_reason if isinstance(finish_reason, str) else None,
            )
        except (OSError, UnicodeDecodeError, json.JSONDecodeError, AttributeError):
            return None

    def _write_cached_response(self, path: Path, response: LLMResponse) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_name = None
        try:
            with tempfile.NamedTemporaryFile(
                "w", encoding="utf-8", newline="\n", dir=path.parent,
                prefix=f".{path.name}.", suffix=".tmp", delete=False,
            ) as handle:
                temporary_name = handle.name
                json.dump({
                    "schema": REMOTE_CACHE_SCHEMA,
                    "version": 1,
                    "provider_id": response.provider_id,
                    "model_identity": response.model_identity,
                    "finish_reason": response.finish_reason,
                    "raw_text": response.raw_text,
                }, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
            Path(temporary_name).replace(path)
        except OSError:
            if temporary_name:
                Path(temporary_name).unlink(missing_ok=True)

    def generate(self, request: LLMRequest) -> LLMResponse:
        endpoint = _validated_endpoint(self.endpoint, "Remote LLM endpoint")
        self.validate_configuration(require_api_key=False)
        api_key = self._resolved_api_key(endpoint) if self.auth_mode == "bearer" else ""
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": request.system_prompt},
                {"role": "user", "content": request.user_prompt},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": "bv_regional_enhancement",
                    "strict": True,
                    "schema": ENHANCEMENT_RESPONSE_SCHEMA,
                },
            },
            "max_completion_tokens": request.max_output_tokens,
            "stream": False,
        }
        payload.update(self._extra_body)
        if request.seed > 0:
            payload["seed"] = request.seed
        if self.reasoning_effort != "none":
            payload["reasoning_effort"] = self.reasoning_effort

        cache_path = self._cache_path(payload, endpoint)
        with _REMOTE_CACHE_LOCK if cache_path is not None else nullcontext():
            if cache_path is not None:
                cached = self._read_cached_response(cache_path)
                if cached is not None:
                    return cached
            headers = {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "User-Agent": "BV-NodePack/Regional-Prompt-Enhancer",
            }
            if self.auth_mode == "bearer":
                headers["Authorization"] = f"Bearer {api_key}"
            status, raw_response = self._transport(
                endpoint,
                headers,
                json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8"),
                self.timeout_seconds,
            )
            if len(raw_response) > MAX_HTTP_RESPONSE_BYTES:
                raise RemoteLLMProviderError("Remote LLM response exceeded the maximum allowed size")
            if status < 200 or status >= 300:
                raise RemoteLLMProviderError(
                    f"Remote LLM returned HTTP {status}: {_safe_error_text(raw_response, api_key)}"
                )
            try:
                raw_value = json.loads(raw_response.decode("utf-8"))
                choice = raw_value["choices"][0]
                content = choice["message"]["content"]
                finish_reason = choice.get("finish_reason")
            except (UnicodeDecodeError, json.JSONDecodeError, KeyError, IndexError, TypeError) as error:
                raise RemoteLLMProviderError("Remote LLM returned an invalid Chat Completions response") from error
            if not isinstance(content, str) or not content.strip():
                raise RemoteLLMProviderError("Remote LLM returned no text response")
            warnings = () if finish_reason in {None, "stop"} else (f"Remote LLM finish reason: {finish_reason}",)
            result = LLMResponse(
                raw_text=content,
                provider_id=self.provider_id,
                model_identity=self.model,
                finish_reason=finish_reason if isinstance(finish_reason, str) else None,
                warnings=warnings,
            )
            if cache_path is not None and not warnings:
                self._write_cached_response(cache_path, result)
            return result


def build_remote_provider(
    provider_profile: str,
    custom_endpoint: str,
    model: str,
    reasoning_effort: str,
    timeout_seconds: int,
    transport: HttpTransport | None = None,
    catalog_path: Path | None = None,
    api_key_resolver: Callable[[], str] | None = None,
    cache_directory: Path | None | bool = None,
) -> OpenAICompatibleChatProvider:
    selected = str(provider_profile).strip()
    profiles = load_provider_catalog(catalog_path)
    profile = next((item for item in profiles if selected in {item.id, item.label}), None)
    if profile is None:
        raise ValueError(f"Unsupported remote LLM provider profile '{selected}'")
    endpoint = custom_endpoint if profile.allow_custom_endpoint else profile.endpoint
    provider_id = f"{profile.id}_chat_completions"
    extra_body: dict[str, Any] = {}
    if profile.request_profile == "venice":
        extra_body = {
            "venice_parameters": {
                "include_venice_system_prompt": False,
                "strip_thinking_response": True,
                "enable_web_search": "off",
            }
        }
    return OpenAICompatibleChatProvider(
        provider_id=provider_id,
        endpoint=endpoint,
        model=model,
        api_key_resolver=api_key_resolver or (lambda: get_remote_api_key(profile.id)),
        reasoning_effort=reasoning_effort,
        timeout_seconds=timeout_seconds,
        extra_body=extra_body,
        transport=transport,
        cache_directory=cache_directory,
        auth_mode=profile.auth_mode,
        local_execution=profile.local_execution,
        credential_resolver=None if api_key_resolver is not None else lambda requested: get_remote_api_key(profile.id, endpoint=requested),
    )

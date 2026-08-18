from __future__ import annotations

import copy
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any


MAX_SNAPSHOT_BYTES = 33_554_432


class DebugBridgeError(ValueError):
    pass


@dataclass(frozen=True)
class DebugSnapshot:
    prompt: dict[str, Any]
    revision: str
    updated_at: str
    workflow_name: str


class DebugBridge:
    def __init__(self):
        self._enabled = False
        self._snapshot: DebugSnapshot | None = None

    def set_enabled(self, enabled: bool) -> dict[str, Any]:
        self._enabled = bool(enabled)
        if not self._enabled:
            self._snapshot = None
        return self.status()

    def publish(self, prompt: Any, workflow_name: Any = "") -> dict[str, Any]:
        if not self._enabled:
            raise DebugBridgeError("BV Debug Bridge is disabled")
        if not isinstance(prompt, dict) or not prompt:
            raise DebugBridgeError("prompt must be a non-empty object")
        if any(not isinstance(node_id, str) or not isinstance(node, dict) for node_id, node in prompt.items()):
            raise DebugBridgeError("prompt must map string node IDs to objects")
        encoded = json.dumps(prompt, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        if len(encoded) > MAX_SNAPSHOT_BYTES:
            raise DebugBridgeError(f"prompt exceeds {MAX_SNAPSHOT_BYTES} bytes")
        clean_prompt = json.loads(encoded.decode("utf-8"))
        revision = hashlib.sha256(encoded).hexdigest()
        name = str(workflow_name).strip()[:256]
        self._snapshot = DebugSnapshot(
            prompt=clean_prompt,
            revision=revision,
            updated_at=datetime.now(timezone.utc).isoformat(),
            workflow_name=name,
        )
        return self.status()

    def status(self) -> dict[str, Any]:
        snapshot = self._snapshot
        return {
            "schema": "bv.debug_bridge.status",
            "version": 1,
            "enabled": self._enabled,
            "snapshot_available": snapshot is not None,
            "revision": snapshot.revision if snapshot else None,
            "updated_at": snapshot.updated_at if snapshot else None,
            "workflow_name": snapshot.workflow_name if snapshot else "",
            "node_count": len(snapshot.prompt) if snapshot else 0,
        }

    def snapshot(self) -> dict[str, Any]:
        if not self._enabled:
            raise DebugBridgeError("BV Debug Bridge is disabled")
        if self._snapshot is None:
            raise DebugBridgeError("No BV Debug Bridge snapshot is available")
        return {
            **self.status(),
            "schema": "bv.debug_bridge.snapshot",
            "prompt": copy.deepcopy(self._snapshot.prompt),
        }


debug_bridge = DebugBridge()

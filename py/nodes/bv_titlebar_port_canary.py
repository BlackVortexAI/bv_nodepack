"""Opt-in throw-away nodes for the titlebar/subgraph link-projection experiment.

These nodes deliberately expose several unmistakable slot types plus the
Regional V3 runtime-provider type.  They are not product nodes; their only
purpose is interactive canvas verification on the experiment branch.
"""

import json
import os
import hashlib

RUNTIME_PROVIDER = "BV_RUNTIME_RESOURCE_PROVIDER"
CATEGORY = "🌀 BV Node Pack/experimental/subgraph"


class BVTitlebarPortCanarySender:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {}, "optional": {
            "test_value": ("STRING", {"default": "DG canary"}),
            "payload_mode": (["text", "cpu", "cuda"], {"default": "text"}),
        }}

    RETURN_TYPES = (
        "STRING",
        "STRING",
        RUNTIME_PROVIDER,
        "INT",
        "FLOAT",
        "STRING",
    )
    RETURN_NAMES = (
        "alpha",
        "beta",
        "resource_provider",
        "gamma",
        "delta",
        "epsilon",
    )
    FUNCTION = "emit"
    CATEGORY = CATEGORY
    DESCRIPTION = "Throw-away sender for BV titlebar and subgraph link-projection tests."

    def emit(self, test_value="DG canary", payload_mode="text"):
        if payload_mode not in ("text", "cpu", "cuda"):
            raise ValueError("DG canary: invalid payload mode")
        provider = {
            "schema": "bv.runtime_resource_provider",
            "version": 1,
            "provider_id": "00000000-0000-0000-0000-000000000001",
            "resource_type": "bv-nodepack.canary",
            "resources": {"canary": {"text": test_value, "integer": 3, "float": 4.0,
                                      "nested": {"unicode": "Grüße", "flags": [True, False]}}},
            "metadata": {},
        }
        if payload_mode != "text":
            import torch
            if payload_mode == "cuda" and not torch.cuda.is_available():
                raise ValueError("DG canary: CUDA requested but unavailable")
            seed = int.from_bytes(hashlib.sha256(test_value.encode()).digest()[:2], "big") % 1000
            tensor = (torch.arange(6, dtype=torch.float32, device=payload_mode) + seed).reshape(2, 3)
            provider["resources"]["canary"].update({"tensor": tensor, "tensor_mode": payload_mode})
        return "alpha", "beta", provider, 3, 4.0, "epsilon"


class BVTitlebarPortCanaryReceiver:
    @classmethod
    def INPUT_TYPES(cls):
        force_input = {"forceInput": True}
        return {
            "required": {
                "sender_id": ("STRING", {"default": ""}),
            },
            "optional": {
                "resource_provider": (RUNTIME_PROVIDER, force_input),
                "samples": ("IMAGE", force_input),
                "vae": ("VAE", force_input),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("received",)
    FUNCTION = "receive"
    OUTPUT_NODE = True
    CATEGORY = CATEGORY
    DESCRIPTION = "Throw-away receiver for BV titlebar and subgraph link-projection tests."

    def receive(self, sender_id, **values):
        provider = values.get("resource_provider")
        if (not isinstance(provider, dict) or provider.get("schema") != "bv.runtime_resource_provider"
                or provider.get("version") != 1 or provider.get("resource_type") != "bv-nodepack.canary"):
            raise ValueError("DG canary: missing or invalid received provider")
        resources = provider.get("resources")
        payload = resources.get("canary") if isinstance(resources, dict) else None
        if not isinstance(payload, dict) or not isinstance(payload.get("text"), str):
            raise ValueError("DG canary: missing or invalid received test payload")
        if "tensor_mode" in payload or "tensor" in payload:
            import torch
            tensor = payload.get("tensor")
            mode = payload.get("tensor_mode")
            if (mode not in ("cpu", "cuda") or not isinstance(tensor, torch.Tensor)
                    or tuple(tensor.shape) != (2, 3) or tensor.dtype != torch.float32
                    or tensor.device.type != mode):
                raise ValueError("DG canary: received tensor contract mismatch")
            seed = int.from_bytes(hashlib.sha256(payload["text"].encode()).digest()[:2], "big") % 1000
            expected = (torch.arange(6, dtype=torch.float32, device=tensor.device) + seed).reshape(2, 3)
            if not torch.equal(tensor, expected):
                raise ValueError("DG canary: received tensor values mismatch")
            # Test-only bounded diagnostic, never a generic tensor serializer.
            payload = {"text": payload["text"], "tensor_check": {
                "passed": True, "device": str(tensor.device), "dtype": str(tensor.dtype),
                "shape": list(tensor.shape), "values": tensor.detach().cpu().tolist(),
            }}
        received = json.dumps(payload, ensure_ascii=False, sort_keys=True)
        return {"ui": {"text": [received], "type_name": ["DG payload received"]}, "result": (received,)}


_CANARY_NAMES = (
    "BV Titlebar Port Canary Sender (THROW AWAY)",
    "BV Titlebar Port Canary Receiver (THROW AWAY)",
)
_CANARY_CLASSES = (BVTitlebarPortCanarySender, BVTitlebarPortCanaryReceiver)
_CANARY_DISPLAY_NAMES = ("🧪 BV DG Sender · Throw-away", "🧪 BV DG Receiver · Throw-away")
_ENABLED = os.environ.get("BV_ENABLE_TITLEBAR_PORT_CANARY") == "1"

NODE_CLASS_MAPPINGS = dict(zip(_CANARY_NAMES, _CANARY_CLASSES)) if _ENABLED else {}
NODE_DISPLAY_NAME_MAPPINGS = dict(zip(_CANARY_NAMES, _CANARY_DISPLAY_NAMES)) if _ENABLED else {}

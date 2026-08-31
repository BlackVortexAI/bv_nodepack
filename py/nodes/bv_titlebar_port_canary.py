"""THROW AWAY - DO NOT MERGE OR RELEASE.

Branch-only ComfyUI nodes for the titlebar provider-port capability canary.
The module itself is the opt-in boundary: production branches must not contain
this throw-away file.
"""

from __future__ import annotations

CATEGORY = "BV Node Pack/Canary (THROW AWAY)"
PROVIDER_TYPE = "BV_RUNTIME_RESOURCE_PROVIDER"
SENDER_NAME = "BV Titlebar Port Canary Sender (THROW AWAY)"
RECEIVER_NAME = "BV Titlebar Port Canary Receiver (THROW AWAY)"
PRESENTATION_MODES = (
    "Native",
    "A - Title midline",
    "B - Body seam",
    "C - Top rail",
)


class BVTitlebarPortCanarySender:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "presentation_mode": (PRESENTATION_MODES, {"default": "Native"}),
                "canary_note": (
                    "STRING",
                    {"default": "Connect provider output 2 to receiver input 3", "multiline": False},
                ),
            }
        }

    RETURN_TYPES = (
        "BV_CANARY_ALPHA",
        "BV_CANARY_BETA",
        PROVIDER_TYPE,
        "BV_CANARY_GAMMA",
        "BV_CANARY_DELTA",
        "BV_CANARY_EPSILON",
    )
    RETURN_NAMES = ("alpha", "beta", "resource_provider", "gamma", "delta", "epsilon")
    FUNCTION = "send"
    CATEGORY = CATEGORY
    DESCRIPTION = "THROW AWAY sender: provider is canonical output index 2 of 6."

    def send(self, presentation_mode="Native", canary_note=""):
        shared = {"mode": presentation_mode, "note": canary_note}
        return tuple({**shared, "channel": name} for name in self.RETURN_NAMES)


class BVTitlebarPortCanaryReceiver:
    @classmethod
    def INPUT_TYPES(cls):
        socket = {"forceInput": True}
        return {
            "required": {
                "alpha": ("BV_CANARY_ALPHA", socket),
                "beta": ("BV_CANARY_BETA", socket),
                "gamma": ("BV_CANARY_GAMMA", socket),
                "resource_provider": (PROVIDER_TYPE, socket),
                "delta": ("BV_CANARY_DELTA", socket),
                "epsilon": ("BV_CANARY_EPSILON", socket),
                "presentation_mode": (PRESENTATION_MODES, {"default": "Native"}),
                "canary_note": (
                    "STRING",
                    {"default": "Provider is canonical input index 3", "multiline": False},
                ),
            }
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("canary_result",)
    FUNCTION = "receive"
    CATEGORY = CATEGORY
    DESCRIPTION = "THROW AWAY receiver: provider is canonical input index 3 of 6."

    def receive(
        self,
        alpha,
        beta,
        gamma,
        resource_provider,
        delta,
        epsilon,
        presentation_mode="Native",
        canary_note="",
    ):
        channels = (alpha, beta, gamma, resource_provider, delta, epsilon)
        return (
            f"mode={presentation_mode}; note={canary_note}; channels={len(channels)}; "
            "provider=sender[2]->receiver[3]",
        )


_CANARY_CLASS_MAPPINGS = {
    SENDER_NAME: BVTitlebarPortCanarySender,
    RECEIVER_NAME: BVTitlebarPortCanaryReceiver,
}
_CANARY_DISPLAY_NAME_MAPPINGS = {
    SENDER_NAME: SENDER_NAME,
    RECEIVER_NAME: RECEIVER_NAME,
}
NODE_CLASS_MAPPINGS = dict(_CANARY_CLASS_MAPPINGS)
NODE_DISPLAY_NAME_MAPPINGS = dict(_CANARY_DISPLAY_NAME_MAPPINGS)

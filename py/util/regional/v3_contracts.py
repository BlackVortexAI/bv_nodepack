from __future__ import annotations

from .context import CapabilityRegistry
from .detailer_v3 import DETAILER_CAPABILITY, DETAILER_CAPABILITY_REGISTRY
from .lora_v3 import LORA_CAPABILITY, LORA_CAPABILITY_REGISTRY
from .lut_v3 import LUT_CAPABILITY, LUT_CAPABILITY_REGISTRY


def regional_v3_capability_registry() -> CapabilityRegistry:
    registry = CapabilityRegistry()
    registry.register(
        "bv-nodepack", "lora", LORA_CAPABILITY_REGISTRY.get(LORA_CAPABILITY), source=__name__,
    )
    registry.register(
        "bv-nodepack", "detailer-plan", DETAILER_CAPABILITY_REGISTRY.get(DETAILER_CAPABILITY), source=__name__,
    )
    registry.register(
        "bv-nodepack", "lut-plan", LUT_CAPABILITY_REGISTRY.get(LUT_CAPABILITY), source=__name__,
    )
    return registry


REGIONAL_V3_CAPABILITY_REGISTRY = regional_v3_capability_registry()

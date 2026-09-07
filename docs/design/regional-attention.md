# Global-only attention conditioning

All built-in BV regional attention consumers accept a global prompt without
regions or a background prompt. Disabled and detailer-only regions do not require
generation routing.

SDXL, Z-Image, FLUX.2 Klein and Krea 2 retain their existing global slot. Its
unmasked attention covers the entire image; ordinary model validation, negative
conditioning, padding and attention-memory limits remain in effect.

Anima emits native conditioning when no usable regional chain exists. Global and
optional background text are combined per polarity; no artificial region is
created. Model validation still runs, but no regional diffusion wrapper is added.
Both LoRA modes use native global conditioning hooks in this case. Unused regional
LoRAs are excluded; global CLIP and MODEL hooks remain effective.

The adapter represents absence of regions as `None`. The built-in BV consumer
supports this. Third-party consumers of `ANIMA_CONDITIONING_REGIONS` may require
a nonempty chain and are outside this compatibility guarantee.

Actual regional routing is unchanged. CPU regression tests cover global-only
compilation, negative modes, ineligible regions, unmasked attention and Anima
global-hook dispatch. These tests do not constitute a GPU generation check.

# Native regional conditioning and LoRA validation

Status: empirical validation and implementation notes, 2026-08-19.

## Scope

This note records the first practical validation of regional ComfyUI WeightHooks
through `BV Regional Native Conditioning`. It separates general behavior of the
native path from model-specific observations for Anima and Illustrious/SDXL.

## Verified native execution model

BV does not add, subtract or otherwise combine the encoded prompt tensors itself.
The native compiler emits independent conditioning entries:

- Global without a mask;
- Background with the complement of all enabled region masks;
- every enabled region with its rendered mask and regional strength;
- optional LoRA `HookGroup` metadata on the matching entries.

See [`native_conditioning.py`](../../py/util/regional/native_conditioning.py) and
[`mask_renderer.py`](../../py/util/regional/mask_renderer.py).

ComfyUI converts each entry into a model prediction and a multiplier

```text
m_i = resized_mask_i * mask_strength_i * conditioning_strength_i
```

then composites overlapping predictions as a normalized weighted sum:

```text
prediction = sum(prediction_i * m_i) / sum(m_i)
```

This behavior is implemented by `get_area_and_mult` and `_calc_cond_batch` in the
installed ComfyUI `comfy/samplers.py`. It is therefore better described as
**mask-weighted denoiser-prediction averaging**, not raw embedding addition.

Consequences:

- Global participates everywhere with weight `1` when present.
- A fully opaque region with strength `1` overlaps Global as an approximate
  50/50 average of the global and regional predictions.
- A regional LoRA is correspondingly diluted by the unhooked global prediction.
- Raising LoRA or region strength can restore identity but also increases conflict
  between two complete composition decisions.
- Feathering introduces fractional regional weights and makes the transition
  continuous; it does not spatially interpolate model weights inside one pass.
- Several feathered/overlapping regions are all included in the normalized blend.

The initial BV native path offered no alternate compositing operator. Following
this validation, the node gained four selectable modes while preserving `blend`
as its backward-compatible default:

- `blend`: the behavior and formula described above;
- `exclusive`: Global text is combined with Background or the matching Region
  text before encoding, and only the resulting scoped conditionings are masked.
  This removes the separate unmasked Global prediction from opaque regions;
- `hybrid`: emits weighted `blend` and `exclusive` groups together. Its
  `hybrid_blend_ratio` has exact endpoints (`0 = exclusive`, `1 = blend`);
  intermediate values require additional denoiser/hook groups;
- `mask_bounds`: retains `blend` conditioning layout but sets
  `set_area_to_bounds=True` on masked entries so ComfyUI evaluates their mask
  bounding areas instead of the full frame.

These are execution-layout alternatives, not embedding operators equivalent to
ComfyUI's generic Conditioning Average, Concat or Multiply nodes. Region
`strength` continues to control contribution multipliers. `exclusive`, `hybrid`
and `mask_bounds` remain experimental until fixed-seed model comparisons are complete.

## General LoRA-hook findings

- ComfyUI WeightHooks correctly select different model/CLIP LoRA state per
  conditioning group.
- Arbitrary grayscale masks work; execution is not limited to rectangular areas.
- BV supplies full-frame masks with `set_area_to_bounds=False`, so the model sees
  the complete latent and Comfy composites the resulting prediction spatially.
- Rectangles, ellipses, polygons, brush/raster masks, add/subtract operations and
  feathering therefore remain usable with regional hooks.
- A named stack with no currently active LoRA entries is a valid no-op. Its binding
  remains persisted for source-node A/B activation tests.
- Hard boundaries can expose anatomical or identity discontinuities. Feathering
  can reduce those seams, but cannot repair artifacts already created inside one
  complete model prediction.

## Anima observations

Anima proved unsuitable as a quality reference for native regional LoRA:

- It frequently fought between a centered subject and the requested two-subject
  composition.
- Character identity at LoRA strength `0.4` was weak.
- Higher strengths made identity more visible but increased visible competition
  and instability.
- This matches the previously established reason for BV's Anima attention router
  and Regional LLLite path: Anima benefits from regional control inside a shared
  model forward rather than outer native prediction compositing.

The Anima native result is still useful as a hook-plumbing check, but should not
be used to judge the intended product quality of regional LoRA support.

## Illustrious/SDXL observations

An Illustrious test used two side-by-side women, a character trigger only in the
left prompt, and the matching LoRA stack assigned only to the left region.

Observed behavior:

- Without the regional LoRA, the left character remained generic.
- At strength `0.8`, the left side clearly acquired the target character's blonde
  hair and characteristic blue/gold outfit.
- The right character retained black hair and a red dress, demonstrating correct
  regional stack assignment.
- Sampling showed substantially less composition conflict than Anima.
- Residual errors were concentrated in hands, contact areas and the boundary
  between subjects, consistent with native prediction blending.

Conclusion: native regional LoRA is technically functional and partially practical
for Illustrious/SDXL, but remains less robust than model-internal attention routing.

## Feather validation

The controlled Illustrious comparison changed only both region feather values:

- `0`: hard transition and visible hand/contact artifacts;
- `0.02`: slightly calmer boundary, but the main hand artifact remained;
- `0.1`: best observed anatomy/contact result while preserving left-side identity.

The current renderer caps the Gaussian feather radius at 64 pixels:

```python
radius = min(64, round(amount * min(width, height)))
```

At 1024 x 1024, every value from approximately `0.0625` upward therefore produces
the same 64-pixel radius. The UI currently permits values beyond their effective
range. A later UX/runtime decision should either expose the effective pixel radius,
align the UI maximum with the cap, or replace the fixed cap with an explicitly
resolution-aware policy.

## Product conclusions

1. Keep native regional LoRA as a compatible fallback and diagnostic path.
2. Document its normalized multipass prediction blending accurately.
3. Treat strong feathering as useful for adjacent subjects, not as a universal
   repair for model-internal anatomical failures.
4. Prioritize regional LoRA support for the built-in Anima attention backend.
5. Preserve standard Comfy hook scheduling, caching and stack activation behavior.
6. Report the number of distinct model-hook passes when attention backends gain
   regional LoRA composition.

## Native composition comparison on Illustrious

A fixed workflow with two adjacent women, left-only character LoRA at strength
`0.8` and effective 64-pixel feathering was used to compare all three modes.

- `blend` with effective 64-pixel feathering preserved a coherent same-depth,
  side-by-side composition and produced the calmest, cleanest anatomy in the
  final controlled comparison. Its left-side character identity and blue/gold
  outfit details were somewhat weaker, consistent with Global/Region averaging.
- `mask_bounds` produced clean local anatomy and clear separation, but lost shared
  scale and depth: the left subject became smaller/backgrounded while the right
  subject dominated the foreground. It is better suited to independent tiles or
  spatially separated subjects than interacting peers.
- `exclusive` preserved equal subject scale and common perspective while retaining
  the strongest left-side LoRA identity and characteristic blue/gold details.
  Minor contact/hand ambiguity remained between the adjacent subjects.

For this Illustrious case there was no universal winner: feathered `blend` favored
anatomical calmness and natural averaging, while `exclusive` favored character
identity and detail retention. `blend` remains the compatibility default. The
preferred tradeoff must be model- and task-selectable; Anima must be tested
independently.

## Anima hybrid follow-up

Controlled Anima tests used `hybrid_blend_ratio=0.35`, region strength `1.0` and
feather `0.05`:

- Two character LoRAs from the same series and creator, each at `0.8`, retained
  distinct orange/yellow and purple character palettes in their assigned regions.
  This is a favorable compatibility case and does not establish universal support
  for arbitrary LoRA pairings.
- A skin-tone slider LoRA at `+6` changed only the assigned character's skin tone.
  Hair, eyes and matching clothing remained coherent, and no obvious skin-tone
  transfer appeared at subject contact areas.
- The latter LoRA is available only through Civitai Red because its source preview
  material did not qualify for the PG-13 Civitai surface. It is not bundled or
  mirrored by BV Node Pack.

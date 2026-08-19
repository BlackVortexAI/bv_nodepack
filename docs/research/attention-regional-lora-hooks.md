# True per-region LoRA for BV attention backends

Status: architecture research, 2026-08-19. This note does not change runtime
behavior. It distinguishes verified behavior from proposed implementation.

## Conclusion

True regional LoRA behavior can be added to the existing SDXL, Z-Image,
FLUX.2 Klein, Krea 2 and built-in Anima attention backends without replacing
their attention routers.

The recommended first implementation is **hook-group model passes with masked
noise-prediction composition**:

1. Keep the existing single combined regional-attention context and router.
2. Encode each text slot under its effective CLIP LoRA hooks before concatenating
   the slots.
3. Duplicate that combined conditioning once per distinct effective *model* LoRA
   hook group.
4. Put the hook group and its spatial output mask on each duplicate.
5. Let ComfyUI group the conditionings by hooks, run the model once per group,
   and compose the predictions with the masks.

This is not single-pass execution. Its principal cost is approximately one model
forward per distinct effective model stack, per denoising evaluation. It is,
however, built from supported ComfyUI conditioning and hook behavior and is much
less invasive than making every LoRA-patched layer spatially aware.

## Verified facts

### ComfyUI WeightHooks select weights per conditioning/model call

- A `WeightHook` tracks model and CLIP weights and is `HookedOnly`; a LoRA hook is
  constructed as a `HookGroup` containing one `WeightHook`.[ComfyUI `hooks.py`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/hooks.py#L131-L144)
  [LoRA hook constructor](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/hooks.py#L602-L607)
- The sampler reads `hooks` from conditioning metadata, separates conditioning
  items by `HookGroup`, then calls `apply_hooks(hooks=...)` before the model call.
  It does not switch weights between text-token or image-token slots inside one
  call.[ComfyUI `samplers.py`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py#L221-L261)
  [application before inference](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py#L303-L319)
- Hook patches are registered on `ModelPatcher`; `apply_hooks` replaces the
  current patched weights (or reuses the current group) before execution.
  `MaxSpeed` can cache patched hook weights, while `MinVram` trades memory for
  repeated patch work.[ComfyUI `model_patcher.py`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_patcher.py#L1516-L1535)
  [hook application/cache path](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_patcher.py#L1583-L1637)
- ComfyUI's official CLIP hook node clones CLIP, forces the hooks while encoding,
  and optionally writes the same hooks to the resulting conditioning metadata.
  The current BV native compiler follows this lifecycle in
  [`native_conditioning.py`](../../py/util/regional/native_conditioning.py).
  [ComfyUI `nodes_hooks.py`](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy_extras/nodes_hooks.py#L249-L259)

Therefore, adding one hook group to the one conditioning currently emitted by an
attention compiler can only make that model LoRA global for the entire forward.
It cannot make different concatenated token slots use different model weights.

### ComfyUI already composes masked predictions from separate hook groups

- Conditioning metadata supports `mask`, `mask_strength`, and an optional bounded
  area. Masks are resized before sampling.[ComfyUI mask helper](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/hooks.py#L716-L730)
  [mask preparation](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py#L767-L803)
- During sampling, each conditioning item contributes a mask multiplier. Results
  from separately executed hook groups are accumulated and normalized by their
  accumulated multipliers.[ComfyUI conditioning multiplier](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py#L33-L116)
  [result accumulation](https://github.com/comfyanonymous/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py#L321-L337)

This existing mechanism is the usable seam for regional model LoRA composition.

### Every current BV attention backend uses one model call with spatially routed text slots

- SDXL concatenates global, background and region embeddings and replaces UNet
  cross-attention with a mask-aware router:
  [`sdxl_attention.py`](../../py/util/regional/sdxl_attention.py).
- Z-Image concatenates the slots and injects a joint-attention bias through a
  diffusion-model wrapper:
  [`zimage_attention.py`](../../py/util/regional/zimage_attention.py).
- FLUX.2 Klein and Krea 2 concatenate slots and install joint-attention patches:
  [`flux2_klein_attention.py`](../../py/util/regional/flux2_klein_attention.py),
  [`krea2_attention.py`](../../py/util/regional/krea2_attention.py).
- Anima stores region conditionings separately, but its model wrapper concatenates
  them into one unified context for one patched model execution:
  [`anima_adapter.py`](../../py/util/regional/anima_adapter.py),
  [`anima_patcher.py`](../../py/util/regional/anima_patcher.py).

Consequently, none of these routers currently provides a layer-level place where
ordinary ComfyUI WeightHooks can change weights by spatial token.

## Proposed architecture: masked hook-group passes

The following is a proposal derived from the verified sampler behavior above.

### 1. Resolve effective hooks by scope

Preserve the v1 contract:

- Background inherits `global_stack_id`.
- A region's effective stack is `global + region`.
- A region without an assignment uses the global stack.

Resolve two internal views per scope:

- **CLIP hooks**, used only while encoding that scope's prompt.
- **Model hooks**, attached to output conditioning passes.

Splitting the views avoids redundant model passes when stacks differ only in
`clip_strength`. The public registry and binding contracts remain unchanged.

### 2. Encode regional attention slots with scoped CLIP hooks

Refactor each backend's `_encode_one`/equivalent to accept optional CLIP hooks.
Encode global under global hooks, background under inherited global hooks, and a
region under combined global-plus-region hooks. Concatenate the resulting tensors
exactly as today.

Before building the combined metadata, remove per-slot `hooks`; hooks on the final
conditioning select a model pass, not a token slot. Preserve model-specific fields
such as `pooled_output`, `attention_mask`, prefix padding and negative-mode data.

This gives each text slot the intended CLIP-LoRA embedding while the existing
attention bias still determines where that slot is visible.

### 3. Partition output space by effective model hook group

Create one positive and corresponding negative conditioning item per distinct
effective model hook group. Every item contains the same combined regional text
context and backend metadata, but has its own:

- `hooks`: effective model hook group;
- `mask`: spatial coverage for that group;
- `mask_strength`: normally `1.0`;
- `set_area_to_bounds`: `False`, because the attention routers need the complete
  latent/token geometry.

For a global stack plus region overrides:

- override group mask = its region mask (union regions sharing the exact group);
- inherited/global group mask = `1 - max(all override masks)`;
- overlapping different override groups remain overlapping and ComfyUI blends
  their predictions by mask weight.

The background and every unassigned region are covered by the inherited/global
group. If there are no regional model overrides, emit the historical single item.
If there is no global model LoRA, the inherited group uses `hooks=None`.

Grouping must use a stable effective model-stack fingerprint, not display name or
fresh `HookGroup` object identity. A suitable fingerprint is the ordered sequence
of resolved LoRA identity plus finite `model_strength`; CLIP-only differences do
not create model groups.

### 4. Keep each attention patch unchanged initially

Each model pass receives the same combined context and the same model attachment
or attention patch. The only changing state is the WeightHook group selected by
the sampler. The mask discards/blends each pass outside its assigned region.

Backend seams:

| Backend | Compiler seam | Model/router seam | Initial special handling |
|---|---|---|---|
| SDXL | `compile_sdxl_attention` | `apply_sdxl_attention_patch` unchanged | Duplicate full-size conditionings; never crop with `area`. |
| Z-Image | `compile_zimage_attention` | diffusion wrapper unchanged | Preserve padded text token counts and attention masks identically across groups. |
| FLUX.2 Klein | `compile_flux2_klein_attention` | `set_model_attn1_patch` unchanged | Reuse the existing dense-bias cache; conditioning groups share slot layout. |
| Krea 2 | `compile_krea2_attention` | `set_model_attn1_patch` unchanged | Same grouping approach as FLUX.2; retain experimental architecture checks. |
| Anima built-in | `compile_anima_adapter` plus node assembly | Anima diffusion wrapper unchanged | Encode stored region/background contexts under scoped CLIP hooks; repeat 2D masks over time through ComfyUI multidimensional mask handling; measure the wrapper's existing internal base/regional dual pass. |

The external `BV Regional Anima Adapter` should not claim model-LoRA support in
the first stage: its downstream third-party patcher owns execution, and nested
region conditionings are not top-level sampler conditionings from which ComfyUI
discovers WeightHooks.

## Semantics and limitations

- This is **spatial output composition**, not spatial modulation at every LoRA
  layer. A hooked pass computes the whole latent, then only its assigned spatial
  prediction contributes. It should be described accurately in documentation.
- Attention routing remains active inside every pass, so it retains the main
  quality advantage of the attention nodes over plain native masked conditioning.
- Model receptive-field effects computed outside a group's mask are discarded at
  final prediction composition. Soft mask edges blend predictions and should
  reduce seams, but visual validation is required.
- At overlaps, different LoRA predictions are blended. There is no mathematically
  unique way for one pixel to use two different complete weight sets; the editor
  should document this rule rather than imply precedence.
- The number of model forwards grows with **distinct model hook groups**, not raw
  region count. One global-only stack remains one pass. Global plus three unique
  regional stacks generally means four passes. CFG/distilled model behavior can
  further affect actual batching and cost.
- `MaxSpeed` may retain multiple patched weight sets and increase VRAM use;
  `MinVram` may repatch while switching groups. Both execution time and peak VRAM
  must be measured with real LoRAs.
- Region masks must remain full-frame (`set_area_to_bounds=False`) because cropping
  changes query-token geometry expected by the attention routers.
- Positive and negative branches need the same group/mask layout. Distilled
  backends must duplicate their current zero-negative metadata rather than encode
  an unrelated negative prompt.
- Dynamic hook schedules must remain supported by passing the real HookGroups to
  conditioning metadata; caching only a resolved static tensor would break the
  ComfyUI hook lifecycle.

## Alternative: layer-local spatial LoRA

A genuinely single-pass solution would compute each LoRA delta separately inside
every patched linear/convolutional layer and multiply the delta by a spatial token
mask before adding it to the base result.

This is not provided by ComfyUI WeightHooks: those hooks patch parameter weights
before the model call. Implementing it would require model-family-specific token
geometry at every target layer, special treatment of text versus image tokens in
joint transformers, convolutional feature-map masks for SDXL, overlap semantics,
quantized/custom ops compatibility, and new caching/offload behavior. It would
also need to cover every LoRA target module, not only attention projections.

This path should be treated as a separate research project after the masked-pass
implementation is quality- and performance-tested. Patching only Q/K/V would be
faster to prototype but would silently ignore LoRAs targeting MLP, convolution,
normalization or other supported modules and is therefore not a compatible v1
implementation.

## Rejected shortcut

Attaching a region's hook group to the existing single combined conditioning is
not regional. The sampler applies that group before the entire model call, so the
LoRA affects all image tokens. This must fail validation rather than silently
falling back to global behavior.

Manually switching `ModelPatcher` weights from inside an attention callback is
also unsuitable: callbacks execute inside an already active model call, while
hook registration, keyframes, caching, offload and multigpu handling are managed
outside that call by the sampler and `ModelPatcher`.

## Staged implementation recommendation

### Stage 0: capability and cost contract

- Add backend capability metadata: scoped CLIP hooks, masked model-hook passes,
  external-runtime unsupported.
- Define overlap blending and full-frame mask rules in the LoRA bindings spec.
- Add an estimated-pass count to node status: `unique model stacks: N`.

### Stage 1: shared compiler primitive and SDXL proof

- Extend the shared LoRA resolver to produce CLIP and model views plus stable
  fingerprints.
- Add helpers for scoped encoding, output-mask partitioning, and conditioning
  duplication.
- Implement SDXL first; it has the simplest explicit cross-attention router and
  conventional 2D latent shape.
- Preserve byte-for-byte-equivalent conditioning structure when LoRA inputs are
  absent.

### Stage 2: joint-attention image backends

- Apply the same primitive to Z-Image, FLUX.2 Klein and Krea 2.
- Assert identical concatenated token layout and backend metadata for every hook
  group.
- Benchmark dense attention-bias cache reuse and hook-cache VRAM.

### Stage 3: built-in Anima

- Add scoped CLIP encoding to base/background/region attachments.
- Add top-level masked model-hook conditioning groups to the built-in Anima node.
- Verify temporal broadcasting explicitly with multiple frame counts.
- Leave the external adapter output unsupported until its downstream runtime has
  a documented hook-registration seam.

### Stage 4: UX and optimization

- Show actual distinct model-pass count and a performance warning when greater
  than one.
- Coalesce identical effective model stacks and CLIP-only stacks.
- Consider optional hard overlap precedence only as an explicit user-selectable
  policy; keep weighted blending as the default.
- Investigate layer-local spatial deltas only if multipass cost is unacceptable.

## Verification matrix

Unit tests:

- no LoRA inputs preserve existing compiler output and single-pass layout;
- global-only, inherited, additive regional, duplicate stack, CLIP-only and
  model-only cases produce the expected group count;
- masks cover the full canvas, preserve soft edges, and have deterministic overlap;
- positive/negative group layouts match for every backend;
- missing/duplicate registry identities still fail before model execution;
- scheduled hooks remain attached and initialize through ComfyUI.

Integration tests per backend:

- fixed seed, no LoRA versus global LoRA versus left/right distinct LoRAs;
- swap left/right bindings without changing prompts and verify the effect swaps;
- compare one region stack shared by several regions (one model group) against
  distinct stacks (multiple groups);
- test overlapping and feathered masks for seams;
- record seconds/step and peak VRAM for 1, 2, 3 and 4 distinct model groups;
- test both ComfyUI hook modes and at least one model-only, CLIP-only and combined
  LoRA;
- for Anima, repeat at several temporal lengths.

Success means the attention-routing baseline remains unchanged with no bindings,
LoRA effects follow the assigned masks under a fixed seed, failures are explicit,
and measured pass count matches the reported estimate.

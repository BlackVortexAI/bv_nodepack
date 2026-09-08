# Krea 2 Identity Edit

The edit backend uses one global source image with global and regional positive
and negative prompts. Full Editor and Quick Edit share the global References tool and
the BV UI ImagePicker, including available image previews. Disabling References
preserves its selection. Image content may change while the logical Registry slot
remains stable.

## Workflow

1. Connect an IMAGE to a Reference Registry's multimedia input.
2. In Regional Prompt, enable Global → References and select the source image.
3. Set BV Regional Krea 2 Attention `mode` to `identity_edit`.
4. Connect the compatible Krea VAE and the same target LATENT that feeds the
   sampler. BV Empty Latent Random Ratio is supported: empty latents use ComfyUI's
   native sampler normalization to the model's channels and spatial resolution.
   Already populated latents must have the compatible 16-channel image format.
5. Put the Identity Edit LoRA in the fixed **Global** stack of LoRA Registry and
   enable its **Global** switch. Keep **Globalen Stack anwenden** enabled in the
   Regional Editor. Attention prepares MODEL and CLIP automatically. Alternatively,
   supply a model with the weights already merged. No dedicated edit-weight selector is needed.
6. Describe the edit in the global prompt. An empty negative prompt is still
   encoded with the same image for the CFG branch.

`generation` remains the default for old and new workflows. Attention strength,
sampling range and regional LoRA execution mode belong to generation. Identity
Edit prepares each effective stack through ComfyUI's native MODEL/CLIP
LoRA loader, preserving order and separate strengths. Grounding uses the matching patched
CLIP; no conditional WeightHooks are added. This avoids the native hook path's
`weight_scale` enumeration failure on quantized layers, without modifying ComfyUI
or changing regional generation. An empty stack preserves an already merged model.
`edit_fit=fit`
matches Identity Edit v1.2 geometry; `crop` supports the older geometry. Reference
boost defaults to 1 (no dense bias allocation); larger values bias target→source
attention and are limited by the shared dense-mask allocation budget.

## Contracts

- `reference_images` is an optional core/document array, currently at most one
  `{collector_id, resource_id, role:"source"}`. IDs identify logical slots, not
  image hashes. Copying Registry and Prompt remaps the Collector ID together.
- The RegionalContext remains JSON-only. Both Prompt and Krea consumer use the
  existing Registry DG family and execution-local resource provider channels.
  Krea derives its Collector channels from the actual connected Regional ancestry
  using the existing native Root/Subgraph traversal. No process-global image store
  or serialized tensor is introduced.
- Source IMAGE must have batch 1. A single source can condition a target batch.
  VAE encoding and latent scaling happen once before sampling. A different sampler
  target resolution fails rather than loading the VAE inside the sampler.
- Qwen3-VL receives the original source image capped at 768 pixels and the training
  template on both conditioning branches. Only mentions bound to the selected
  source are translated to `the source image`. Literal `@` remains literal.
- Edit forwarding uses `[text | source | target]`, frame 1 for source and frame 0
  for target, centered continuous RoPE offsets in fit mode, and returns only target
  tokens. It deliberately does not install the native-layout regional attention
  or token-LoRA patches. Nonempty Background prompts,
  zeroed negative conditioning and already patched attention/edit models fail
  explicitly. Detailer-only regions remain available downstream.

## Regional edit prompts (experimental)

Draw separate regions over the two hair areas. Use a global preservation instruction
and local edits such as `Change her hair color to blonde.` and
`Change her hair color to red.` Enable Generation usage for both regions.

Each active region runs a complete image-grounded instruction consisting of the
global prompt followed by its local prompt. Negative prompts follow the same rule.
All passes use the same source image, full target geometry and unchanged Identity
Edit forward; there is no image crop or native-layout token routing patch.
ComfyUI blends the predicted denoising outputs using the shared region masks,
represented as `[1,1,height,width]` for Krea's singleton time axis. Positive and
negative conditioning receive identical masks, with `set_area_to_bounds=False`.

Region weight is mask times region strength. The global-only pass uses
`1 - max(clamp(region_weight, 0, 1))` across regions, keeping all pixels covered.
ComfyUI normalizes overlapping weights. Strength below one blends in the global
prediction; above one increases relative weight in overlaps, not absolute hair
color intensity. Disabled, detailer-only, empty-mask and zero-strength
regions do not consume passes or subtract from global coverage. With no active
region the previous global-only conditioning is unchanged.
An empty local prompt is skipped unless its effective LoRA stack differs from
the global stack; such a LoRA-only region overlays the existing prompt passes as
described below.

Extra passes increase encoding/sampling cost. Spatial prediction blending steers
where edits apply; it does not guarantee unchanged pixels outside the regions or
perfect identity preservation.

## Regional edit LoRAs (experimental)

### Independent LoRA regions

A region with empty positive AND negative local text and a different effective
LoRA stack is an independent LoRA overlay. It does not add a competing blank
instruction pass. Each existing prompt pass (including uncovered Global) is split
into `outside = prompt_mask * (1-alpha)` and `inside = prompt_mask * alpha`, where
`alpha = clamp(overlay_mask * region_strength, 0, 1)`. The inside keeps exactly the
same positive/negative instruction and receives the combined LoRA stack. The two
parts preserve the original prompt weight pointwise. Overlay strength above one
saturates coverage; it does not increase the configured LoRA MODEL/CLIP strengths.

For example, overlapping blonde-hair and skin-LoRA-only regions now evaluate the
blonde instruction WITH the skin LoRA in their intersection, instead of averaging
a blonde/no-LoRA prediction and a blank/LoRA prediction. Outside that intersection
the original prompt/stack still applies. Regions containing their own text AND
LoRAs retain the established prompt-pass behavior; normal Generation is unchanged.

Overlays are composed in document order. Common Global entries are removed from
the overlay contribution occurrence-by-occurrence; identical assignments across
scopes use their maximum occurrence count. Intentional duplicate entries within
a stack remain duplicated, and entries with different MODEL/CLIP strengths remain
distinct. Stack order is preserved. Multiple overlapping overlays combine their
local entries; equivalent text/stack passes are merged by adding their masks.
Empty intersections are discarded. More than 64 resulting combinations abort
before CLIP encoding or model-variant preparation, rather than silently dropping
effects. Many overlapping soft overlays can increase memory and execution cost.

### Native execution

Keep Identity/Turbo weights in the active Registry's fixed Global stack.
The shared automatic preparation service applies them to MODEL and CLIP.
Select ordinary LoRAs in the Regional Editor as usual; the existing resolver
defines their effective regional stacks and manual global inheritance/override rules.
Each regional variant starts from the same automatically prepared MODEL/CLIP.
The occurrence ledger prevents repeated application of automatic Global weights. Both positive and negative prompts use the matching
statically patched CLIP and the same reference image. No token-gating mode is used
in Identity Edit, regardless of the generation-only mode selector.

`py/util/regional/edit_lora_passes.py` installs a scoped native
`CALC_COND_BATCH` wrapper when active passes need distinct ordered MODEL stacks
(path, MODEL strength). CLIP stacks have a separate ordered cache, so CLIP-only
differences do not cause additional model switches. Native
`load_models_gpu` activates each static ModelPatcher; the passed native executor
evaluates that group's full-image conditioning. Native mask multipliers are used
to undo per-group normalization and blend all groups in float32, separately for
each CFG branch. The original patcher is loaded again in `finally`, including
after a failed forward. A single effective stack retains the normal sampler path.

For multiple MODEL stacks on a dynamic patcher, preparation uses ComfyUI's native
`get_non_dynamic_delegate()` once. All regional variants share that delegate's
model and backup storage. This avoids repeated AIMDO host-buffer staging during
static stack switches. Single MODEL stacks retain the original dynamic path.
The native delegate API caches its model reference on the source patcher; the
original dynamic model and the delegate may coexist in RAM. This is not a memory
ceiling guarantee. A missing native delegate factory is an error, not a silent
fallback to repeated dynamic staging.

Blend weight/count buffers use one channel and broadcast across output channels.
For a 16-channel latent these buffers occupy one sixteenth of their former size;
prediction buffers and native temporary mask allocation remain full-sized.

This seam avoids the quantized conditional WeightHook path; it does not patch
ComfyUI globally. It can be replaced by a native quantization-compatible scoped
weight API once that API satisfies the same routing and restoration tests.
Only full-image BV conditioning is supported: external areas/default conditioning,
ControlNet, additional models, weight hooks, foreign wrappers, context windows,
recursive sampling and Multi-GPU are rejected. A lock serializes this adapter's
own calls; it does not make ComfyUI's global model manager generally thread-safe.
Place other static MODEL LoRA loaders and model patches before the Attention
node. Downstream weight/object patches are rejected because the captured variants
would otherwise silently omit them. Third-party model lifecycle callbacks are
not covered by this adapter's compatibility contract.

Switching native clones may repeatedly repatch/offload weights and increase
sampling time substantially, especially with quantization or low VRAM. Clones
share the underlying model; this is not a promise of constant VRAM usage or
unchanged pixels outside the assigned region. GPU performance and visual effect
require a real workflow test.

`tests/test_edit_lora_passes.py` covers stack/CLIP identity and baseline handling.
`tests/test_edit_lora_native.py` is an optional separate-process CPU contract:
set `BV_NATIVE_COMFY_ROOT` to a ComfyUI installation and run it with a Python
environment containing that installation's dependencies. It exercises native
quantized static LoRA loading, successive stack switches, CFG/overlap blending,
public wrapper dispatch and failure restoration without loading a full checkpoint.

## Provenance and validation

Training description: [conradlocke/krea2-identity-edit](https://huggingface.co/conradlocke/krea2-identity-edit).
Pixel preparation is adapted from [comfyui-krea2edit commit 86f886d](https://github.com/lbouaraba/comfyui-krea2edit/tree/86f886dac23013d88996e3a2e99093ba44d322fb),
Apache-2.0; license retained in `licenses/comfyui-krea2edit-LICENSE.txt`. The helper
has diagnostic output removed. The BV adapter implements the single-source
execution, validation, conditioning, Registry resolution and wrapper integration.
No dependency on installation of the upstream custom node is required.

CPU contract tests cover reference identity/resolution, disabled configuration,
grounding, UTF-16 mentions, fit/crop geometry, token order, RoPE, boost direction,
preencoding and sampler size drift. These do not establish real model output
quality or successful GPU sampling with a particular checkpoint/LoRA combination.

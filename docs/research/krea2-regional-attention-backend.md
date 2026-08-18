# Krea 2 as a BV regional-attention backend

Research date: 2026-08-18
Local ComfyUI revision: [`72865f4f27eaf5396f8f36370e0a2be3a9a090ee`](https://github.com/Comfy-Org/ComfyUI/tree/72865f4f27eaf5396f8f36370e0a2be3a9a090ee)
Official Krea 2 reference revision: [`db3984fbc6e13b34c0064990fc2d95ac64d00058`](https://github.com/krea-ai/krea-2/tree/db3984fbc6e13b34c0064990fc2d95ac64d00058)

## Executive conclusion

Krea 2 is a viable `BV_REGIONAL` attention backend that can retain the normal ComfyUI `MODEL -> KSampler` contract. The current ComfyUI implementation exposes the necessary main-transformer seam through `ModelPatcher.set_model_attn1_patch()`: all 28 single-stream blocks call the patch with Q, K, V, positional encoding, the current attention mask and block metadata. A cloned model can therefore inject a regional joint-attention mask without replacing KSampler.

It is materially stronger than the existing native mask/area-conditioning baseline, because it can control which text tokens and image tokens may attend to one another inside the transformer rather than merely blend separate denoiser results afterward.

There is, however, one model-specific limitation that prevents claiming perfect prompt isolation in a first implementation: Krea 2 fuses a twelve-layer Qwen3-VL representation through four text-only transformer blocks before the 28 patchable joint blocks. Current ComfyUI does not expose an attention patch inside those text-fusion blocks. If independently encoded regional contexts are concatenated before the model, the two token-refiner blocks may mix regional text before the regional main-attention mask is applied. This does not make the backend useless, but it makes a first version **experimental attention routing**, not mathematically strict end-to-end isolation.

Recommended delivery order:

1. Keep `BV Regional Native Conditioning` as the stable fallback.
2. Add a Krea-specific experimental backend using the current `attn1_patch` seam and standard KSampler.
3. Preserve per-segment token-span and validity metadata; never infer prompt spans from decoded strings.
4. Gate the exact Krea 2 architecture and the required Comfy patch contract at runtime.
5. Treat text-fusion isolation as a separate second-stage improvement, preferably through a small upstream Comfy hook rather than a copied model forward.

## Source boundary and terminology

This note distinguishes:

- **confirmed fact**: directly evidenced by official Krea sources or the pinned ComfyUI source;
- **architecture inference**: a BV design conclusion derived from those facts;
- **unverified behavior**: something requiring an image-quality or runtime tensor test before release.

“Native conditioning” below means ComfyUI conditioning entries carrying `mask`, `area`, `mask_strength` or related metadata. “Attention routing” means a mask or bias applied to the text/image attention matrix inside Krea 2's diffusion transformer.

## Confirmed model architecture

### Public model contract

Krea publishes two checkpoints with the same model family:

- **Krea 2 Raw** is the undistilled base checkpoint. The official recommendation is 52 steps with CFG 3.5 at 1024 resolution.
- **Krea 2 Turbo** is the post-trained/distilled inference checkpoint. The official recommendation is 8 steps, CFG disabled, `mu=1.15`, and roughly 1K–2K output resolution.

The official model card calls Krea 2 a 12-billion-parameter text-to-image diffusion transformer. The official technical report describes a flow-matching, final single-stream MMDiT with shared text/image attention and MLP weights, grouped-query attention, sigmoid-gated attention, SwiGLU, zero-centered RMSNorm/QKNorm, lightweight timestep modulation and 3D axial RoPE.

Primary sources:

- [Pinned official README: Raw and Turbo inference profiles](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/README.md)
- [Official Raw model card](https://huggingface.co/krea/Krea-2-Raw)
- [Official technical report: architecture](https://www.krea.ai/blog/krea-2-technical-report#architecture)
- [Pinned official MMDiT implementation](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/mmdit.py)

### Exact released transformer shape

The official inference configuration and current Comfy implementation agree on the released architecture:

| Property | Value |
| --- | ---: |
| Transformer hidden width | 6,144 |
| Main blocks | 28 single-stream blocks |
| Query heads | 48 |
| KV heads | 12 |
| Head dimension | 128 |
| MLP expansion | 4x SwiGLU |
| Latent channels | 16 |
| Latent patch | 2 x 2 |
| Timestep embedding width | 256 |
| Text hidden width per selected layer | 2,560 |
| Selected text layers | 12 |
| Text-fusion attention heads | 20 |
| Main RoPE axes | frame, height, width = 32, 48, 48 dimensions |

The main attention uses 48 query heads but only 12 key/value heads, applies per-head Q/K normalization, repeats K/V groups for the Comfy optimized-attention call and gates the attention output with a learned sigmoid projection.

Primary sources:

- [Pinned official inference configuration](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/inference.py#L11-L25)
- [Pinned Comfy Krea 2 model](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py)
- [Pinned Comfy checkpoint detection](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_detection.py)

## Text and conditioning contract

### Qwen3-VL layer stack

Krea 2 uses `Qwen/Qwen3-VL-4B-Instruct` as its single text encoder. It selects hidden states 2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32 and 35. The official encoder returns a `(batch, sequence, 12, 2560)` tensor plus a validity mask, with a maximum user-prompt length of 512 tokens before template accounting.

ComfyUI transports this through the ordinary three-dimensional `CONDITIONING` tensor contract by flattening the selected-layer and feature axes to `(batch, sequence, 30720)`. `SingleStreamDiT._unpack_context()` rejects any other feature width and reconstructs the twelve-layer form inside the diffusion model.

This is a hard family contract. A Krea backend must not reuse the Z-Image or FLUX.2 text-width assumptions and must not project or average the 30,720-wide Comfy tensor itself.

Primary sources:

- [Pinned official Qwen3-VL conditioner](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/encoder.py)
- [Pinned Comfy Krea tokenizer/encoder adapter](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/krea2.py)
- [Pinned Comfy context unpacking](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py#L382-L390)

### Prompt template and span ownership

Krea uses an image-description system prompt followed by the user's text and an assistant marker. Comfy strips the system and user-opening prefix after encoding. Consequently, regional span metadata must be captured from the exact Krea tokenizer result after template stripping. Counting words, commas or source-string characters is not a safe substitute for token spans.

For a multi-prompt backend, each global/background/region source should be encoded independently, and the backend should preserve for each resulting segment:

- tensor start/end in the combined Krea context;
- validity mask start/end;
- semantic role (`global`, `background`, region id);
- positive or negative branch;
- region strength and enabled state.

The architecture permits concatenating tensors along the sequence axis because the feature width remains 30,720. Whether concatenation before Krea's text-refiner blocks causes unacceptable subject leakage is an **unverified quality question**, not a shape question.

### Model-side text fusion

`TextFusionTransformer` has two different stages:

1. two layerwise transformer blocks operate across the twelve selected Qwen layers independently for every token, followed by a learned 12-to-1 projection;
2. two refiner transformer blocks operate across the prompt-token sequence.

The resulting 2,560-wide tokens are projected to the 6,144-wide main-transformer space. Text and image tokens are then concatenated and processed by all 28 single-stream blocks.

The current Comfy `attn1_patch` is deliberately guarded by `block_index`. The text-fusion calls occur before `block_index` is assigned, so the normal patch reaches the 28 main blocks but not the four text-fusion blocks.

**Architecture inference:** this is the principal Krea-specific isolation gap. Main joint attention can be region-routed cleanly, while the token-refiner stage remains global. A strict second-generation backend would need one of:

- an upstream Comfy patch hook inside `TextFusionTransformer`;
- a supported pre-/post-text-fusion hook that can fuse each prompt segment independently;
- a carefully maintained Krea diffusion wrapper.

Copying and maintaining Krea's entire `_forward()` merely to split text fusion is the least desirable option.

## Latent and image-token raster

Krea 2's released autoencoder is the Qwen Image VAE: eightfold spatial compression and 16 latent channels. Comfy assigns `latent_formats.Wan21`, whose inherited spatial downscale ratio is 8 and whose latent channel count is 16. The DiT groups each 2 x 2 latent patch into one image token.

Therefore:

```text
token_rows = ceil(pixel_height / 8 / 2)
token_cols = ceil(pixel_width  / 8 / 2)
image_tokens = token_rows * token_cols
```

For aligned dimensions, one image token represents 16 x 16 output pixels:

| Output | Latent grid | Main image-token grid | Image tokens |
| ---: | ---: | ---: | ---: |
| 1024 x 1024 | 128 x 128 | 64 x 64 | 4,096 |
| 1536 x 1024 | 192 x 128 | 96 x 64 | 6,144 |
| 2048 x 2048 | 256 x 256 | 128 x 128 | 16,384 |

Comfy pads latent dimensions to the 2 x 2 patch size and crops the output back afterward. The regional mask compiler must therefore rasterize against the actual latent-derived `h_` and `w_`, not infer a square grid from total token count.

Primary sources:

- [Pinned official Qwen Image autoencoder wrapper](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/autoencoder.py)
- [Pinned official sampling/token preparation](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/sampling.py)
- [Pinned Comfy latent format](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/latent_formats.py#L662-L690)
- [Pinned Comfy Krea patchification](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py#L283-L293)

## Current ComfyUI integration and architecture gate

Current ComfyUI identifies Krea 2 checkpoints by `txtfusion.projector.weight`, derives the released widths and block counts from checkpoint tensors, assigns `image_model = "krea2"`, and instantiates `comfy.model_base.Krea2` with `comfy.ldm.krea2.model.SingleStreamDiT`. `model_base.Krea2.extra_conds()` accepts ordinary `c_crossattn` and optional reference latents. `supported_models.Krea2` selects the Krea tokenizer, Qwen3-VL-4B encoder, Krea sampling shift 1.15, Wan/Qwen latent format and bf16/fp16/fp32 inference.

A BV backend should require all of the following rather than check a display name:

1. base model is `comfy.model_base.Krea2`;
2. diffusion model is `comfy.ldm.krea2.model.SingleStreamDiT`;
3. patch size 2 and 16 latent channels;
4. 28 main blocks;
5. 48 query heads and 12 KV heads;
6. text width 2,560, twelve selected layers and flattened context width 30,720;
7. first projection input width 64 and output width 6,144;
8. `txtfusion.projector` is 12-to-1;
9. the main attention exposes `attn1_patch` with `attn_mask` replacement and `img_slice` metadata.

Raw and Turbo share this architecture. Architecture tensors alone do not reliably distinguish their sampler/negative-prompt profiles. Backend selection may be automatic, but the checkpoint profile should be explicit or derived only from trusted model metadata—not a filename substring.

Primary sources:

- [Pinned Comfy model detection](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_detection.py)
- [Pinned Comfy supported-model entry](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/supported_models.py#L1903-L1929)
- [Pinned Comfy base-model adapter](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_base.py#L2469-L2496)

## Native mask/area conditioning: valid fallback, known ceiling

Comfy's native `ConditioningSetMask` stores a mask and mask strength on each conditioning entry. During sampling, Comfy scales/crops the latent input as necessary, evaluates the relevant conditioning entries, multiplies their denoiser outputs by the spatial masks/strengths and accumulates the results.

That contract is model-agnostic and works with Krea 2 and the standard KSampler. It is also the mechanism used by the previously examined LC123 Krea workflow and the existing BV native backend.

It does **not** create text-to-image ownership inside Krea's unified transformer. Each regional denoiser evaluation still lets its prompt affect every token inside that evaluation; the spatial restriction is applied to the resulting denoiser contribution. Overlaps become weighted output composition, not one joint attention graph. This is why native conditioning can give useful spatial hints while still showing subject leakage, duplicated composition or weak interaction semantics.

Primary sources:

- [Pinned Comfy ConditioningSetMask node](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/nodes.py#L245-L270)
- [Pinned Comfy conditioning evaluation/composition](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/samplers.py)

## Confirmed attention-patch seam

`ModelPatcher.set_model_attn1_patch(callback)` appends a transformer patch without changing the public model type. In each Krea main block, Comfy calls the callback before RoPE and optimized attention with:

```text
q, k, v,
pe=freqs,
attn_mask=current_mask,
extra_options={block_index, total_blocks, block_type, img_slice, ...}
```

The callback may return replacements for Q, K, V, positional encoding and `attn_mask`. This is precisely the required seam for a BV joint-attention bias. Because the patched object remains a normal Comfy `MODEL`, no custom sampler is required.

Sequence order in the current implementation is:

```text
[fused text tokens] [target image tokens] [optional reference-image tokens]
```

`img_slice` starts at the first image token but extends through target and reference tokens. The target-image token count must be computed from the current latent raster. A backend that assumes every token in `img_slice` belongs to the target will incorrectly paint regional ownership onto reference images.

Primary sources:

- [Pinned ModelPatcher API](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_patcher.py#L661-L686)
- [Pinned Krea attention callback](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py#L62-L104)
- [Pinned Krea combined-sequence layout](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py#L295-L380)

## Important divergence: official validity mask versus current Comfy

The official Krea implementation:

- builds a combined text-validity plus image-validity mask;
- applies it to the text refiner;
- pads the combined sequence to a multiple of 256;
- applies the expanded pairwise mask to every main block.

At Comfy revision `72865f4...`, `SingleStreamDiT._forward()` accepts `attention_mask` but calls `txtfusion(context, mask=None)` and all main blocks with `mask=None`. It also does not reproduce the official sequence padding. This is a confirmed source-level difference.

Consequences for BV:

1. The main `attn1_patch` can still inject a regional mask; the seam is functional.
2. BV must preserve or reconstruct token-validity information so padding/special tokens are not unintentionally made active by the regional mask.
3. The patch must merge with a non-`None` upstream attention mask if future Comfy revisions restore the official behavior.
4. Runtime capability tests must validate callback shape and mask replacement rather than merely compare Comfy version numbers.
5. This difference should be reported upstream independently; BV should not silently copy the official forward into its package as a permanent fork.

This is also why the backend should be revision-gated and initially marked experimental.

Primary sources:

- [Pinned official combined validity mask](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/mmdit.py#L349-L382)
- [Pinned official sampler mask construction](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/sampling.py#L18-L33)
- [Pinned current Comfy forward](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/krea2/model.py#L295-L380)

## Proposed regional-attention semantics

Krea's single-stream attention uses one square matrix over text and image tokens. It has no separate `attn2` cross-attention module. The backend therefore needs an explicit policy for every quadrant:

```text
               keys
queries      text       image
text       text-text   text-image
image      image-text  image-image
```

Recommended first-version policy:

- **global text**: readable by every target-image query;
- **regional text**: readable only by target-image queries whose rasterized mask contains that token;
- **background text**: readable by the complement of the enabled regional union;
- **overlap pixels**: may read every region active at that pixel (`joint` semantics);
- **text-to-text**: remain open in the 28 main blocks for coherence, while documenting that Krea's earlier token refiner is already global;
- **image-to-text**: enforce the regional ownership above;
- **text-to-image**: use the transpose-compatible ownership policy so joint attention remains bidirectionally coherent;
- **image-to-image self-attention**: remain global by default; optional cross-region attenuation is a separate advanced control;
- **reference-image tokens**: remain globally visible in v1 unless the user explicitly selects a reference-routing policy.

Hard-blocking image-to-image attention across region boundaries is not a safe default. It can damage pose, anatomy, shadows, perspective and the interaction zone between subjects. A later control may attenuate cross-region self-attention during an early step window, but it must not be conflated with prompt strength.

### Strength and overlap

Region strength should affect allowed regional text logits, not multiply latent output after the transformer. A robust compiler should distinguish:

- **ownership**: allowed versus blocked token pair;
- **attention bias**: soft preference for an allowed pair;
- **denoising schedule**: start/end percentage for routing;
- **self-attention mixing**: independent cross-region image bias.

For `joint` overlap, the intersection should not select one winner. It should expose both regional text spans, with each region's own bias. Priority/winner semantics can be added later as a different policy without changing the `BV_REGIONAL` document format.

### Dense-mask memory risk

At 1024 square, the combined sequence is approximately 4,096 image tokens plus up to hundreds of text tokens. A broadcastable `(batch, 1, query, key)` bias is practical. At 2048 square, 16,384 image tokens imply over 268 million image/image pairs before text and batch dimensions; even a single dense bf16 matrix is roughly 512 MiB before attention workspace.

Therefore the backend needs:

- a preflight memory estimate;
- a configurable maximum dense sequence length;
- cached raster/token ownership tensors;
- a broadcast single-head bias, never a materialized 48-head mask;
- an explicit failure message rather than an OOM;
- later investigation of block-sparse or operator-level masking for 2K use.

Krea Turbo's advertised 2K capability does not imply that a dense regional pairwise mask is affordable at 2K.

## Negative-prompt contract

### Krea 2 Raw

Raw is explicitly sampled with CFG. The official sampler encodes `negative_prompts`, evaluates an unconditional/negative branch and combines it with the positive branch. In ComfyUI, Raw can therefore use ordinary positive and negative `CONDITIONING` with a standard KSampler and CFG above 1.

The regional backend should build matching positive and negative segment layouts, but it must not assume that separately tokenized positive and negative prompts have identical sequence lengths. The attention patch receives `cond_or_uncond` and UUID metadata through Comfy transformer options; branch-specific routing metadata should be selected from those identifiers rather than tensor batch position alone.

### Krea 2 Turbo

Turbo's official profile disables CFG (`guidance_scale=0` in the official pipeline; Comfy's equivalent practical profile is CFG 1). The official sampler skips negative encoding entirely when guidance is disabled. A negative input socket may remain present for graph compatibility, but it has no generative effect at CFG 1.

BV should not invent a negative effect for Turbo and should not silently raise CFG. The UI/description should say:

> Krea 2 Turbo is distilled for CFG-off inference. Negative conditioning is structurally accepted but inactive at CFG 1. Use Krea 2 Raw when true negative CFG is required.

Primary sources:

- [Pinned official Raw/Turbo recommendations](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/README.md#usage)
- [Pinned official CFG implementation](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/sampling.py#L50-L121)

## Standard-KSampler compatibility

Confirmed integration contract:

```text
Krea MODEL
  -> clone ModelPatcher
  -> attach Krea attn1_patch
  -> return patched MODEL + ordinary positive/negative CONDITIONING
  -> standard ComfyUI KSampler
```

No custom sigma loop, scheduler or KSampler fork is justified. Raw/Turbo step count, CFG and scheduler remain user-visible sampler concerns. The backend may provide documentation or presets, but must not hide sampler semantics in the model patch.

A custom sampler would only become necessary if BV chooses a per-step routing policy that cannot be expressed from `extra_options["sigmas"]` inside the attention callback. Current Comfy already transports sigmas into transformer options, so even a routing start/end window should remain possible without a sampler fork.

## Comparison with existing BV attention backends

| Contract | SDXL | Z-Image | FLUX.2 Klein 9B | Krea 2 |
| --- | --- | --- | --- | --- |
| Main architecture | UNet transformer | single-stream DiT | 8 double + 24 single blocks | 28 single-stream blocks |
| Primary text encoder | CLIP family | Qwen3-4B | Qwen3-8B, 3-layer stack | Qwen3-VL-4B, 12-layer stack |
| Comfy context width | conventional CLIP context | family-specific | 12,288 | 30,720 flattened, then 2,560 fused |
| Image latent | 4ch, downscale 8 | family-specific | 128ch, downscale 16, patch 1 | 16ch, downscale 8, patch 2 |
| 1024 image grid | multiscale UNet | model-specific | 64 x 64 | 64 x 64 |
| Strong text seam | separate `attn2` | unified `attn1` | double/single `attn1` policies | unified `attn1` in main blocks |
| Pre-main text mixing | no comparable model-side stack | model-specific | Qwen features projected in model | four text-fusion blocks, not patched |
| Negative semantics | normal CFG | Turbo: inactive | Klein 9B: model/profile-specific | Raw: active; Turbo: inactive at CFG-off |
| Standard KSampler | yes | yes | yes | yes |

### Modules reusable without model leakage

Reuse these existing BV concepts/modules:

- `BV_REGIONAL` validation and enabled-region filtering;
- rectangle/brush rasterization;
- background-complement generation;
- joint-overlap membership maps;
- region priority/strength policy IR;
- context-segment descriptors;
- additive/broadcast attention-bias utilities;
- branch selection by `cond_or_uncond`/UUID;
- resolution and memory preflight;
- cloned-ModelPatcher lifecycle;
- standard-KSampler node surface;
- capability-probe and diagnostic reporting.

Keep these Krea-specific:

- architecture gate;
- Qwen3-VL template-aware segment encoding;
- 30,720-to-(12 x 2,560) context contract;
- text-fusion limitation/profile;
- target/reference sequence resolver;
- 8x VAE plus patch-2 raster mapping;
- Raw versus Turbo negative profile;
- future validity-mask compatibility shim.

Do not reuse SDXL's `attn2` callback or assume FLUX.2's double-stream block metadata. Do not reuse Z-Image's text width or tokenizer-span logic merely because both are single-stream models.

## Recommended BV backend design

Suggested product node:

```text
BV Regional Krea 2 Attention (Experimental)

inputs:
  model: MODEL
  clip: CLIP
  regional: BV_REGIONAL
  routing_strength: FLOAT = 1.0
  start_percent: FLOAT = 0.0
  end_percent: FLOAT = 1.0
  image_self_attention: [global, attenuated] = global
  reference_policy: [global, isolate] = global

outputs:
  patched_model: MODEL
  positive: CONDITIONING
  negative: CONDITIONING
```

Implementation layers:

1. **Krea document compiler**: encode independent prompt segments and retain exact token spans and validity.
2. **Krea capability gate**: inspect base model, diffusion model, tensor widths, block/head counts and patch callback API.
3. **Krea raster resolver**: map BV masks to the current target `h_ x w_` token grid.
4. **Unified attention compiler**: produce branch-specific broadcast biases for the four text/image quadrants.
5. **Krea sequence resolver**: distinguish text, target image and optional reference image ranges.
6. **Krea attention callback**: merge the BV bias with any current upstream mask and apply the step window.
7. **Diagnostics**: report architecture, text spans, target/reference counts, grid, dense-mask estimate and active negative profile.

Recommended initial defaults:

- routing enabled in all 28 main blocks;
- text-to-image/image-to-text regional ownership on;
- image self-attention global;
- reference tokens global;
- joint overlaps;
- no forced CFG or sampler changes;
- hard architecture failure, not silent native fallback, when the user selected the attention node explicitly.

The general dispatcher may offer native fallback, but the explicit Krea attention node should fail clearly if the contract is not met. Silent fallback makes visual regressions impossible to diagnose.

## License and redistribution boundary

The official inference **source code** is Apache-2.0. The **model weights** are not Apache-2.0; Raw and Turbo use the Krea 2 Community License v1.

Confirmed weight-license conditions include:

- commercial use under the community license only while total company-wide trailing annual revenue is below USD 1,000,000; larger commercial use requires an enterprise license;
- required reasonable content-filtering/review safeguards for deployments;
- acceptable-use compliance;
- pass-through license, attribution and naming requirements when distributing the model or derivatives;
- model/derivative distribution notices and restrictions;
- output ownership subject to license compliance.

BV consequences:

1. Do not bundle or mirror Krea weights.
2. Link users to the official Raw/Turbo model cards and license.
3. Label the adapter code license separately from the loaded model license.
4. Do not call the weights “Apache-2.0” or unqualified “open source”; “open weights under the Krea 2 Community License” is accurate.
5. State that users/deployers are responsible for satisfying Krea's revenue, safety and acceptable-use conditions.
6. A clean-room BV adapter implemented against Comfy's public `ModelPatcher` contract need not copy Krea implementation code. If any Apache-licensed source fragment is copied, retain the Apache notice and mark modifications.

This is an engineering interpretation, not legal advice.

Primary sources:

- [Pinned official inference-code Apache-2.0 license](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/LICENSE.md)
- [Pinned Krea 2 Community License v1](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/docs/KREA-2-COMMUNITY-LICENSE)
- [Official Krea safety guidance](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/docs/safety.md)

## Verification plan before implementation is called stable

### Contract tests

1. Accept official Raw and Turbo architecture fixtures.
2. Reject SDXL, Z-Image, FLUX.1, FLUX.2 Klein/full and malformed Krea-like models.
3. Verify all 28 main blocks invoke the callback exactly once per model evaluation.
4. Verify the callback receives `block_index`, `total_blocks`, `block_type` and `img_slice`.
5. Verify K/V GQA expansion does not require a 48-head materialized mask.
6. Verify target image count for square, portrait and landscape latents, including odd latent dimensions padded to patch 2.
7. Verify reference-image tokens are excluded from target raster ownership.
8. Verify positive and negative branches choose their own span/mask metadata.
9. Verify a future non-`None` upstream attention mask is combined rather than overwritten.
10. Verify dense-mask preflight rejects unsafe 2K cases before allocation.

### Behavioral tests with fixed noise

Compare at identical seed/settings:

- native conditioning baseline;
- Krea attention routing with routing strength zero/disabled;
- Krea attention routing enabled;
- region prompts swapped left/right;
- disjoint regions;
- joint overlap interaction region;
- global-only prompt;
- background complement;
- reference image present/absent;
- Raw with meaningful negative CFG;
- Turbo at CFG 1 with different negative strings (outputs should remain unchanged if all other execution is deterministic).

Acceptance must measure more than “image looks good”:

- character/property placement follows the intended region more often than native conditioning;
- swapping region prompts swaps properties without moving the masks;
- global composition remains coherent;
- overlap interaction does not create a third duplicated subject;
- disabled routing reproduces the unpatched model within expected numerical tolerance;
- memory remains bounded at documented resolutions.

### Text-fusion isolation experiment

The central research experiment should compare:

1. concatenated regional contexts using only main-block routing;
2. separately fused segment contexts followed by concatenation and main-block routing;
3. native outer conditioning.

Use prompts whose attributes are deliberately incompatible across regions. If (2) materially reduces attribute bleed versus (1), an upstream text-fusion patch seam is justified. If the difference is negligible, avoid a custom forward and keep the smaller ModelPatcher implementation.

## Final recommendation

Proceed with a Krea 2 attention backend after the current SDXL, Z-Image and FLUX.2 Klein contracts are stable. Krea is not blocked by KSampler or by a missing main-attention seam. The correct first implementation is a Krea-specific `attn1_patch` adapter on a cloned `ModelPatcher`, backed by the shared BV unified-attention compiler.

Ship it as experimental until three issues are resolved by tests:

1. regional text leakage through the unpatched token-refiner blocks;
2. token-validity handling in the current Comfy port;
3. dense-mask memory limits at Turbo's higher resolutions.

Native Comfy conditioning remains the reliable compatibility fallback, but it is not the technical ceiling. A real internal Krea attention backend is possible with today's Comfy public patch API; strict text-fusion isolation is the only part likely to require an additional Krea/Comfy seam.

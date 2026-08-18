# FLUX.2 Klein 9B as a BV regional-attention backend

Research date: 2026-08-18

Status: implementation specification and risk assessment. **Confirmed** statements are directly supported by the pinned primary sources below. **Inference** statements are BV design conclusions that still require an executable integration test. **Unknown** statements must not be advertised as supported.

## Decision

FLUX.2 Klein 9B is a viable next `BV_REGIONAL` attention backend without a custom sampler. The lowest-risk ComfyUI integration is a cloned `ModelPatcher` with an `attn1_patch` callback applied to **both** the eight double-stream blocks and the 24 single-stream blocks. The patched model can continue into the standard KSampler.

The initial backend should be deliberately narrow:

- accept only the exact Klein 9B tensor architecture and Qwen3-8B conditioning contract;
- target the distilled 9B conditioning contract by default, including its lack of a meaningful negative-prompt branch, while leaving the sampling recipe caller-owned;
- route cross-attention first, leaving image-to-image self-attention unrestricted;
- support normal target-image generation first and keep reference-image tokens globally reachable;
- reject the official KV-cache editing variant until ComfyUI exposes an equivalent stable patch lifecycle;
- never bundle the 9B weights, because they use the FLUX Non-Commercial License rather than Apache-2.0.

Native ComfyUI `ConditioningSetMask` remains a useful fallback, but it composites denoiser predictions by area. It is not the model-internal joint-attention routing described here.

## Confirmed model contract

### Architecture

The official BFL source defines `Klein9BParams` as:

| Field | Klein 9B |
| --- | ---: |
| Input/output channels | 128 |
| Text context width | 12,288 |
| Transformer hidden width | 4,096 |
| Attention heads | 32 |
| Head width | 128 |
| Double-stream blocks | 8 |
| Single-stream blocks | 24 |
| RoPE axes | `[32, 32, 32, 32]` |
| RoPE theta | 2,000 |
| MLP ratio | 3.0 |
| Guidance embedding | absent |

The model first projects image and text independently, runs eight double-stream blocks, concatenates the sequence as `[text, image]`, runs 24 single-stream blocks, removes the text prefix, and projects the target image tokens back to 128 channels. This means a regional router applied only to the double blocks is incomplete: three quarters of the transformer depth is single-stream.

Primary source:

- [BFL `Klein9BParams` and model construction](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/src/flux2/model.py#L21-L104)
- [BFL double/single execution and final text removal](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/src/flux2/model.py#L106-L156)

The official model card identifies the checkpoint as a 9B rectified-flow transformer with an 8B Qwen3 text embedder. The distilled checkpoint is guidance- and timestep-distilled to four inference steps.

- [Official FLUX.2 Klein 9B model card](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B)
- [Pinned BFL FLUX.2 repository README](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/README.md)

The Hugging Face checkpoint is gated, so its current model-card revision could not be pinned anonymously during this research. Architecture claims are therefore also tied to the pinned BFL implementation above.

### ComfyUI detection and model classes

Current ComfyUI detects FLUX.2 from `double_stream_modulation_img.lin.weight` and derives the input width, hidden width, text width, number of heads, and block counts from checkpoint tensors. It assigns `image_model = "flux2"`, four RoPE axes, theta 2000, 128 output channels, global modulation, SiLU MLPs, no QKV bias, no operator bias, and patch size 1.

- [Pinned ComfyUI FLUX.2 checkpoint detection](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_detection.py)

`supported_models.Flux2` selects `model_base.Flux2` and chooses the text stack by detected encoder weights. A Qwen3-8B encoder selects `KleinTokenizer8B`; Qwen3-4B selects the 4B Klein tokenizer; Mistral selects the full FLUX.2 stack. Consequently, checking only `isinstance(model, model_base.Flux2)` is unsafe: Klein 4B, Klein 9B, and full FLUX.2 share that broad family class.

- [Pinned ComfyUI `supported_models.Flux2`](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/supported_models.py#L795-L838)
- [Pinned ComfyUI `model_base.Flux2`](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_base.py)

### Text conditioning

ComfyUI's Klein 9B path uses the following contract:

- `Qwen3Tokenizer8B` uses Qwen3-8B with 4,096-dimensional hidden states;
- prompts are wrapped in the Klein chat template containing a user message followed by an empty thinking section and assistant prefix;
- the tokenizer has no added BOS or EOS, uses pad token `151643`, pads to at least 512 tokens, and disables prompt weights;
- Qwen hidden states from layers 9, 18 and 27 are collected and concatenated, yielding the model's required 12,288-wide context;
- an attention mask is returned and must be preserved.

- [Pinned ComfyUI Qwen3/Klein tokenizers and encoder taps](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/flux.py#L140-L230)
- [Pinned ComfyUI tokenizer padding implementation](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/sd1_clip.py#L565-L670)

The normal Qwen tokenizer pads on the right because `pad_left` remains false. `model_base.Flux2.extra_conds` also left-pads externally supplied embeddings shorter than 512. Therefore BV must map spans from the actual token sequence and attention mask rather than assuming either that token zero is active or that all 512 positions are prompt text. AST character offsets are not token offsets, and Comfy's disabled prompt weighting means weighted AST syntax must not be advertised for this backend.

### Latent and token grid

ComfyUI's FLUX.2 latent format has 128 channels and a spatial downscale ratio of 16. The diffusion model uses patch size 1, so every latent cell is one image token.

Examples for target tokens:

| Canvas | Latent grid | Target image tokens |
| --- | --- | ---: |
| 512 x 512 | 32 x 32 | 1,024 |
| 1024 x 1024 | 64 x 64 | 4,096 |
| 1536 x 1024 | 96 x 64 | 6,144 |
| 2048 x 2048 | 128 x 128 | 16,384 |

- [Pinned ComfyUI `latent_formats.Flux2`](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/latent_formats.py)
- [Pinned ComfyUI FLUX token packing and forward path](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/flux/model.py)

Reference images append additional image tokens. In ComfyUI's normal FLUX forward path the target image tokens are followed by reference tokens, while the single-stream combined sequence remains text first. Routing code must use `img_slice` and `reference_image_num_tokens` supplied by ComfyUI instead of reconstructing positions from canvas size alone.

## Recommended ComfyUI patch seam

### Public seam

`ModelPatcher.set_model_attn1_patch` registers a callback through the public patch list. FLUX double and single blocks invoke `transformer_options["patches"]["attn1_patch"]` with Q, K, V, positional embedding, the current attention mask and `extra_options`; a callback may return a replacement `attn_mask`.

- [Pinned `ModelPatcher.set_model_attn1_patch`](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_patcher.py)
- [Pinned FLUX double/single attention patch calls](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/flux/layers.py)
- [Pinned FLUX attention-mask forwarding](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/ldm/flux/math.py)

Relevant `extra_options` include `block_type`, `block_index`, total block counts, `img_slice` and reference-image token counts. BV should clone the incoming model, install one backend-owned callback, and output the cloned model plus ordinary ComfyUI conditionings. This preserves the standard KSampler contract and avoids sampler monkey-patching.

### MVP routing policy

Encode a single structured prompt context and retain exact token spans for:

- global prompt;
- background prompt;
- every regional prompt;
- structural separators and chat-template tokens.

Do not encode a full 512-token context per region and concatenate them. Besides changing contextualization, that grows the already expensive sequence by 512 tokens for every region. If separate encodes are ever supported, inactive padding must be trimmed from the returned attention masks before packing.

For each target image token, rasterize normalized `BV_REGIONAL` geometry to the actual latent token grid. The recommended initial attention rules are:

1. Text-to-text remains unrestricted.
2. Image-to-image remains unrestricted in the default `cross_only` mode.
3. Every target image query may attend global and structural text.
4. A target image query may attend a region's text span only when its token belongs to that region.
5. Background text is available on the complement of enabled region masks, or everywhere if the user explicitly selects global-background behavior.
6. Reference image tokens remain globally reachable in the first release.
7. The same routing callback runs for both double and single blocks.

For stronger separation, a later `joint_soft` mode may add a finite negative bias between image tokens belonging exclusively to disjoint regions. Overlap tokens remain a bridge. Hard image-to-image blocking should not be the default because it can damage pose, composition and global coherence.

### Overlap and priority semantics

For the current BV `joint` semantic, an overlap image token receives the **union** of all region prompt spans covering it. Priority must not silently erase lower-priority regions. A future explicit `winner` mode may choose the highest-priority region; a future `weighted` mode may convert region strengths into additive attention bias.

Region strength should initially scale an additive cross-attention bias, not multiply Q/K/V tensors. Geometry opacity and editor display opacity remain unrelated authoring properties.

### Attention-mask representation and memory

Use an additive floating mask with shape broadcastable to `[batch, heads, query, key]`: zero for allowed edges and a large finite negative value for disallowed edges. A boolean query-by-key mask is not safe across all ComfyUI attention implementations because the basic implementation treats boolean masks as a flattened key mask.

Dense masks are the main implementation risk. With 512 text tokens and no references:

| Canvas | Combined sequence | Q x K entries | BF16 mask | FP32 mask |
| --- | ---: | ---: | ---: | ---: |
| 1024 x 1024 | 4,608 | 21.2 M | ~40.5 MiB | ~81 MiB |
| 2048 x 2048 | 16,896 | 285.5 M | ~545 MiB | ~1.06 GiB |

These figures are for one unexpanded mask and exclude backend/head expansion and temporary tensors. The MVP must cache one mask per document geometry, latent shape, batch layout, device and dtype; it must not rebuild the mask per block. It should warn or refuse dense routing above a measured threshold. PyTorch SDPA, SageAttention fallback and FlashAttention fallback must all be benchmarked because masked attention can select a slower backend.

If dense masks prove impractical, the second implementation should move to block replacement or segmented attention rather than prematurely introducing a custom sampler.

## Standard KSampler and conditioning semantics

The patched model is still ComfyUI `MODEL`; positive and negative outputs are still ordinary `CONDITIONING`. The standard KSampler remains responsible for noise, schedule and denoising.

For the official distilled Klein 9B profile:

- four steps are the reference setting;
- CFG/guidance is fixed around 1.0 by distillation;
- the official reference CLI encodes only the positive prompt;
- the model has no guidance-embedding input;
- BV should output `ConditioningZeroOut` or an equivalent empty negative and label arbitrary negative prompting unsupported.

The 9B Base model has the same tensor architecture but is not timestep/guidance distilled. Its reference path uses an empty unconditional context for CFG and roughly 50 steps. Substituting arbitrary negative text is technically possible in a CFG branch, but BFL does not document it as a trained negative-prompt contract; BV should label it experimental until tested.

- [Pinned BFL model registry and distilled/base defaults](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/src/flux2/util.py)
- [Pinned BFL reference generation CLI](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/scripts/cli.py)

The distilled and Base 9B checkpoints cannot be distinguished from dimensions alone. The backend therefore needs an explicit profile, for example `klein_9b_distilled` and `klein_9b_base`, with the distilled profile as the safe default. Filename matching may suggest a profile but must never be the architecture gate.

## Exact architecture gate

Accept only when all of the following hold:

- Comfy model family is `model_base.Flux2` / `image_model == "flux2"`;
- latent format is FLUX.2 with 128 channels and downscale 16;
- diffusion patch size is 1;
- `img_in`: 128 to 4,096;
- `txt_in`: 12,288 to 4,096;
- 32 heads with 128-wide heads;
- exactly 8 double blocks and 24 single blocks;
- RoPE axes `[32, 32, 32, 32]`, theta 2000;
- no QKV bias, global modulation enabled;
- CLIP probe returns a final context width of 12,288 and the Qwen3-8B/Klein text stack.

Reject with a precise diagnostic rather than silently falling back when the model is:

- Klein 4B: context 7,680, hidden 3,072, 24 heads, 5 double and 20 single blocks;
- full FLUX.2 dev: context 15,360, hidden 6,144, 48 heads, 8 double and 48 single blocks;
- FLUX.1 or Chroma;
- Z-Image;
- the official reference-editing KV variant until explicitly supported.

The architecture gate should be a reusable capability probe, not a class-name or filename switch.

## Differences from FLUX.1 and Z-Image

### FLUX.1

FLUX.1 in ComfyUI uses three RoPE axes `[16, 56, 56]`, patch size 2, 16 latent channels at an 8x VAE downscale, QKV bias, and CLIP/T5 conditioning. FLUX.2 Klein uses four axes, patch size 1, a 128-channel 16x latent, bias-free projections and Qwen3 triple-layer conditioning. At 1024 x 1024 both happen to produce a 64 x 64 image-token grid, but this coincidence does not make their tensor contracts or prompt spans interchangeable.

- [Pinned ComfyUI FLUX.1/FLUX.2 detection](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/model_detection.py)
- [Pinned ComfyUI FLUX text encoders](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/flux.py)

The regional compiler may share geometry rasterization and abstract routing policy with a future FLUX.1 backend. It must not share hardcoded token widths, token templates, latent conversion or architecture gates.

### Z-Image Turbo

Z-Image uses a different transformer and Qwen3-4B conditioning path. Its model is single-stream from the beginning; Klein 9B has eight double-stream blocks before the 24 single-stream blocks. A common `BV_REGIONAL` document and routing-policy IR is appropriate, but the attention adapter must remain family-specific.

- [Pinned official Z-Image source](https://github.com/Tongyi-MAI/Z-Image/tree/26f23eda626ffadda020b04ff79488e1d72004cd)
- [Pinned ComfyUI Z-Image text encoder](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/z_image.py)

## Reference images and the KV variant

ComfyUI's current generic FLUX implementation exposes target/reference token ranges through transformer options, which is enough for a conservative first backend. The official BFL repository also contains a special KV-extract/KV-cache editing path whose sequence layout and cache lifetime differ: the first pass uses `[reference, target]` image layout, later passes reuse cached reference keys and values, and the combined single stream is `[text, reference, target]`.

- [Pinned BFL KV extraction/cached forward path](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/src/flux2/model.py#L157-L300)

An `attn1_patch` mask built for the normal sequence cannot be assumed to remain valid across that cache transition. Initial BV support should therefore reject an identified KV checkpoint/mode. Supporting it later requires a separate adapter that can route both cached and live K/V ranges and invalidate the regional cache whenever geometry or prompts change.

## License and clean-room boundary

The official BFL inference repository is Apache-2.0, but the **FLUX.2 Klein 9B weights are not**. The 9B model card uses the FLUX Non-Commercial License. The license limits use to non-commercial/non-production purposes unless a separate commercial license is obtained, constrains redistribution and derivatives, and incorporates the acceptable-use conditions. The model is gated on Hugging Face.

- [Pinned FLUX Non-Commercial License v2.1](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/model_licenses/LICENSE-FLUX-NON-COMMERICAL)
- [Pinned Apache-2.0 license for the BFL inference repository](https://github.com/black-forest-labs/flux2/blob/50fe5162777813d869182b139e83b10743caef15/LICENSE.md)
- [Official gated Klein 9B distribution page](https://huggingface.co/black-forest-labs/FLUX.2-klein-9B)

BV may distribute independently written ComfyUI adapter code under its own project license, but it must:

- not bundle, mirror or automatically redistribute the 9B checkpoint;
- link users to the official gated model page and state that they must accept and comply with BFL's current license/AUP;
- not imply that BV's open-source license grants commercial rights to the model;
- avoid copying BFL implementation code when ComfyUI's public patch interfaces are sufficient;
- retain notices for any small Apache-2.0 concepts or code fragments if they are ever copied rather than independently implemented.

This is an engineering/license-boundary assessment, not legal advice.

## Proposed BV backend contract

```text
BV_REGIONAL document
  + Klein9B MODEL
  + Klein9B CLIP
  + profile: distilled_9b | base_9b
  + routing: cross_only | joint_soft (later)
        |
        v
architecture + conditioning capability probe
        |
        v
single structured prompt encode + exact token spans
        |
        v
latent-grid raster compiler + cached attention policy
        |
        v
cloned ModelPatcher with attn1_patch
        |
        +--> patched MODEL
        +--> positive CONDITIONING
        +--> zero/empty negative (distilled)
        +--> diagnostics: token spans, grid, mask memory, profile
```

The diagnostic output is important. It should report the detected architecture, target/ref token counts, active prompt spans, mask shape and estimated memory, plus whether the negative branch is zeroed.

## Required tests before claiming support

1. **Gate matrix:** accept real/mocked Klein 9B and reject Klein 4B, full FLUX.2, FLUX.1 and Z-Image with explicit reasons.
2. **Prompt spans:** short, 512-token, long, Unicode and repeated text; verify chat-template and padding tokens never become regional content.
3. **Double/single blocks:** assert the patch runs with correct sequence ranges in all 8 + 24 blocks.
4. **Geometry:** 512, 1024, non-square and at least 1536; rectangle, brush, subtract, overlap union and background complement.
5. **Batch/CFG:** distilled CFG 1 with positive plus zeroed negative; Base profile tested separately; `cond_or_uncond` batch layouts must not cross-leak.
6. **References:** zero, one and multiple reference images; target output slicing must remain unchanged.
7. **No-op invariant:** no regions or disabled routing must match the unpatched model within an agreed numeric tolerance at the same seed.
8. **Isolation A/B:** same seed with swapped left/right colors and identities, with and without routing; include overlap contact regions.
9. **Attention backends:** PyTorch SDPA, SageAttention and FlashAttention fallback behavior with masks.
10. **VRAM:** measure mask allocation and peak VRAM at 512, 1024, 1536 and 2048; enforce a safe threshold.
11. **Cache invalidation:** changes to canvas, region geometry, prompts, tokenizer output, batch size, dtype or reference count must rebuild the mask.
12. **Workflow contract:** ordinary KSampler only; four-step CFG-1 distilled reference workflow; reload/save round-trip.

## Open questions

- **Unknown:** runtime callback shapes against the gated production 9B checkpoint were not exercised in this research environment. The BFL architecture and current ComfyUI implementation agree, but one real-checkpoint probe is mandatory.
- **Unknown:** whether a current ComfyUI loader identifies or supports BFL's special KV-cache checkpoint/mode with an equivalent public patch seam. It is excluded from MVP.
- **Unknown:** whether cross-only routing is strong enough to prevent identity/color leakage for Klein 9B. The unrestricted image self-attention intentionally allows soft leakage.
- **Unknown:** the best finite negative bias and region-strength mapping across BF16/FP16 attention backends.
- **Unknown:** the practical canvas limit for dense masks. The theoretical memory numbers justify a guard, not a final cutoff.
- **Inference:** a combined single-context encode best preserves Qwen contextualization and keeps sequence length bounded, but the exact textual region-marker grammar requires image-quality evaluation.

## Final recommendation

Implement `flux2_klein_9b` after the generic regional compiler can emit token spans and latent-grid memberships. Use `set_model_attn1_patch`, cover both block families, ship `cross_only` first, default to the distilled four-step/CFG-1 profile, zero the negative branch, and enforce the exact architecture gate. Keep references global, reject KV-cache mode, cache masks, and put a measured high-resolution safety limit in place.

This produces a maintainable backend with a normal KSampler surface. It also keeps the model-specific work behind a narrow adapter instead of contaminating `BV_REGIONAL` with FLUX.2 assumptions.

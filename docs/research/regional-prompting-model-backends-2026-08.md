# Regional prompting backends for current open image models

Research date: 2026-08-18

Status: architecture decision support, not an implementation specification. Claims marked **confirmed** are backed by primary model or ComfyUI source. Claims marked **inference** follow from those sources but still need an executable BV prototype. Items marked **unknown** must not be advertised as supported.

## Executive conclusion

BV should keep `BV_REGIONAL` model-independent and implement a family backend registry. The preferred backend contract is:

```text
BV_REGIONAL + MODEL + CLIP
        |
        v
family compiler / model patcher
        |
        +--> patched MODEL
        +--> ordinary positive CONDITIONING
        +--> ordinary negative CONDITIONING (or ConditioningZeroOut)
        +--> optional diagnostic control image / legend
```

The compiler should patch the diffusion model through ComfyUI `ModelPatcher` wrappers or `patches_replace`, not require a custom sampler. This keeps the standard `KSampler` interface and lets a single document feed different backends.

Implementation priority:

1. **Generic SDXL attention backend** — one implementation covers Illustrious XL and Pony Diffusion V6 XL, is the easiest architecture to validate, supports negative CFG and has separate cross/self-attention seams.
2. **Z-Image Turbo backend** — permissive Apache-2.0 model/code, explicit unified attention-mask seam, very relevant, but no meaningful negative branch in the distilled Turbo variant.
3. **Krea 2 backend** — high relevance and a clean single-stream attention seam, but its twelve-layer text fusion and custom model license make it more complex than Z-Image.
4. **FLUX.2 Klein 9B backend** — relevant and structurally patchable, but the 9B weights are non-commercial and its dual/single-stream routing requires two attention policies.
5. Qwen-Image, FLUX.1/Chroma, SD3.5 and HiDream-I1 after the first four prove the common compiler API.
6. Wan only after the mask schema can express time or explicitly broadcast a 2D mask over all frames.

Native ComfyUI area/mask conditioning must remain available as a universal fallback. It is useful, standard-KSampler compatible and model-agnostic, but it is not equivalent to attention routing.

## What native ComfyUI masking actually does

### Confirmed behavior

`ConditioningSetMask` stores `mask`, `mask_strength` and `set_area_to_bounds` in conditioning metadata; it does not modify a model's attention layers. In the sampler, `get_area_and_mult` resizes the mask to latent resolution, crops the model input to the selected area, creates a multiplier from mask and strength, executes compatible conditions, and composites the resulting denoiser predictions by weighted accumulation.

Primary source:

- [`ConditioningSetMask` in ComfyUI nodes.py](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/nodes.py)
- [`get_area_and_mult` and conditional batching in comfy/samplers.py](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/comfy/samplers.py)

Consequences:

- A normal Comfy model that accepts ordinary `CONDITIONING` can generally use native area/mask conditioning with the standard KSampler.
- Saying a model “respects masks” is only accurate at the **denoiser-output compositing** level.
- Text tokens and image tokens still interact inside each model invocation. Global layout, duplicated subjects, attribute leakage and self-attention leakage remain possible.
- Masks are soft constraints. They are not bounding boxes guaranteed to contain the final semantic object.
- Overlap is a weighted combination of predictions. It is not a declared “joint semantic region” inside attention.
- A full-canvas global pass can still dominate composition. Region strength, mask coverage, CFG/guidance, step interval and model prior all interact.

This distinction explains why the existing BV native/Krea baseline works but reaches a ceiling: it gives spatially weighted denoiser hints, not token-to-pixel ownership.

## Backend classes

### A. Native denoiser-composite backend

Universal fallback. Compile every region into normal encoded conditioning with mask metadata. Standard KSampler compatible. No model patch. Supports arbitrary masks and feathering. Overlap follows Comfy's weighted accumulation.

### B. Attention-routing backend

Encode global/background/region prompts separately, concatenate or otherwise inject their context tokens, and install a per-layer attention bias derived from the BV region masks. An image query may attend global tokens and the prompt tokens of every region covering that image token. Optional image-to-image self-attention restriction reduces cross-region identity leakage.

This is the preferred strong backend. It must be family-specific because token order, stream topology, rotary positions, GQA layout and attention call sites differ.

### C. Trained spatial-control backend

ControlNet, Control-LoRA or LLLite can strongly reinforce a layout if the control model was trained for the target base architecture and control representation. It is not a universal translation of arbitrary region prompts. The Anima Regional LLLite is therefore a useful Anima-specific companion, not a generic replacement for text attention routing.

### D. IP-Adapter-style spatial image conditioning

Regional IP-Adapter masks localize reference-image features. They solve reference identity/style placement, not arbitrary regional text ownership. BV may consume the same masks later, but this is a separate backend capability.

## Detailed primary targets

## Illustrious XL

### Architecture and model contract

**Confirmed:** Illustrious XL is an SDXL architecture checkpoint/family. The official OnomaAI model card describes the original release as based on SDXL and the later v2 line retains the SDXL/OpenRAIL licensing lineage.

- [Official Illustrious early-release model revision](https://huggingface.co/OnomaAIResearch/Illustrious-xl-early-release-v0/tree/dca0dac303e6dc4b0c31d8001bc685b89b5d0204)
- [Official Illustrious repository/model collection](https://huggingface.co/OnomaAIResearch)
- [ComfyUI SDXL implementation at pinned revision](https://github.com/Comfy-Org/ComfyUI/tree/8e869efc8764546415036e5fdac05fc287dbe926/comfy)

SDXL uses a UNet with transformer blocks containing distinct self-attention (`attn1`) and text cross-attention (`attn2`). That separation is the lowest-risk patch seam of all primary targets.

### Native masks

**Confirmed:** ordinary SDXL conditioning works with ComfyUI mask/area metadata and standard KSampler. The region is enforced through outer denoiser compositing, not attention ownership. It is a valid fallback, not a strong isolation backend.

### Strong attention seam

Recommended patch:

- concatenate independently encoded global and regional SDXL text contexts;
- patch `attn2` so each spatial query can attend global tokens plus tokens belonging to covering regions;
- leave `attn1` open initially;
- add optional soft/self-attention routing in selected early or middle blocks only after cross-attention tests pass;
- compute token masks from the actual latent grid on every model call, including hires/detail passes.

ComfyUI already exposes attention/block patching through model options and replacement hooks. A BV `ModelPatcher` clone can therefore retain standard KSampler.

### Negatives, overlaps and priorities

- Negative prompts: supported through normal SDXL CFG.
- Joint overlap: allow both regional text ranges for overlapping image queries; normalize regional weights to avoid doubling attention energy.
- Priority overlap: bias or gate lower-priority token ranges only in the overlap, not in the full region.
- Self-attention: unrestricted self-attention can transfer identity/colors across characters; hard blocking risks seams and broken global anatomy. Start with cross-attention-only and an optional low-strength self mask.

### License and BV recommendation

Weights use the SDXL/OpenRAIL family license stated by the model card. BV should not redistribute model weights. A generic SDXL backend implemented against ComfyUI APIs does not need Illustrious source code and is the recommended clean-room route.

**Recommendation: first strong BV backend.** Market it as “SDXL attention routing (tested with Illustrious)” rather than an Illustrious-only patcher.

## Pony Diffusion V6 XL

### Identity and evidence boundary

“Pony” is ambiguous. This section means **Pony Diffusion V6 XL by PurpleSmartAI**, not Pony v6 1.5 or unrelated Pony fine-tunes. Its published checkpoint is an SDXL-family model. The authoritative distribution is the creator's Civitai entry; unlike the GitHub-hosted architectures above, there is no stable public source tree that can be pinned to an auditable implementation commit.

- [Creator distribution: Pony Diffusion V6 XL](https://civitai.com/models/257749/pony-diffusion-v6-xl)
- [PurpleSmartAI](https://purplesmart.ai/)

The absence of a pinned model-code repository is a provenance limitation, not an architecture blocker. BV must validate checkpoint detection at runtime and must not infer support from the word “Pony” alone.

### Native masks, attention seam and KSampler

Because V6 XL is an SDXL checkpoint, its sampler and attention seams are the same as Illustrious:

- native Comfy mask/area conditioning: available, soft outer composite;
- strong seam: SDXL transformer `attn2`, optional `attn1`;
- standard KSampler: yes through a cloned ModelPatcher;
- negative prompts: yes through SDXL CFG;
- overlaps: same joint/priority policy as Illustrious.

Pony's tag vocabulary changes prompt encoding behavior, not the spatial patch architecture. Prompt style must therefore remain a document/user concern, not a backend fork.

### License and BV recommendation

The creator provides separate usage/commercial terms on the distribution pages. Do not bundle the checkpoint and do not copy model-specific assets. The BV backend should be generic SDXL code. That cleanly separates BV's GPL code from Pony weight terms and avoids a maintenance fork.

**Recommendation: same backend as Illustrious, separate compatibility test fixture and documentation profile.**

## Z-Image Turbo (ZiT)

### Architecture

**Confirmed:** Z-Image Turbo is a 6B distilled Scalable Single-Stream DiT (S3-DiT). Text and image tokens participate in a unified transformer sequence. The official implementation's attention accepts an `attention_mask`; ComfyUI's Z-Image support follows the same single-stream model family.

- [Official Z-Image repository at `26f23eda`](https://github.com/Tongyi-MAI/Z-Image/tree/26f23eda626ffadda020b04ff79488e1d72004cd)
- [Official Z-Image Turbo model revision](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo/tree/f332072aa78be7aecdf3ee76d5c247082da564a6)
- [ComfyUI implementation at pinned revision](https://github.com/Comfy-Org/ComfyUI/tree/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm)

### Native masks

Native Comfy masks remain usable as denoiser composites. They do not exploit the S3-DiT's unified attention mask and cannot prevent text/image or image/image leakage inside a pass.

### Strong attention seam

Z-Image does not have a separate “cross-attention module.” The backend must construct a bias over the full unified token sequence:

- text-to-text: normally open;
- image query to global text keys: open;
- image query to regional text keys: allowed where the image token lies in that region;
- image query to image keys: initially open; optionally softly restrict across non-overlapping regions;
- reference or auxiliary token ranges: preserve unless explicitly supported.

The patch must respect grouped-query attention head dimensions and the mask form accepted by the active optimized attention backend. Derive image-token `(h,w)` from the model input and patch size, not from editor pixels.

**Inference:** because the model and attention calls accept a mask and Comfy exposes model wrappers/replacement seams, BV can keep the standard KSampler. No custom sampler callback is architecturally required.

### Negatives and overlap

- Turbo is guidance-distilled for fast inference and normally runs without CFG; a conventional negative prompt branch is not meaningful. Emit ConditioningZeroOut or the model's expected empty branch.
- The non-Turbo/base Z-Image model supports ordinary CFG and is a separate capability profile.
- Joint overlap maps naturally to multiple allowed regional text ranges for the same image query.
- Strong self-attention isolation is risky in a single stream; introduce it only as a separate slider and step interval.

### License and BV recommendation

Official code and model are Apache-2.0. This is the cleanest permissive target after SDXL. Preserve notices if source fragments are copied; preferably implement from the published contract and Comfy APIs.

**Recommendation: second strong backend.** Implement a `unified_attention` compiler usable by Z-Image first, but keep token-layout adapters model-specific.

## FLUX.2 Klein 9B

### Architecture

**Confirmed:** FLUX.2 Klein 9B is a 9B rectified-flow transformer using a Qwen3 8B text encoder. The official code defines family-specific model parameters and a transformer with text/image processing stages. ComfyUI has explicit FLUX.2 model detection and Qwen3 text-encoder support.

- [Official FLUX.2 code at `50fe5162`](https://github.com/black-forest-labs/flux2/tree/50fe5162777813d869182b139e83b10743caef15)
- [ComfyUI FLUX.2 support at `8e869efc`](https://github.com/Comfy-Org/ComfyUI/tree/8e869efc8764546415036e5fdac05fc287dbe926/comfy)
- [Black Forest Labs FLUX.2 documentation](https://docs.bfl.ai/flux_2)

The 9B line has both distilled and base variants. Capability detection must use the loaded model/config, not merely “Klein 9B.”

### Native masks

Native Comfy masks are expected to operate through normal sampler compositing and remain standard-KSampler compatible. They remain soft and do not isolate internal attention.

### Strong attention seam

The backend needs two policies:

1. dual-stream/joint blocks, where text and image streams are still separately addressable but participate in joint attention;
2. single-stream blocks, where concatenated tokens require a full joint bias.

ComfyUI's Flux implementation exposes `patches_replace["dit"]`, `img_ids`, `txt_ids` and an attention-mask argument. FLUX.2 must be verified against its own Comfy implementation rather than assumed byte-compatible with FLUX.1.

Standard KSampler compatibility is feasible through ModelPatcher/block replacements. Avoid a sampler-owned callback, because it unnecessarily couples BV to one sampler implementation.

### Negatives, overlaps and self-attention

- Distilled Klein 9B is designed for about four steps and guidance scale 1; treat negative prompts as unsupported.
- Base Klein variants are not guidance-distilled and support CFG; expose negatives only when capability detection confirms a base model.
- Joint overlap: allow multiple regional contexts, normalize their contribution.
- Self-attention control is important in single-stream blocks but should be soft/step-limited to preserve composition.

### License and BV recommendation

Official inference code is Apache-2.0. The FLUX.2 Klein 9B weights are under the FLUX non-commercial model license; smaller Klein variants may have different terms. BV must link, not redistribute, weights and show the loaded model's license separately from BV's code license.

**Recommendation: third/fourth backend, after the unified-attention compiler is proven on Z-Image.** Keep `flux2_klein` separate from `flux1` even if helper math can be shared.

## Krea 2

### Architecture

**Confirmed:** Krea 2 Raw and Turbo use a dense single-stream multimodal diffusion transformer of roughly 12B transformer parameters (the published package is about 13B total), Qwen3-VL-4B text encoding and Qwen Image's VAE. The text path aggregates twelve hidden layers before model-side text fusion. The official attention implementation accepts a mask and uses grouped-query attention.

- [Official Krea 2 inference code at `db3984fb`](https://github.com/krea-ai/krea-2/tree/db3984fbc6e13b34c0064990fc2d95ac64d00058)
- [Official `mmdit.py` attention/model source](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/mmdit.py)
- [Official technical report](https://www.krea.ai/blog/krea-2-technical-report)
- [Official Krea 2 Turbo model card](https://huggingface.co/krea/Krea-2-Turbo)
- [Official community license at pinned code revision](https://github.com/krea-ai/krea-2/blob/db3984fbc6e13b34c0064990fc2d95ac64d00058/docs/KREA-2-COMMUNITY-LICENSE)

Raw is undistilled and intended for CFG/training; Turbo is an eight-step distilled checkpoint and its official invocation uses `cfg 0.0`.

### Existing BV/native baseline

The current BV/LC123-style path is a useful baseline: separate prompt encodings plus native Comfy regional conditioning. It is standard-KSampler compatible but still has the native outer-composite limitations above. It must not be presented as strict Krea attention routing.

### Strong attention seam

Krea 2 has a promising unified attention-mask seam, but regional text preparation is not trivial:

- each prompt produces twelve layer features;
- model-side text fusion refines/combines those features;
- regional prompts must remain independently identifiable through fusion;
- only then can their token ranges be concatenated and mapped to image-token masks.

Do not flatten/concatenate pre-fusion tensors unless the model's fusion contract proves this equivalent. The clean implementation is likely a Krea-specific diffusion-model wrapper that receives a structured context batch, runs text fusion per prompt, constructs the unified sequence and injects the attention bias at every transformer layer.

**Inference:** standard KSampler can be retained because the intervention is entirely inside the patched model invocation.

### Negatives, overlaps and self-attention

- Raw: conventional CFG/negative path is expected and must be confirmed in Comfy with a deterministic A/B test.
- Turbo: official inference uses zero CFG; treat negatives as unsupported unless the Comfy implementation documents otherwise.
- Joint overlap is natural in a unified mask.
- Cross-region image self-attention needs a separate softness/step window. Hard isolation would damage Krea's global aesthetics and anatomy.

### License and BV recommendation

The official code license and model-weight license are separate. The weights use **Krea 2 Community License v1**, not an OSI open-source license. Commercial use is limited to entities below USD 1M trailing annual revenue unless an enterprise license is obtained; deployed use requires appropriate content filtering; distribution has naming, notice and pass-through requirements.

BV should not distribute weights, should link to the official model cards, and should not call the weights “Apache” or unqualified “open source.” A clean-room adapter built against Comfy public APIs and the official inference contract is acceptable; copying third-party Krea adapters is unnecessary.

**Recommendation: high priority, but after Z-Image.** Preserve the current native baseline as fallback and label the future mode explicitly `Krea 2 attention routing (experimental)` until deterministic tests pass.

## Secondary compatibility matrix

| Family | Core architecture | Native Comfy mask | Strong patch seam | Standard KSampler target | Negative prompt | License / risk | BV direction |
|---|---|---|---|---|---|---|---|
| SD 1.5 | UNet, separate self/cross attention | Yes, outer composite | `attn2`, optional `attn1` | Yes | Yes | CreativeML OpenRAIL; many fine-tunes differ | Generic legacy UNet backend after SDXL |
| SDXL base/fine-tunes | UNet, separate self/cross attention | Yes | `attn2`, optional `attn1` | Yes | Yes | SDXL OpenRAIL / checkpoint-specific | First backend; covers Illustrious and Pony XL |
| FLUX.1 dev/schnell | dual-stream then single-stream rectified-flow transformer | Yes, soft | double + single stream attention, `img_ids/txt_ids` | Yes via ModelPatcher | Usually no meaningful negative for distilled dev/schnell | code Apache; dev weights non-commercial, schnell Apache | Share compiler concepts with FLUX.2, separate adapter |
| Chroma1 | Flux-derived transformer | Yes, soft | Comfy `dit` block replacement and joint token mask | Yes, inferred | Guidance-distilled profiles generally no negative | model card/license must be checked per checkpoint | Low priority; reuse Flux-style abstractions only |
| Qwen-Image / Edit | 20B MMDiT with joint text/image attention | Yes, soft | Comfy exposes joint Q/K/V patch plus `img_slice` and attention mask | Yes | Base pipelines use CFG; variant-specific | Apache-2.0 | Strong later target; excellent Comfy seam |
| Qwen-Image 2.0 | Newer unified generation/edit family | Unknown until exact Comfy implementation is frozen | Do not assume Qwen-Image 1.x token layout | Unknown | Variant-specific | official family is Apache-2.0, verify weights | Separate capability ID; no blanket Qwen claim |
| SD3 / SD3.5 | MMDiT joint blocks, optional image self-attention | Yes, soft | `patches_replace["dit"]`, joint txt/img block | Yes | Yes for non-distilled; Turbo differs | Stability Community model license; code license separate | After unified compiler; good CFG test target |
| HiDream-I1 Full/Dev/Fast | 17B sparse DiT, separate model variants | Yes, soft | image/text token routing inside sparse transformer blocks | Feasible through block replacement | Full supports CFG; distilled Dev/Fast profiles differ | model and official code MIT | Attractive permissive later target |
| Wan 2.x | video DiT with separate spatial-temporal self-attention and text cross-attention | Technically compositable; 5D behavior needs tests | `WanAttentionBlock.self_attn/cross_attn`, `dit` replacements | Feasible | Model/workflow-specific CFG | Apache-2.0 official code/models for Wan 2.1; verify newer variant | Only after temporal mask schema exists |
| Anima | Cosmos Predict2-derived image transformer | Existing BV native + attention patch | Existing BV cross/self attention wrapper | Yes, already proven | Existing BV conditioning supplies normal branches | upstream/model terms as documented separately | Keep as reference implementation |

Primary sources for the matrix:

- [ComfyUI FLUX code](https://github.com/Comfy-Org/ComfyUI/tree/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm/flux)
- [Official FLUX.1 code at `802fb471`](https://github.com/black-forest-labs/flux/tree/802fb4713906133fcbd0d8dc5351620ca4773036)
- [Official Qwen-Image code at `6b5e1f5c`](https://github.com/QwenLM/Qwen-Image/tree/6b5e1f5cec987d404be5ac6657db3b9aacb56a89)
- [ComfyUI Qwen joint-attention implementation](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm/qwen_image/model.py)
- [Official SD3.5 reference at `8565799a`](https://github.com/Stability-AI/sd3.5/tree/8565799a3b41eb0c7ba976d18375f0f753f56402)
- [ComfyUI MMDiT implementation](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm/modules/diffusionmodules/mmdit.py)
- [Official HiDream-I1 at `5f92bab4`](https://github.com/HiDream-ai/HiDream-I1/tree/5f92bab45f1dfb1e794ee357286a5b837eaf4400)
- [ComfyUI HiDream-I1 implementation](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm/hidream/model.py)
- [Official Wan 2.1 at `9737cba9`](https://github.com/Wan-Video/Wan2.1/tree/9737cba9c1c3c4d04b33fcad41c111989865d315)
- [ComfyUI Wan implementation](https://github.com/Comfy-Org/ComfyUI/blob/8e869efc8764546415036e5fdac05fc287dbe926/comfy/ldm/wan/model.py)
- [Chroma1 Base model revision `50ebe125`](https://huggingface.co/lodestones/Chroma1-Base/tree/50ebe125b67794f4ed8e4985d26a4414ca62aed3)

## Why ControlNet/LLLite is complementary, not universal

A trained control adapter can make the intended canvas layout much harder to ignore than native conditioning. It has three limitations:

1. its weights target a particular base architecture and often a narrow checkpoint family;
2. its control image vocabulary is learned, not defined by the BV schema;
3. a color canvas can assign spatial slots, but prompt semantics still require the matching conditioning path.

Therefore BV should expose control backends independently from prompt-routing backends:

```text
regional document
  -> prompt backend: native | attention
  -> optional control backend: none | Anima LLLite | future family control
```

The two patched models must be composed in a documented order, with deterministic same-seed A/B tests. Control strength and end percentage must not silently change prompt strength.

## Proposed BV backend interface

```python
class RegionalBackend(Protocol):
    family_id: str
    capabilities: RegionalCapabilities

    def detect(self, model, clip) -> DetectionResult: ...
    def compile(self, model, clip, document, options) -> RegionalBuild: ...

class RegionalCapabilities:
    native_mask: bool
    cross_attention_routing: bool
    self_attention_routing: bool
    negative_prompt: Literal["cfg", "ignored", "zero-out", "variant"]
    overlap_joint: bool
    overlap_priority: bool
    temporal_masks: bool
    standard_ksampler: bool
```

`RegionalBuild` should contain the patched model, positive/negative conditioning, diagnostics, detected family/version and warnings. It should never mutate the input model in place.

Backend IDs should be architectural, not marketing aliases:

- `sdxl_unet_attention`
- `zimage_s3dit_attention`
- `flux2_klein_attention`
- `krea2_single_stream_attention`
- `qwen_image_mmdit_attention`
- `sd35_mmdit_attention`
- `wan_video_attention`

Compatibility presets such as “Illustrious”, “Pony V6 XL” or “Krea 2 Turbo” can select defaults, but they must not own duplicate patch code.

## Attention policy for overlaps

For image token `i` and text token group `r`, define coverage `m[r,i]` from the downsampled BV mask. A practical additive bias is:

```text
bias(i, r) = log(epsilon + clamp(m[r,i] * strength[r], 0, 1))
```

Global text receives zero bias. Outside-region text receives a large negative bias. In joint overlap, all covering groups remain visible. In priority mode, priority modifies the normalized regional weights only within overlaps.

Do not start with a hard image-to-image block. Recommended phases:

1. regional text routing only;
2. optional soft self-attention penalty across disjoint regions;
3. configurable start/end sigma interval;
4. only then strict isolation for specialized tests.

This preserves global pose and interaction while reducing attribute leakage.

## Required validation matrix

Each backend needs deterministic tests with identical seed, sampler, schedule and model:

1. native-mask baseline;
2. attention backend disabled through bypass (must reproduce baseline exactly);
3. attention backend enabled, no overlap;
4. 20–30% overlap with two conflicting colors/materials;
5. interaction zone shared by both characters;
6. empty global prompt;
7. global prompt plus background prompt;
8. unsupported negative prompt on distilled model (must warn/zero, not pretend);
9. 512, 1024 and non-square latent grids;
10. hires/detail second pass;
11. batch size > 1;
12. different optimized attention backends (PyTorch SDPA, xFormers where supported, SageAttention only if its mask contract is proven).

Metrics should include mask leakage scores, prompt adherence judged per region, seam artifacts, runtime/VRAM delta and same-seed reproducibility. Visual examples alone are insufficient.

## Confirmed unknowns and non-claims

- Pony V6 XL lacks a pin-able official model-code repository; runtime checkpoint detection must be tested before declaring support.
- Qwen-Image 2.0 must not automatically inherit the Qwen-Image 1.x adapter. Its exact Comfy token layout needs a separate inspection.
- Krea 2 Raw negative conditioning must be validated in ComfyUI; Turbo should be treated as no-CFG based on the official zero-CFG invocation.
- Chroma negative behavior and license must be taken from the exact loaded checkpoint, not inferred from Flux ancestry.
- Native mask support for video tensors must be tested rather than inferred from image behavior.
- “Standard KSampler compatible” means the backend returns a normal patched `MODEL` and ordinary conditioning. It does not promise compatibility with every third-party sampler implementation or fused attention kernel.
- Attention routing improves conditioning locality; it still does not guarantee exact object boundaries or final geometry.

## Licensing and clean-room boundary

### Safe reference layer

- ComfyUI is GPL-3.0; BV is GPL-3.0 and can integrate through documented Comfy APIs.
- Apache-2.0/MIT official model inference code may be studied and, with notices, reused where necessary.
- Prefer a clean implementation of the published tensor contract rather than copying third-party node packs.

### Restricted layer

- Do not copy RES4LYF implementation code. Its repository metadata and license text have conflicting signals and the observed source imposes non-commercial/restrictive terms. Treat it only as behavioral prior art.
- Do not copy third-party Krea/Flux/Qwen regional adapters without a compatible, unambiguous license.
- Do not distribute model, ControlNet or LLLite weights in BV. Link to their official pages and surface their license independently.
- Krea 2 and FLUX.2 Klein 9B weight licenses constrain users even when BV adapter code is GPL.
- Model output and deployment obligations are not erased because BV itself is non-commercial.

This section is technical license triage, not legal advice.

## Final architecture recommendation

Build one deep regional compiler and several thin token-layout adapters:

```text
BV document normalization
  -> prompt encoding plan
  -> latent-token mask pyramid
  -> overlap policy
  -> family token-layout adapter
  -> Comfy ModelPatcher wrapper / DIT replacements
```

The shared compiler owns masks, priorities, joint overlap, sigma windows, warnings and diagnostics. Each family adapter owns only:

- how text contexts are encoded/fused;
- token ordering and ranges;
- latent grid to image-token mapping;
- exact attention/block replacement seam;
- negative/guidance capability detection.

This avoids a separate deconstructor or document format per model, keeps the editor stable, keeps standard KSampler interoperability, and prevents the first successful backend from becoming an architectural dead end.

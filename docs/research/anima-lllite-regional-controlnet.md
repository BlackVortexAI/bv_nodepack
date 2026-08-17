# Anima LLLite Regional ControlNet: license and BV integration assessment

Research date: 2026-08-17

This note separates verified source facts from architectural recommendations. It
is a technical assessment, not legal advice.

## Scope and sources

- [Sen-sou/Anima-LLLite-Regional-Controlnet model card](https://huggingface.co/Sen-sou/Anima-LLLite-Regional-Controlnet)
- [CircleStone Anima license](https://huggingface.co/circlestone-labs/Anima/blob/main/LICENSE.md)
- [CircleStone Anima model card license summary](https://huggingface.co/circlestone-labs/Anima/blob/main/README.md#license)
- [kohya-ss/ComfyUI-Anima-LLLite](https://github.com/kohya-ss/ComfyUI-Anima-LLLite)
- [ComfyUI-Anima-LLLite Apache-2.0 license](https://github.com/kohya-ss/ComfyUI-Anima-LLLite/blob/main/LICENSE)
- [Civitai resource supplied by the user](https://civitai.com/models/2721063/anima-regional-canvas-for-comfyui-v20?modelVersionId=3238045)
- Current local ComfyUI implementation: `comfy_extras/nodes_model_patch.py`
  (`ModelPatchLoader`, `AnimaLLLiteApply`) and `comfy/ldm/anima/lllite.py`.

The upstream links above intentionally use the current default branch because
no immutable revision was exposed by all source surfaces during this research.
The findings are therefore pinned to the research date rather than asserted as
permanent upstream behavior.

The Civitai page and its public API were unavailable to the research tools. No
license claim about that resource is treated as verified below.

## Verified facts

### Adapter behavior

The Hugging Face model card describes the artifact as an experimental Anima
ControlNet-LLLite adapter and labels its repository `apache-2.0`. It consumes a
color-mask image as conditioning:

- any color can identify a region;
- white is expected as the background;
- simple, solid, clearly separated colors are recommended;
- the adapter was trained on manually masked conditioning images;
- it does **not** associate prompts with colored regions by itself;
- spatial text such as `girl on the left, cat on the right` remains necessary
  unless it is combined with an attention-masking method;
- the author explicitly suggests combining it with attention masking for
  stronger prompt-to-region association;
- distant subjects can deviate from mask boundaries because the training set
  predominantly contained close-up compositions.

The adapter therefore provides learned layout/region conditioning. It is not a
replacement for per-region text attention and it does not make masks into hard
segmentation boundaries.

### Runtime mechanism

The upstream ComfyUI-Anima-LLLite repository describes LLLite as a low-rank
correction injected into Anima DiT attention projections and optionally MLP
projections. Its code is Apache-2.0 licensed.

The same repository records that current ComfyUI core contains a native beta
implementation:

- weights are loaded as `MODEL_PATCH` from `models/model_patches/` with
  `ModelPatchLoader`;
- `AnimaLLLiteApply` accepts `MODEL`, `MODEL_PATCH`, an `IMAGE`, strength and a
  sampling interval;
- current core support is single-frame (`T=1`);
- the core node uses ComfyUI attention/MLP patch hooks rather than the older
  custom node's model-function wrapper;
- sd-scripts v2 LLLite weights are supported by both implementations.

These facts were also confirmed in the current local ComfyUI checkout. A BV
implementation does not need to vendor the upstream custom-node code merely to
load and apply this adapter.

### License layers

There are at least three distinct artifacts and their licenses must not be
collapsed into one:

1. **LLLite ComfyUI implementation code**: the kohya-ss repository states
   Apache-2.0. BV may implement interoperability without copying this code, or
   reuse Apache-licensed portions with the required notice.
2. **Regional LLLite adapter weights**: the Hugging Face repository is labelled
   Apache-2.0 by its publisher.
3. **Anima base model and derivatives**: CircleStone's license expressly
   defines LoRAs and other works based on Anima as `Derivatives`. Use and
   distribution of Anima and Derivatives are restricted to the license's
   defined non-commercial purposes unless a separate commercial license is
   obtained. Distribution also carries license-copy, attribution-notice and
   modified-derivative notice obligations. Generated outputs are treated
   separately and may be used commercially under the stated terms. Anima also
   identifies itself as a derivative of NVIDIA Cosmos Predict2 and says the
   NVIDIA Open Model License applies where relevant.

Consequently, the adapter repository's Apache label is not sufficient evidence
that downstream users can ignore the Anima base-model derivative terms. The
conservative compliance position is to treat use/distribution of the adapter
weights as subject to both the adapter publisher's stated terms and all
applicable upstream Anima/NVIDIA derivative conditions.

The supplied Civitai resource cannot be redistributed or copied into BV based
only on its URL. Its exact creator-selected asset license and included files
must first be inspected. Civitai platform availability is not itself a reusable
software/model license.

## Compatibility with BV Regional

### Directly compatible concepts

`BV_REGIONAL` already contains everything needed to render the LLLite control
image:

- canvas dimensions;
- enabled region geometry, including Rectangle and Brush operations;
- deterministic region priority;
- model-neutral rendered masks.

The existing BV Anima backend provides the capability that the model card says
LLLite lacks: explicit prompt-to-region binding through regional attention.
The two mechanisms are therefore complementary:

1. BV regional attention binds region prompt slots to spatial masks.
2. LLLite receives a color control image and reinforces the requested regional
   composition/layout.

Current ComfyUI core LLLite uses model attention/MLP patch hooks, while the BV
Anima backend uses a keyed diffusion-model wrapper and temporarily supplies its
masked attention operation. Their integration points are structurally
different, so composition is plausible and no direct node-ID dependency is
required. This combination has **not yet been empirically validated** and must
be tested for hook order, tensor shape, sampler-window interaction and output
quality before it is advertised as supported.

### Semantic mismatches requiring a policy

BV supports overlapping regions, whereas one RGB control pixel can express only
one solid region color. The LLLite card recommends clearly separated colors.
BV therefore needs a deterministic overlap rule when rendering the control
image. Region priority winning at overlapping pixels is the least surprising
v1 rule; RGB blending should not be the default because it creates new colors
that look like additional regions.

Editor display color and conditioning color should remain separate concepts:

- `authoring.color` is user-facing visualization state and may be freely
  customized for readability;
- LLLite control colors should come from a stable high-distance palette, or
  from a future explicit `control_color` field;
- changing the editor overlay color must not silently change generation
  semantics.

White background also needs an explicit renderer rule. It must not be inferred
from the visual editor background image or mask-display opacity.

## Architectural recommendations

### Recommended first implementation

Add a model-neutral `BV Regional Color Control Image` node:

- input: `BV_REGIONAL`;
- output: ComfyUI `IMAGE` plus optional legend/debug JSON;
- white background;
- one stable solid color per enabled region;
- region-priority-wins overlap policy;
- no adapter weight bundled or downloaded;
- no dependency on the Civitai workflow or external custom nodes.

Users can connect this output to ComfyUI core's `Load Model Patch` and `Apply
Anima LLLite` nodes. This is the smallest maintainable and license-safe seam: BV
owns document-to-control-image compilation, while ComfyUI owns the experimental
model-patch runtime.

### Optional convenience backend after validation

After a verified reference workflow exists, a `BV Regional Anima LLLite`
convenience node could accept `MODEL`, `MODEL_PATCH`, `BV_REGIONAL`, strength and
sampling range, then expose a patched model. It should still require the user to
install the adapter weights separately. Before adding it:

1. verify the exact Sen-sou safetensors format with current `ModelPatchLoader`;
2. test LLLite alone, BV attention alone, then both combined with identical
   seeds;
3. test both model-patch orders;
4. test overlaps and priority changes;
5. test `start_percent`/`end_percent` combinations against BV's active interval;
6. confirm single-image `T=1` behavior and fail clearly for unsupported inputs;
7. record adapter filename/hash and upstream revisions in the example workflow.

### Distribution recommendation

Do not add the adapter weights or the Civitai download to the BV repository.
Ship only integration code, renderer behavior, documentation and links. Add a
clear notice that:

- users obtain and accept model licenses independently;
- the adapter is Anima-specific;
- commercial use of Anima/derivatives may require a CircleStone commercial
  license even though generated images are treated differently;
- the feature is conditioning guidance, not guaranteed segmentation.

## Conclusion

Implementation is technically feasible and fits BV's existing adapter
architecture well. The safest near-term feature is a BV color-control-image
compiler wired to ComfyUI core LLLite nodes, followed by an empirical combined
BV-attention + LLLite test. Incorporating or redistributing the weights is not
recommended without explicit clarification that reconciles the adapter's
Apache label with Anima's derivative-model restrictions. The Civitai asset must
remain external until its exact license is verifiably available.

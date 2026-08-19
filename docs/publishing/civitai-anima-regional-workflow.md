# Civitai publishing copy: Visual Regional Prompting

## Recommended title

**Visual Regional Prompting – Multi-Model Workflows, Native LoRA Hooks & LLLite**

---

# Visual Regional Prompting for ComfyUI

This post contains ready-to-use regional-prompting workflows for several model
families:

- **Illustrious / Pony / SDXL**
- **Anima** with optional LLLite layout control
- **Anima Native Regional LoRA**
- **Z-Image Turbo**
- **FLUX.2 Klein 9B**
- **Krea 2 (Experimental)**

Choose the download matching your model. All versions share **BV Regional
Editor** and the portable `.bv-regional.json` document format, while each graph
uses the compiler and loader required by its architecture.

Instead of assembling large prompt, mask and conditioning chains, the editor
keeps Global, Background and all regional prompts in one scalable workspace.
Each named region can contain rectangles, ellipses, polygons or freehand brush
layers with its own prompt, strength, feathering, priority and display color.

## New in BV Node Pack v0.10.0: Anima Native Regional LoRA

The new downloadable Anima workflow demonstrates an external LoRA assigned only
to one visual region.

Two intentionally similar adult subjects stand close together. Both request
matching appearance and clothing, but `Skin-tone-Slider-Anima` at `+6` is bound
only to the left region. The touching subject on the right remains the control,
making cross-region color bleeding easy to evaluate.

Tested configuration:

- `BV Regional Native Conditioning`
- Composition mode: `hybrid`
- Hybrid blend ratio: `0.35`
- Region strength multiplier: `1.0`
- Mask feather: `0.05`
- Resolution: `1024 × 1024`
- Steps / CFG: `8` / `1.0`
- Sampler / scheduler: `euler_ancestral` / `simple`

`hybrid` balances two native execution layouts. `blend` generally preserves a
shared composition better but can weaken regional identity through overlapping
predictions. `exclusive` separates regions more strongly but can produce a
split-panel appearance. In this test, `0.35` provided a useful middle ground.
It is an empirical starting value, not a universal optimum.

Basic regional LoRA behavior was also tested with an Illustrious-class SDXL
model. It was technically functional, but the tested output did not reach the
quality bar for a separate showcase download. This release therefore focuses on
the stronger Anima example.

## Quick start

1. Add **BV Regional Prompt** and open **BV Regional Editor**.
2. Enter the Global and Background prompts.
3. Create named regions and draw their geometry.
4. Enter the positive and optional negative prompt for every region.
5. Connect `regional` to the backend matching the loaded model.
6. Connect the returned model/conditioning to a standard sampler.
7. Optionally send the generated image back to the editor for visual alignment.

Basic model-aware workflow:

```text
BV Regional Prompt
    -> matching BV Regional Attention/Conditioning node
    -> standard KSampler or SamplerCustom
```

For Regional LoRA, register the external `LORA_STACK` with **BV Named LoRA
Stack**, connect its `lora_registry`, and connect both `regional` and
`lora_bindings` from **BV Regional Prompt** to **BV Regional Native
Conditioning**. Empty or temporarily disabled assigned stacks are valid no-ops.

## Installation

### ComfyUI Nodes Manager

Open **Nodes Manager** or **Extensions**, search for **BV Node Pack**, install it,
restart ComfyUI and hard-refresh the browser. The editor is included.

Source, documentation and issue tracking:

https://github.com/BlackVortexAI/bv_nodepack

### Additional components

The Anima Regional LoRA graph uses **ComfyUI-Lora-Manager** as its external
`LORA_STACK` producer:

https://github.com/willmiao/ComfyUI-Lora-Manager

Compatible stack producers can be substituted. Optional Anima LLLite weights:

https://huggingface.co/Sen-sou/Anima-LLLite-Regional-Controlnet

Model weights, encoders, VAEs and LoRAs are not bundled. Select your installed
files after loading a workflow.

`Skin-tone-Slider-Anima` is currently available through **Civitai Red** rather
than the regular catalog because its original previews did not qualify for the
PG-13 surface. Follow the creator's license and access conditions.

## Important limitations

Regional prompting is strong generative guidance, not pixel-perfect segmentation.
The model still interprets composition, anatomy, pose, scale and boundaries.
Results depend on the checkpoint, LoRA training, trigger design, prompts, seed,
sampler and region geometry.

Regional LoRA hooks in v0.10.0 currently apply to **BV Regional Native
Conditioning**. They are not yet integrated into BV's model-specific Attention
nodes or the external Anima regional-attention adapter.

For A/B tests, keep model, seed, prompts and sampling fixed and disable only the
component being measured.

Full setup details, examples, compatibility notes and technical documentation:

- https://github.com/BlackVortexAI/bv_nodepack#regional-prompting
- https://github.com/BlackVortexAI/bv_nodepack/blob/main/docs/research/native-regional-lora-validation-2026-08.md
- https://github.com/BlackVortexAI/bv_nodepack/blob/main/docs/specs/bv-regional-lora-bindings-v1.md

## Feedback wanted

Feedback is welcome for complex masks, overlapping subjects, additional
checkpoints, regional LoRAs and useful `hybrid` ratios.

Leave feedback on Civitai or open an issue:

https://github.com/BlackVortexAI/bv_nodepack/issues

## Development disclosure

BV Node Pack was developed with AI-assisted programming and research. Product
direction, architecture, workflow design, testing and release decisions were
reviewed and directed by the project author.

## Credits

Special thanks to **Sen-sou** for publishing the Anima Regional LLLite model and
related regional-conditioning research.

Thanks also to the ComfyUI community and the authors of regional-prompting,
configurable-pipe and workflow-navigation projects that inspired parts of BV Node
Pack. Detailed acknowledgements and third-party notices are available in the
GitHub repository.

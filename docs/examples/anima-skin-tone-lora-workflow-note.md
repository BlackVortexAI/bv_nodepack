# BV Regional LoRA Test: Skin-Tone Attribute

This workflow tests whether an attribute LoRA remains isolated to one Anima region.

- Left region: **Skin-tone-Slider-Anima** at `+6`
- Right region: control region without a LoRA
- Composition mode: `hybrid`
- Hybrid blend ratio: `0.35`
- Region strength: `1.0`
- Mask feather: `0.05`

Both regions request similar adult characters with matching blue outfits, hair and eye color. Their central hand contact and visible skin make regional skin-tone bleeding easy to detect while retaining one coherent shared composition.

The LoRA stack is registered with **BV Named LoRA Stack** and assigned only to the left region in **BV Regional Prompt**. The `lora_bindings` output must be connected to **BV Regional Native Conditioning** together with the `regional` document.

For a controlled A/B comparison, keep the seed and all sampler settings fixed and temporarily disable the LoRA inside its source stack. An empty or fully disabled registered stack is valid.

The LoRA is not bundled or mirrored by BV Node Pack. Obtain it from its authorized external listing and follow the creator's license and access requirements.

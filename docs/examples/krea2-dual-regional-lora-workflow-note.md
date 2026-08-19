# BV Regional Krea 2 LoRA Test: Two Character LoRAs

This workflow validates two independently assigned regional character LoRAs with
**BV Regional Krea 2 Attention (Experimental)**.

- Left region: **MaluX**, LoRA strength `1.0`
- Right region: **AiriX**, LoRA strength `1.0`
- Region overlap: `20%`
- Attention strength: `1.0`
- Attention interval: `0.0` to `0.5`
- Canvas: `768 x 768`
- Sampler: Euler, simple scheduler, 8 steps, CFG `1.0`

Each external stack is registered with **BV Named LoRA Stack** and assigned only to
its matching region in **BV Regional Prompt**. Connect both `lora_registry` and
`lora_bindings` to **BV Regional Krea 2 Attention (Experimental)**.

The overlapping center deliberately exercises interaction between the two regions.
The observed test retained distinct hair color, appearance and skin tone around the
shared hand area without obvious regional LoRA bleeding. Both LoRAs were trained by
the same creator and are therefore a favorable compatibility test, not evidence that
arbitrary LoRA combinations will behave equally well.

Krea 2 regional LoRAs use masked full-model passes. Each distinct effective
model-side stack adds another denoiser pass and can substantially increase sampling
time, VRAM pressure and system-memory use. A 768 x 768 run is the practical starting
point for constrained hardware.

External LoRAs and Krea 2 weights are not bundled or mirrored by BV Node Pack. Obtain
them from their authorized listings and follow their licenses and access conditions.

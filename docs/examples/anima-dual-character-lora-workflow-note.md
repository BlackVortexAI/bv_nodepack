# BV Regional LoRA Test: Two Character LoRAs

This workflow validates two independently assigned regional character LoRAs on Anima.

- Left region: **Nyamena** (`a4onyamena`), LoRA strength `0.8`
- Right region: **Myaley** (`a4omyaley`), LoRA strength `0.8`
- Composition mode: `hybrid`
- Hybrid blend ratio: `0.35`
- Region strength: `1.0`
- Mask feather: `0.05`

Each LoRA stack is registered with **BV Named LoRA Stack** and assigned only to its corresponding region in **BV Regional Prompt**. The `lora_bindings` output must be connected to **BV Regional Native Conditioning** together with the `regional` document.

Both LoRAs come from the same series and creator and recommend similar strengths. This is therefore a deliberately favorable compatibility test, not a guarantee that arbitrary LoRAs will combine without bleeding or style conflicts.

External LoRAs are not bundled with BV Node Pack. Their own licenses and access conditions apply.

# BV Regional LoRA Bindings v1

`BV_REGIONAL_LORA_BINDINGS` is an optional sidecar contract. It assigns named,
workflow-local LoRA stacks to a `BV_REGIONAL` document without adding runtime or
model configuration to the model-neutral `BV_REGIONAL` v1 JSON.

```json
{
  "schema": "bv.regional.lora_bindings",
  "version": 1,
  "document_id": "regional-document-id",
  "global_stack_id": "base-style-stack-id",
  "regions": {
    "region-id": "face-detail-stack-id"
  }
}
```

- `document_id` must identify the connected regional document.
- Stack IDs are stable opaque identities owned by `BV Named LoRA Stack` nodes.
- A global stack is inherited by Background and every region.
- A region stack is additive to the global stack.
- Source activation, Model strength and CLIP strength are used unchanged.
- Missing registries, missing assigned stacks and duplicate sender identities fail
  explicitly.
- An assigned stack without active LoRA entries is a valid no-op. Its assignment
  remains persisted so source nodes can temporarily disable every entry for A/B tests.
- Omitting both optional LoRA inputs from `BV Regional Native Conditioning`
  preserves the historical native-conditioning path.

The compiler resolves stack entries only at execution time. Dynamic and randomized
stack producers therefore remain live sources; bindings never snapshot their entries.

## Public named-stack registry contract

Other node packs may bypass `BV Named LoRA Stack` and directly emit the custom
ComfyUI type `BV_LORA_STACK_REGISTRY` with this JSON-compatible runtime value:

```json
{
  "schema": "bv.lora_stack_registry",
  "version": 1,
  "stacks": {
    "f2e26f43-67b6-4c3a-b012-cb944e44ef9e": {
      "id": "f2e26f43-67b6-4c3a-b012-cb944e44ef9e",
      "name": "Face Detail",
      "stack": [
        ["characters/face_detail.safetensors", 0.8, 0.6],
        ["styles/skin_texture.safetensors", 0.35, 0.0]
      ]
    }
  }
}
```

Each stack entry is `[lora_path, model_strength, clip_strength]`. Paths may be
absolute or relative to ComfyUI's `loras` search paths. Registry keys and nested
`id` values must match. IDs and names must be unique, strengths must be finite,
and unknown fields are not part of v1. The normative structural schema is
[`schemas/bv_lora_stack_registry_v1.schema.json`](../../schemas/bv_lora_stack_registry_v1.schema.json).

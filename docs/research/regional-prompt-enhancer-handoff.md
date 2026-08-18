# Hand-off: BV Regional Prompt Enhancer with local LLMs

Status: planning and research complete; implementation not started.

Primary research:

- `docs/research/comfyui-local-llm-qwen-enhancer-2026-08.md`

## Objective

Build a BV-owned prompt enhancer that understands `BV_REGIONAL` documents and can improve sentence-based prompts without destroying region identity, geometry, masks, priorities, or other authoring data.

The first priority is local LLM inference inside ComfyUI. OpenAI-compatible APIs may be added later, but must not be required for the initial implementation.

## Decisions already made

1. The enhancer is regional-document-aware. It does not flatten a regional document into one prompt.
2. Local models loaded or managed inside ComfyUI have priority.
3. API providers are allowed as a later optional backend.
4. Qwen-family support is important, but compatibility must be capability-based rather than inferred from the word `Qwen` in a model name.
5. The user may customize an additional instruction, but cannot replace the BV structural protocol.
6. All model output is untrusted and must pass a strict verifier.
7. Failed enhancement or verification must preserve the source document byte-for-byte.
8. The LLM may change prompt text only. It may not change geometry, masks, strengths, priorities, enabled state, names, IDs, canvas settings, or overlap semantics.
9. No third-party custom-node pack should be a required runtime dependency.
10. API keys, live Python objects, model weights, and secrets must never be serialized into a workflow.

## Confirmed ComfyUI findings

The native ComfyUI `Generate Text` node consumes a `CLIP` object and calls:

1. `clip.tokenize(...)`
2. `clip.generate(...)`
3. `clip.decode(...)`

This is not a generic language-model socket. A compatible generative `CLIP` implementation is required.

At the inspected ComfyUI snapshot, Qwen3-VL supports this generation path. Ordinary diffusion text encoders—including other Qwen-based encoders used by image models—must not automatically be treated as generative LLMs.

Therefore the first provider should accept ComfyUI `CLIP`, perform an explicit capability preflight, and fail early with a useful message when `generate`/`decode` are unavailable or unsuitable.

## Proposed architecture

### Provider layer

Introduce a BV-owned provider contract such as `BV_LLM_PROVIDER`.

Initial provider:

- `BV Comfy CLIP LLM Provider`
- Input: compatible `CLIP`
- Output: immutable provider descriptor/handle
- Performs capability detection before enhancement

Possible later providers:

- `BV Local LLM Loader` for text-only Qwen Instruct models through a controlled Transformers/GGUF backend
- `BV OpenAI-Compatible LLM Provider` for Ollama, LM Studio, llama.cpp server, vLLM, and similar endpoints

Provider workflow state may contain safe configuration and capability metadata. It must not serialize live model identities, weights, API keys, or opaque Python object references.

### Enhancer layer

Proposed node:

- `BV Regional Prompt Enhancer`
- Inputs: `BV_REGIONAL`, `BV_LLM_PROVIDER`, editable enhancement instruction, generation controls
- Output: preferably a validated `BV_ENHANCEMENT_RESULT` containing proposed prompt changes and diagnostics

The safer architecture separates proposal from mutation:

- `BV Apply Regional Enhancement`
- Inputs: original `BV_REGIONAL` plus validated enhancement result
- Output: enhanced `BV_REGIONAL`

This enables review, diff display, retry, rejection, debugging, and future batch/detailer workflows. The exact node split should be confirmed against existing BV conventions before implementation.

### Prompt protocol

The final LLM request should be composed from three layers:

1. Immutable BV system protocol
   - response schema
   - identity-preservation rules
   - allowed mutable fields
   - no prose or Markdown
2. User-editable addition instruction
   - desired style, verbosity, target model, prose versus tag behavior, preservation preferences
3. Serialized regional payload
   - document ID
   - global/background prompts
   - ordered region IDs and prompt text
   - only the context necessary for prompt enhancement

The user instruction is additive. It cannot override the structural rules.

## Recommended response envelope

The model should return prompt changes only, not a complete regional document:

```json
{
  "schema_version": 1,
  "document_id": "document-id",
  "prompts": {
    "global": {
      "positive_source": "...",
      "negative_source": "..."
    },
    "background": {
      "positive_source": "...",
      "negative_source": "..."
    }
  },
  "regions": [
    {
      "id": "region-id",
      "positive_source": "...",
      "negative_source": "..."
    }
  ]
}
```

The apply stage must copy the original `BV_REGIONAL` document and replace only these verified prompt fields.

## Mandatory verifier behavior

The verifier is part of the security and data-integrity boundary, not an optional helper.

It must:

- extract exactly one JSON value;
- reject Markdown fences, surrounding prose, trailing values, duplicate keys, `NaN`, `Infinity`, excessive nesting, and oversized output;
- enforce a closed schema with `additionalProperties: false`;
- verify `schema_version` and `document_id`;
- require the exact original region-ID set, each ID exactly once;
- restore canonical region order independently of model output order;
- accept changes only to approved prompt fields;
- preserve every non-prompt field from the original document;
- return structured diagnostics and a human-readable diff;
- allow at most one or two bounded repair attempts;
- return the unchanged original document when validation or repair fails.

Model-generated paths, URLs, imports, node types, shell commands, or runtime configuration must never be acted upon.

## Generation defaults

Use conservative deterministic defaults:

- greedy or low-temperature generation;
- bounded output token count;
- seed when supported;
- timeout and cancellation support;
- no automatic model download during enhancer execution.

The provider must expose capabilities rather than make family-name assumptions.

## VRAM and model-management requirements

The first implementation should reuse a compatible ComfyUI `CLIP` model and ComfyUI model-management/offloading behavior. This avoids immediately introducing a second model runtime and duplicate VRAM residency.

If a dedicated local Qwen loader is added later:

- place models under a clear ComfyUI model category such as `models/LLM`;
- lazy-import optional dependencies;
- expose quantization, device, offload, keep-loaded, and unload behavior;
- fail gracefully when optional runtimes are missing;
- measure coexistence with image-generation models on the target 24 GB GPU.

## Suggested implementation sequence

1. Inspect the current `BV_REGIONAL` schema, Python node conventions, JS integration, serialization, and existing tests.
2. Freeze the provider descriptor, enhancement-result schema, verifier errors, and immutable apply contract.
3. Implement the verifier and immutable patch/apply logic test-first.
4. Implement the compatible-Comfy-`CLIP` provider with explicit preflight checks.
5. Implement the enhancer request builder with immutable protocol plus editable addition instruction.
6. Add bounded repair and structured diagnostics.
7. Prove the path with Qwen3-VL and compare it with native `Generate Text` behavior.
8. Measure VRAM/loading/offloading behavior.
9. Only then assess whether a dedicated text-only Qwen loader is needed.
10. Add OpenAI-compatible API providers later as optional adapters.

## Minimum test matrix

- Compatible Qwen3-VL provider completes successfully.
- A non-generative diffusion `CLIP` fails during preflight with a clear diagnostic.
- Valid response updates only prompt fields.
- Missing, duplicate, foreign, or reordered region IDs are handled deterministically or rejected as specified.
- Fenced JSON, prose, trailing JSON, duplicate keys, invalid numbers, excessive depth, and oversized responses are rejected.
- Geometry, masks, priorities, strengths, enabled state, names, canvas values, and overlap settings remain unchanged.
- Validation and repair failure return the original document unchanged.
- Workflow serialization contains no model objects or secrets.
- Cancellation and timeout do not leave partially changed state.

## Open design points to settle before coding

1. Whether `BV Regional Prompt Enhancer` directly returns enhanced `BV_REGIONAL` in addition to diagnostics, or only returns `BV_ENHANCEMENT_RESULT` for an explicit apply node.
2. Whether global, background, region positive, and region negative prompts can be individually enabled for enhancement.
3. Whether the first UI includes a before/after diff and manual accept/reject, or whether that follows in a second iteration.
4. Exact behavior for empty prompts: preserve empty, generate content, or make this user-selectable.
5. Whether prompt AST content is enhanced as rendered text only or requires a separate AST-aware enhancement mode later.

The recommended first version preserves empty prompts unless the user explicitly enables filling them, and treats prompt AST support as a later, separately specified capability.

## Out of scope for the first version

- Cloud/API-first operation
- Automatic downloading of LLM weights
- Arbitrary full-document rewriting
- Geometry or mask generation by the LLM
- Multi-agent prompt debate
- Automatic factual web research
- Unbounded repair loops
- Assuming every Qwen-named encoder is a generative LLM

## Start instruction for a new chat

Copy the following into the new chat:

> Continue work on the BV Node Pack in `X:\Stability Matrix\Data\Packages\ComfyUI 2026-06\custom_nodes\bv_nodepack`.
>
> Read `docs/research/regional-prompt-enhancer-handoff.md` and then `docs/research/comfyui-local-llm-qwen-enhancer-2026-08.md` completely. The goal is a BV-owned regional-aware prompt enhancer, prioritizing local LLMs loaded inside ComfyUI. APIs are secondary and optional.
>
> First inspect the existing `BV_REGIONAL` schema, node conventions, tests, and serialization. Then propose the concrete v1 contracts for `BV_LLM_PROVIDER`, the enhancement-result envelope, strict verifier, and immutable apply stage. Preserve all unrelated worktree changes. Do not introduce a required third-party node-pack dependency, do not serialize model objects or secrets, and never allow the LLM to modify geometry, masks, IDs, strengths, priorities, or other non-prompt fields.
>
> Once the contracts are consistent with the repository, implement the verifier and immutable apply logic test-first, followed by the compatible-Comfy-`CLIP` provider and enhancer request builder. Use Qwen3-VL as the first confirmed local generation path and fail clearly for non-generative diffusion CLIP encoders.

## Workspace note

At hand-off creation time, the detailed research file and this hand-off are not assumed to be committed. The unrelated `docs/publishing/` path must remain untouched unless explicitly requested.

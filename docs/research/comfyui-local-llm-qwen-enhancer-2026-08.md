# ComfyUI local LLM and Qwen integration for the BV Regional Prompt Enhancer

Research date: 2026-08-18

Status: architecture decision support. Primary sources only: current ComfyUI source, official Qwen model repositories/cards, and the source repositories of the compared custom nodes. The locally installed ComfyUI revision is `72865f4f27eaf5396f8f36370e0a2be3a9a090ee`; ComfyUI links below are pinned to it. Third-party repositories are linked to their default branch where a stable commit identifier was not exposed by the Registry/GitHub page and must therefore be treated as a dated snapshot, not an immutable citation.

## Decision

BV should not make Ollama, OpenAI-compatible HTTP, or a bundled Transformers loader the only execution path. The enhancer should consume a small BV-owned generation interface with three adapters:

1. `comfy_clip_generate`: reuse a compatible, already-loaded ComfyUI `CLIP` object;
2. `openai_compatible`: call Ollama, LM Studio, llama.cpp server, vLLM, or another compatible endpoint;
3. later, optional `local_llm_handle`: consume a BV-owned loader output for GGUF/Transformers models that are not represented by a generative Comfy `CLIP`.

The first local in-process path should be **ComfyUI's existing `CLIP` generation contract**, not a new Qwen loader. This gives immediate Qwen3-VL support when the full compatible text encoder is already loaded for an image model, avoids duplicate VRAM residency, uses ComfyUI model management/offloading, and adds no new runtime dependency. The HTTP provider remains the broad compatibility path for ordinary Qwen Instruct models and GGUF runtimes.

Do not accept diffusion `MODEL` as an LLM input. It is a denoiser `ModelPatcher`, not a causal-language-model contract. Accepting it would create misleading wiring and unsafe introspection. `CLIP` reuse is capability-based; the label `CLIP` alone does not guarantee generation.

## What ComfyUI's Generate Text node actually contracts

At the pinned revision, `TextGenerate` has these relevant inputs:

- required `CLIP` named `clip`;
- multiline `STRING` prompt;
- optional `IMAGE`, `VIDEO`, and `AUDIO`;
- `max_length`, sampling on/off, temperature, top-k, top-p, min-p, repetition penalty, seed, optional presence penalty;
- `thinking` and `use_default_template`.

It returns one `STRING`. Execution is exactly:

```text
clip.tokenize(prompt, media..., thinking, template policy)
  -> clip.generate(tokens, sampling parameters)
  -> clip.decode(generated token ids)
  -> STRING
```

Sources:

- [ComfyUI `TextGenerate` at installed revision](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy_extras/nodes_textgen.py)
- [ComfyUI `CLIP.generate`, model loading and decode at installed revision](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/sd.py)

Consequences:

- There is no public, generic ComfyUI `LLM` socket type behind this node.
- `Generate Text` does not provide JSON mode, grammar-constrained decoding, tool calls, response schemas, or validation.
- `use_default_template` and `thinking` are tokenizer/model conventions, not portable semantics across arbitrary `CLIP` instances.
- ComfyUI loads the `CLIP` patcher through its model manager before generation; reuse participates in ComfyUI's loading/offloading rather than creating an unrelated Transformers cache.
- The node calls `cond_stage_model.generate`; therefore a normal conditioning encoder that lacks that method will fail at runtime even though its socket type is `CLIP`.

### Current Qwen compatibility in ComfyUI

The installed source detects Qwen2.5, Qwen3, Qwen3.5, and Qwen3-VL variants as text encoders. Detection/loading does **not** imply generation support. The strongest confirmed reusable path is Qwen3-VL:

- `Qwen3VLClipModel` implements `generate`;
- its tokenizer owns the Qwen chat template and thinking suppression;
- generation supports text and image embeddings and returns token IDs for `CLIP.decode`;
- it uses ComfyUI's own llama implementation and model patcher rather than Hugging Face `AutoModelForCausalLM`.

At the same pinned revision, `Qwen35` internally inherits generative machinery, but `Qwen35ClipModel` does not expose the wrapper-level `generate` method required by `CLIP.generate`. It must therefore be treated as unsupported by the stock `Generate Text` contract until ComfyUI adds that adapter or BV provides and tests one. Plain Qwen3 conditioning configurations likewise must not be assumed generative merely from model detection.

Sources:

- [Qwen3-VL wrapper and tokenizer](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/qwen3vl.py)
- [Qwen3.5 wrapper](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/qwen35.py)
- [Text-encoder detection and construction](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/sd.py)
- [ComfyUI causal generation loop, sampling and KV cache](https://github.com/Comfy-Org/ComfyUI/blob/72865f4f27eaf5396f8f36370e0a2be3a9a090ee/comfy/text_encoders/llama.py)

BV should perform an explicit preflight such as `supports_generate(clip)` and fail with a precise message naming the loaded encoder. It should not catch `AttributeError` after a long queue run and call that capability detection.

## Registry/repository patterns worth adopting

The Registry query is discovery only; repository source remains authoritative.

| Nodepack | Execution shape | Reusable object contract | Memory/dependency behavior | BV relevance |
|---|---|---|---|---|
| ComfyUI core Generate Text | Existing `CLIP` in, `STRING` out | Standard `CLIP`, but only if its internal model implements generation | Comfy model management; no extra runtime | Preferred in-process adapter |
| [ComfyUI Qwen chat models](https://github.com/ConstantlyGrowup/ComfyUI_Qwen_chat_models) | Node selects/downloads Qwen2.5/Qwen3 or VL, loads and generates internally | No cross-pack standard LLM handle is documented; result is text | Transformers, optional bitsandbytes 4/8-bit, shared cache, pin or unload | Useful reference for cache policy; avoid copying its fused loader+generator boundary |
| [ComfyUI-Qwen3.5](https://github.com/workordie/ComfyUI-Qwen3.5) | Separate monolithic Transformers, GGUF CLI, and WaveSpeed nodes | Outputs response/thinking strings; no reusable model output | Transformers + accelerate + optional bitsandbytes, or separately built `llama-mtmd-cli`; keep-loaded flag; CPU/GPU-layer controls | Evidence that local and service backends need one BV interface; not a composable provider contract |
| [ComfyUI-GGUF-FX](https://github.com/weekii/ComfyUI-GGUF-FX) | Loader emits a custom model configuration consumed by generation | Pack-private model/config type | llama.cpp/llama-cpp/Nexa choices, context and GPU-layer controls | Loader/generator separation is good, but its private socket must not become BV's public ABI |
| [ComfyUI-LLM-Session](https://github.com/kantan-kanto/ComfyUI-LLM-Session) | GGUF via llama-cpp-python with persistent sessions | Session-oriented, pack-private state | Explicit unload node; KV/history persistence; backend-build compatibility risk | Too stateful for deterministic enhancement, but useful evidence for unload and cache controls |
| [ComfyUI-MultiModal-Prompt-Nodes](https://github.com/kantan-kanto/ComfyUI-MultiModal-Prompt-Nodes) | Local GGUF, local model, and Qwen cloud paths inside prompt-specific nodes | Primarily text results, not a neutral shared provider | Searches `models/LLM` and `models/text_encoders`; llama-cpp-python compatibility varies | Closest use case, but reinforces separating prompt policy from runtime provider |

The recurring custom-node pattern is a monolithic node that owns model selection, download, loading, prompting, generation, cleanup, and output parsing. It is convenient for a demo but creates duplicate caches, workflow churn when models change, and no interoperable model socket. BV should take the useful pieces—explicit quantization, keep/unload behavior, GPU-layer/offload controls, model-path discovery—and keep them behind a stable provider interface.

## Proposed BV node and object contracts

### Workflow nodes

```text
BV Regional Prompt Enhancer
  required: BV_REGIONAL, BV_LLM_PROVIDER
  optional: seed, generation policy
  output: BV_ENHANCEMENT_RESULT

BV Comfy CLIP LLM Provider
  required: CLIP
  output: BV_LLM_PROVIDER

BV OpenAI-Compatible LLM Provider
  required: base URL, model
  optional: API key reference, timeout, sampling defaults
  output: BV_LLM_PROVIDER

BV Apply Regional Enhancement
  required: BV_REGIONAL, BV_ENHANCEMENT_RESULT
  output: BV_REGIONAL
```

`BV_LLM_PROVIDER` should be a BV-owned immutable configuration/capability object, not a third-party model instance. For the CLIP adapter it may hold the workflow-provided object reference for the duration of execution, but serialization must contain only a provider descriptor, never model weights, Python object identities, API keys, or sessions.

Recommended provider protocol:

```python
class LLMProvider(Protocol):
    provider_id: str
    capabilities: LLMCapabilities

    def generate(self, request: LLMRequest) -> LLMResponse: ...

class LLMCapabilities:
    structured_output: Literal["native_schema", "json_mode", "prompt_only"]
    deterministic_seed: bool
    media: frozenset[Literal["image", "video", "audio"]]
    local_execution: bool
    model_identity: str
```

`LLMRequest` should contain system/user messages, maximum output tokens, deterministic sampling settings, optional schema, and a cancellation/timeout budget. `LLMResponse` should contain raw text, provider/model identity, finish reason if available, usage if available, warnings, and sanitized diagnostics.

### Why not accept arbitrary third-party `LLM` sockets

Comfy custom socket names are strings, not a shared Python protocol. Two packs can both expose `LLM` while returning incompatible objects, ownership rules, and lifetimes. Supporting named third-party handles would require explicit adapters pinned and tested per pack. It must not be accidental duck typing in the core enhancer.

## Structured output and verifier

Neither core `Generate Text` nor the inspected local Qwen nodes establishes a trustworthy structured-output guarantee. Even providers with JSON/schema mode only constrain syntax; they do not prove preservation of the regional document. The deterministic verifier remains mandatory and provider-independent.

Recommended response envelope:

```json
{
  "schema_version": 1,
  "document_id": "...",
  "regions": [
    {"id": "...", "prompt": "..."}
  ]
}
```

Verification order:

1. extract exactly one JSON value; reject Markdown fences, prose, duplicate keys, NaN/Infinity, excessive nesting/size, and trailing data;
2. validate the closed schema (`additionalProperties: false`), version, types, lengths, and total output budget;
3. require the same document ID and exactly the requested region-ID set, each exactly once and in canonical order;
4. reject mutation of geometry, masks, strengths, priorities, locked facts, or any non-prompt field by making those fields impossible in the response schema;
5. apply semantic preservation checks/warnings, then produce a diff; never mutate the source document in the enhancer;
6. at most one or two bounded repair attempts using only validation errors, invalid output, and the schema; on failure return an invalid result and preserve the original.

For the Comfy `CLIP` adapter, request prompt-only JSON and verify locally. For an OpenAI-compatible endpoint, use native schema/JSON mode when the selected server advertises it, but still run the same verifier. Capability negotiation should downgrade explicitly with a warning, never silently.

Security requirements:

- API keys are secret widgets/environment references and must not enter workflow JSON, logs, metadata, or `BV_ENHANCEMENT_RESULT`.
- Default local endpoint policy should allow loopback; non-loopback URLs should require explicit user configuration. Protect against arbitrary URL fetch/SSRF if endpoints become dynamically supplied.
- Set connection/read timeouts, response-size limits, and cancellation behavior.
- Do not auto-download weights from an enhancer execution. Downloads belong to an explicit loader/setup action.
- Treat model text as untrusted data; it never controls node types, file paths, URLs, Python imports, or executable workflow data.

## VRAM, offloading and dependencies

### Reusing Comfy `CLIP`

This is the only path that can genuinely reuse a text/VLM already loaded for another part of the workflow. Comfy's `CLIP.generate` calls its model manager before inference. It avoids a second Transformers model cache, although the full generative weights and KV cache can still be large. A diffusion text encoder may be truncated or saved without an LM head; capability and a small generation preflight fixture are required.

Qwen3-VL-4B-Instruct's official snapshot is about 8.89 GB before runtime overhead. This is a useful weight-size floor, not a VRAM promise; dtype, quantization, image tokens, context length, KV cache, attention backend, and concurrent diffusion models determine actual use. [Official pinned Qwen3-VL-4B-Instruct model snapshot](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/tree/ebb281ec70b05090aa6165b016eac8ec08e71b17)

### Transformers loader

The compared Qwen packs add `transformers`, `accelerate`, and often `bitsandbytes`, then manage their own global cache. This can conflict with Comfy's allocator/offload expectations and duplicate a model already represented as `CLIP`. If BV later ships such a loader, it should be optional, lazy-imported, isolated in its own requirements extra, use `models/LLM`, expose quantization/device/offload policy, and have an explicit unload path. It should never be imported merely to use the HTTP or Comfy-CLIP adapter.

### GGUF

GGUF substantially reduces resident weight memory and can offload selected layers, but introduces backend/build coupling. `llama-cpp-python` wheels, CUDA architecture, multimodal handlers/mmproj files, and external `llama-mtmd-cli` builds are not interchangeable. Prefer an OpenAI-compatible llama.cpp server for the first GGUF integration because it keeps those dependencies outside the BV process. A future in-process GGUF provider must be an optional plugin-like adapter, not a base dependency.

## Licensing boundary

- ComfyUI is GPL-3.0; BV may integrate with its runtime APIs under the repository's existing GPL boundary.
- The inspected `ComfyUI-Qwen3.5` code is Apache-2.0; `ComfyUI-LLM-Session` and `ComfyUI-MultiModal-Prompt-Nodes` state GPL-3.0. Do not copy code merely because it demonstrates a useful pattern; implement the BV contract against primary runtime APIs.
- Qwen3 open-weight models are stated as Apache-2.0, and the pinned Qwen3-VL-4B-Instruct model card is Apache-2.0. Exact model and quantized derivative licenses must still be checked per selected artifact; a runtime family name is not sufficient. [Official Qwen3 repository](https://github.com/QwenLM/Qwen3) · [Pinned Qwen3-VL model snapshot](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/tree/ebb281ec70b05090aa6165b016eac8ec08e71b17)
- BV should not redistribute model weights, GGUF conversions, mmproj files, or llama.cpp binaries. Display/link the selected artifact's license separately from BV's code license.

This is engineering license triage, not legal advice.

## Implementation sequence

1. Define `BV_LLM_PROVIDER`, request/response types, closed response schema, and deterministic verifier tests.
2. Implement `comfy_clip_generate` with capability preflight, precise unsupported-encoder errors, greedy/default deterministic mode, raw-response capture, and no repair mutation.
3. Prove it with a pinned Qwen3-VL `CLIP` workflow and Comfy's core Generate Text as an A/B oracle.
4. Implement the OpenAI-compatible adapter with loopback-safe defaults and native-schema capability negotiation; test Ollama/Qwen as one server profile, not as a special architecture.
5. Add repair attempts and `BV_ENHANCEMENT_RESULT` diff/apply flow.
6. Only after real demand, prototype a BV-owned GGUF or Transformers loader. Do not bind the enhancer to a third-party pack-private socket.

## Required tests before claiming support

- compatible Qwen3-VL `CLIP` succeeds and produces valid JSON under greedy decoding;
- non-generative Qwen/CLIP fails before inference with the exact detected identity;
- missing/truncated LM weights fail deterministically;
- same seed/settings reproduce output where the provider claims deterministic seeding;
- duplicate/missing/unknown region IDs and extra fields are rejected;
- malformed JSON, fences, trailing prose, oversized output, deep nesting, and duplicate keys are rejected;
- locked facts and source `BV_REGIONAL` remain byte-for-byte unchanged on every failure;
- model unload/reload behavior is measured alongside a loaded diffusion model on the target 24 GB GPU;
- OpenAI-compatible timeout, cancellation, unreachable host, invalid certificate, auth failure, and response-size limits produce bounded errors without leaking secrets;
- workflows serialize without Python objects or API keys and reopen with a clear provider state.

## Bottom line

Qwen is not one integration path. Today it can arrive as a generative Comfy `CLIP` (confirmed for Qwen3-VL at the installed revision), a Transformers/GGUF model loaded by a custom node, or a local OpenAI-compatible service. BV should normalize all of them behind its own provider protocol. Start with `CLIP` reuse plus OpenAI-compatible HTTP, keep model loading optional, and make the verifier the invariant center of the design.

# Regional canvas image contract

## Scope

Regional canvas images are a UI-only projection for the BV Regional Editor. They
do not become part of the Regional document, `RegionalContext`, LoRA/detailer/LUT
capabilities, or the planned reference system.

The producers are:

- `BV Regional Image Send`
- `BV Regional Image Save`
- the optional `canvas_image` input of `BV Regional Prompt`

## Backend publication v1

Every producer publishes `ui.bv_regional_canvas_images` with schema
`bv.regional.canvas-images`, version `1`, a target `document_id`, a source
containing the hierarchical Comfy execution `node_id` and source `kind`, a
deterministic `batch_id`, and the complete ordered image-descriptor batch.
Descriptors contain `index`, `filename`, `subfolder`, and `type`. The frontend
validates this contract and constructs `/view` URLs itself.

The prompt image is stored through ComfyUI's temporary preview storage but does
not add a runtime output. With no image connected, the existing two-value Prompt
result remains byte-for-byte structurally unchanged.

`BV Regional Prompt` is an `OUTPUT_NODE` so ComfyUI executes the publication
path even when neither Regional output has a downstream consumer. Consequently,
every Prompt instance is a queue root and can pull its connected image/provider
upstream into execution. Draft and legacy Prompt instances without
`canvas_image` therefore remain deliberately supported and keep the original
two-output result; no `IS_CHANGED` override or separate companion output node is
used.

## Catalog and workflow ownership

`RegionalCanvasImageCatalog` is the only frontend owner. It partitions entries
by workflow scope and then by source and Regional document. Each source retains
only its newest complete batch; rerunning a source replaces its previous batch,
and shrinking a batch removes obsolete indices.

Prompt queue origin is captured before `api.queuePrompt` is submitted and is
bound authoritatively when the response supplies its `prompt_id`. If ComfyUI
emits `execution_start` before that response, the tracker consumes exactly one
pending token in accepted queue order; the token cannot be reused by another
prompt. Execution and cache events are accepted only for the bound workflow
scope. Uncorrelated or late events are rejected, so switching workflows cannot
attach an old result to the newly active graph. Cached nodes hydrate from
ComfyUI's current `nodeOutputs` publication when available.

The source identity is the hierarchical execution ID received in the execution
event. This distinguishes root nodes and multiple instances of the same
Subgraph. Graph pruning resolves the same colon-separated execution path and
removes deleted, disconnected, or retargeted sources.

## Selection semantics

`Last Sent Image` is the default follow-mode sentinel. It resolves to the final
image of the latest accepted publication across all three source kinds. An
explicit selection uses source identity plus batch index; it remains selected
when other sources publish and follows a rerun of the same source/index. If that
index disappears, the editor displays `Source unavailable` and an empty canvas
instead of silently choosing another image.

Selection state is ephemeral and partitioned by workflow scope and document.
It is not serialized into the Regional document or the current document-only
editor-state storage.

## Prompt slot compatibility

`canvas_image` is appended after every existing optional/provider backend input.
The frontend initially suppresses it together with provider bootstrap inputs and
uses the central idempotent deferred-public-input reconciler only after provider
reconciliation. Existing provider slot objects, links, and target indices are
never rebuilt or reordered. The lifecycle seam is registered in
`PRESENTATION_EXCEPTIONS`.

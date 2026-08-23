# BV Regional v3 Milestone 0 hidden-link result

Status: **Go**

Validated on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7 in a separately started terminal server on
port 8190, its own SQLite database, and fresh Nodes 2.0 browser tabs.

The earlier No-Go was invalid. It tested ad-hoc LiteGraph `input.hidden`
rendering and then removed the fake nodes before completing the gate. Existing
BV hidden-input behavior prompted a full retest against the real Nodes 2.0 DOM.
The corrected implementation uses normal typed ComfyUI links and structural
Nodes 2.0 CSS to suppress only the visual port and link presentation.

## Spike contract

The retained technical spike provides:

- typed fake collector output and consumer input
  `BV_RUNTIME_RESOURCE_PROVIDER_M0`;
- one stable `collector_id` and two stable `resource_id` values;
- a mutable integer runtime value with explicit `IS_CHANGED` data;
- strict ID-only resolution and understandable unresolved errors;
- a shared React Resource Picker using the existing BV UI package;
- an ordinary persisted `collector.connect(..., consumer, ...)` graph link;
- a graph-local transient catalog reconstructed from collector nodes;
- hidden IDs, consumer port and link with an explicit debug reveal toggle;
- copy remapping based on copied stable IDs and the copied real link.

The spike has no prompt or queue hook, workflow registry, runtime singleton,
global DOM observer, name/type lookup fallback, cache heuristic, or prompt
rewriting. Dynamic React controls are DOM widgets with `serialize: false` and
are not mixed into positional `widgets_values`.

## Gate evidence

| Requirement | Evidence | Result |
| --- | --- | --- |
| Save and reload retain the real link | Reloaded Nodes 2.0 workflow retained consumer provider link `1:0`; queued workflow JSON still contained `resource_provider: ["1", 0]`. | Pass |
| Ordinary queue dependency | The normal Run action queued collector node `1` before consumer node `2`; no prompt hook or rewrite exists. | Pass |
| Producer change invalidates consumer cache | An unchanged second run cached collector and consumers. Changing only `runtime_value` from 1 to 2 produced an empty cached-node list and recomputed the linked consumer. | Pass |
| Hide and reveal port/link | Normal Nodes 2.0 view exposed zero consumer inputs and no visible link. Enabling `bv_m0_debug` exposed exactly the real `in-0` port and link; disabling it hid both again. | Pass |
| Joint copy/paste | Copying a linked collector/consumer pair produced collector node `4` and consumer node `5`, retained link `4:0`, generated a fresh collector ID and two fresh resource IDs, and remapped the consumer to those copied IDs. | Pass |
| Isolated consumer copy | Isolated copies had no provider link, retained the explicit selected IDs for diagnosis, rendered `Unresolved resource selection`, and failed with the clear missing-collector message. | Pass |
| Root graph | A root collector/consumer pair queued and completed through the ordinary stored typed link. | Pass |
| Subgraph | Converting the test graph to a Nodes 2.0 subgraph produced flattened prompt links `7:1 -> 7:2` and `7:4 -> 7:5`; inside the subgraph, linked selections remained resolved and isolated consumers remained unresolved. | Pass |
| Bypass | Bypassing the linked collector omitted it from the prompt and left no provider input on its consumer; the consumer failed closed with the missing-collector message. | Pass |
| Mute | The official Nodes 2.0 `Ctrl+M` command marked the collector `Muted`, omitted it from the normal prompt, and produced the same fail-closed missing-collector result without fallback. | Pass |
| Deleted/missing collector | Deleting a linked collector immediately changed its consumer picker to unresolved; queuing produced `BV M0 resource collector is missing for collector_id ...`. | Pass |
| Picker switching | Switching collector changed the physical origin link and stable collector/resource IDs. Switching Alpha/Beta changed only the stable resource ID. No display name participated in resolution. | Pass |
| UI reconstruction dirty behavior | The catalog is recomputed from the current graph during node configure/render. It performs no graph writes, uses no global observer, and its DOM widget is non-serializing; reload preserved the same serialized workflow/link state. | Pass |
| Existing BV validation | 288 Python tests and 245 UI tests passed; TypeScript typecheck and the Vite production build passed. | Pass |

Focused M0 checks additionally passed 3 Python contract tests and 4 Resource
Picker/link-source tests. The UI source test explicitly rejects queue hooks,
name fallback, `MutationObserver`, and document-wide DOM lookup.

## Decision

All mandatory Milestone 0 tests are reliably green. The ordinary persisted
hidden typed-link model is approved for BV Regional v3.

This decision permits later milestones to use the model; it does not implement
the Context Kernel, LoRA, Detailer, or any later V3 milestone.

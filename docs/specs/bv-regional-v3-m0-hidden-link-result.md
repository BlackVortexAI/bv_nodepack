# BV Regional v3 Milestone 0 hidden-link result

Status: **Go — validation complete**

The previous Go decision was withdrawn after manual visual review exposed that
the classic renderer still showed the provider port and link. The subsequent
full retest also found that using LiteGraph's `input.hidden` flag removed the
ordinary provider dependency from the queued prompt, that picker reconstruction
marked the workflow dirty, and that temporarily replacing canonical slot arrays
while drawing caused Nodes 2.0 to persist an empty input model. The final
implementation corrects all three defects and every gate was repeated against
the final build.

Validated on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7 in a separately started terminal server on
port 8190 and fresh Nodes 2.0 browser tabs. The user-supplied reproduction
workflow remained unchanged; a separate persisted validation copy was written
to `Testing/V3/BV M0 Node2 Validation.json` and reloaded from disk.

The earlier No-Go was invalid. It tested ad-hoc LiteGraph `input.hidden`
rendering and then removed the fake nodes before completing the gate. Existing
BV hidden-input behavior prompted a full retest against the real Nodes 2.0 DOM.
The corrected implementation keeps normal typed ComfyUI links semantically
visible to serialization and prompt generation. Classic ports are projected
only while drawing. Links are skipped directly by the canvas link renderer,
without changing slot/link state. Nodes 2.0 ports and persisted ID widgets are
suppressed with stable node-type-scoped DOM selectors. UI lifecycle events only
reapply transient presentation markers and never write graph state.

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
| Save and reload retain the real link | A separate `Testing/V3/BV M0 Node2 Validation.json` was saved, opened from disk in a new tab, remained resolved and executed successfully. Its queued prompt retained `resource_provider: ["9", 0]`. | Pass |
| Ordinary queue dependency | The normal Run action emitted collector node `9` and consumer node `10` with `resource_provider: ["9", 0]`; history completed with `status_str: "success"`. No prompt hook or rewrite exists. | Pass |
| Producer change invalidates consumer cache | An unchanged second run cached nodes `11,12`. Changing only `runtime_value` from 1 to 2 produced an empty cached-node list and recomputed the linked consumer. | Pass |
| Hide and reveal port/link | Cleanly separated Node 1.0 and Nodes 2.0 pairs were inspected end-to-end. Normal view hid collector output, consumer input, and the complete link; debug revealed all three. | Pass |
| Joint copy/paste | Copying a linked collector/consumer pair produced collector node `4` and consumer node `5`, retained link `4:0`, generated a fresh collector ID and two fresh resource IDs, and remapped the consumer to those copied IDs. | Pass |
| Isolated consumer copy | Isolated copies had no provider link, retained the explicit selected IDs for diagnosis, rendered `Unresolved resource selection`, and failed with the clear missing-collector message. | Pass |
| Root graph | A root collector/consumer pair queued and completed through the ordinary stored typed link. | Pass |
| Subgraph | The official Nodes 2.0 conversion produced flattened prompt links `16:11:0 -> 16:12` and `16:11:0 -> 16:13`; execution completed successfully. | Pass |
| Bypass | Bypassing the linked collector omitted it from the prompt and left no provider input on its consumer; the consumer failed closed with the missing-collector message. | Pass |
| Mute | The official Nodes 2.0 `Ctrl+M` command marked the collector `Muted`, omitted it from the normal prompt, and produced the same fail-closed missing-collector result without fallback. | Pass |
| Deleted/missing collector | Deleting a linked collector immediately changed its consumer picker to unresolved; queuing produced `BV M0 resource collector is missing for collector_id ...`. | Pass |
| Picker switching | Switching collector changed the physical origin link and stable collector/resource IDs. Switching Alpha/Beta changed only the stable resource ID. No display name participated in resolution. | Pass |
| UI reconstruction dirty behavior | Reconstruction passes `markDirty=false`, performs no graph writes, uses no global observer, and its DOM widget is non-serializing. After execution-triggered Nodes 2.0 DOM replacement, IDs/ports stayed hidden while the queued serialized workflow retained the physical link. | Pass |
| Existing BV validation | 288 Python tests and 250 UI tests passed; TypeScript typecheck and the Vite production build passed. | Pass |

Focused M0 checks additionally passed 3 Python contract tests and 10 Resource
Picker/graph/projection tests. The UI source tests explicitly reject queue
hooks, name fallback, semantic `input.hidden` flags, and `MutationObserver` use,
and verify that the Nodes 2.0 render path never replaces canonical slot arrays.

## Decision

All automated, persisted-workflow, queue, and visual Milestone 0 tests are
reliably green. The ordinary persisted hidden typed-link model is approved for
BV Regional v3.

This decision permits later milestones to use the model; it does not implement
the Context Kernel, LoRA, Detailer, or any later V3 milestone.

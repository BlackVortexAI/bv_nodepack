# BV Regional v3 Milestone 0 hidden-link result

Status: **No-Go**, confirmed after corrected Hidden-InputSpec retest

Tested on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7 in a freshly started terminal server and fresh
browser tab.

## Corrected spike

The first spike incorrectly relied on setting `input.hidden = true` after node
creation. The retest declared the real typed consumer input server-side instead:

```python
"resource_provider": (
    "BV_RUNTIME_RESOURCE_PROVIDER_M0",
    {"hidden": True},
)
```

The temporary spike also provided:

- one stable `collector_id` and two stable `resource_id` values;
- a mutable integer runtime value with explicit `IS_CHANGED` data;
- strict ID-only resource resolution with understandable unresolved errors;
- a shared React Resource Picker using the existing BV UI package;
- an ordinary persisted `collector.connect(..., consumer, ...)` graph link;
- graph-local catalog reconstruction from nodes marked with the provider
  protocol, without lookup by display name or node type;
- a debug reveal toggle for the attempted port/link presentation.

It did not wrap `graphToPrompt` or `queuePrompt`, persist a workflow registry,
use a runtime singleton, or fall back by name.

## Evidence that ordinary links work

The running server's `/object_info` response preserved `hidden: true` on the
typed `resource_provider` InputSpec. A directly queued prompt preserved the
ordinary dependency as:

```json
"resource_provider": ["1", 0]
```

The queue completed successfully. Repeating the same prompt reported both fake
nodes as cached. Changing only the collector runtime value caused neither node
to be cached, proving that the producer change invalidated the consumer through
the normal ComfyUI dependency.

The corrected focused checks passed before the live gate:

- 3 Python contract tests;
- 244 frontend tests, including 3 focused spike checks;
- TypeScript typecheck;
- production UI build.

## Blocking visual result

In the fresh Nodes 2.0 tab, the fake nodes were discoverable and the Resource
Picker rendered. Nevertheless the consumer still visibly rendered the
`resource_provider` socket and label.

Source inspection explains the result. Frontend 1.48.7 applies InputSpec
`hidden` while creating widgets in `litegraphService.addInputWidget`. Non-widget
custom-type inputs take the separate socket path; its Nodes 2.0 preview and
renderer do not filter or hide the socket from that metadata. Mutating the
LiteGraph input's ad-hoc `hidden` property likewise has no supported rendering
effect.

Existing BV Smart Pipe behavior is not counter-evidence: it removes dormant,
unconnected physical ports and keeps connected ports present. Its explicit
`hidden` assignments apply to widgets. MiniMax H3's server-hidden transport
inputs are paired with queue-time prompt materialization, which V3 explicitly
forbids and therefore cannot be reused as proof of an ordinary stored hidden
link.

Because hiding and revealing the real connected port is a mandatory gate, the
remaining save/reload, copy/paste, subgraph, bypass/mute, deletion and dirty-state
matrix cannot produce a Go. They were not claimed as passing evidence after the
blocking renderer result.

## Decision

The ordinary-link execution model works, but a reliably hidden connected typed
port does not on the tested Nodes 2.0 frontend. Milestone 0 is therefore No-Go.
Later V3 milestones must use progressively revealed visible typed resource ports.

The temporary runtime spike was removed after recording the evidence. No queue
hook, prompt rewriting, mutable global registry, provider discovery heuristic,
cache heuristic, or other replacement mechanism is retained.

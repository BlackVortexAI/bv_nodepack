# BV Regional v3 Milestone 0 hidden-link result

Status: **No-Go**

Tested on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7 in a freshly started server and fresh browser
tab.

## Spike

The temporary spike registered a typed fake resource collector and consumer.
The collector owned one stable `collector_id`, two stable `resource_id` values,
and a mutable integer runtime value. The consumer used an ordinary persisted
ComfyUI link and a graph-local React Resource Picker reconstructed from collector
nodes. The implementation did not wrap `graphToPrompt` or `queuePrompt`, did not
create a persisted workflow registry, and did not use a runtime singleton or
name-based fallback.

The spike compiled and its focused automated checks passed:

- 3 Python contract tests;
- 244 frontend tests, including 3 focused spike checks;
- TypeScript typecheck;
- production UI build.

## Blocking result

In a fresh ComfyUI tab, both fake node definitions were discoverable in the Node
Library and the shared picker rendered. The frontend set the typed consumer input
to hidden and made the associated link transparent unless debug reveal was
enabled. Nevertheless, the current Nodes 2.0 canvas continued to render the
`resource_provider` input port visibly on the consumer node.

Therefore the mandatory requirement that both port and link can be hidden and
revealed reliably is not satisfied. The acceptance rule requires every Milestone
0 test to pass, so the remaining save/reload, queue, cache, copy/paste, subgraph,
bypass/mute, deletion, picker-switch, and dirty-state cases cannot convert this
result into a Go and were not treated as release evidence.

## Decision

The hidden-link model is rejected for BV Regional v3 on this tested ComfyUI
frontend. The temporary runtime spike was removed after recording the result.
Later V3 milestones must use progressively revealed visible typed resource ports.

No queue hook, prompt rewriting, mutable global registry, provider discovery by
display name or node type, cache heuristic, or other replacement mechanism may be
introduced to simulate wireless behavior.

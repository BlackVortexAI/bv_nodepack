# BV Regional v3 Milestone 0 hidden-link result

Status: **Go with a mandatory same-graph boundary**

Validated on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7.

## Approved contract

A collector and every consumer binding that references it must belong to the
same concrete ComfyUI graph:

- root collector to root consumer: allowed;
- collector and consumer inside the same subgraph definition: allowed;
- root to subgraph, subgraph to root, and one subgraph to another: invalid.

The Resource Picker catalogs only collector nodes from `consumer.graph`.
Collector display names and node types never participate in persistence or
resolution. A copied consumer whose persisted selection is not backed by a real
same-graph collector link is repaired to an explicit unresolved binding:

- `collector_id` and `resource_id` are cleared;
- the invalid consumer input link is disconnected;
- the binding row and stable `binding_id` remain visible;
- no collector is selected automatically;
- prompt validation fails with an explanation that collector and consumer must
  be in the same graph;
- runtime validation remains as a second fail-closed layer.

Jointly copying a linked collector and consumer into the same target graph
retains the real link and remaps their stable IDs together.

## Proven behavior

- ordinary persisted typed ComfyUI links, with no prompt rewriting;
- one stable collector ID and two stable resource IDs;
- mutable producer runtime value and ordinary cache invalidation;
- shared BV Resource Picker with visible unresolved state;
- four-collector live fan-in and a twenty-collector automated stress path;
- hidden ports, anchors, labels, and links in normal presentation;
- dashed animated native links in debug presentation;
- fresh workflow loads in Nodes 1.0 and Nodes 2.0 without canonical-array
  replacement by the BV canvas projection;
- save/reload, queue dependency, copy/paste, isolated copy, bypass/mute,
  deleted collector, picker switching, and non-dirty UI reconstruction;
- root graphs and same-subgraph collector/consumer pairs.

The implementation contains no queue hook, global persisted registry, runtime
singleton, name fallback, cache heuristic, global DOM observer, or replacement
link overlay. Dynamic picker controls remain non-serializing DOM widgets and are
not added to positional `widgets_values`.

## Final evidence

- Vite production build passed (117 modules).
- TypeScript typecheck passed.
- All 273 UI tests passed, including 21 focused M0 picker/link tests.
- All 293 Python tests passed, including 8 focused M0 runtime/validation tests.
- `git diff --check` passed.
- Fresh isolated Nodes 2.0 session: four resolved root-graph bindings rendered
  four native dashed debug links.
- Fresh isolated Nodes 1.0 session: the same saved four-binding workflow loaded
  with zero unresolved rows and `graphToPrompt()` contained all four ordinary
  `resource_provider_*` dependencies without prompt rewriting.
- Fresh isolated Nodes 2.0 session: a same-subgraph collector/consumer pair was
  resolved visually and executed successfully in 0.20 seconds.
- Fresh isolated Nodes 2.0 session: a root collector was absent from the inner
  consumer picker, the stale binding was visibly unresolved with cleared IDs and
  no link, and prompt validation rejected execution with the same-graph message.

## Deferred research

Cross-graph resource routing is explicitly outside the V3 contract. A technical
spike proved that execution can traverse exposed subgraph inputs and outputs,
but Nodes 2.0 did not reliably render the host-to-host debug segment when both
exposed anchors were hidden. This does not block V3 under the same-graph rule.

A future, separately approved Smart Pipe/Subgraph research project may evaluate
official exposed-port manipulation and renderer APIs. Cross-graph bindings may
only be admitted after their own full feasibility gate; they must not be enabled
incrementally or by fallback heuristics in the V3 implementation.

Live switching between the beta Nodes 2.0 renderer and Nodes 1.0 is not part of
the approved persistence contract. The ComfyUI menu switch can reconstruct the
active canvas and discard the spike's native provider edges during a two-way
renderer roundtrip even though a fresh load of the saved workflow works in each
renderer independently. M0 validation therefore follows the project-wide
fresh-session rule and never treats an in-place renderer conversion as a
save/reload substitute. No prompt hook, registry, or link-repair heuristic is
introduced to mask this frontend behavior. A future renderer/subgraph research
project may re-evaluate it against official ComfyUI APIs.

## Decision

Milestone 0 is **Go** for same-graph hidden typed resource links. This approves
the transport and picker model for later V3 milestones under the boundary above;
it does not itself implement Context Kernel, LoRA, Detailer, or Milestone A.

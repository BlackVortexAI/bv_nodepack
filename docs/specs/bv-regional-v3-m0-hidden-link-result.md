# BV Regional v3 Milestone 0 hidden-link result

Status: **No-Go**

Validated on 2026-08-23 with ComfyUI 0.33.1 and
`comfyui-frontend-package` 1.48.7 in an isolated ComfyUI session on port 8192.

The spike proves that ordinary persisted typed links can provide strict
ID-based resource selection, native multi-provider fan-in, cache dependencies,
copy remapping, and execution across exposed subgraph boundaries. It does not
prove the complete hidden-link presentation reliably enough for V3: in Nodes
2.0 a real host-to-host link between two subgraph instances is not rendered
when both exposed typed anchors are hidden. The prompt still contains the
dependency and executes successfully, but debug mode cannot show the required
complete dashed connection chain without drawing a replacement overlay or
revealing progressive ports.

Per the gate rule, no replacement line registry, prompt hook, queue rewrite,
runtime singleton, name lookup, or cache heuristic was added. Later milestones
must use progressively visible typed ports unless a future ComfyUI renderer API
provides a stable native solution and Milestone 0 is explicitly reopened.

## Proven behavior

- one stable `collector_id`, two stable resource IDs, and mutable runtime data;
- one ordinary stored `BV_RUNTIME_RESOURCE_PROVIDER_M0` edge per binding;
- four-provider live fan-in and a twenty-provider automated stress path;
- graph-local transient catalog reconstructed from collector nodes;
- strict ID-only resolution with visible unresolved state and clear errors;
- normal hidden presentation and dashed animated debug links in root graphs;
- collector outside / consumer inside a subgraph;
- collector inside / consumer outside a subgraph;
- collector and consumer inside the same subgraph;
- picker rewiring across an exposed subgraph input by changing the real parent
  host link while retaining the inner boundary link;
- collector-subgraph to consumer-subgraph execution through the ordinary
  host-to-host dependency;
- Nodes 1.0 / Nodes 2.0 renderer roundtrip without input-array loss;
- save/reload, queue dependency, cache invalidation, copy/paste, isolated-copy
  unresolved handling, bypass/mute, deleted collector, and non-dirty UI rebuild
  from the earlier focused gate runs.

## Decisive failing case

Workflow `M0 Subgraph To Subgraph` stores three ordinary typed edges:

1. internal collector to the first subgraph output;
2. first subgraph host output to second subgraph host input;
3. second subgraph input to the internal consumer.

The picker resolves `BV M0 Fake Resource Collector / Alpha`, and a normal Run
completed successfully. With debug enabled, the internal and one-sided boundary
cases can render dashed links, but the root host-to-host segment remains absent
in a fresh Nodes 2.0 tab after a fresh server restart. This violates the expanded
M0 requirement that debug provide a complete visual overview while anchors and
labels remain hidden.

## Automated evidence

- 18 focused UI contract tests passed.
- 259 complete UI tests passed.
- TypeScript typecheck passed.
- Vite production build passed.
- 6 focused Python M0 tests passed.
- The first complete Python run found the new fake multi-consumer missing from
  `node_list.json`; the manifest was corrected and all 291 Python tests passed
  on the complete rerun.

## Decision

Milestone 0 is **No-Go** for the fully hidden-link model. The functional graph
model remains useful evidence, but it is not approval to start Context Kernel,
LoRA, Detailer, or another V3 milestone.

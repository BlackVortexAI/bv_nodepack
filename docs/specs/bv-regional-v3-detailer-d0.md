# BV Regional V3 Detailer — Milestone D0 contract

Status: design contract for Milestone D. This document defines the required
schema and execution seams before implementation. It does not authorize the
deferred Regional UI or deprecated-port nice-to-haves.

## Decision summary

- A Detailer Plan contains any number of ordered jobs.
- A job contains zero or one detector assignment in capability version 1.
- Different jobs may reference resources from different Detector Collectors.
- The serializable shape uses an assignment array with `maxItems: 1`; it does
  not persist a scalar `detector_id` as the V3 source of truth.
- Supporting more than one detector assignment per job requires a later
  capability version with explicit composition semantics. V1 rejects such
  payloads and never ignores surplus assignments.
- Native persisted typed ComfyUI links are the only provider truth. Collector
  and resource identity remain separate and are persisted per assignment.
- Runtime detector objects never enter the serializable Regional Context.

## Module roles and seams

### Resource producer: BV Detector Collector

`BV Detector Collector` owns a stable `collector_id` and any number of named
detector resources. Each resource has a stable `resource_id` and may resolve to
an Impact-compatible BBOX detector, segmentation detector, optional SAM model,
or another supported detector adapter.

The Collector exposes the typed hidden native provider output. It is the only
persisted provider truth and replaces the V1 assumption that a
`BV_DETECTOR_REGISTRY` object is wired directly into the plan node. A Collector
may internally reuse the existing configured-model and external-binding
implementations, but those are implementation details behind its interface.

### Configuration owner: BV Regional Detailer Plan

`BV Regional Detailer Plan` owns job order, region selection, mask and prompt
composition, detector parameters, and detector assignments. It consumes every
same-graph Detector Collector referenced by its jobs through independently
persisted typed hidden native links.

The plan resolves each `(collector_id, resource_id)` once while materializing
the Detailer capability. It resolves by stable identity, never provider slot,
node title, numeric node ID, or workflow-global state.

Milestone D0 does not introduce a separate Detailer transformer. If one is
added later, it must preserve inherited providers, append locally required
providers without duplicates, and use explicit ordered operations rather than
mutating the existing plan implicitly.

### Context executors: loop and Impact adapter

`BV Detailer Loop Start`, `BV Detailer Loop Job Resolver`,
`BV Detailer Loop Detect to SEGS (Impact)`, and `BV Detailer Loop End` are not
Collectors and do not own detector configuration. They consume the already
materialized Detailer capability/runtime plan.

The public loop seam remains state-driven: Start receives the materialized plan
and image; the resolver emits the current job; the Impact adapter converts that
job into SEGS; End advances the accumulated image. These nodes do not discover
Collectors or reconstruct a second registry.

## Serializable capability

Capability key: `bv-nodepack.detailer-plan`
Current capability version: `1`

The canonical persisted shape is JSON-only:

```json
{
  "version": 1,
  "jobs": [
    {
      "id": "job-face",
      "region_ids": ["face-region"],
      "primary_region_id": "face-region",
      "mask_composition": "union",
      "prompt_composition": "context",
      "conditioning": {
        "global_influence": 1.0,
        "background_influence": 0.35,
        "primary_region_influence": 1.0,
        "context_region_influence": 1.0
      },
      "detector_assignments": [
        {
          "id": "assignment-face",
          "source": {
            "collector_id": "detector-collector-a",
            "resource_id": "face-yolo"
          },
          "options": {
            "roi_padding": 0.15,
            "query": "face",
            "labels": ["face"],
            "threshold": 0.5,
            "dilation": 0,
            "crop_factor": 1.5,
            "drop_size": 10
          }
        }
      ]
    }
  ]
}
```

### Identity and order

- `jobs` is ordered and every job has a stable, non-empty, unique `id`.
- `region_ids` is ordered, non-empty, duplicate-free, and contains
  `primary_region_id`.
- `detector_assignments` is ordered and contains zero or one entry in v1.
- Every assignment has a stable, non-empty, unique `id`.
- `collector_id` identifies the provider node; `resource_id` identifies one
  resource owned by that provider. Both are required and non-empty.
- Changing a selected Collector clears or explicitly replaces an incompatible
  Resource selection; there is no name-based fallback.

The list shape is intentional future-proofing, not latent multi-detector
execution. A v1 payload with more than one assignment in a job is invalid and
fails closed in frontend normalization and authoritative backend validation.

### Job semantics

Jobs execute sequentially in persisted array order against one accumulated
image. Multiple jobs may target the same region and may reuse the same detector
assignment source; they remain distinct jobs with distinct IDs and settings.

Without a detector assignment, the existing region-mask-to-SEGS behavior is
preserved. With one assignment, the executor crops to the composed region ROI,
runs the resolved detector binding, applies supported query/label/SAM behavior,
rebases SEGS to the full image, and intersects them with the exact job mask.

`mask_composition` remains `union`, `intersection`, or ordered `subtract`.
`prompt_composition` remains `primary` or `context`; legacy `combined` migrates
to `context`, since both are equivalent in the current implementation.

## Runtime materialization

The Regional Context stores the canonical JSON capability, never Python detector
objects. At the Detailer Plan execution seam:

1. Normalize the Regional Context and require the supported Detailer capability.
2. Collect the distinct `collector_id` values referenced by all jobs.
3. Resolve those IDs only among the plan node's concrete linked providers.
4. Resolve every `resource_id` inside its selected Collector.
5. Build an internal `BV_DETAILER_PLAN` containing the validated document,
   ordered jobs, and the resolved detector binding for each assigned job.
6. Pass that internal plan through the existing sequential loop seam.

The internal plan may contain opaque runtime objects and is never serialized as
Regional Context or workflow configuration. The legacy `detector_registry` and
`detector_id` fields may exist only inside a compatibility adapter during
migration; they are not V3 graph truth.

Missing Collector, missing Resource, wrong resource type, unsupported capability
version, or an invalid assignment count fails closed before loop execution. An
unassigned job remains valid and uses its region mask.

## Native-link reconciliation

The plan node requires one typed provider link for every distinct Collector used
by its canonical jobs, regardless of how many assignments reuse that Collector.

Reconciliation must:

- preserve native same-concrete-graph links;
- support multiple Collectors and multiple Resources across jobs;
- derive required Collectors by stable ID in first-use job order;
- be idempotent and deferred/coalesced during UI edits;
- preserve occupied required links and disconnect surplus occupied links when
  the required set shrinks;
- tolerate temporarily missing nodes while ComfyUI reconstructs the graph;
- publish a workflow-scoped inventory refresh after links are final;
- leave unresolved selections visible and fail closed rather than substituting
  another Collector or Resource.

Subgraph and workflow boundaries are never bridged heuristically.

## UI contract for capability version 1

The editor presents an ordered list of jobs. Each job exposes exactly one
optional Detector Resource Picker:

- `None` means `detector_assignments: []`;
- one selected resource means `detector_assignments: [assignment]`;
- the UI provides no add-second-detector action in v1;
- the picker catalogs Resources from all same-graph linked/available Detector
  Collectors and displays unresolved persisted IDs without fallback;
- changing a job, Collector, Resource, or detector option updates canonical
  configuration first and schedules native-link reconciliation;
- reordering jobs changes execution order but not job or assignment identity.

The Collector editor may configure multiple detector Resources. That inventory
cardinality is independent from the one-assignment-per-job UI limit.

## Migration from Detailer Plan v1

Migration is explicit and node-local:

- every existing v1 job becomes one V3 job in the same order;
- existing job IDs are retained; missing IDs receive deterministic stable IDs;
- absent `detector_id` becomes `detector_assignments: []`;
- a present `detector_id` must be mapped to exactly one concrete same-graph
  Collector and Resource before a V3 assignment can be created;
- successful mapping creates a stable assignment ID and persists both IDs;
- ambiguous, missing, or cross-graph mapping remains Legacy/unresolved and is
  reported; it is never inferred from display name alone;
- existing detector options and conditioning values migrate without semantic
  change;
- migration computes and validates the complete candidate before replacing the
  node's canonical configuration.

The current `BV Detector Registry` may be upgraded in place to the Collector role
only if its stable resource identities, link migration, and old-workflow behavior
can be preserved. Otherwise a new internal node class owns the canonical
Collector role and the existing Registry remains Legacy. This choice belongs to
Milestone D1 implementation planning and requires fixture evidence; D0 does not
assume automatic replacement is safe.

## Explicitly deferred

- More than one detector assignment inside one job.
- Detector-result union, intersection, fallback, cascade, ensemble/NMS, or other
  multi-detector composition semantics.
- A dedicated Detailer transformer and Replace/Merge/Subtract/Clear operations.
- Generic third-party configurator UI.
- Deferred per-workflow window geometry restoration.
- Deferred deprecated-port debug reveal behavior.
- ControlNet, IP-Adapter, LUT, image-edit, and overlay capabilities.

## Milestone D acceptance matrix

Implementation may be approved only after focused unit/integration coverage and
live testing in the exact Stability Matrix ComfyUI installation prove:

1. zero, one, and many ordered jobs;
2. zero or one detector assignment per job and fail-closed rejection of two;
3. two jobs using two Resources from one Collector;
4. two jobs using two independent Collectors and Resources;
5. repeated reuse of one Collector/Resource without duplicate provider links;
6. job reorder without identity or selection drift;
7. add, remove, reactivate, and switch one assignment without affecting another;
8. save, workflow close, hard reload, reopen, and genuinely uncached execution;
9. full-graph copy preserves/remaps provider identity correctly;
10. consumer-only copy remains unresolved and fails closed;
11. Collector removal and missing Resource diagnostics;
12. same-graph enforcement across root/subgraph/workflow cases;
13. two simultaneously loaded workflows with independent workflow/node IDs;
14. transformer-chain behavior if a transformer is introduced in Milestone D;
15. detector-free mask-to-SEGS parity with the current implementation;
16. BBOX, segmentation, optional SAM, query/label filtering, ROI rebase, and
    exact job-mask intersection through the Impact adapter;
17. sequential accumulated-image behavior across multiple real Detailer jobs;
18. existing Legacy workflows retain their documented execution path;
19. fresh-session UI checks show no stale unresolved state, crash, frozen editor,
    or permanently inaccessible editor.

Proxy tests alone are insufficient. The hardest multi-job/multi-collector path
must be reproduced live with deterministic evidence where comparison is valid.

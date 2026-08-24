# BV Regional v3 architecture and migration plan

Status: approved revised design plan; implementation has not started.

BV Regional v3 replaces the growing set of public sidecar contracts with one
incrementally constructed, extensible regional context. It preserves the
`BV_REGIONAL` ComfyUI socket type and upgrades compatible consumers in place.
Only structurally incompatible legacy nodes receive separate deprecated
implementations.

The primary design objective is that future features such as LUTs, ControlNet,
IPAdapter, regional image editing, overlays, and third-party extensions can be
added without changing the v3 envelope, creating another Regional socket type,
or modifying consumers that do not use the new feature.

## Non-goals

- The context does not contain `IMAGE`, `LATENT`, `MODEL`, `CLIP`, detector
  instances, LoRA stack objects, or other native runtime objects.
- The complete runtime context is not persisted as a workflow snapshot.
- Regional contexts cannot be merged. A context may branch; branches never
  rejoin through a generic merge operation.
- V3 does not introduce an execution-history log, a deferred universal
  operations queue, or a central executor.
- LUT, ControlNet, IPAdapter, image editing, and overlays are architecture
  extension tests, not part of the first implementation slice.

## Execution model

The workflow persists the source configuration of each node. ComfyUI rebuilds
the context deterministically during every queue execution:

```text
BV Regional Prompt
    -> core context
BV Regional LoRA
    -> core + LoRA capability
BV Regional Detailer Plan
    -> core + LoRA + detailer capability
later transformer
    -> incrementally updated context
```

Each transformer accepts exactly one `BV_REGIONAL` input and returns a new
JSON-compatible dictionary. It must not mutate its input. Branches therefore
retain the exact context value present at their branch point.

Native execution remains visible in the ComfyUI graph. Consumers combine the
context with their required native inputs:

```text
BV_REGIONAL + CLIP                 -> CONDITIONING
BV_REGIONAL + MODEL                -> patched MODEL
BV_REGIONAL + IMAGE + detector     -> detailer result
BV_REGIONAL + IMAGE                -> future LUT/image-edit result
```

Graph dependencies define execution order. Repeating an executor intentionally
applies the configured behavior again. The context does not track whether a
capability has already been consumed.

## Contract structure

The wire value remains a JSON-compatible dictionary and is accessed through a
public copy-on-write facade rather than direct dictionary mutation.

```json
{
  "schema": "bv.regional",
  "version": 3,
  "core": {
    "version": 1,
    "document_id": "uuid",
    "title": "Regional Prompt",
    "canvas": {},
    "prompts": {},
    "negative_mode": "auto",
    "overlap": {},
    "regions": []
  },
  "capabilities": {}
}
```

The envelope, core, and every capability are versioned independently:

- Envelope v3 changes only if the extension mechanism itself changes.
- The core version changes when the fundamental regional document changes.
- Capability versions change only for that capability.

The core is strict and rejects unknown fields. Extensibility belongs exclusively
in namespaced capabilities and registered resource types.

## Identity

All identities are UUIDs created during authoring and persisted in the owning
node configuration. Queue execution must not create UUIDs, timestamps, random
values, or other volatile context fields.

A region reference is always:

```json
{
  "document_id": "uuid",
  "region_id": "uuid"
}
```

Names are display-only, may be changed or duplicated, and are never executable
references. Editing a region preserves its ID. Creating, duplicating, splitting,
merging, deleting, and recreating regions follows these rules:

- create or duplicate: new ID;
- rename, geometry change, prompt change, or parameter change: preserve ID;
- split or merge: new IDs for the resulting regions;
- delete and recreate: new ID;
- IDs are never reused within a document;
- undo restores the original IDs.

Workflow location is separate from domain identity:

- Region identity: `document_id + region_id`.
- Collector identity: `collector_id`; the real ComfyUI link defines graph scope.
- Node ID: diagnostics and provenance only, never region identity.

Moving or copying complete trees, subgraphs, and workflows remaps all affected
IDs atomically. Copying an isolated consumer without its provider or document
leaves an unresolved reference; it never falls back to a matching name.

## Capability envelope and registry

Each capability key occurs at most once. Multiple ordered items live inside its
payload as an array with stable entry IDs:

```json
{
  "capabilities": {
    "bv-nodepack.lora": {
      "version": 3,
      "entries": [
        { "id": "uuid", "source": {}, "targets": [] }
      ],
      "scopes": {
        "global": [["example.safetensors", 1.0, 1.0]]
      }
    }
  }
}
```

Array order is semantic order. Merge and subtract identify entries by stable ID;
reordering never changes IDs.

Capabilities do not have a global `required` flag. Consumers declare and validate
only the capabilities they actually use. Unused or unknown capabilities do not
block unrelated output branches.

The internal Python registry derives full keys as
`<normalized-pack-id>.<local-capability-key>`. Provider identity is taken from an
explicit manifest ID when available, then the installed distribution name, then
the root Python package as fallback. The `bv-nodepack` namespace is reserved.

A registration can provide:

- current capability version;
- declarative schema;
- semantic validator;
- sequential version migrations;
- supported `replace`, `merge`, `subtract`, and `clear` handlers;
- display and inspector metadata;
- optional frontend editor registration.

V3 does not publish this Python registry as a stable third-party interface.
Unregistered capabilities nevertheless remain opaque JSON and must be transported
unchanged. Internal registered key collisions are fail-closed: the first
registration remains active, the second is rejected, and both sources are
reported. Import order must not silently replace an interpreter.

The namespaced extension data format may be published as an explicitly unstable
Experimental Preview. It provides no compatibility promise for Python lifecycle,
frontend factories, resource registration, or editor integration. A stable public
Extension Kit is deferred until the internal LoRA and Detailer adapters have been
proven in released workflows.

Capability migrations are sequential (`v1 -> v2 -> v3`), validate every step,
never downgrade a newer version, and participate in the atomic workflow migration.
Newer unsupported payloads remain byte-for-byte preservable, open read-only, and
block only consumers that require them.

## Transform operations

The presence of a capability determines add behavior. `Add` is not a separate UI
mode:

- missing capability plus configuration: add;
- existing capability plus default mode: replace;
- merge: offered only when the registry provides semantic merge behavior;
- subtract: offered only for stable entry IDs with a registered handler;
- clear: remove the entire capability.

Unsupported operations are absent from the UI and rejected by the backend. A
transformer always produces a complete valid capability; half-configured runtime
contexts are forbidden.

The dedicated Regional LoRA transformer may persist an ordered list of operation
steps. Every step owns a stable ID, one global or regional target, its operation,
and its own ordered LoRA entries. Targets are repeatable, and drag-and-drop order
is execution order. The backend applies each step through the ordinary registered
capability handler, so one node with `merge(region A)` followed by
`subtract(region B)` is semantically identical to two transformer nodes in that
order. Every ordered step is target-scoped: `replace` and `clear` affect only the
selected global or regional target, while preserving entries assigned to other
targets. `subtract` matches the selected target by stable entry ID or by identical
source reference, so a freshly created editor entry can remove its upstream
counterpart. The original single-operation configuration remains accepted and is
normalized deterministically as the Legacy fallback.

If a downstream configuration references a region removed upstream, that
transformer fails before emitting an output. It reports its node, missing
`document_id + region_id`, and provides an action to open the affected editor.
There is no fallback by name and no silent skip.

## Resource-provider protocol

The context contains serializable configuration and resource references, never
foreign runtime objects. Typed collectors share one internal provider protocol:

```text
BV_RUNTIME_RESOURCE_PROVIDER
  provider_id
  resource_type
  stable resource entries -> runtime objects
```

User-facing collectors remain specialized, for example:

- BV LoRA Stack Collector;
- BV Detector Collector;
- future BV ControlNet Collector;
- future BV Reference Image or IPAdapter Collector.

The common provider interface remains internal during V3. Public third-party
resource and panel registration is deferred with the Extension Kit. A universal
user-facing `ANY` collector is explicitly rejected.

Wireless presentation is implemented with ordinary persisted ComfyUI links. When
the user selects a collector, the frontend creates a real typed connection and
only hides its port and link visually. ComfyUI remains authoritative for graph
scope, queue dependencies, caching, copy/paste, and subgraphs. The frontend must
not rewrite the prompt at queue time, search globally by provider name or node
type, or maintain mutable runtime resources outside the link graph.

The Collector node is the only persisted provider truth. A reconstructed,
graph-local UI index may list collector IDs, resource IDs, display names, and
metadata for pickers and validation, but it is never serialized as a second
workflow registry. Runtime objects flow only through the real hidden link.

Copy and import behavior:

- copying a complete provider/consumer group preserves the normal copied link and
  remaps copied collector/resource identities as one group;
- copying only a consumer keeps a usable link only when ComfyUI copied or retained
  it, otherwise marks the reference unresolved;
- duplicate subgraph instances rely on their real instance links rather than a
  custom persisted graph identity;
- identity collisions are remapped within the copied/imported group.

Resources resolve when a capability-writing node executes. Detector resolution
may remain lazy and consumer-specific, but LoRA resolution is deliberately owned
by the Regional Prompt and Regional LoRA transformer boundaries described below.

### LoRA

A Regional context may reference multiple external LoRA collectors. Every external
entry owns its stable entry/binding ID and persists both `collector_id` and
`resource_id`. Each distinct used collector is represented on the capability
writer (`BV Regional Prompt` or `BV Regional LoRA`) by its own ordinary typed
same-graph ComfyUI link. The writer resolves those references once and stores the
effective per-scope stacks in the immutable Regional context. Attention and
Conditioning nodes consume only that materialized context; they are never
resource-provider consumers and expose no Collector, registry, or binding inputs.
Repeated entries may reuse a writer's collector link while preserving their
independent resources, targets, and semantic order. The LoRA capability may mix
BV-native serializable LoRAs and external stack references.

Replacing a target may switch any number of collectors. Merge and subtract use
complete per-entry source references; subtract additionally accepts a stable entry
ID. Clear removes assignments for the selected target and removes the capability
only when no assignments remain. This removes the former global same-collector
restriction without altering unrelated regional assignments.
Legacy single-collector payloads migrate deterministically by copying their global
collector ID into every external entry without changing entry IDs or order.

### Detailer and detectors

Detector configuration belongs inside the detailer plan. One detailer capability
references at most one Detector Collector containing any number of named external
detector resources. The collector provides runtime objects; the plan owns region
selection, job order, detector selection, and detector/detailer parameters.

The context carries the complete plan configuration. Existing specialized
`BV_DETAILER_PLAN` and loop-state types may remain internal execution contracts;
they do not need to become general-purpose context fields.

## Shared schema and validation system

Versioned declarative field metadata is the shared source for frontend and backend
types, defaults, fallbacks, and constraints. Regional, LoRA, and Detailer editors
remain purpose-built React views; V3 does not implement a universal schema-driven
form renderer. Controlled BV annotations may describe individual controls and
fallback behavior:

```json
{
  "type": "integer",
  "default": 20,
  "minimum": 1,
  "maximum": 100,
  "x-bv-invalid-fallback": 1,
  "x-bv-ui": { "control": "number", "label": "Steps" }
}
```

Schemas distinguish missing, `null`, empty string, syntactically invalid, and
out-of-range values. An empty string may be valid for fields such as a negative
prompt and invalid for required IDs. Complex cross-field rules use registered
semantic validators. Backend validation is authoritative.

Every node stores two separate workflow values:

- canonical configuration: complete, valid, and executable;
- editor draft: UI-only raw values and validation state, which may be invalid.

The runtime context never receives the draft. Invalid primitive or form values use
the field's explicitly designed fallback in the canonical configuration. The draft
is preserved across workflow save/reload so the user cannot mistake a fallback for
their original input.

An invalid draft marks the field and creates a persistent, deduplicated toast. The
toast reports that fallbacks are active and opens the owning node, editor, section,
and first invalid field. It remains until the invalid values are corrected. Simple
invalid edits do not block closing a window.

This persistence rule intentionally supersedes the current UI-window contract that
keeps dirty editor drafts in RAM only. Implementation must update that document and
use stable named serialization; dynamic visual controls must not enter positional
`widgets_values` ordering.

## Migration and compatibility

The `BV_REGIONAL` socket string remains unchanged. A central normalizer accepts v1,
v2, and v3 values and returns the canonical v3 facade. Existing consumers must use
the facade instead of indexing regional dictionaries directly.

Workflow loading eagerly migrates compatible schemas atomically per node:

- intelligent feature-specific defaults are materialized;
- migrated schema versions are stored in memory;
- the workflow is marked unsaved/dirty;
- one migration summary toast lists assumed defaults and affected editors;
- every node computes and validates its complete result before replacing its own
  configuration;
- a failed node remains unchanged in its supported Legacy form while independent
  nodes may migrate successfully;
- one aggregated report lists successful and failed node migrations;
- reloading without saving restores the complete original file state.

Simply opening a workflow never writes its file. Saving persists the migrated
configuration. Reloading without saving reruns the migration.

Compatible nodes retain their internal class IDs and visible names. Attention,
conditioning, mask, selection, debug, and output consumers gain v3 support in
place. Existing optional sidecar inputs remain functional but are classified as
Legacy:

- new unconnected nodes hide Legacy ports;
- existing links reveal them automatically;
- a global temporary preference can show all Legacy ports;
- dragging a compatible Legacy datatype temporarily reveals the port;
- disconnecting leaves the port visible until focus changes or reload;
- if context and Legacy inputs are both present, Legacy wins initially and emits
  a deprecation warning.

Legacy ports are removed only in a documented breaking release after at least two
normal feature releases and successful workflow migration coverage.

Structurally incompatible nodes keep their existing class IDs and become Legacy
implementations. New implementations receive new internal IDs and the canonical
visible names. Legacy nodes remain in their current functional categories with a
Legacy suffix, badge, and migration action. They are never replaced automatically
on load.

The first queue of a workflow with Legacy usage shows one aggregated toast, not one
toast per node. It can focus affected nodes and open migration details. V3 does not
ship a universal structural migration assistant: incompatible node replacement and
rewiring remain manual and documented. Targeted automatic migrators may be added
later only for workflow patterns covered by real Golden fixtures.

## UI-package and layout contract

All Regional v3 editors use the shared BV UI package. Legacy and v3 nodes reuse the
same React views through separate load/validate/save adapters. Legacy data is not
silently written as v3 merely because the shared view opens it.

Complex editors use the common FlexLayout system. Panels have stable namespaced
IDs such as `bv.regional.canvas` and `bv.regional.capabilities`; display names may
change, IDs may not. Third-party panel IDs receive their pack prefix. Removed IDs
are never reused.

The current Factory layout contains all registered panels. Saved user layouts are
not silently modified when a new panel appears. The editor detects missing
registered panels and offers a non-blocking action to switch to the current Factory
layout. Reset restores all current panels; users may then customize and save a new
profile. Future complex BV editors must reuse this layout and persistence system
instead of implementing parallel window infrastructure.

The initial Regional Prompt editor exposes optional LoRA and Detailer capabilities
for convenience. Advanced users can leave them absent and add dedicated context
transformers. Both surfaces use the same schemas, builders, and registered editor
views; there is no simplified second implementation.

LoRA and Detector editors use one shared typed Resource Picker. It combines
collector and resource selection, shows unresolved IDs without name-based fallback,
and creates or updates the real hidden collector link. The closed control may show
`Collector / Resource`; the expanded control groups resources by collector and may
display thumbnails and provider metadata. Switching collectors clears an invalid
resource choice explicitly.

Persisted invalid drafts, fallback toasts, and the new validation lifecycle are
limited to the Regional family in the first release. Other BV editor families may
adopt the reusable controls after V3; they are not migrated as part of this scope.

## Implementation milestones

Development occurs on `codex/regional-context-v3`. The release line remains
maintainable, and the V3 branch is synchronized with current `main` after every
validated milestone. Each milestone ends in focused tests and reviewable local
commits; V3 is published only after every milestone and release gate passes.

### Milestone 0: hidden-link feasibility gate

A minimal fake producer and consumer must prove save/load, visual hiding and
reveal, queue dependency, cache invalidation, copy/paste, root graph, subgraph,
bypass/mute, deleted provider handling, and Resource Picker link switching.

The gate additionally proves native multi-provider fan-in with at least four
collectors and a stress capacity of twenty. Every provider remains an ordinary,
independently persisted typed ComfyUI link. Physical provider slots need not
participate in visible node layout: the frontend may project all real links onto
one transient visual anchor. Debug presentation may draw these real links with a
distinct dashed or animated style, but must not replace them with virtual links,
persist a second link registry, or modify the queued prompt. Normal/debug
switching must not resize the node or reorder serialized widgets. A future
workflow-wide shortcut may activate the same transient presentation, but is not
part of Milestone 0.

The approved V3 transport is graph-local: a collector and each consumer binding
must belong to the same concrete root graph or the same subgraph definition.
The Resource Picker must not catalog collectors from parent, child, sibling, or
otherwise external graphs. A copied external selection is cleared without
fallback, remains visibly unresolved, and fails prompt validation with a
same-graph diagnostic. Cross-graph routing through exposed subgraph ports is
deferred to a separate future Smart Pipe/Subgraph research gate and is not a V3
requirement.

If any required behavior cannot be made reliable with ordinary stored links, V3
abandons Wireless presentation and uses progressively revealed typed ports. Queue
rewriting, global runtime registries, and provider discovery heuristics are not
acceptable fallbacks.

### Milestone A: Context Kernel

- v3 envelope and independently versioned core;
- copy-on-write facade and strict validation;
- deterministic v1/v2 runtime normalization;
- internal capability/resource registries;
- unknown capability passthrough;
- branch immutability and extension tests.

### Milestone B: existing consumers

- Mask, Select, Debug, output, Conditioning, and Attention compatibility;
- current Legacy execution remains functional;
- model-family regression workflows.

### Milestone C: LoRA vertical slice

- LoRA capability;
- native and external live-stack entries;
- typed collector, Resource Picker, and real hidden link;
- cache, copy, and subgraph tests.

### Milestone D: Detailer vertical slice

- Detailer Plan capability;
- typed Detector Collector and Resource Picker;
- current loop and Impact adapter integration;
- detector/detailer end-to-end tests.

### Milestone E: Regional UI and migration UX

- embedded and advanced editors using shared purpose-built React views;
- Legacy port reveal, detection, navigation, and manual migration guidance;
- node-local eager schema migration and aggregated reports;
- Regional-only persisted invalid drafts, fallbacks, toasts, and layout handling.

### Milestone F: release hardening

- full Legacy corpus and Golden expectations;
- examples, migration guide, and Experimental Preview format documentation;
- fresh-session visual, cache, and functional verification.

LUT, ControlNet, IPAdapter, image editing, text overlays, and other future features
must be addable only by registering schemas/resources and adding their specific
configurator/executor nodes.

## Mandatory acceptance tests

- v1 and v2 migration to v3;
- atomic per-node migration, failure isolation, aggregated reporting, and reload
  rollback;
- incremental deterministic construction;
- immutable branch behavior;
- rejection of context merge behavior;
- unknown capability lossless pass-through;
- independent core and capability version migrations;
- unsupported newer versions preserved and fail-closed at relevant consumers;
- fictitious third-party capability and resource-type extension test without core
  or unrelated-consumer changes;
- copy/paste and root/subgraph/workflow link and identity behavior;
- real hidden-link provider dependency and provider collision tests;
- cache invalidation when a live external stack changes;
- consumer-specific lazy resolution;
- LoRA native/external mixing and collector-switch rules;
- detector/detailer-plan resolution;
- Legacy port visibility, drag reveal, override, and warnings;
- Legacy workflow regression fixtures for attention, conditioning, and detailer;
- persisted invalid UI draft with valid fallback execution;
- toast navigation to the owning node, editor, section, and field;
- old saved layout missing-panel notice and Factory reset;
- frontend/backend validation against shared fixtures;
- Resource Picker collector/resource selection, unresolved state, and link update;
- Legacy Workflow Corpus generated with or captured from released old versions,
  covering v1/v2, model consumers, LoRA sidecars, Detailer/Detector/Loop, branches,
  root graphs, subgraphs, connected Legacy ports, and broken references;
- Golden expectations for load warnings, dirty state, node-local migration, runtime
  context, unchanged Legacy execution, manual migration guidance, save, and reload;
- fresh-session visual and functional verification with cache-busting reloads.

## Release gate

V3 is releaseable only after every mandatory acceptance test passes, existing
example workflows remain functional through either v3 or the documented Legacy
path, migration documentation is complete, and fresh-session UI verification has
been recorded. Known silent data loss, nondeterministic identity, partial migration,
or unverified cache behavior blocks release.

Implementation, local release commit, publication, and Wiki work are distinct
phases. A local commit follows completed validation; push or publication requires
separate explicit approval. Wiki documentation begins only after the v3 release
contract and behavior are proven.

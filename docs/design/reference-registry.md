# Reference Registry

`BV Reference Registry` collects native IMAGE, AUDIO and VIDEO values through one
visible `Media` fan-in port. The shared presentation layer projects native V3
Autogrow inputs onto one interactive socket; each connection retains its own
technical input and dependency. The limit is 100 references. Generated upstream
media works like loaded media. There is no Registry configuration window.

## Identity and execution

The socketless `bv.reference_registry_config` v1 widget stores a collector UUID
and `{id, slot}` entries. Reference identity is `(collector_id, resource_id)`.
Display labels are numbered independently by media type: `Image 1`, `Audio 1`,
etc. Labels, link IDs, filenames and content hashes are never identities.

The optional `places` array retains logical slots, including disconnected places.
`entries` contains only connected places. Reconnecting a vacant place preserves
its UUID; new places append. Optional `media_type` preserves per-type numbering
across disconnection. All 100 places, including vacancies, count toward the limit.
No automatic compaction takes place. Source content and filenames do not identify
a place. Reload and Undo/Redo restore configuration and links together. Clipboard
remaps copied collector identities and corresponding prompt mentions while
retaining collector-scoped resource UUIDs. Ambiguous collectors fail closed.
The existing `bv.runtime_resource_provider` v1 envelope carries resource type
`bv-nodepack.reference`, native `resources: {UUID: value}` and
`metadata: {UUID: {name, media_type}}`. An image batch remains one reference.
The Registry does not decode video, load files, concatenate media, hash content or
copy tensors. Resolution checks collector, resource and expected media type.

## Regional Prompt and Registry DG

The provisional Regional catalog-selection panel is hidden. Existing explicit
selections remain supported by the Registry/DG infrastructure.
`reference_v3_config_json` stores `{version: 1, collector_ids: [...]}` with at most
20 unique collectors. Selection uses the shared Registry family resolver,
concrete graph ownership, clipboard remapping and DG route reconciliation.
There is no public Reference Registry-to-consumer provider cable.

The technical `resource_provider` output and
`reference_resource_provider_1` through `_20` inputs are owned by shared provider
presentation and DG infrastructure. The reference family cannot resolve another
registry family. Missing, duplicate or unexpectedly connected collectors fail.
Existing Regional inputs retain their indices; outputs remain `regional` and
`lora_bindings`. Empty selection preserves the existing Regional result.

The `bv-nodepack.references` v1 Regional capability contains only the JSON catalog
`entries: [{collector_id, resource_id, name, media_type}]`, ordered by selected
collector and native input order. Native tensors/audio/video never enter Regional
JSON or PNG metadata. Prompt reference input and available image previews are described in
[Regional editor tools](regional-editor-tools.md). Model conditioning remains
separate; catalog attachment does not apply reference conditioning.

## Shared presentation and native lifecycle

`interactiveFanIn.ts` owns socket positioning, target hit testing, occupied-input
protection and cleanup for the central `fanIn` presentation role. Canonical input
arrays and links remain native. Only explicitly socketless schema widgets receive
the missing native STRING factory option in `nodePresentationLifecycle.ts`.

The registered `reference-autogrow-identity-lifecycle` exception in
`referenceRegistryLifecycle.ts` is needed because native Autogrow replaces slots
and transplants links. It owns identity reconciliation, not presentation or
routing. Serialization is read-only. Stable fan-in places reconcile identity
synchronously inside native connection transactions; catalog publication waits
until native link mutation has finished. The shared native minimum getter prevents compaction independently of callback
installation order. Its original descriptor is restored during cleanup.
Replace this seam when ComfyUI supplies persistent Autogrow entry identities and
a preserve-empty-slots option.
See [central presentation contract](node-presentation.md).

Autogrow stays inside its owning graph. It does not grow enclosing Subgraph
interfaces. Cross-boundary media uses native explicit typed interfaces; collector
transport follows the existing Registry DG boundary machinery.

## Validation

Domain tests cover native media, batches, IDs, strict provider selection and
JSON-only Regional output. Frontend tests cover lifecycle, shared fan-in,
socketless widgets, family isolation and scoped clipboard remapping. Real ComfyUI
API tests are separately available in `test_reference_registry_native.py`.
Native drag, Undo/Redo, clipboard and Nodes2 acceptance remain separate from unit
and build success. Internal runtime evidence is kept outside the public package.

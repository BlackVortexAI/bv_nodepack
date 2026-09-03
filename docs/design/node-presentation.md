# BV node presentation architecture

This document is the authoritative contract for BV node and widget presentation.
The machine-readable exception registry is `PRESENTATION_EXCEPTIONS` in
`ui/src/regional/nodePresentation.ts`.

## Non-negotiable rules

1. Every new BV UI surface uses the shared BV UI pack and its tokens/components.
2. Every manipulation of a ComfyUI node, port or widget is implemented in the
   central presentation/manipulation modules.
3. Feature modules may own domain state and structural graph behavior. They must
   delegate hiding, projection, ordering, measurement, compaction and resizing.
4. Classic, Node Library Ghost and Nodes 2.0 consume the same semantic policy.
5. A connected Legacy port stays visible even when Legacy Debug is disabled.
6. Automatically reconciled internal provider plumbing remains serialized and
   executable while hidden. Provider ports that form the explicit interface of
   optional manual chains remain visible and direction-aware.
7. User-controlled dimensions are never overwritten by an automatic refresh.
8. Direct `converted-widget`, `hidden`, `computeSize`, `setSize`, DOM projection
   or slot-visibility code outside the central modules requires a registered
   exception before it is merged.

## Central modules

| Module | Responsibility |
| --- | --- |
| `ui/src/regional/nodePresentation.ts` | Semantic roles, node policies and exception registry |
| `ui/src/regional/nodePresentationLifecycle.ts` | Idempotent NodeDefinition lifecycle for every declarative presentation policy |
| `ui/src/regional/executionResultPreview.tsx` | Shared execution-result lifecycle and BVUI preview rendering |
| `ui/src/ui/components/ReadonlyTextBlock.tsx` | Bounded read-only text display and copy action |
| `ui/src/regional/classicNodePresentation.ts` | Classic adapter and measured layout |
| `ui/src/regional/nodes2NodePresentation.ts` | Nodes 2.0 DOM adapter |
| `ui/src/regional/nodePreviewProjection.ts` | Node Library Ghost adapter |
| `ui/src/regional/presentationSize.ts` | Shared versioned user-height state, resize tracking and guarded automatic sizing |
| `ui/src/regional/portProjection.ts` | Runtime provider-port projection and connection-aware layout |
| `ui/src/regional/reactNodeWidgetHost.tsx` | Central React/addDOMWidget lifecycle, native ComfyUI actions, bounded measurement, canvas-event isolation and cleanup for inline BVUI widgets |

Node-specific code may request these operations. It must not reimplement them.

## User-controlled height contract

`presentationSize.ts` is the single owner of persistent user-height state for
Classic, Nodes 2.0 and projected-port layout. A height is persisted when
ComfyUI reports an active resize transaction. Serialization, lifecycle refreshes
and unrelated host `setSize` calls never infer user intent from size drift.
Every automatic `setSize` call uses the shared internal guard and applies
`max(semanticAutoHeight, userHeight)` without freezing the current width.

The serialized contract uses `bvPresentationSizeVersion` and
`bvPresentationUserHeight`. A valid version-1 `bvProjectedUserHeight` is
migrated once; invalid, unversioned and marker-free historical sizes are
compacted once rather than inferred as user intent. This intentional migration
cut removes stale hidden-row space. Provider projection no longer owns user
dimensions.

Classic widget arrangement is projected through the same policy. Hidden
provider outputs remain canonical graph slots, but they do not contribute a
vertical slot row or push native widgets downward. The adapter uses
`widgets_start_y` only when the node has no pre-existing specialized value. A
LiteGraph class field whose value is still `undefined` or `null` is treated as
unset, not as a specialized layout. The adapter restores the exact prior
property state during removal.

Port-only nodes never receive a synthetic widget start. If the first visible
content is a centrally declared `nativeAction` and no public port row precedes
it, Classic reserves exactly one current ComfyUI slot row above the action.
Native action widgets are always marked with ComfyUI's `socketless` capability;
feature code must not suppress their sockets with local CSS or node-specific
flags.

Nodes 2.0 port-only height is derived from the mounted, unscaled port-row
`offsetHeight` values rather than Classic's global `NODE_SLOT_HEIGHT`. It uses
one canonical mounted row height and `chrome + max(public inputs, public
outputs) * row height`; hidden provider rows never reserve space. A central
`ResizeObserver` coalesces late mount and geometry changes into at most one
animation-frame reconciliation and is disconnected on root replacement or
cleanup. The bounded 0/50/150 ms schedule remains bootstrap-only. The shared
active resize guard and persisted user-height contract remain authoritative.

Every node type with a declarative presentation policy is enrolled through the
same NodeDefinition lifecycle before feature-specific registration can return.
The lifecycle composes existing create, configure, connection-change and remove
callbacks and is idempotent per prototype. An empty policy is a regular opt-in,
not a node-specific sizing exception.

Connected Legacy rows in Nodes 2.0 retain their canonical slot and link. The
adapter projects the resolved native link color into the matching datatype CSS
variable and restores the exact previous inline value and priority on
disconnect, surface replacement or cleanup. Link colors are resolved from the
link, then ComfyUI's link-type palette, then the active canvas default; BV does
not define a competing color table.

## Runtime provider titlebar anchors

`portProjection.ts` owns the reusable provider-anchor interface. A feature may
mark a runtime provider slot, while the central module owns projection,
restoration, resize tracking, layout compaction and canvas invalidation.

- Classic debug presentation projects provider inputs and outputs to the visual
  titlebar midline. Multiple providers on one side share the fan-in anchor.
- Canonical `inputs`, `outputs`, link ids and graph slot indexes are never
  reordered or replaced.
- Anchor geometry is stored as a configurable, non-enumerable `slot.pos` value,
  so workflow serialization and copy/paste retain only canonical graph state.
- Disabling debug or removing the presentation restores the exact original
  property descriptor, including inherited or absent position state.
- The shared presentation lifecycle composes resize handling, blocks Classic
  anchors while Nodes 2.0 owns the surface, and cleans projection state through
  one idempotent removal entrypoint.
- Widget-backed input records are not graph ports and are excluded from anchor
  projection.
- Ghost and Nodes 2.0 continue to consume the same semantic provider role and
  their existing surface adapters; node-specific titlebar code is forbidden.
- Debug link animation owns one request-animation-frame loop per canvas and
  invalidates the background layer where ComfyUI renders links. It stops when
  debug presentation is disabled, the last connected provider edge is removed,
  the graph changes or the canvas detaches. Rendering a newly reconnected
  provider edge restarts exactly one loop.

### Subgraph boundary projection experiment

The experiment branch extends only the visual classification of real provider
link segments. A parent link ending at a Subgraph host and a definition link
between the special Subgraph input/output node and an internal node remain two
independent, graph-owned links. Each active canvas hides its own segment in
normal presentation and renders it with the existing animated debug style when
global Legacy Debug is enabled.

The existing node-local M0 debug property still applies only inside the
concrete graph that owns that consumer. It does not propagate through a
Subgraph boundary; global Legacy Debug is the experiment's cross-canvas switch.

Boundary identity is positional: host slot index, definition slot index and the
special I/O link's canonical origin/target slot. Names are not identities. The
projection must not create cross-graph LiteGraph links, reorder slots, replace
link ids, mutate `linkIds`, or change prompt materialization. In particular,
`m0LocalGraph.ts` remains intentionally graph-local; using this experiment as a
Smart Pipes or Regional resource-routing contract requires a separate domain
architecture decision and real-runtime evidence.

ComfyUI's virtual Subgraph Input/Output nodes expose their interface through
`node.slots`, not ordinary `node.inputs`/`node.outputs`. The registered
`subgraph-boundary-provider-slots` exception therefore suppresses provider slot
labels and drawing only for the duration of the central canvas draw call. It
must restore the exact slot objects immediately and must never rename or hide
the serialized Subgraph interface itself.

The central Classic boundary adapter collapses only the technical provider's
layout measurement to zero on both input and output I/O nodes. It re-arranges
the native layout so ordinary ports and the trailing Add port retain contiguous
rows. The debug endpoint is derived from the first ordinary slot's real position,
one `M0_PROVIDER_SLOT_HEIGHT` above it; it is not the hidden technical slot's
position. Slot arrays and canonical link indices are not changed by this adapter.
The shared routing service uses `SubgraphOutput.connect(output, source)`
for the inner output segment, because the special Output node is not a normal
`LGraphNode` with an `inputs` array.

## Registered exceptions

The current exceptions, their exact implementation paths, rationale and intended
centralization path live in `PRESENTATION_EXCEPTIONS`. This keeps the list next
to the policy used at runtime and prevents documentation from silently diverging.

An exception is legitimate only when it adapts a genuinely different ComfyUI
lifecycle seam, such as promoted Subgraph proxy widgets or runtime-generated
graph slots. A node being visually unusual is not sufficient justification.

## Adding or changing UI behavior

Before implementation:

1. Add or extend the semantic role/policy centrally.
2. Extend the applicable Classic, Ghost and Nodes 2.0 adapter tests.
3. Use BV UI pack components and tokens for rendered controls.
4. If a central interface cannot represent the requirement, deepen that module.
5. Only if the lifecycle seam genuinely differs, register an exception with its
   file path, reason and concrete future centralization path.

No presentation task is complete until implementation, automated coverage,
visual acceptance and this architecture contract agree.

## Runtime port contract cuts

- `BV Detector Registry` no longer exposes the V2 `detector_registry` output.
  Its public diagnostics remain `detector_count` and `registry_summary`; the
  V3 `resource_provider` output remains serialized but presentation-hidden.
  This is an intentional hard cut without an output-port migration adapter.
- The V2 `detector_registry` input on `BV Regional Detailer Plan` remains as a
  separate compatibility seam for existing external detector-registry sources.
  Its continued presence does not restore the removed Registry output.
## DG boundary minimum width

`projectedPortInteraction.ts` is the central owner of manual interaction suppression for
program-owned projected ports. Nodes opt in with a slot predicate; unregistered nodes remain
unchanged. It normalizes native legacy/modern hit results and guards the classic canvas
pointer entry before output drag/detach as well as the separate Special-I/O pointer entry.
Special-I/O preserves last-hit priority and the ordinary add slot. No slot arrays, indices,
positions or programmatic connection APIs are rewritten by this adapter.

The DG conversion lifecycle installs the shared
`projectedPortInteraction.ts#installProjectedPortConversion` wrapper on graph instances
after graph assignment, including newly returned child graphs. Native synchronous
`convertToSubgraph` and `unpackSubgraph` reconnect existing edges through connection veto hooks; only those
transactions use `dgRouting.ts`'s shared depth-counted `try/finally` permission. Default-channel
receiver removal skips route cleanup inside this synchronous structural move, but ordinary
deletion cleans its route and permits reuse only after root-wide owner absence is proven. Pointer gates
remain active, original hook vetoes remain authoritative, and no asynchronous permission
window or global graph-prototype patch is introduced. The permission scope is now
centralized; adapter lifecycle only enrolls graph instances after assignment.
Regression contract: `tests/dg_canary_prototype.test.mjs` native conversion, structural removal,
exception-reset and deleted receiver ownership tests. This remains shared NodePack infrastructure,
not a ComfyUI source modification.

Test-only node adapters live under `tests/fixtures` and are not registered by the
NodePack. The shared `dgRouting.ts#installDgAnchorInteractionGuard` also enrolls opted-in subgraph hosts directly in
`nodes2NodePresentation`, since hosts have no BV backend definition lifecycle;
removal releases that enrollment and a later route reconciliation can rebind it.
This host enrollment is owned by the central connection service. Virtual I/O keeps its canvas path.
Vue slot rows use the shared `projectedPortInteraction` capture guard only for
currently owned DG slots. Canonical slot keys, row reuse and owner-aware removal
keep native ports interactive without changing the serialized port/link arrays.

The central DG copy-identity lifecycle uses `prepareDgClipboard` in
`dgRouting.ts`, installed once per canvas through
`projectedPortInteraction.ts#installProjectedClipboard`. Each native `_deserializeItems`
transaction receives a detached clipboard snapshot: copied senders receive fresh IDs,
and copied receivers referencing those senders are remapped, including flat nested
subgraph definitions and named widget values. Receiver-only copies retain external
sender references. Duplicate source sender identities fail before native mutation.
The sender `clone()` hook is deliberately not used: it runs at copy time, so repeated
paste would reuse its ID. Configure, reload and conversion moves preserve identity.
The core owns transport identity remapping; registered adapters read/write their own
serialized selection storage. An optional bounded `prepareClipboard` hook transforms
domain references on the detached snapshot before transport remapping. It must not
mutate live nodes or perform routing. Regression: `tests/dg_canary_prototype.test.mjs`.

### Shared DG routing module contract

`dgRouting.ts` owns traversal, persistent sender identities, LCA routing through
nested/sibling graphs, shared-boundary protection, reconciliation, clipboard
remapping, programmatic connection permission and receiver epoch invalidation.
`tests/fixtures/dgCanaryPrototype.ts` supplies isolated regression fixtures only. SmartPipe and Collector are not migrated by this extraction. Registry
adoption is a separate explicit opt-in pilot described below, not a global migration.

Register a `DgNodeAdapter` with unique ID, sender/receiver predicates and live plus
serialized selection accessors. Registration is application-lifetime; conflicting
owners or overlapping predicates fail explicitly. The disposer is for isolated
tests only, not hot-unloading adapters with living graphs. HMR requires a full reload.
All adapters share the existing `bvDgSenderId` identity contract and the
`BV_RUNTIME_RESOURCE_PROVIDER` type. `receiverChannels(node)` optionally declares
independent `{id,inputName}` channels. Both names must be unique; inputs resolve
by exact name and provider type, never by a stale numerical index. Selection
accessors receive the channel ID. Adapters without this declaration retain the
legacy default channel. This is not a generic arbitrary-port router.

Named channel state is isolated per receiver/channel. Persisted route metadata
lives in `properties.bvDgChannels`; reconstruction validates native endpoints and
backlinks. Cleanup protects every other channel, including channels on the same
receiver and shared upstream boundaries. `connectedDgSender` is a read-only query
of the actual validated native chain, not an inference from stored selection.
`releaseDgReceiverChannel` releases topology while that channel is still owned.
`scheduleDgUpgrade` and `queueDgUpgrade` capture receiver epochs so removed/re-added
nodes cannot receive stale asynchronous work.

Native connection/disconnection transactions reuse the exported
`runtimeResourceGraph.ts#withNativeGraphOwnership` synchronous try/finally seam.
They bind the concrete owning graph temporarily and restore prior ownership on
success or throw; no global current-graph substitution or async permission exists.

### Opt-in Registry DG pilot

`loraRegistryDgAdapter.ts` adapts existing Regional Prompt/Regional LoRA selection
storage to named `resource_provider_1` through `resource_provider_20` channels.
Only `bvRegistryDgPilot === true` or existing `bvLoraDgSelections` enrolls a receiver.
Manual Collector channels keep their native path and remain manually interactive.
The adapter accepts Registry sources only; selection discovery includes nested
registries with complete graph paths and stable transport identities. Ambiguous
domain IDs are excluded rather than resolved by first match.

Registry sources are discoverable before pilot activation. Discovery/clipboard
processing may therefore add `bvDgSenderId` transport metadata to an unmarked
Registry. This alone does not activate DG routes or alter Registry domain IDs,
LoRA stack/resource IDs or manual Collector semantics; legacy copies are not
claimed byte-identical. Pilot-associated Registry copies freshen domain IDs and
rewrite only matching copied consumer references in the detached clipboard.
Receiver-only copies retain external references. Config widget positions are
Registry 0, Regional Prompt 2, Regional LoRA 1, with named forms also supported.

The live TEST acceptance covers Registry to Regional Prompt, two independent DG
sources plus a manual Collector, nested/sibling routing and complete-group copy.
Regional LoRA uses the same adapter but has automated coverage only at this gate.
No default activation, SmartPipe migration or replacement of manual Collectors is
implied. Runtime evidence is recorded in the internal Registry pilot acceptance.

`dgSenderChoices` discovers registered senders across the owning root graph.
For a persistent selection change, write adapter selection and call
`reconcileDgTopology`. `connectDgSender` and `disconnectDgSender` are topology
primitives: they do not write/clear adapter selection, so later reconciliation
can restore the selected route. Lifecycle adapters call `activateDgReceiver`,
`deactivateDgReceiver` and `queueDgUpgrade` for stale-work protection.

The former throwaway selector is retained only as a regression fixture; it has no
production entry point or presentation exception.
DG integration runs on the standard ComfyUI frontend; the experimental
NativeModeTest frontend is not a dependency. Presentation and routing extensions
remain inside this NodePack. Native mute/bypass semantics still apply: suppressing
descendants is not a guarantee of arbitrary external multiport bypass mappings,
and shared-definition mode changes affect all occurrences of that definition.

Nested receiver-only copies may reuse a dangling copied input-boundary chain only
after validating every provider type, endpoint, slot and backlink, ending at a host
input whose link is null. Missing link objects or broken backlinks are not accepted
as dangling boundaries. This avoids allocating a duplicate technical input while
preserving unrelated receivers and historical boundaries.

DG input routes reuse provider-typed boundaries by their exact persisted route name after transient metadata is lost. Reconstruction reuses an existing owning-graph segment only when both endpoint IDs, slot indices, type and source/target backlinks match. Input reordering updates the immediate host graph, not the root graph. This preserves normal ports and avoids additional technical boundaries/segments on reload; historical duplicates are not bulk-deleted.

Projected provider ports keep their canonical internal names, but do not contribute to the visible minimum width. The central layout adapter measures visible slots together with native title/widget constraints. Install it before native boundary creation, because `addInput`/`addOutput` can synchronously expand the host. Existing user widths are retained; an already oversized host can be resized manually after reload.

DG prototype boundaries use the short serialized display label `DG` on both sides, including existing technical boundary entries along the affected route. This prevents native loading before adapter installation from falling back to long internal route names. Labels are set via the shared presentation API; canonical names and connections remain unchanged. Save after the first upgrade/resize so native restoration can use the short labels on subsequent loads.

`setProjectedSlotLabel` records explicit display-label intent per slot object. Both
provider marking and Classic presentation reapply that same intent through
`applyProjectedSlotLabel`; unregistered providers retain the empty default. Do not
clear explicit labels during refresh: alternating `DG` and an empty string changes
serialized workflow state and creates a spurious native Undo entry. The WeakMap is
not persisted; topology reconciliation registers intent again for replacement
slots after configure/reload. Ordinary port labels and internal names are untouched.
Regression: `tests/node_presentation.test.mjs`, explicit provider label lifecycle.

### SmartPipe native relocation lifecycle

Registered exception: `PRESENTATION_EXCEPTIONS.smart-pipe-native-relocation-lifecycle`.

`js/bv_smart_pipe.js#installRelocationHooks` wraps the graph-instance methods
`_convertToSubgraphImpl` and `_unpackSubgraphImpl`. The tested frontend contract
invokes these synchronously between the public operation's `beforeChange` and
`finally { afterChange() }`. Routing must be published before that final snapshot;
a deferred discovery/cleanup repair would create an inconsistent Undo state.
This is a version-bound domain lifecycle adapter, not a port presentation hook.
It does not own visual port layout; the narrowly scoped structural compatibility
repairs below preserve the original slot/link contract. Replace it with an official atomic
graph-relocation event when one becomes available, retaining the same tests.

Mapping uses stable route identity, kind and exact concrete host path. Shared
parent definitions are handled for every concrete instance separately. Move
rewrites destinations and inbound references; copy only rewrites references
inside the copied prefix. Local follow routes become addressed only when split
across scopes. Conflicting unpack identities are rejected before native mutation.
Missing private methods block the corresponding public SmartPipe operation.
Unexpected post-native mapping failure restores the original registry and reports
that topology has changed and Undo is required; it is not a topology rollback.
Regression coverage: `smart_pipe_relocation.test.mjs` and
`smart_pipe_dg_lifecycle.test.mjs`. Browser Undo/Redo and payload verification remain
separate acceptance gates; unit tests alone do not establish native compatibility.

One narrow metadata compatibility correction precedes conversion: for selected
sources connected to the current output boundary, a wildcard link type is corrected
to `BV_SMART_PIPE` only if both actual endpoint slots already declare that exact
type. Native type lookup otherwise fails despite compatible endpoints. Other
wildcards are unchanged; the original link type is restored if native conversion
throws. This does not undo any topology mutation already performed by native code.

Native Unpack configures fresh BV nodes with backend placeholder slots before
reconnecting by serialized indices. The transaction intercepts only the newly added
SmartPipe/Merge clones' Configure calls and restores the original pre-multiClone slot-name order
using the same configured slot objects, after validating both arrays. It never
restores serialized link IDs. The temporary Add/Configure wrappers are removed in
finally. Native-mutated endpoint fields of the original definition's link objects
are also restored in finally, preserving other hosts of that definition.

Before Unpack (selected host) and after Convert (returned host), missing
`BV_SMART_PIPE` output backlinks are repaired only when the current graph linkstore
and the actual target backlink agree. Existing IDs/order are retained; no link is
created. Pre-Unpack repairs are restored exactly if native execution throws.
Copy identity replacements are retained for the complete traversal, so every
concrete instance of a shared parent receives its own remapped registry prefix.

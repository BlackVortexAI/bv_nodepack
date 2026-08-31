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

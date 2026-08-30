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
| `ui/src/regional/executionResultPreview.tsx` | Shared execution-result lifecycle and BVUI preview rendering |
| `ui/src/ui/components/ReadonlyTextBlock.tsx` | Bounded read-only text display and copy action |
| `ui/src/regional/classicNodePresentation.ts` | Classic adapter and measured layout |
| `ui/src/regional/nodes2NodePresentation.ts` | Nodes 2.0 DOM adapter |
| `ui/src/regional/nodePreviewProjection.ts` | Node Library Ghost adapter |
| `ui/src/regional/portProjection.ts` | Runtime provider-port projection and connection-aware layout |
| `ui/src/regional/reactNodeWidgetHost.tsx` | Central React/addDOMWidget lifecycle, native ComfyUI actions, bounded measurement, canvas-event isolation and cleanup for inline BVUI widgets |

Node-specific code may request these operations. It must not reimplement them.

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

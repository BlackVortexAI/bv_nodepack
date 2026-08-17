# BV Regional Document v1

## Purpose

`BV_REGIONAL` is the model-neutral output contract of the BV Regional Prompt
editor. It records the user's intended canvas, prompt sources, regions, and
editable mask geometry. It does not describe how a model or sampler implements
that intent.

The normative structural schema is
[`schemas/bv_regional_v1.schema.json`](../../schemas/bv_regional_v1.schema.json).
This document defines the invariants that JSON Schema alone cannot express.

## Separation of responsibilities

`BV_REGIONAL` owns:

- the canonical canvas size;
- global and uncovered-background prompt sources;
- independently addressable regions;
- normalized rectangle and brush geometry;
- region strength, priority, and requested overlap semantics;
- authoring metadata needed to reopen the editor.

`BV_REGIONAL` does not own:

- `MODEL`, `CLIP`, `CONDITIONING`, tensors, or callbacks;
- sampler or backend settings;
- compiled masks or model token grids;
- floating-window layout, editor zoom, or current tool selection;
- a background image or a Base64 representation of one;
- a parsed `BV_AST` snapshot.

Prompt `*_source` fields are the single source of truth. Consumers derive a
`BV_AST` and plain text through the existing BV prompt parser so those
representations cannot become stale.

## Coordinate system

Rectangle coordinates and brush points use normalized canvas coordinates in
the inclusive range `0.0` through `1.0`. Brush `size` and region `feather` are
fractions of the shorter canvas edge so circular brushes remain circular at
non-square aspect ratios.

In addition to JSON Schema validation:

- `x + width` and `y + height` must not exceed `1.0`;
- every numeric value must be finite;
- renderers must use the canonical canvas aspect ratio;
- changing to a different aspect ratio requires an explicit transform.

## Identity and ordering

Document, region, and geometry IDs are lowercase UUIDs. IDs are stable across
editing, rendering, serialization, and migration.

- Moving or renaming an item preserves its ID.
- Duplicating a document creates new document, region, and geometry IDs.
- Duplicating a region creates a new region ID and new geometry IDs.
- Array order is stable authoring and display order.
- Region array order has no sampling meaning for `joint` overlap.

All IDs within a document must be globally unique. Every non-null
`parent_region_id` must resolve to a region in the same document. Parent links
must form an acyclic forest.

## Prompt semantics

The intended positive semantics are:

- global source: applies everywhere;
- background source: additionally applies to uncovered canvas areas;
- region source: additionally applies inside that region;
- joint overlap: all overlapping region sources apply.

Negative sources mirror that structure. `negative_mode` requests one of:

- `auto`: let a later backend choose prompt or native zero-out semantics;
- `prompt`: use entered negative prompt sources;
- `zero_out`: create structurally compatible zeroed negative conditioning.

Backend capability checks and any explicit fallback belong to later compiler
nodes, not to this document or its editor validation.

Prompt sources may contain BV prompt markup. All prompt sources must parse
successfully before the document can be emitted for execution. Prompt
categories never imply spatial coordinates.

## Regions and hierarchy

Regions own independent geometry and therefore may overlap. A region may name
an optional parent for navigation and later deconstruction. In v1, hierarchy:

- does not clip a child mask to its parent;
- does not move a child when the parent geometry moves;
- does not inherit prompts;
- does not affect joint overlap.

`enabled` is semantic and controls whether later consumers compile the region.
`authoring.visible` and `authoring.locked` affect only editor presentation and
interaction.

An enabled region with no geometry or no positive source is valid but should
produce a warning. Empty documents are valid.

## Geometry evaluation

Geometry operations are evaluated in array order against an initially empty
layer mask. The v1 operations are:

- `add`: `result = max(result, shape)`;
- `subtract`: `result = result * (1 - shape)`.

Version 1 supports rectangles, brush strokes and cropped raster masks. A one-point
brush stroke is a valid dot. Brush pressure scales the local brush opacity.
`raster_mask` stores a white-alpha PNG crop plus its normalized canvas bounds and
native pixel dimensions. It is used for pixel-preserving results of destructive
editor operations such as splitting disconnected areas. Region feathering is
applied after all geometry operations.

Each mask group is evaluated independently; completed group masks are combined
with `max` before region feathering. `mask_group_id` identifies that group when
present and otherwise falls back to `layer_id`. A subtract operation therefore
affects only its mask group and cannot erase another group in the same region.
Documents without any `layer_id` retain the historical flat evaluation by
placing their operations into one implicit legacy layer.

Geometry may carry the backward-compatible optional fields:

- `enabled`: when false, the operation is skipped by mask renderers;
- `layer_id`: groups multiple ordered Add/Subtract operations into one visible editor layer;
- `mask_group_id`: preserves independent Add/Subtract evaluation inside a merged compound layer;
- `authoring.name`: user-facing layer name;
- `authoring.visible`: editor presentation only;
- `authoring.locked`: editor interaction only.

Missing `enabled` means true. Missing geometry authoring metadata receives
stable editor defaults without changing mask semantics. Brush `shape` is
`round` or `square` and defaults to `round`; `pressure_mode` records whether
captured points used constant mouse pressure or stylus pressure and defaults
to `constant`.

When `layer_id` is absent, legacy operations in that region share one implicit
layer so their historical flat Add/Subtract result remains unchanged. The
editor materializes that implicit layer ID when it next persists the document.
Repeated `layer_id` values are intentional and do not weaken the global
uniqueness requirement for geometry `id` values. Moving, resizing,
duplicating, reordering, or deleting a layer acts on every operation sharing
that `layer_id` while operation order remains stable. Merging layers assigns a
common `layer_id` but retains their former identities as `mask_group_id`, so
Rectangle and Brush layers can be combined without changing the rendered mask.

The exact rasterization and rounding rules will be locked by shared TypeScript
and Python golden fixtures before the renderer is exposed to callers.

## Overlap

`joint` is the only executable v1 overlap mode. `normalized`, `priority`, and
`exclusive` are reserved values so documents can express future intent, but
the v1 editor must not offer them and v1 execution validation must reject them
as unsupported.

Region `priority` is stored now for forward compatibility. It has no effect in
`joint` mode.

## Validation and recovery

Structural or semantic errors block executable output. Warnings do not.

Loaders must never silently discard an unknown field or unsupported future
schema version. They should retain the original payload and open recovery or
read-only tooling instead. Known migrations run on a copy and replace the
stored payload only after successful validation.

The editor may retain an invalid draft, but queuing must not silently use an
older committed document while visible unsaved or invalid changes exist.

## Serialization

Serialization is deterministic:

- field names and array order are stable;
- no timestamps appear in semantic data;
- IDs are not regenerated while serializing;
- numbers are finite and normalized before commit;
- generated masks and editor session state are excluded.

The workflow persists the canonical document and any explicitly recoverable
draft source separately. The `BV_REGIONAL` runtime value contains only a
validated canonical document.

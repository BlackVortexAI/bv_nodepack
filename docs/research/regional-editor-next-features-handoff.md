# BV Regional Editor – handoff for the next task

> Status update, 2026-08-18: The geometry phase described below has been implemented
> as v0.9.0, including Add/Subtract rectangles, ellipses and click polygons, resolved
> binary-mask inspection, live gesture previews, persistence and regression coverage.
> The original handoff remains below as the decision and scope record.

## Why this file exists

The previous Codex task became too long and was stopped before starting another editor implementation. This file records the agreed scope, the relevant architecture, completed research, and the safest continuation point.

## Repository state at handoff

- No editor feature implementation from the aborted work was applied.
- No tests, builds, commits, or pushes were performed for that aborted work.
- `git status --short` showed only the pre-existing untracked directory `docs/publishing/`. Treat it as unrelated user work and do not modify or stage it without explicit instruction.
- The Ideogram 4 conversion research was completed separately and is available at `docs/research/bv-regional-to-ideogram4-json.md`.

## Agreed next editor scope

Implement only this phase first:

1. Rectangle Add and Rectangle Subtract.
2. Ellipse Add and Ellipse Subtract.
3. Polygon Add and Polygon Subtract.
4. Binary mask preview inside the editor.
5. Complete persistence, import/export, backend mask rendering, schema validation, undo/redo, and regression tests for these additions.

Do not silently expand the phase with snapping, guides, rotation, arbitrary transforms, mask-file import/export, soft erasing, or other convenience tools. Those remain useful later candidates.

One product detail still needs an explicit decision before Polygon is implemented: click-to-place vertices with Enter/double-click to close versus freehand lasso. Recommended editor-style behavior is click-to-place vertices, Escape to cancel, and Enter or double-click to close.

## Required behavior

- Add tools create a new geometry layer in the active region.
- Subtract tools modify the selected unlocked layer/compound mask instead of creating an unrelated subtract layer.
- Subtract tools are disabled when no suitable unlocked layer is selected.
- All geometry stays normalized to the document canvas.
- Binary preview shows the actual resolved sampling mask: black background, white active mask, without the background image, authoring colors, selection handles, or brush cursor.
- Binary preview is inspection-only; drawing and transforms must not accidentally mutate the document while it is active.
- Existing rectangle and brush documents must continue to deserialize unchanged.
- Undo/redo must treat each completed shape gesture as one atomic edit.

## Likely implementation map

### Frontend domain and state

- `ui/src/regional/model.ts`
  - The geometry union currently contains rectangle, brush stroke, and raster mask types.
  - Add an ellipse type using normalized `x`, `y`, `width`, and `height`.
  - Add a polygon type using normalized points.
- `ui/src/regional/editorState.ts`
  - Extend the tool union beyond select/rectangle/brush tools.
  - Preserve migration compatibility for existing persisted tool names.
  - Persist a binary-mask-preview flag with the editor UI state.
- `ui/src/regional/ToolPalette.tsx`
  - Add distinct icons and tooltips for add/subtract variants.
  - Enforce selection/locking rules for subtract tools.

### Interaction and rendering

- `ui/src/regional/RegionalEditor.tsx`
  - Generalize gesture handling into box, polygon, and brush gestures.
  - Include live draft geometry in the composed operation list.
  - Append subtract geometry to the selected layer's mask operation chain.
- `ui/src/regional/Artboard.tsx`
  - Render ellipses and polygons in normal authoring mode.
  - Add the inspection-only binary preview.
- `ui/src/regional/geometry.ts`
  - Add bounds, hit testing, translation, and resize behavior for ellipse and polygon.
  - Ellipse hit testing should use the ellipse equation; polygon hit testing should use point-in-polygon/raycast logic.
- `ui/src/regional/EditorMenus.tsx`
  - Add a View-menu toggle for binary mask preview.
- `ui/src/regional/LayerPanel.tsx`
  - Add understandable icons and labels for the new geometry types.
- `ui/src/regional/disconnectedAreas.ts`
  - Extend rasterization/component logic for ellipse and polygon geometry.

### Python/backend contract

- `py/util/regional/document.py`
  - Validate ellipse bounds and polygon point arrays.
- `py/util/regional/mask_renderer.py`
  - Render ellipse and polygon geometry explicitly, preferably through Pillow drawing primitives.
- `schemas/bv_regional_v1.schema.json`
  - Add schema definitions and union entries without breaking v1 rectangle/brush documents.

### Tests and verification

- Python:
  - document validation for ellipse/polygon and invalid coordinates;
  - add/subtract mask composition;
  - overlap and clipping at canvas borders;
  - raster output dimensions and deterministic values.
- Frontend:
  - tool-state migration and persistence;
  - live rectangle/ellipse/polygon preview;
  - subtract modifies the selected layer;
  - binary preview blocks editing;
  - undo/redo atomicity;
  - hit testing and transforms.

Run before reporting completion:

```text
python -m unittest discover -s tests -v
cd ui
npm test
npm run build
cd ..
git diff --check
git status --short
```

Do not commit or push until Florian explicitly requests it. Before any commit, update README, changelog, node documentation/listing, and `pyproject.toml` version/description when the release scope requires it.

## Completed model-backend work and evidence

The following model paths were researched, implemented/tested during the broader project, and committed in prior work:

- SDXL attention routing, tested with Illustrious and Pony.
- Z-Image Turbo attention routing.
- FLUX.2 Klein 9B attention routing.
- Krea 2 attention routing marked experimental.
- Anima attention routing and Anima LLLite integration.
- Native ComfyUI regional conditioning remains the general fallback.

Important product statement for all documentation: attention routing is guidance, not hard spatial forcing. Results remain a combination of model priors, prompt engineering, region placement, overlap, strength, schedule, sampler, and model-specific behavior.

Krea 2 has a specific limitation: its main attention blocks can be patched, but the earlier text-fusion/refiner stage is not covered by the current seam. Therefore its backend should remain explicitly experimental rather than promising strict end-to-end isolation.

Relevant research files:

- `docs/research/regional-prompting-model-backends-2026-08.md`
- `docs/research/res4lyf-regional-conditioning.md`
- `docs/research/lc123-anima-regional-conditioning.md`
- `docs/research/anima-lllite-regional-controlnet.md`
- `docs/research/flux2-klein-9b-regional-attention-backend.md`
- `docs/research/krea2-regional-attention-backend.md`

## Ideogram 4 research

The conversion study is in `docs/research/bv-regional-to-ideogram4-json.md`.

Summary:

- A dedicated `BV Regional Ideogram 4 Export` node is feasible.
- Global prompt, background prompt, rectangle regions, and overlaps map reasonably well.
- Brushes, multiple mask islands, subtract operations, feather, strength, negatives, and explicit priority/overlap semantics cannot be represented losslessly by the known Ideogram region JSON contract.
- Recommended default fallback is to resolve each BV region mask and export its combined bounding box, while returning warnings/metadata about lossy conversion.
- Keep this as a clean-room implementation against the data contract; do not copy KJNodes implementation code.

This exporter is a separate future phase and should not be mixed into the editor-geometry change above.

## Suggested opening prompt for the next task

> Read `AGENTS.md` and `docs/research/regional-editor-next-features-handoff.md`, inspect the current Git status, and implement only the agreed editor geometry phase. Preserve `docs/publishing/`, use tests and existing document contracts as the guide, and do not commit until I explicitly ask.

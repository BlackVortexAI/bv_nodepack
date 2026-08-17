# BV Regional Editor Guide

The BV Regional Editor authors a model-neutral `BV_REGIONAL` document. Geometry,
prompts and authoring metadata are stored once; model-specific compiler nodes
decide how much of that contract a backend can execute.

[![Anima regional result](../examples/images/anima-android-dance-regional-showcase.png)](../examples/images/anima-android-dance-regional-showcase.png)

The reference document behind this image uses two rectangle layers per character:
a main body area and a smaller shared interaction area. A third, painted region
guides the golden light arc.

[Import the workflow PNG](../examples/images/anima-android-dance-regional-showcase.png)
· [Import the regional document](examples/anima-android-dance-regional-showcase.bv-regional.json)

## Minimal workflow

1. Add **BV Regional Prompt**.
2. Open the editor from the node or the BV toolbar action.
3. Define Global and Background prompts.
4. Add named regions and create rectangle or brush geometry.
5. Connect `regional` to a supported compiler.
6. Connect the compiler outputs to a standard KSampler.

| Backend | Connect | Behavior |
| --- | --- | --- |
| Native/Krea-style | `BV Regional Native Conditioning` | Standard ComfyUI masked conditioning; no model attention patch |
| Anima | `BV Regional Anima Conditioning` | Built-in Anima attention patch; standard KSampler |
| External Anima fallback | `BV Regional Anima Adapter` | Compiles for the optional Sen-sou node pack |

## Editor layout

| Area | Purpose |
| --- | --- |
| Left panel | Regions, priority order, geometry layers, visibility, lock and selection |
| Artboard | WYSIWYG canvas, background preview, masks, selection handles, zoom and pan |
| Right panel | Region strength, feather, prompts and document prompts |
| Top menu | Import/export, undo/redo, display controls, canvas settings, completion data and help |
| Floating tool strip | Select, rectangle, additive brush and subtractive brush |

Panel widths, open sections, active selection, zoom/pan and window geometry are
saved separately per `document_id`. They never alter the semantic regional document.

<details>
<summary><strong>Workspace and floating layouts</strong></summary>

![Regional Editor in workspace mode](assets/regional/editor-workspace.png)

![Regional Editor in floating mode](assets/regional/editor-floating.png)

Floating mode remains at viewport scale while the graph is zoomed or panned.

</details>

<details>
<summary><strong>Node and toolbar entry points</strong></summary>

![BV Regional Prompt node](assets/regional/regional-prompt-node.png)

![BV toolbar actions](assets/regional/toolbar-actions.png)

![Open Regional Editor action](assets/regional/toolbar-editor-hover.png)

![Quick Edit action](assets/regional/toolbar-quick-hover.png)

</details>

## Geometry and layers

- Rectangles show a live preview while dragging and support move plus eight resize handles.
- Brush layers support round/square tips, size, hardness, opacity and optional stylus pressure.
- Subtractive brush strokes remove from the selected brush layer; they do not create white masks.
- Regions and layers can be renamed, reordered, locked, hidden, disabled, duplicated or deleted.
- Regions may overlap. Version 1 executes the overlap mode `joint`.
- Canvas width and height control the authoring aspect ratio even when no background exists.

Mask overlay opacity and background-image opacity are display-only settings. They
do not change exported masks, regional strength or the image returned by a sender.

<details>
<summary><strong>Display controls</strong></summary>

![Mask and background-image opacity controls](assets/regional/view-controls.png)

</details>

<details>
<summary><strong>Reference document geometry</strong></summary>

The main layers guide the two character designs. The smaller rectangles overlap
where their hands should meet, while the brush region demonstrates freehand geometry.

![Cyan main body](assets/regional/region-cyan-main.png)

![Cyan interaction area](assets/regional/region-cyan-interaction.png)

![Amber main body](assets/regional/region-amber-main.png)

![Amber interaction area](assets/regional/region-amber-interaction.png)

![Holographic light arc brush](assets/regional/region-brush-arc.png)

</details>

## Prompts

Each document contains:

- Global positive and negative prompts;
- Background positive and negative prompts;
- positive and negative prompts per region;
- per-region strength and feather;
- negative mode, including the technical zero-out path.

Global prompting establishes composition and concepts across the image. Regional
prompts should usually describe local attributes rather than duplicate the entire
scene. A region guides where conditioning applies; it is not a hard object boundary.

## How strict is regional guidance?

Regional prompting and attention masking bias where prompt information is available;
they do not clip a generated object to a mask. Results still depend on the model,
seed, sampler, prompt composition, mask geometry and backend implementation.

- A subject may extend beyond its region or appear slightly offset from it.
- Attributes may bleed between nearby or strongly overlapping regions.
- A small interaction region can make both regional contexts available around a
  contact point, but it cannot guarantee joined hands, eye contact or another pose.
- Region strength controls conditioning influence. Raising it does not turn the
  region into a stricter bounding box and can overemphasize local concepts.
- Global prompts can still influence composition and placement across the full image.

Treat masks as spatial intent. Validate important layouts across several seeds and
adjust geometry, prompt wording and backend settings together.

## Workspace, floating and Quick Edit

Workspace mode fills the available browser viewport. Floating mode is independently
movable and resizable and remains unaffected by graph zoom or pan.

Quick Edit changes Global, Background or one selected region without opening the
full artboard. It targets stable document and region IDs even though the UI shows names.

<details>
<summary><strong>Quick Edit over a live workflow</strong></summary>

![Regional Quick Edit](assets/regional/quick-edit.png)

</details>

## Background feedback

- **BV Regional Preview Send** returns a temporary preview to a selected editor.
- **BV Regional Save Send** saves normally and returns the saved result.
- Multiple senders use last-completed-sender-wins semantics.
- Images are not embedded as Base64 in the workflow document.

This makes it possible to redraw masks over the latest sampler, detailer or upscale
result without creating a workflow cycle.

## Prompt autocomplete

BV Prompt Autocomplete works in the full editor, Quick Edit and ordinary ComfyUI
multiline widgets. Tags from the default dataset are inserted with spaces while the
canonical underscore form remains available as metadata.

Autocomplete is optional. Disable it under **Settings → BV Node Pack → Prompting**
or from **Edit → Prompt Autocomplete** when another extension should own prompt fields.
Several CSV/TSV datasets may be enabled and ordered; the topmost source wins duplicate tags.

<details>
<summary><strong>Completion surfaces</strong></summary>

![Autocomplete in Quick Edit](assets/regional/autocomplete-quick-edit.png)

![Autocomplete in the full editor](assets/regional/autocomplete-editor.png)

![Autocomplete in a native multiline widget](assets/regional/autocomplete-multiline.png)

</details>

<details>
<summary><strong>Dataset settings and priority</strong></summary>

![Completion dataset settings](assets/regional/completion-settings.png)

</details>

## Document tools

| Node | Use |
| --- | --- |
| BV Regional Debug | Canonical JSON, summary and stable `document_id` |
| BV Regional Select | Select Global, Background or a named region |
| BV Regional Deconstructor | AST, plain text, source text and reusable selection |
| BV Regional Prompt Extract | Extract positive/negative AST and text |
| BV Regional Mask Render | Render mask plus pixel bounding box |

These seams are intended for later detailer adapters and other consumers without
coupling them to the editor UI.

## Anima reference workflow

The built-in Anima path has been verified with two independently conditioned
characters, joint interaction overlap, a painted light region and a standard KSampler.

<details>
<summary><strong>Minimal workflow</strong></summary>

![Anima regional workflow](assets/regional/anima-workflow.png)

</details>

Import either the metadata-bearing
[`workflow PNG`](../examples/images/anima-android-dance-regional-showcase.png)
or the editor-only
[`regional document`](examples/anima-android-dance-regional-showcase.bv-regional.json).

## Current limits

- `joint` is the only executable overlap mode; normalized, exclusive and priority modes are reserved.
- Native masked conditioning does not provide model-internal attention isolation.
- The built-in attention backend currently targets Anima; other model families require future adapters.
- Parent-region IDs exist in the schema, but hierarchy authoring is not exposed yet.
- Regional negative isolation depends on backend capability.
- A region is conditioning guidance, not a guaranteed object-sized bounding box,
  exact pose constraint or pixel-perfect interaction target.

For the formal schema and implementation boundaries, see
[`docs/specs/bv-regional-v1.md`](specs/bv-regional-v1.md) and
[`docs/regional-editor-mvp.md`](regional-editor-mvp.md).

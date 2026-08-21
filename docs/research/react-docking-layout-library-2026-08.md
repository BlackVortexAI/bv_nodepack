# React docking/layout library research

Date: 2026-08-21
Scope: choose a docking/layout engine for BV-owned ComfyUI windows. No dependency was added and no production code was changed.

## Executive decision

**Prototype FlexLayout first. Keep Dockview as the deliberate fallback. Reject Golden Layout for new BV work.**

FlexLayout currently offers the best balance for this project: it covers resizable and nested splits, tab/panel docking, internal floating panels, browser-window popouts, JSON persistence, React 18, comprehensive styling, and substantially better accessibility than a hand-built layout. In a reproducible local measurement against the official npm artifacts, its minified production JavaScript was roughly half Dockview's size.

Dockview is the stronger product when maximum docking sophistication and host isolation matter more than footprint. Its built-in floating *groups*, Shadow DOM support, CSP nonce option, framework-neutral core, and very explicit docking APIs reduce integration risk. If FlexLayout fails the ComfyUI interaction prototype—especially drag/drop, focus, overlay containment, or state preservation—Dockview is the preferred fallback, not a custom layout engine.

Golden Layout is smaller in the same synthetic JavaScript measurement, but its published npm release is from 2022 and its own current repository documentation warns that the npm modules have not been updated in a long time and recommends building from source. It also has no first-party React component layer comparable to the other two. That maintenance and integration burden outweighs its size advantage.

## Requirements and gates

The chosen library must pass every mandatory gate:

1. Bundle fully into the BV frontend; no CDN, remote CSS, font, image, or runtime request.
2. Run with the project's React 18.3.1 and Vite 5 build without a second React runtime.
3. Stay inside a BV-owned host and not steal canvas drag, wheel, pointer, focus, or keyboard events outside that host.
4. Support horizontal and vertical resize, nested layouts, panel rearrangement between left/right/top/bottom, internal floating panels, and restore from a serializable model.
5. Allow complete BV visual theming without leaking broad selectors into ComfyUI.
6. Degrade safely when stored layout JSON is absent, corrupt, from an older schema, or refers to a removed panel.

External browser windows are useful but **not a phase-one requirement**. They introduce popup blockers, cross-document CSS, focus, lifecycle, and multi-monitor behavior that is unrelated to the requested floating-on-canvas panels.

## Decision matrix

Scores are 1 (poor) to 5 (excellent). Weight reflects the BV/ComfyUI constraints, not generic library quality.

| Criterion | Weight | Dockview | FlexLayout | Golden Layout |
|---|---:|---:|---:|---:|
| Required docking, nested split and resizing behavior | 25% | 5 | 5 | 4 |
| Internal floating panels | 15% | 5 | 4 | 2 |
| ComfyUI isolation / integration surface | 20% | 5 | 4 | 2 |
| Bundle footprint | 15% | 3 | 4 | 5 |
| React 18 integration | 10% | 5 | 5 | 2 |
| Persistence / migration seam | 5% | 5 | 5 | 4 |
| Styling control | 5% | 5 | 5 | 4 |
| Accessibility | 5% | 4 | 5 | 1 |
| **Weighted total** | **100%** | **4.65** | **4.55** | **3.00** |

The score difference between Dockview and FlexLayout is intentionally small. FlexLayout is recommended for the prototype because footprint is a stated constraint and it still clears all feature gates. Dockview has the highest capability/compatibility score and is the fallback if the prototype reveals host conflicts.

## Verified facts by candidate

### 1. Dockview

Verified:

- The free React package is MIT licensed; the separate Enterprise package is proprietary. The project describes the free package as a zero-runtime-dependency docking manager and lists React 16.8 through 19 as supported peer versions. The React wrapper depends on the Dockview JavaScript package rather than on unrelated UI frameworks. [Repository and package overview](https://github.com/mathuo/dockview), [npm package](https://www.npmjs.com/package/dockview-react)
- It supports dockable tab groups, resizable grids/splits, drag-and-drop, internal floating groups, external popout windows, and `toJSON()` / `fromJSON()` persistence. A floating container can itself contain a nested layout with multiple groups. [Introduction](https://dockview.dev/docs/overview/introduction/), [core concepts and serialization](https://dockview.dev/docs/core/overview/), [floating groups](https://dockview.dev/docs/core/groups/floatingGroups/)
- Floating groups can be bounded to the dock viewport, which maps directly to the requirement that a floating BV panel remain inside its owning UI. [Floating-group bounds](https://dockview.dev/docs/core/groups/floatingGroups/)
- The package advertises Shadow DOM support. Its options include a CSP nonce provider. These are valuable host-isolation seams even if the first prototype uses ordinary DOM. [npm package features](https://www.npmjs.com/package/dockview-react), [Dockview options](https://dockview.dev/docs/api/dockview/options/)
- Accessibility includes WAI-ARIA state, live-region announcements, rebindable keyboard navigation, focus movement, and keyboard docking. Keyboard navigation is opt-in while the feature matures. [Accessibility](https://dockview.dev/docs/advanced/accessibility/), [keyboard API](https://dockview.dev/docs/advanced/keyboard/)
- The official package includes a stylesheet (`dockview-react/dist/styles/dockview.css`) and ESM/CJS entry points. CSS/SCSS files are explicitly marked as side effects. [Package manifest](https://github.com/mathuo/dockview/blob/master/packages/dockview-react/package.json)
- Maintenance is active. Official npm metadata reported `dockview-react` 8.2.0 on the research date, and recent releases contain substantial accessibility, floating-group, and packaging work. [npm package](https://www.npmjs.com/package/dockview-react), [releases](https://github.com/mathuo/dockview/releases)

Advantages:

- Richest match for future IDE-like workspaces: nested floating groups, docking, edge groups, external windows, and extensive APIs are native concepts.
- Strongest explicit isolation story: Shadow DOM support, prefixed CSS, viewport-bounded floating groups, and CSP nonce handling.
- Framework-neutral core gives BV an escape hatch if a future UI surface is not React.
- Serialization API is straightforward and storage-backend agnostic.

Disadvantages:

- Largest measured runtime of the three. Its full CSS contains multiple themes/features; importing the stock stylesheet wholesale is also materially larger than FlexLayout's single-theme CSS.
- Rapid major-version cadence increases upgrade/migration work. BV should pin an exact version, wrap the API, and upgrade deliberately.
- Some advanced UI features are Enterprise-only. The required BV features are documented in the free core, but the prototype must avoid accidentally relying on Enterprise examples or modules.
- Its large feature surface is more than the current three-column Region Editor strictly needs.

### 2. FlexLayout

Verified:

- FlexLayout is MIT licensed, React-specific, and declares only React/React DOM peer dependencies (`^18 || ^19`) in the current manifest. The repository describes React as its only dependency. [Package manifest](https://github.com/caplin/FlexLayout/blob/master/package.json), [README](https://github.com/caplin/FlexLayout/blob/master/README.md)
- It supports splitters, nested row layouts, movable/reorderable tabs and tabsets, edge docking, border tabsets, internal floating panels, external popout windows, and submodels/layouts inside layouts. [Feature list and JSON model](https://github.com/caplin/FlexLayout/blob/master/README.md)
- Layout state is a defined JSON model. `Model.fromJson()` restores it and `model.toJson()` serializes it. The top-level model can include `layout`, `borders`, and `subLayouts`. [Model and persistence documentation](https://github.com/caplin/FlexLayout/blob/master/README.md)
- Version 0.9 introduced simulated/internal floating panels; version 0.9.1 added `constrainFloatPanels` to keep them inside the main layout. This is the relevant floating mode for BV phase one. [Changelog](https://github.com/caplin/FlexLayout/blob/master/CHANGELOG.md)
- External popouts use React portals, require a same-origin `popout.html`, copy styles at runtime, and require components to use their actual owner `window`/`document` rather than global objects. The repository also documents a production limitation for CSS-in-JS styles that cannot be copied to the popout. [Popout documentation](https://github.com/caplin/FlexLayout/blob/master/README.md)
- Styling is delivered through prefixed classes and CSS variables. A single theme stylesheet can be imported and variables overridden on a common ancestor. Custom tab, tabset, icon, menu, and overflow renderers are supported. [Theming and rendering](https://github.com/caplin/FlexLayout/blob/master/README.md)
- It has detailed built-in accessibility: WAI-ARIA tab/tablist/tabpanel semantics, accessible splitters, menus, visible focus, rebindable shortcuts, and keyboard splitter resizing. [Accessibility section](https://github.com/caplin/FlexLayout/blob/master/README.md#accessibility)
- Maintenance is active. Official npm metadata and the repository manifest reported 0.10.5 on the research date; the changelog shows frequent 2026 work including floating panels, action logging, and test coverage. [npm package](https://www.npmjs.com/package/flexlayout-react), [changelog](https://github.com/caplin/FlexLayout/blob/master/CHANGELOG.md)

Advantages:

- Best feature-to-size balance in the measured artifacts.
- Native React model/factory fits the existing BV React 18 code without an adapter layer.
- JSON-first model provides a clean persistence, validation, migration, and reset boundary.
- Strong accessibility is already part of the control instead of becoming BV-owned infrastructure.
- Single-theme CSS is compact and straightforward to replace with BV variables.

Disadvantages:

- React-only; there is no framework-neutral core seam comparable to Dockview.
- The package is still pre-1.0 and has recent breaking changes. Exact pinning and an internal adapter are mandatory.
- External popouts add a host page and cross-document behavior. We should disable them initially rather than confuse them with internal floating panels.
- HTML drag-and-drop and portal/popover behavior must be tested against ComfyUI's canvas handlers. The documentation cannot prove coexistence with ComfyUI.
- Shadow DOM and CSP nonce support are not documented as first-class features; Dockview is stronger if isolation becomes a hard requirement.

### 3. Golden Layout

Verified:

- Golden Layout 2.6.0 is MIT licensed, TypeScript/framework-neutral, and its package manifest declares no runtime dependencies. It supports drag/drop layouts, native popup windows, virtual components, save/load, focus, theming, and responsive sizing. [Repository](https://github.com/golden-layout/golden-layout), [package manifest](https://github.com/golden-layout/golden-layout/blob/master/package.json)
- Its official documentation says the npm modules have not been updated in a long time, recommends building from source, and notes that generated single-file bundles are not included in the npm package by default. [Current repository documentation](https://github.com/golden-layout/golden-layout/blob/master/docs/index.md)
- Official npm metadata dates 2.6.0 to 2022-09-26. The repository says non-trivial development is aimed at an unstable, backward-incompatible `dev` branch intended to become version 3. [Releases](https://github.com/golden-layout/golden-layout/releases), [repository README](https://github.com/golden-layout/golden-layout)
- Framework integration is through component binding/virtual components. The current library does not provide a first-party React component API comparable to `DockviewReact` or FlexLayout's `<Layout>`. [Framework and virtual-component documentation](https://github.com/golden-layout/golden-layout/blob/master/docs/index.md), [public API](https://github.com/golden-layout/golden-layout/blob/master/etc/golden-layout.api.md)
- The shipped dark theme still references multiple packaged PNG assets for controls. It is bundleable/offline, but it creates more asset-path and restyling work than the SVG/CSS-variable approaches of the other candidates. This was verified directly from the 2.6.0 npm artifact.

Advantages:

- Smallest measured JavaScript and CSS payload.
- Mature conceptual model, MIT license, framework neutrality, native popup support, and persistence.
- No declared runtime dependency.

Disadvantages:

- The official npm artifact is stale by its own documentation; using current source would make BV responsible for building and tracking an unstable future major.
- React integration requires a BV-owned binding/lifecycle layer or a third-party wrapper, increasing the exact compatibility risk this research is intended to avoid.
- No comparable documented accessibility layer was found in the current primary documentation or package.
- Old asset-based themes and broader manual integration make it the highest-maintenance option despite the smallest bytes.

## Reproducible size evidence

This is a local, apples-to-apples measurement, not a claim about the final BV bundle. It used official npm artifacts, the repository's installed esbuild, minification, ESM output, and externalized React/React DOM because BV already ships those. CSS was measured separately. Tree shaking depends on the actual import and can change the result.

Tested artifacts:

- Dockview React **8.1.0** (8.2.0 was visible in registry metadata but was beyond the local npm time-travel cutoff during artifact installation)
- FlexLayout React **0.10.5**
- Golden Layout **2.6.0**

| Candidate | Minified JS | gzip JS | Minified CSS | gzip CSS | Approx. total gzip |
|---|---:|---:|---:|---:|---:|
| Dockview React 8.1.0 | 397,126 B | 91,799 B | 132,183 B | 10,321 B | **102,120 B** |
| FlexLayout React 0.10.5 | 174,665 B | 46,234 B | 20,641 B | 3,285 B | **49,519 B** |
| Golden Layout 2.6.0 | 154,591 B | 36,874 B | 7,698 B | 1,712 B | **38,586 B** + 1,331 B PNG assets |

Official npm `dist.unpackedSize` is recorded only for audit context and is **not** a runtime-size comparison: Dockview React 8.2.0 1,785,211 B plus its transitive packages; FlexLayout 0.10.5 1,604,680 B; Golden Layout 2.6.0 2,059,600 B. Those values include declarations, maps, themes, and other files that do not all enter the BV bundle. Package metadata can be independently inspected with `npm view <package>@<version> dist.unpackedSize dependencies peerDependencies`.

## ComfyUI compatibility assessment

No candidate's documentation makes a ComfyUI-specific guarantee. The following points are therefore **inferences to validate**, not verified compatibility facts:

- BV already owns a React 18 root and Vite bundle, so both React packages should resolve their peer dependency to BV's existing React rather than loading a second runtime. A bundle/metafile assertion must enforce this.
- All three libraries operate inside a supplied container, so they should coexist with the LiteGraph canvas if the BV host defines a clear stacking context and stops pointer/wheel/drag events only within interactive panel chrome. The prototype must prove this; documentation alone cannot.
- FlexLayout's prefixed classes and Dockview's `dv-` styles reduce ordinary CSS collisions. BV should still scope overrides under a BV root class and never import theme CSS globally without auditing selectors.
- Internal floating panels are safer than browser popouts for ComfyUI. They stay in the existing document and avoid popup blockers, copied styles, alternate `window` objects, and teardown synchronization.
- Stored library JSON must not be treated as BV's durable public configuration contract. Persist a BV envelope with `schemaVersion`, library/version identity, panel IDs, and a validated library payload. Fall back to a known default layout when validation or migration fails.

## Recommended architecture boundary

Keep the library behind a small BV adapter rather than exposing it throughout Region Editor components:

- `WorkspaceLayout`: owns library initialization and teardown.
- `WorkspacePanelRegistry`: maps stable BV panel IDs to React renderers and capability metadata.
- `WorkspaceLayoutStateV1`: BV-owned persistence envelope with schema version and sanitized library JSON.
- `WorkspaceLayoutStorage`: initially `localStorage`, replaceable by BV config storage without changing panel code.
- commands such as `movePanel`, `floatPanel`, `dockPanel`, `resetLayout`, `saveLayout`, and `restoreLayout` form the only mutation surface used by the application.

This makes a FlexLayout-to-Dockview switch expensive only inside the adapter, not across every editor tool.

## Prototype plan and acceptance criteria

Prototype **FlexLayout 0.10.5 pinned exactly** in an isolated route/showcase first. Do not integrate it into the Region Editor until every mandatory criterion passes.

### Required scenario

- Three initial panels: tools left, canvas/content center, properties right.
- Resize both splitters horizontally; create one nested vertical split.
- Move the right panel to the left, center, and a nested bottom position.
- Float one panel inside the BV workspace, resize it, move it to every edge, and redock it.
- Constrain internal floats to the BV workspace.
- Switch between Standard/Large/Larger density modes and both performance-effect settings without corrupting geometry.
- Save, reload, restore, reset, and migrate one synthetic prior schema.

### Mandatory technical assertions

- Production build contains no CDN URL or runtime network fetch from the layout package.
- Build contains one React/React DOM runtime only; package peers resolve to BV's pinned React 18.
- No uncaught exception or console error across all scenario steps.
- Canvas pan, zoom, node drag, selection, context menu, and keyboard shortcuts still work immediately outside the BV panel host.
- Splitter/tab/floating drag never moves a ComfyUI node and canvas drag never moves a panel.
- Pointer capture is released after cancel, Escape, window blur, component unmount, and editor close.
- All overlays, drag previews, menus, and floating panels remain inside the intended stacking context and above BV content without covering unrelated ComfyUI controls.
- Layout responds correctly when its host is initially hidden, resized, detached, and mounted again.
- Panel React state survives docking moves where documented; any intentional remount is identified and handled.
- Corrupt/unknown layout JSON falls back to the default without losing other BV config.
- Unknown or removed panel IDs are discarded or replaced deterministically.
- Keyboard-only user can focus tabs, move between tabsets, and resize splitters; visible focus and labels match the BV design.
- Exact package license and version are included in third-party notices.

### Size budget

- Record Vite's before/after production chunks and gzip sizes.
- Initial acceptance target: **no more than 65 KiB additional gzip** for layout JavaScript plus required CSS, excluding an already-shipped React runtime.
- If FlexLayout exceeds the budget materially or cannot be code-split to the editor route, investigate import shape before changing libraries.

### Fallback trigger

Switch the prototype to Dockview if FlexLayout fails any non-workaroundable requirement involving ComfyUI event isolation, internal floating containment, nested docking, component lifecycle/state preservation, or host/CSP isolation. Do not fall back merely for a cosmetic mismatch; both candidates are sufficiently themeable.

## Final recommendation

Proceed with a **small FlexLayout prototype**, not production integration. It appears to be the cleanest middle ground: about 50 KiB gzip in the synthetic measurement, full required layout behavior, native React 18 support, JSON persistence, and strong accessibility. Treat Dockview as a high-quality, better-isolated fallback whose roughly 102 KiB gzip synthetic footprint buys a richer and more future-proof docking engine. Do not adopt Golden Layout.

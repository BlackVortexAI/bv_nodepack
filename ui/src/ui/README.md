# BV UI system

This directory is the project-wide interface boundary for BV-owned UI. New dialogs and workspaces should compose these modules instead of adding isolated colors, spacing, overlays, or persistence code.

- `react.tsx`: accessible React dialog shell and portal lifecycle.
- `dom.ts`: matching imperative adapter for legacy ComfyUI widget entrypoints.
- `dock.tsx`: reusable FlexLayout workspace with session working drafts. It never writes workflow data or silently overwrites a named layout.
- `layoutProfiles.ts`: versioned, editor-type-specific user layout profiles in browser preferences plus RAM-only working drafts.
- `windowRegistry.ts`: graph-scoped node identity and workflow-owned menu visibility.
- `history.ts`: shared bounded, RAM-only editor history.
- `toastStore.tsx`: global BV notifications positioned around ComfyUI overlays.
- `preferences.ts`: global BV size and reduced-effects settings.
- `window.tsx`: canonical window chrome, responsive header tiers, node navigation, geometry, shelf and footer hierarchy.
- `../index.css`: shared `--bv-ui-*` tokens and component classes.

Add `bv-ui` to imperative roots. React content mounted below `#bv-root` inherits the same tokens automatically. Keep native ComfyUI canvas and node widgets outside this styling boundary.

Dock layouts must use a stable editor-type and instance key. Working layouts are session-only; named layouts are explicitly saved per editor type in browser preferences. Workflow/domain data must remain in normal workflow serialization. Window geometry is presentation state and is not a layout modification. See `docs/bv-ui-window-architecture.md` for the persistence and lifecycle contract.

The repository-owned showcase entry is `ui/showcase/index.html`; its implementation is `ui/src/showcase.tsx` and it runs through `npm run showcase`. It is the canonical optical and interactive reference for new elements and must remain completely offline-capable: no CDN assets or runtime network imports. Responsive examples must derive their state from their measured demo surface so they exercise the same breakpoints as production instead of presenting static mock states.

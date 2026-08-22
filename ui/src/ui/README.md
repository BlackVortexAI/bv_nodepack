# BV UI system

This directory is the project-wide interface boundary for BV-owned UI. New dialogs and workspaces should compose these modules instead of adding isolated colors, spacing, overlays, or persistence code.

- `react.tsx`: accessible React dialog shell and portal lifecycle.
- `dom.ts`: matching imperative adapter for legacy ComfyUI widget entrypoints.
- `dock.tsx`: reusable, locally bundled FlexLayout workspace with versioned browser persistence and a reset signal.
- `preferences.ts`: global BV size and reduced-effects settings.
- `window.tsx`: canonical window chrome, responsive header tiers, node navigation, geometry, shelf and footer hierarchy.
- `../index.css`: shared `--bv-ui-*` tokens and component classes.

Add `bv-ui` to imperative roots. React content mounted below `#bv-root` inherits the same tokens automatically. Keep native ComfyUI canvas and node widgets outside this styling boundary.

Dock layouts must use a stable `storageId`. The adapter stores presentation state only; workflow/domain data must remain in the normal node serialization. Every large workspace must expose a visible reset action by incrementing `resetSignal`.

The repository-owned showcase entry is `ui/showcase/index.html`; its implementation is `ui/src/showcase.tsx` and it runs through `npm run showcase`. It is the canonical optical and interactive reference for new elements and must remain completely offline-capable: no CDN assets or runtime network imports. Responsive examples must derive their state from their measured demo surface so they exercise the same breakpoints as production instead of presenting static mock states.

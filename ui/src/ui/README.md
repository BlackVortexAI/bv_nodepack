# BV UI system

This directory is the project-wide interface boundary for BV-owned UI. New dialogs and workspaces should compose these modules instead of adding isolated colors, spacing, overlays, or persistence code.

- `react.tsx`: accessible React dialog shell and portal lifecycle.
- `dom.ts`: matching imperative adapter for legacy ComfyUI widget entrypoints.
- `dock.tsx`: reusable, locally bundled FlexLayout workspace with versioned browser persistence and a reset signal.
- `preferences.ts`: global BV size and reduced-effects settings.
- `../index.css`: shared `--bv-ui-*` tokens and component classes.

Add `bv-ui` to imperative roots. React content mounted below `#bv-root` inherits the same tokens automatically. Keep native ComfyUI canvas and node widgets outside this styling boundary.

Dock layouts must use a stable `storageId`. The adapter stores presentation state only; workflow/domain data must remain in the normal node serialization. Every large workspace must expose a visible reset action by incrementing `resetSignal`.

The repository-owned showcase lives under `ui/prototypes/` and is the visual reference for new elements. It must remain completely offline-capable: no CDN assets or runtime network imports.

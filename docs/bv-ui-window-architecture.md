# BV UI window architecture

This document is the implementation contract for BV-owned ComfyUI windows. The showcase in `ui/src/showcase.tsx` is the visual reference; this document defines lifecycle and persistence boundaries.

## Identity and instances

A node-bound editor is identified by editor family plus scoped node identity. Scoped identity combines the graph/subgraph instance path and node ID; a bare node ID is never globally unique. The Control Center is the only workflow-global singleton and does not use a node identity.

Each node can own at most one window per compatible editor surface. The Regional Prompt Full Editor and Quick Edit are mutually exclusive views of one node document. Switching views for that same node replaces the other view. Different nodes may remain open according to the global Keep/Replace preference.

## Visibility

`node.properties.bvWindowMenuVisible` controls discovery only. It filters the global window overview and compatible in-window switch menus. It never closes, minimizes, disables, or changes last-active history.

When the property is absent, ordinary editors default to visible while Smart Pipe and Smart Pipe Merge default to hidden. Loading an old workflow must infer the default without dirtying it. The Control Center has no visibility switch.

The overview always provides a session-only **Show hidden nodes** recovery switch. It resets when the menu closes. Hidden rows provide a direct reveal action which persists the node property in the workflow.

## Capability-driven action bar

Actions are derived from the active workflow:

1. Control Center, only if a Control Center node exists.
2. Last full BV editor, if a full-editor-capable node exists.
3. Quick Edit, if a quick-capable node exists.
4. Window overview, if any full or quick capability exists, including when all instances are hidden.

Control Center is never an overview entry and never changes last-editor history. Missing last-active targets fall back to the first graph-scoped target and emit a timed BV toast.

## Persistence boundaries

| State | Storage | Lifetime |
| --- | --- | --- |
| Node menu visibility | node property in workflow | workflow |
| Domain/editor values | node widgets or root workflow config | workflow |
| Control Center config | `rootGraph.extra.bv_settings.controlConfig` | workflow |
| Keep/Replace preference | ComfyUI user setting | user |
| Named FlexLayout profiles | browser user preferences, per editor type | user/browser |
| Window geometry and session layout drafts | local presentation/session state | session or local UI state |
| Undo/redo history | RAM only, maximum 100 entries | open editor session |
| Dirty editor draft | RAM only until Save/Discard/close decision | open editor session |

Undo history, layout working drafts, and conflict snapshots must never inflate workflow JSON.

## Draft and history contract

All BV editors use the shared bounded history controller. Text controls keep native text undo while focused; otherwise Ctrl+Z, Ctrl+Shift+Z, and Ctrl+Y address the active BV editor and must not also trigger ComfyUI workflow undo.

Explicit-save editors keep their window open after Save. Save creates a new baseline and clears draft history. Discard restores execution-affecting values to the baseline without resetting presentation state. Dirty close or Replace uses the shared Save/Discard/Keep Editing dialog.

External Smart Pipe changes use a three-way merge of baseline, draft, and current node state. Stable IDs are mandatory. Unresolvable conflicts disable editing and offer reload plus draft JSON export.

## Layout profiles

FlexLayout editors have an immutable Factory layout and at most 20 named profiles per editor type. Profile names contain 1-40 characters and are case-insensitively unique. Profiles include schema version, editor version, FlexLayout library signature, panel signature, and complete layout JSON.

Named profiles never autosave. Session working state distinguishes:

- **Saved**: matches the selected stored profile.
- **Adjusted**: split sizes, expanded panels, or active tab changed; preserved silently for the session.
- **Modified**: structural panel/tab placement changed; protected when switching layouts.

Window position and size are never layout changes. Incompatible profiles remain listed and can be replaced or deleted; the editor loads Factory and emits a timed toast.

### Deferred preference portability

Layout-profile export/import is intentionally deferred. When added, it belongs in the ComfyUI BV settings surface and must transfer all editor-type profile envelopes without adding per-window commands or workflow payload. Imported profiles must pass the same schema, editor version, FlexLayout library, and panel-signature compatibility checks before activation.

## UI ownership

BV windows, dialogs, confirmations, menus, toasts, form controls, lists, and editor overlays must compose exports from `ui/src/ui`. Native ComfyUI node widgets and ComfyUI settings remain native. Legacy imperative extensions may bridge runtime node APIs, but must mount a BV React view instead of creating a second visual control system.

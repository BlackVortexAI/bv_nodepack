# LUT catalog lifecycle

## Contract

The repository JSON files `py/util/lut_catalog.json` (stable) and
`py/util/lut_catalog.experimental.json` (experimental) are the bundled and
online development sources. Runtime never edits them. Each ComfyUI user profile
has separate working copies under `user/default/bv_nodepack/` plus
`lut_catalog_settings.json` for the selected channel.

Local resolution validates both bundled and working JSON. The valid catalog
with the higher `catalog_version` wins; an equal working version remains
authoritative. When bundled is newer, it is atomically materialized as the
working copy. A remote catalog replaces the working copy only when its version
is strictly greater than the effective local version. Invalid, unavailable,
older or oversized remote data never replaces the last valid local catalog.

Stable and experimental are independent catalogs. Selecting a channel persists
the choice and queues a refresh for that channel. The manual refresh endpoint
uses the persisted channel, returns `202` immediately and exposes progress via
the status endpoint. The Download Manager displays queued/checking/current/
updated/failed state and keeps the local entries usable after update failure.

## Concurrency and startup boundary

Network download runs in a daemon worker and does not wait in the ComfyUI import
path. Startup still performs bounded local settings/catalog reads and may
atomically create or repair the working files before starting the worker; this
local-I/O boundary is deliberately reported separately from asynchronous
network refresh.

Refresh requests are serialized per service, coalesced per channel and tagged
with generations. Readers see defensive snapshots; a new snapshot is published
only after validation and atomic persistence. Installation is bound to the
rendered channel and catalog version, then rechecked immediately before publish
so a concurrent channel or catalog change cannot install stale content. UI
requests and polling also carry a generation; stale completions and stale
errors may not mutate the current channel state.

## Paths and repository hygiene

- Bundled stable: `py/util/lut_catalog.json`
- Bundled experimental: `py/util/lut_catalog.experimental.json`
- Working/settings: `<ComfyUI user>/default/bv_nodepack/lut_catalog*.json`
- Installed LUTs: `<ComfyUI models>/luts/downloaded/`

`.gitignore` excludes the repository-local forms of all working/settings files
and downloaded libraries. The bundled catalogs remain tracked.

## Consumer inventory and path contract

Disk LUT names exposed by the backend and stored by the UI use `/` as their
canonical relative-path separator on every platform. `folder_paths` is still
called with its original platform-specific name, while `_lut_choices()` exposes
only the canonical name. Loader and Registry execution remain tolerant of
legacy `\` values; registry parsing migrates those values to the canonical form.
Built-in choices and the Download Manager sentinel are not path-normalized.

`ui/src/regional/lutLibrary.ts` is the node-free consumer inventory. It owns an
immutable, reference-stable snapshot of canonical installed names. Catalog
seeds merge without deleting newer installations, publication is idempotent,
and subscribers receive one notification per content change with explicit
unsubscribe cleanup. A successful LUT installation publishes exactly once
before invoking an optional origin callback.

All open Loader and Registry consumers subscribe to this inventory. An
installation from another surface adds the new choice without changing the
current selection. Only the Loader that initiated a download may select the new
choice through its origin callback. Loader subscriptions are owned and cleaned
up by the central LUT presentation adapter; Registry windows consume the same
snapshot through `useSyncExternalStore`.

## Verification matrix

- `tests/test_lut_catalog.py`: validation, bundled/working precedence, strict
  remote version comparison, offline/error retention, channel persistence,
  non-blocking worker, generation/race guards and atomic writes.
- `tests/test_lut_routes.py`: channel preview/persistence, status, asynchronous
  manual refresh and stale-install conflict responses.
- `tests/download_manager_ui.test.mjs`: shared BV UI, channel and status controls,
  bounded polling, generation guards and install binding.
- `tests/node_presentation.test.mjs`: the central LUT lifecycle/presentation
  adapter, two-Loader fan-out and cleanup, origin-versus-external selection,
  and the absence of LUT-specific ComfyUI manipulation in domain modules or
  `index.tsx`.
- `tests/lut_library.test.mjs`: canonical merge, immutable snapshot identity,
  idempotent publication, multi-subscriber fan-out and unsubscribe behavior.
- `tests/test_lut_prototype.py` and `tests/test_lut_resources.py`: canonical
  backend choices, tolerant legacy loading and Registry migration.
- `tests/lut_registry_config.test.mjs`: UI-side migration of legacy disk names
  without altering built-in choices.

## Current runtime evidence (2026-08-29, uncommitted working tree)

An isolated CPU ComfyUI 0.34.0 instance loaded only this `bv_nodepack` checkout.
The import log named the exact checkout and measured 0.1 seconds. The served
`extensions/bv_nodepack/bv_nodepack.core.js` SHA-256 matched the checkout bundle
(`132E9C8CF3FB80697B07068F848D6B010D222FCB59BC18994493C8B6F17E83D6`). With
remote access unavailable, startup and manual refresh retained working stable
v1 and showed the offline warning. The real Download Manager switched between
experimental and stable, exposed the correct entries/status, showed
queued-then-fallback for manual refresh, and persisted stable across a process
restart. This evidence proves neither a commit nor a push. The bundle hash
describes the on-disk bundle at that time; later source edits require a rebuild
and a fresh runtime check before claiming uptake.

The later consumer-synchronization fixes were built into
`js/bv_nodepack.core.js` with SHA-256
`D547548DF41C982BFB455CF0ED17B9D349845669766C3610D4DD0BAA6F91F2A6`.
That bundle is ready for manual acceptance, but this newer hash has not yet been
loaded, runtime-tested or visually accepted in ComfyUI.

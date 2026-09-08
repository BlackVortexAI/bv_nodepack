# BV Node Pack for ComfyUI

![BV Node Pack banner](docs/assets/registry/bv-nodepack-banner.png)

BV Node Pack adds visual regional prompting, model-specific regional attention,
regional LoRA routing, sequential detailer workflows, Smart Pipes, structured prompt
tools, Subgraph controls and deterministic workflow utilities to ComfyUI.

> [!NOTE]
> BV Node Pack is developed with extensive generative-AI assistance. Product
> direction, architecture, review and real-workflow validation remain human-led.

> [!IMPORTANT]
> **BV Node Pack 1.4.2** moves API keys, settings and catalogs into ComfyUI's
> private System User directory, limits management actions to local clients,
> pins LUT downloads to one host and applies one folder-containment rule to the
> LoRA, preview, sidecar, model-hash and LUT files it handles. **1.4.1** closed
> the workflow-reachable file, model and
> endpoint boundaries. Both build on **1.4.0**, which added
> reference-driven regional editing, one workflow-wide Global LoRA Registry,
> automatic MODEL/CLIP preparation and improved Registry, catalog and Quick Edit UI.
> The [Wiki](https://blackvortexai.github.io/bv_nodepack_wiki/) contains the full
> node reference and task-oriented guides.
>
> Existing Regional workflows retain compatibility and supported node-local data is
> migrated when a workflow is loaded. Loading does not overwrite the workflow file,
> and deprecated Regional wiring is not silently rebuilt. Keep a backup, migrate any
> remaining legacy connections to the V3 resource flow, then save, reload and run the
> updated workflow once. Press **Ctrl+Alt+B** to toggle **Regional Legacy Debug Mode**
> when hidden legacy ports or V3 provider links are needed for inspection. The
> shortcut can be changed in ComfyUI Settings → Shortcuts.

## Installation

Install **BV Node Pack** through ComfyUI Manager, or clone it into
`ComfyUI/custom_nodes`:

```bash
git clone https://github.com/BlackVortexAI/bv_nodepack.git
```

Restart ComfyUI and hard-refresh the browser after installation or update.

Registry review remains open in [issue #217](https://github.com/Comfy-Org/registry-backend/issues/217).
Registry publication, security-review status and the version offered by Manager are
separate states; Manager may offer an older version while review is pending.

### Updating to 1.4.2

- BV runtime files move from `user/default/bv_nodepack/` to ComfyUI's private
  System User directory `user/__bv_nodepack/`, which ComfyUI's own `/userdata`
  routes do not serve. The move happens once at startup: settings, API keys, LUT
  catalogs and the LoRA header cache are copied, verified and then removed from
  the public folder; the Remote LLM response cache is deleted there and rebuilt
  on demand. If a private file already exists and differs, the public content is
  kept next to it as a `*.recovered` file that is never loaded. The startup log
  lists every migrated, removed, recovered or failed file. Until this update the
  public files were potentially readable through `/userdata` by anyone who could
  reach the server; consider rotating API keys if that applies to your setup.
- On a ComfyUI without the System User API (older versions) BV neither reads nor
  writes the public folder: API-key providers and catalog updates are disabled
  with a clear message, everything else keeps working, and existing public files
  stay where they are until you update ComfyUI or remove them yourself.
- Management actions (saving or deleting API keys, installing LUTs, switching the
  catalog channel) are accepted only from clients on the same machine while
  ComfyUI listens on a loopback address, like ComfyUI-Manager's local mode. For
  a `--listen` server, either edit the files in `user/__bv_nodepack/` directly or
  create `admin_settings.json` there with
  `{"schema": "bv.admin.settings", "version": 1, "allow_remote_management": true}`,
  which deliberately opens these actions to every client that can reach the server.
- LUT catalogs and downloads come only from `raw.githubusercontent.com`, without
  following redirects. Foreign catalogs are not supported; place your own `.cube`
  files in the LUT folder instead.
- Previews, sidecars and model hashes follow the same folder containment as LoRA
  loading: a link inside a model folder that leads outside it is ignored.
- Restart ComfyUI and reload the browser after updating both backend and frontend.

### Updating to 1.4.1

- **BV Text Log Writer** accepts `.txt`, `.json` and `.log` names only. Rename
  logs that used other endings; a rejected name fails the node with a clear error.
- Regional LoRA stacks and Civitai metadata hashes accept `.safetensors` files
  only, inside the configured ComfyUI LoRA folders. Convert pickle-based LoRAs
  (`.pt`, `.ckpt`, `.bin`) before referencing them.
- **BV Remote LLM Provider** lost its endpoint widget. Fixed profiles keep their
  catalog address. For **OpenAI Compatible**, open **Configure API Key**, enter
  the destination there and save the key again. For **Local OpenAI Compatible
  (Custom)**, set `profile_defaults.local-openai-compatible.custom_endpoint` in
  `remote_llm_settings.json` when the catalog loopback address does not fit.
  Saved workflows load unchanged apart from the dropped endpoint value.
- Restart ComfyUI and reload the browser after updating both backend and frontend.

### Updating to 1.4.0

- Enable **Global** in the intended LoRA Registry. Only one Registry may be active
  across the workflow and its Subgraphs. New Registries start with Global off;
  conflicting saved selections require an explicit choice, never a load-order winner.
- The Regional Editor's **Globalen Stack anwenden** checkbox defaults to on.
  Turning it off skips automatic Global LoRAs for that editor while preserving
  manually selected normal stacks. Supply original MODEL/CLIP inputs when opting
  out; already applied weights cannot be undone by this checkbox.
- With **BV Regional Native Conditioning**, connect the source MODEL input and
  use its **MODEL output (slot 2)** for the sampler when applying Global LoRAs.
  Positive and negative outputs remain in slots 0 and 1. Model-specific attention
  nodes prepare their own MODEL/CLIP through the same automatic service.
- Existing basis groups retain their identities, order, strengths and enabled
  states inside the Global area. Existing manual global assignments remain
  separate; they are not copied into the fixed Global stack.
- Registry dialog changes save immediately to the node configuration, including
  Undo/Redo and catalog additions. Invalid drafts keep the last valid saved state.
  Save the workflow separately to persist changes to disk.
- Restart ComfyUI and reload the browser after updating both backend and frontend.
  The catalog identifies an older running backend instead of presenting missing
  routing fields as a compatibility result.

The following safeguards from 1.3.0 to 1.4.2 apply together:

- All BV runtime files (`remote_llm_settings.json`, `remote_llm_secrets.json`,
  `admin_settings.json`, LUT catalogs, caches) live in ComfyUI's private
  `user/__bv_nodepack/` directory, which ComfyUI's `/userdata` routes do not
  serve. BV itself reads nothing from the public `user/default/` tree any more;
  other custom nodes or routes are outside this guarantee.
- Management routes (API keys, LUT install, catalog channel) answer only local
  clients of a loopback-only ComfyUI unless `allow_remote_management` is set in
  the private `admin_settings.json`. This mirrors ComfyUI-Manager's local mode
  and is not an authentication: a reverse proxy on the same machine is local.
- Re-enter existing API keys for custom OpenAI-compatible providers through
  **Configure API Key** and confirm the displayed destination. Keys are bound to
  that full endpoint; redirects are blocked. Fixed-provider legacy keys retain
  their catalog destination.
- **BV Remote LLM Provider** has no endpoint widget any more. The destination is
  decided by the backend only: the catalog address for fixed profiles, the
  approved API-key binding for custom bearer profiles, and the optional
  `profile_defaults.<profile>.custom_endpoint` entry in the private
  `remote_llm_settings.json` for the key-less local custom profile. A workflow
  cannot select a destination.
- LUT catalogs and LUT files are downloaded only from
  `raw.githubusercontent.com`, checked before any connection, without redirects.
- Regional LoRA stacks accept `.safetensors` files only, and only inside
  configured ComfyUI LoRA folders, including `extra_model_paths.yaml` entries.
  Register additional folders there; absolute paths within configured folders
  remain supported. Pickle-based formats (`.pt`, `.ckpt`, `.bin`) are rejected
  with a clear error, so no LoRA reaches `torch.load`. The same folder rule
  applies to LoRA previews, metadata sidecars, the LoRA and model hashes that
  BV Regional Image Save embeds as Civitai metadata, and the LUT install
  directory: links are resolved first, and a file that resolves outside its
  configured folders is never read or written.
- Text logs reject linked log files and linked `bv_logs` directories. Use an
  ordinary log directory below the configured ComfyUI output root. Log names
  must end with `.txt`, `.json` or `.log`; other endings are rejected.

Keep ComfyUI and its settings routes restricted to trusted users, and review
imported workflows before running them. These safeguards do not constitute
Registry approval or a guarantee that arbitrary workflows are safe.

## Feature overview

### Regional prompting and LoRA routing

![Regional V3 Editor with layered character and interaction regions](docs/assets/releases/1.3.0/regional-editor.png)

Create named regions with layered geometry, prompts and stable identities, then
compile them through native conditioning or supported model-specific attention
backends. Regional V3 supports independently resolved workflow-local LoRA resources.

[Read the Regional V3 guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/regional-v3)

### LUT and LoRA libraries

![LoRA library catalog](docs/assets/releases/1.3.0/lora-catalog.png)

<details>
<summary>View the LUT catalog</summary>

![Stable LUT catalog](docs/assets/releases/1.3.0/lut-catalog.png)

</details>

Configure workflow-local LUT and LoRA resources through the shared BV interfaces.
The LUT catalog has separate Stable and Experimental channels, retains a local
working copy for offline startup, refreshes asynchronously and verifies downloads
against pinned checksums. Built-in LUTs and files below `ComfyUI/models/luts` use
the same loader and registry path.

[Read the LUT library guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/lut-library)

[Read the LoRA library guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/lora-library)

### Smart Pipes

![Native Smart Pipe connections in the Nord theme](docs/assets/releases/1.3.0/smart-pipe.png)

*Reviewed native wiring diagram; not an executed workflow.*

Carry typed workflow state through wired or wireless branches while preserving stable
slot identity.

[Read the Smart Pipes guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/smart-pipes)

### Workflow Control

Switch named workflow stages deterministically between active, muted and bypassed
states.

[Read the Workflow Control guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/workflow-control)

### Structured prompts

![Prompt Encode, Category Switch and Decode connections](docs/assets/releases/1.3.0/prompt-pipeline.png)

*Reviewed native wiring diagram; not an executed workflow.*

Encode, filter, route and decode semantic prompt blocks without fragile string
replacement.

[Read the Structured Prompt guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/prompt-processing)

### Subgraph interface tools

Project headings, dividers, spacers and controlled choices onto purpose-built
Subgraphs.

[Read the Subgraph Interface guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/subgraph-interface)

### Latent utilities

Create deterministic latent sizes and transformations for reusable workflows.

[Read the Latent Utilities guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/latent-utilities)

## Documentation and workflows

Detailed guides and references are maintained separately from the runtime repository
in the [BV Node Pack Wiki](https://blackvortexai.github.io/bv_nodepack_wiki/).
Reviewed example workflows will ship as ComfyUI templates in `example_workflows/`
once they are updated for the current node set.

## Support

Report reproducible bugs and feature requests through
[GitHub Issues](https://github.com/BlackVortexAI/bv_nodepack/issues).

## License and notices

BV Node Pack is licensed under [GPL-3.0](LICENSE). Third-party attribution and
provenance are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Changelog

The README keeps the four most recent version entries. The complete history is
maintained in the [Wiki changelog](https://blackvortexai.github.io/bv_nodepack_wiki/reference/changelog).

### 1.4.2 — unreleased

- Store Remote LLM settings and API keys, the response cache, LUT working
  catalogs and the LoRA header cache in ComfyUI's private System User directory
  `user/__bv_nodepack/`, with a verified one-time migration from the public
  `user/default/bv_nodepack/` folder. Without the System User API the pack fails
  closed instead of using the public folder.
- Accept management requests (API keys, LUT install, catalog channel) only from
  local clients of a loopback-only ComfyUI, with an explicit operator opt-in file
  for `--listen` servers. Read routes and the catalog refresh stay open.
- Download LUT catalogs and files only from `raw.githubusercontent.com`, checked
  before any connection, and never follow redirects.
- Apply one folder-containment rule to LoRA previews, sidecars, Civitai model
  hashes and the LUT install directory, resolving links before use.
- Bound raster masks to 32 megapixels, deduplicate autocomplete dataset
  selections, check LUT existence before downloading and limit parallel installs.
- Exclude `.github/` from the Registry package and remove outdated example
  workflows, fixtures and scripts from the runtime repository.

### 1.4.1 — 2026-09-08

- Restrict **BV Text Log Writer** names to `.txt`, `.json` and `.log`; other
  endings are rejected before anything is written.
- Approve every workflow-supplied LoRA path with one shared rule: inside the
  configured ComfyUI LoRA folders and `.safetensors` only. This covers LoRA
  loading and the Civitai metadata hashes; pickle-based files never reach
  `torch.load`, and files outside those folders are never read.
- Remove the endpoint widget from **BV Remote LLM Provider**. The destination
  is resolved by the backend from the provider catalog, the approved API-key
  binding or the local settings file; the Configure dialog now takes the
  destination for custom bearer profiles. Workflows saved with earlier versions
  load unchanged apart from the dropped endpoint value.
- Move internal design notes out of the Registry package.

### 1.4.0 — 2026-09-08

- Add reference-driven regional editing with **BV Reference Registry**, inline
  `@` references, regional tool controls and the Krea 2 Identity Edit path.
- Add an exclusive workflow-wide Global LoRA Registry and per-editor opt-out,
  preserving legacy groups and manual selections. Share occurrence-aware automatic
  MODEL/CLIP preparation across attention and Native Conditioning consumers.
- Append Native Conditioning's MODEL input/output while retaining positive and
  negative output ordinals; use the returned MODEL with the sampler.
- Support official Krea 2 LoRA key mappings and header-based routing evidence.
  Catalog routing distinguishes token candidates, multipass and unknown files;
  target-model compatibility remains unknown without a concrete model check.
- Autosave valid Registry edits, catalog additions and Undo/Redo. Keep peer Global
  changes synchronized and preserve invalid drafts without replacing valid state.
- Grow Registry nodes to a bounded content height before scrolling, respecting
  manual dimensions. Enlarge the catalog and its preview pane and automatically
  fill and paginate results. Persist header-check results across restarts, invalidate
  them when a file changes, and continue reading local metadata and previews fresh.
- Show validated Civitai links from local metadata and concise routing information.
- Fix Quick Edit spacing and textarea resize reachability through whole-content
  scrolling, and improve Smart Pipe/Subgraph lifecycle and sizing behavior.

### 1.3.0 — 2026-09-05

- Unify Regional negative-prompt policies (`auto`, `prompt`, `zero_out`) across
  Anima, FLUX.2, Krea 2 and Z-Image, with scoped Anima negatives and CFG token masking.
- Add local `embedding:` completion to shared prompt editors.
- Improve LoRA catalog refresh, preview sidecar discovery and persistent preview
  preferences; previews remain opt-in.
- Improve shared resizable previews, window text selection and GraphImage DOM capture.
- Add the built-in **Day for Night** LUT and image sender preview/pass-through
  behavior when no target is selected.
- Improve Civitai seed and LoRA hash metadata, and workflow-scoped DG routing
  through Subgraphs for registries and Smart Pipes.
- Refresh documentation with all 62 public-node screenshots and reviewed native
  wiring diagrams. Wiring captures do not establish successful workflow execution.
- Bind remote API keys to approved endpoints, block redirects, and harden text-log
  aliases and Regional LoRA path boundaries.
- Update the frontend build toolchain; the release audit reports no known npm
  advisories at the time of validation.



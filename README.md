# BV Node Pack for ComfyUI

![BV Node Pack banner](docs/assets/registry/bv-nodepack-banner.png)

BV Node Pack adds visual regional prompting, model-specific regional attention,
regional LoRA routing, sequential detailer workflows, Smart Pipes, structured prompt
tools, Subgraph controls and deterministic workflow utilities to ComfyUI.

> [!NOTE]
> BV Node Pack is developed with extensive generative-AI assistance. Product
> direction, architecture, review and real-workflow validation remain human-led.


## Installation

Install **BV Node Pack** through ComfyUI Manager, or clone it into
`ComfyUI/custom_nodes`:

```bash
git clone https://github.com/BlackVortexAI/bv_nodepack.git
```

Restart ComfyUI and hard-refresh the browser after installation or update.

Registry publication, security-review status and the version offered by Manager are
separate states. As of 2026-09-13 the Comfy Registry lists **1.4.3** and **1.4.2** as
active after a manual review (`reviewed SAFE`); 1.3.0 to 1.4.1 and 1.0.1 to 1.2.3 are
banned and 1.0.0 and older remain active. A Registry-based install offers the newest
active version; a newly published version is scanned first and may be flagged until it
is reviewed. The review history is in
[issue #217](https://github.com/Comfy-Org/registry-backend/issues/217); the pack's
security model is described in [SECURITY.md](SECURITY.md).

## Feature overview

### Standalone text and writing assistance

**BV Text** (`utils`) provides a native multiline text field and a STRING output,
without a Regional document. Use the controls below the field to select a provider
and model, translate or improve wording, and undo the last replacement. Provider
credentials use the shared private backend storage; writing settings stay in the
node's workflow properties. Assistance runs only when clicked. Queue execution
returns the stored text unchanged. Newer manual edits are preserved if a response
or Undo would overwrite them. Disconnect a linked text input before editing the
local field with writing assistance.

Writing settings include General, Krea 2 and Custom prompt profiles. Selecting a
curated profile replaces the editable system prompt; the provider and language
settings are independent. Edited templates are marked Customized. Saved workflows
keep their actual system prompt until you explicitly select or reset a profile.
The Krea 2 preset adapts the [official prompting guidance](https://github.com/krea-ai/krea-2/blob/main/docs/prompting.md)
for conservative rewriting: natural language, existing details and quoted image
lettering, without inventing scene content. Other model profiles remain pending.

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
provenance, including every library bundled into the frontend, are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). The security model of the pack's
routes, files, downloads and release process is described in [SECURITY.md](SECURITY.md).

## Changelog

The README keeps the four most recent version entries. The complete history is
maintained in the [Wiki changelog](https://blackvortexai.github.io/bv_nodepack_wiki/reference/changelog).

### 1.4.4 — 2026-09-13

- Add **BV Text**, a native multiline text node with a STRING output and optional
  writing assistance: translate or improve the field through the configured Remote
  LLM provider, undo the last replacement, and switch between General, Krea 2 and
  Custom prompt profiles. Assistance runs only when clicked; queue execution returns
  the stored text unchanged. The assistance route is management-gated, reads at most
  192 KiB, keeps one request in flight and can only reach the endpoint the stored API
  key was approved for.
- Reuse prepared MODEL/CLIP state for Krea 2 and Anima LLLite consumers across
  repeated runs when the LoRA stack, strengths and files are unchanged, instead of
  preparing again; any file, option or patch change invalidates the entry.
- Give every Remote LLM request one wall-clock budget that covers connecting, the
  status line and headers, chunked framing and the body. A provider that stalls or
  trickles data is cut off at the configured timeout and the request fails; the
  writing-assistance slot is freed for the next request. Writing assistance uses the
  profile's configured `timeout_seconds` instead of a fixed 60 seconds.
- Read every JSON request body of the pack's routes through one bounded reader with a
  route-specific limit (completion search 16 KiB, catalog channel 1 KiB, LUT install
  4 KiB, API key 16 KiB, writing assistance 192 KiB); oversized or malformed bodies
  are refused with 413 or 400 before any work starts. Infinite or absurd `limit`
  values in a completion search fall back to the default instead of failing.
- Ship `SECURITY.md` with the pack's security model: management routes, private
  storage, the deliberately public catalog refresh and startup fetch, file and
  download boundaries, the frontend bundle and the release process.
- Start the frontend bundle with a readable header naming the vendored libraries and
  versions, and list all eight bundled libraries with license, copyright and lockfile
  integrity in `THIRD_PARTY_NOTICES.md`. The libraries themselves are unchanged.
- Turn the Registry scan replica into a hard test: a pattern match outside the
  documented baseline fails the suite. Add a test of the packaged file set, and
  exclude design references, brand sources and a TypeScript declaration from the
  package. Both are compatibility and packaging checks, not security tests.
- Publish only from a commit whose Validate run succeeded, through a publish job with
  read-only permissions and a pinned comfy-cli, writing a manifest of the packaged
  files before the upload and comparing the archive the Registry stored afterwards.
  Validate additionally audits the UI dependencies and verifies that a rebuild emits
  nothing but the committed bundle.
- Record the Registry review status in the README and note that API keys saved before
  1.4.2 on a server other machines could reach should be rotated.

### 1.4.3 — 2026-09-08

- Make the **BV Seed** action buttons respond to normal clicks again, also when
  the seed is exposed on a Subgraph node. Since ComfyUI frontend 1.49 the canvas
  treats any pointer movement later than 32 ms after pressing as a drag, so
  ordinary clicks on canvas buttons were often lost; the seed buttons now take
  over the press and fire on release inside the button.
- Trim the frontend bundle: the JSON editor now loads only Prism's core and
  JSON grammar instead of the full Prism build, which drops the unused file
  loader from the shipped script.
- Refactor three backend call sites to plain imports and a single download-host
  constant: the environment lookup for the autocomplete dataset, the aiohttp
  session in the LUT downloader and the catalog source URLs, which are built
  from the host constant and stay byte-identical. No behaviour, no limit and
  no safeguard changes; these are the exact literals the Registry's automated
  scan reported for 1.4.1 and 1.4.2.
- Add a repository test that mirrors the Registry's automated scan over the
  packaged file set and compares it with a checked-in baseline, so new scanner
  matches are visible before publishing. It is a compatibility check, not a
  security test.

### 1.4.2 — 2026-09-08

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

## Upgrade notes

Version-specific steps and safeguards, newest first. The changelog above lists
what changed; this section lists what to do after updating.

Existing Regional workflows retain compatibility and supported node-local data is
migrated when a workflow is loaded. Loading does not overwrite the workflow file,
and deprecated Regional wiring is not silently rebuilt. Keep a backup, migrate any
remaining legacy connections to the V3 resource flow, then save, reload and run the
updated workflow once. Press **Ctrl+Alt+B** to toggle **Regional Legacy Debug Mode**
when hidden legacy ports or V3 provider links are needed for inspection. The
shortcut can be changed in ComfyUI Settings → Shortcuts.

### Updating to 1.4.4

- Restart ComfyUI and reload the browser after updating both backend and frontend so
  the rebuilt bundle and the new **BV Text** node are picked up.
- Remote LLM requests now fail at the configured timeout even when the provider keeps
  sending data slowly. If a legitimate provider needs longer, raise `timeout_seconds`
  in the private `remote_llm_settings.json`; the allowed range is unchanged.
- Read [SECURITY.md](SECURITY.md) once: it describes which routes are public, what
  the pack fetches at startup, and why. If an API key was saved before 1.4.2 on a
  server other machines could reach, rotate it.
- Writing-assistance settings, including the style guide, are stored in the node's
  workflow properties and therefore travel with saved workflows and image metadata.
  Do not put secrets into them.

### Updating to 1.4.3

- Reload the browser after updating so the seed button fix is picked up. If other
  canvas buttons still need several clicks, raise the ComfyUI setting
  `Comfy.Pointer.ClickBufferTime` from 32 to 150 ms (the pre-1.49 default).
- Restart ComfyUI and reload the browser after updating
  both backend and frontend so the rebuilt bundle is picked up.

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

The following safeguards from 1.3.0 to 1.4.4 apply together:

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
- Every Remote LLM request has one wall-clock budget; every JSON request body the
  pack accepts is read with a route-specific size limit before it is parsed.
- Text logs reject linked log files and linked `bv_logs` directories. Use an
  ordinary log directory below the configured ComfyUI output root. Log names
  must end with `.txt`, `.json` or `.log`; other endings are rejected.

Keep ComfyUI and its settings routes restricted to trusted users, and review
imported workflows before running them. These safeguards do not constitute
Registry approval or a guarantee that arbitrary workflows are safe. If an API key
was saved before 1.4.2 on a server that other machines could reach, rotate it: the
1.4.2 migration moved the key out of the public tree but cannot tell whether it was
read before. [SECURITY.md](SECURITY.md) describes the complete model, including the
deliberately public catalog refresh and the startup catalog fetch.

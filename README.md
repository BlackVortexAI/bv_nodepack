# BV Node Pack for ComfyUI

![BV Node Pack banner](docs/assets/registry/bv-nodepack-banner.png)

BV Node Pack adds visual regional prompting, model-specific regional attention,
regional LoRA routing, sequential detailer workflows, Smart Pipes, structured prompt
tools, Subgraph controls and deterministic workflow utilities to ComfyUI.

> [!NOTE]
> BV Node Pack is developed with extensive generative-AI assistance. Product
> direction, architecture, review and real-workflow validation remain human-led.

> [!IMPORTANT]
> **BV Node Pack 1.2.2 is prepared but not yet released.** This source
> centralizes native node presentation, adds Regional Canvas image sources and
> aligns LoRA Registry interaction and outputs.
> The accompanying
> [Wiki](https://blackvortexai.github.io/bv_nodepack_wiki/) is online but still
> under construction, so missing screenshots or incomplete pages do not indicate
> missing runtime features.
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

## Feature overview

### Regional prompting and LoRA routing

![Regional V3 Editor with layered character and interaction regions](examples/images/regional-v3-editor.png)

Create named regions with layered geometry, prompts and stable identities, then
compile them through native conditioning or supported model-specific attention
backends. Regional V3 supports independently resolved workflow-local LoRA resources.

[Read the Regional V3 guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/regional-v3)

### LUT and LoRA libraries

Configure workflow-local LUT and LoRA resources through the shared BV interfaces.
The LUT catalog has separate Stable and Experimental channels, retains a local
working copy for offline startup, refreshes asynchronously and verifies downloads
against pinned checksums. Built-in LUTs and files below `ComfyUI/models/luts` use
the same loader and registry path.

[Read the LUT library guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/lut-library)

[Read the LoRA library guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/lora-library)

### Smart Pipes

![Smart Pipe wireless merge](examples/images/smart-pipe-wireless-merge.png)

Carry typed workflow state through wired or wireless branches while preserving stable
slot identity.

[Read the Smart Pipes guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/smart-pipes)

### Workflow Control

![Control Center workflow states](examples/images/control-center-workflow-states.png)

Switch named workflow stages deterministically between active, muted and bypassed
states.

[Read the Workflow Control guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/workflow-control)

### Structured prompts

![Prompt AST categories](examples/images/prompt-ast-categories.png)

Encode, filter, route and decode semantic prompt blocks without fragile string
replacement.

[Read the Structured Prompt guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/prompt-processing)

### Subgraph interface tools

![Subgraph UI layout](examples/images/subgraph-ui-layout.png)

Project headings, dividers, spacers and controlled choices onto purpose-built
Subgraphs.

[Read the Subgraph Interface guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/subgraph-interface)

### Latent utilities

![Random-ratio latent workflow](examples/images/empty-latent-random-ratio.png)

Create deterministic latent sizes and transformations for reusable workflows.

[Read the Latent Utilities guide →](https://blackvortexai.github.io/bv_nodepack_wiki/node-guides/latent-utilities)

## Documentation and workflows

Detailed guides and references are maintained separately from the runtime repository
in the [BV Node Pack Wiki](https://blackvortexai.github.io/bv_nodepack_wiki/).

Only selected, verified examples are published in [`workflows`](workflows/README.md).

## Support

Report reproducible bugs and feature requests through
[GitHub Issues](https://github.com/BlackVortexAI/bv_nodepack/issues).

## License and notices

BV Node Pack is licensed under [GPL-3.0](LICENSE). Third-party attribution and
provenance are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Changelog

The README keeps the four most recent version entries. The complete history is
maintained in the [Wiki changelog](https://blackvortexai.github.io/bv_nodepack_wiki/reference/changelog).

### 1.2.2 — prepared 2026-08-31, not released

- Centralize native node, port and widget presentation across Classic and Nodes
  2.0, including titlebar routing for hidden infrastructure connections.
- Add Regional Canvas image selection from connected inputs and sender sources,
  including a compact thumbnail picker and automatic latest-image selection.
- Align LoRA Registry count and summary outputs and use stable 0.05 increments
  for strength scrubbing.
- Remove the temporary titlebar-port Canary after the shared production path
  passed the complete regression suite.

### 1.2.1 — 2026-08-30

- Add `BV Inspect Any` for readable in-node previews and string pass-through of
  arbitrary values.
- Make BV node widgets follow the active ComfyUI light or dark theme through the
  shared widget UI layer.
- Extend `BV Regional Image Save` with an optional Regional Context input and
  Civitai-compatible prompt, sampler, model, LoRA and hash metadata while
  preserving existing workflows when the input is disconnected.

### 1.2.0 — 2026-08-29

- Add the workflow-local `BV LoRA Registry`, catalog library and Full/Quick
  selection flows while retaining the published V2 registry chain.
- Complete the asynchronous LUT catalog with separate Stable and Experimental
  channels, offline working-copy fallback, manual refresh and checksum-verified
  downloads.
- Add nine deterministic built-in looks: Digital Green, Machine Blue, Dustfire,
  Steel Action, Sunbleached Coast, Expired Film, Classic Monochrome, Grayscale
  and HDR Color Boost.
- Expand the Experimental LUT channel to 46 profile- and license-documented
  candidates without changing the tested Stable channel.
- Normalize newly discovered LUT paths across Windows and browser-facing choices
  so Registry and Loader selections remain interoperable.

The built-in looks were manually tested and the Experimental catalog was confirmed
to load on 2026-08-29. This does not claim verification of every external LUT
download.

### 1.1.0 — 2026-08-28

- Add Regional LUT authoring and execution workflows, including registry, plan,
  loop, catalog, download and prototype tooling.
- Unify Classic, Nodes 2.0 and Node Library presentation for technical,
  provider and legacy ports, including connection-aware Legacy Debug visibility.
- Stabilize node sizing and widget projection across mode changes, Subgraphs and
  hot reloads without overwriting user-resized dimensions.
- Refresh Regional graph-dependent selectors and sender targets when relevant
  nodes, editors or regions are created, replaced or removed.
- Normalize Control Center, Seed, prompt-debug and text-preview presentation and
  add regression coverage for the shared UI rules.

---

## Continue with the BV Node Pack Wiki

Installation details, complete node references, migration guidance,
acknowledgements and task-oriented workflow guides are maintained in the
**[BV Node Pack Wiki →](https://blackvortexai.github.io/bv_nodepack_wiki/)**

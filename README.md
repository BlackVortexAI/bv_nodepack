# BV Node Pack for ComfyUI

![BV Node Pack banner](docs/assets/registry/bv-nodepack-banner.png)

BV Node Pack adds visual regional prompting, model-specific regional attention,
regional LoRA routing, sequential detailer workflows, Smart Pipes, structured prompt
tools, Subgraph controls and deterministic workflow utilities to ComfyUI.

> [!NOTE]
> BV Node Pack is developed with extensive generative-AI assistance. Product
> direction, architecture, review and real-workflow validation remain human-led.

> [!IMPORTANT]
> **BV Node Pack 1.1.0 includes Regional V3.** The accompanying
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

The README keeps the four most recent release entries. The complete history is
maintained in the [Wiki changelog](https://blackvortexai.github.io/bv_nodepack_wiki/reference/changelog).

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

### 1.0.1 — 2026-08-26

- Add deterministic PNG export for the active graph, selected nodes and groups,
  and open BV-managed windows.
- Add transparent, BV Documentation Grid and current ComfyUI background modes
  with configurable scale and padding.
- Add optional complete-workflow PNG metadata and the versioned
  `window.bvNodepack.export.v1` automation API.
- Preserve native Subgraph capture compatibility with guarded offscreen-canvas
  attachment and cleanup.

### 1.0.0 — 2026-08-25

- Release Regional V3 with workflow-scoped documents, stable region identity,
  resource providers and model-specific execution paths.
- Add migration support and temporary Legacy Debug visibility for compatible
  pre-1.0 Regional workflows.
- Publish the task-oriented documentation site and runtime-derived node
  reference.

### 0.18.2 — 2026-08-23

- Adopt the Fluent Cyclone mark and the `#1345B7` CI palette across published
  brand assets and shared UI accent states.
- Add canonical white, black and light-tinted logo variants with the required
  Microsoft Fluent Emoji attribution.
- Replace the legacy Regional Editor and minimized-window marks with the
  canonical Cyclone geometry.
- Keep the layout-profile icon compact when a session layout is modified.

---

## Continue with the BV Node Pack Wiki

Installation details, complete node references, migration guidance,
acknowledgements and task-oriented workflow guides are maintained in the
**[BV Node Pack Wiki →](https://blackvortexai.github.io/bv_nodepack_wiki/)**

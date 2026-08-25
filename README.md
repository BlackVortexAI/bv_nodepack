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

## Feature overview

### Regional prompting and LoRA routing

[![Two-character Anima regional result](examples/images/anima-android-dance-regional-showcase.png)](examples/images/anima-android-dance-regional-showcase.png)

Create named regions with layered geometry, prompts and stable identities, then
compile them through native conditioning or supported model-specific attention
backends. Regional V3 supports independently resolved workflow-local LoRA resources.

### Smart Pipes

![Smart Pipe wireless merge](examples/images/smart-pipe-wireless-merge.png)

Carry typed workflow state through wired or wireless branches while preserving stable
slot identity.

### Workflow Control

![Control Center workflow states](examples/images/control-center-workflow-states.png)

Switch named workflow stages deterministically between active, muted and bypassed
states.

### Structured prompts

![Prompt AST categories](examples/images/prompt-ast-categories.png)

Encode, filter, route and decode semantic prompt blocks without fragile string
replacement.

### Subgraph interface tools

![Subgraph UI layout](examples/images/subgraph-ui-layout.png)

Project headings, dividers, spacers and controlled choices onto purpose-built
Subgraphs.

### Latent utilities

![Random-ratio latent workflow](examples/images/empty-latent-random-ratio.png)

Create deterministic latent sizes and transformations for reusable workflows.

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

# BV Regional V3 Milestone F release gate

Status: in progress

Branch: `codex/regional-context-v3`
Scope source: `docs/specs/bv-regional-v3-plan.md`, Milestone F and Mandatory acceptance tests

This file is internal release evidence. Public user guidance belongs in the separate
BV NodePack Wiki after the behavior and release contract are proven.

## Fixed completion boundary

Milestone F is complete only when all four groups below are satisfied. Automated
tests, live acceptance, documentation, local release preparation, publication and
push remain separate states.

### 1. Legacy corpus and Golden expectations

| Requirement | Evidence | State |
| --- | --- | --- |
| v1 Regional document migration | `legacy_workflow_goldens.json`; `regional_milestone_f_goldens.test.mjs` | Automated |
| Single- and multi-stack LoRA sidecars | Two versioned Anima example workflows | Automated |
| Legacy native links remain graph truth | Exact persisted typed-link expectations | Automated |
| Migration materializes defaults and marks the graph dirty | Node harness Golden expectations | Automated |
| Legacy sidecar remains byte-for-byte unchanged | Node harness Golden expectations | Automated |
| Detailer/Detector/Loop identity and links | Versioned two-job workflow Golden; fresh-session v2 Detailer/Loop execution | Automated and live verified |
| Migration failure isolation and aggregate report | `regional_milestone_e.test.mjs`; corrupted-node corpus mutation in `regional_milestone_f_goldens.test.mjs` | Automated |
| Save and reload without a repeated migration | Real workflow acceptance from Milestone E; migrated-workflow reload Golden | Automated and live verified |
| Root graph, copied group and consumer-only copy | Root-graph M0 Golden plus focused M0/LoRA copy tests and fresh-session UI copy/paste | Automated and live verified |
| Subgraph and cross-graph rejection | M0 graph tests; ComfyUI-authored four-collector Subgraph Golden | Automated and live verified |
| Connected Legacy ports and manual migration guidance | Milestone E tests and live acceptance | Automated and live verified |
| Broken collector/resource/region references | Focused LoRA/Detailer/M0 fail-closed tests and Detailer Golden mutations | Automated |
| Legacy Attention/Conditioning execution | Backend regression tests plus released-workflow provenance index for Native, Anima, FLUX.2, Krea 2, SDXL and Z-Image; fresh-session Anima sidecar execution | Automated, indexed and live verified for Anima |

### 2. Mandatory functional contract

The complete mandatory acceptance list remains authoritative in
`bv-regional-v3-plan.md`. Before completion, every item must be mapped to a named
test or an explicit fresh-session live step. A passing aggregate test count alone
is not acceptance evidence.

Current baseline on 2026-08-25 after the Subgraph and Legacy consumer regressions:

- Python: 359 passed;
- frontend: 366 passed;
- TypeScript typecheck: passed;
- production frontend build: passed;
- focused Milestone F Goldens: 6 passed.

The mandatory list is covered by named focused suites for document and capability
migration, immutable context transforms, unknown/newer capability handling,
same-graph resource resolution, LoRA operations and live cache keys,
Detailer/Detector planning, Legacy UX, persisted drafts/layout recovery, and
frontend/backend workflow Goldens. The final fresh-session matrix below remains
the release-closing evidence and is not replaced by this automated coverage.

### 3. BV Wiki documentation

Required public documentation:

- V3 overview and compatibility boundary;
- step-by-step workflow creation;
- migration guide for v1/v2 and incompatible Legacy wiring;
- LoRA Multi-Collector and Resource Picker workflow;
- Detailer/Detector workflow;
- Experimental Preview format and explicit stability limits;
- examples, prerequisites, typical errors, verification and removal/rollback;
- concise repository README links replacing duplicated long-form guidance only
  after the Wiki is ready and verified.

Renderer-neutral drafts currently live under `X:\bv_node_wiki\content`. They are
not yet linked from navigation or treated as published because the Wiki production
foundation is parallel work. All other existing uncommitted Wiki work remains
foreign.

### 4. Fresh-session release verification

Use the exact Stability Matrix installation with a dedicated configuration and
fixed port, preferably `8200`:

- restart from a fresh server and browser session;
- cache-busting hard reload;
- load representative v1, v2 and v3 workflows;
- confirm migration toast, dirty state, save, reload and no repeated toast;
- verify two collectors/resources and scoped Replace/Merge/Subtract/Clear;
- verify Detailer/Detector/Loop execution;
- verify root graph, copied group, consumer-only copy and subgraph behavior;
- verify Legacy port reveal, existing links, warning and manual guidance;
- verify layout recovery and invalid-draft fallback navigation;
- perform genuinely uncached executions and record the observed outcomes.

Recorded fresh-session evidence on 2026-08-25:

- exact Stability Matrix installation, dedicated temporary user configuration,
  fixed port `8200`, and cache-busted `localhost` browser session;
- v1 native migration reported `1 migrated, 0 failed`, persisted version 2 with
  generation defaults, and did not report migration again after save and hard reload;
- v1 Anima Legacy sidecar wiring remained visible, produced the non-blocking Legacy
  warning, and completed an uncached execution with image output in 49.49 seconds;
- v2 Detailer/Detector/Loop loaded without a false LoRA migration failure and
  completed an uncached execution with image output;
- V3 Subgraph workflow loaded without migration or dirty-state mutation.
- a production-like SDXL graph resolved two collectors with independent stable
  collector/resource IDs; scoped Merge, Replace, Subtract and Clear each forced
  a downstream execution and produced distinct image outputs (`00281` through
  `00284`) from isolated workflow copies.
- copying a complete four-provider M0 graph produced a second consumer with four
  remapped native links; copying that consumer alone produced no links and left
  its visible picker values unresolved instead of reconnecting by name;
- an editor tab was floated, the adjusted state was detected, and Factory reset
  restored the dock; the saved Milestone E old-layout fixture still exposed the
  newly registered Document tab and could be reset to Factory;
- invalid canvas-width draft fallback and its `Open field` navigation to the
  Document tab were live accepted during the Milestone E test session.

All fresh-session checks listed above have live evidence. Milestone completion
still requires a final evidence audit and documentation/release-state review.

Milestone F must not be closed solely from this checklist or automated tests.

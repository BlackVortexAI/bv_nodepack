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
| Detailer/Detector/Loop identity and links | Versioned two-job workflow Golden | Automated |
| Migration failure isolation and aggregate report | `regional_milestone_e.test.mjs` | Automated; add corpus mutation |
| Save and reload without a repeated migration | Real workflow acceptance from Milestone E | Live verified; add deterministic Golden |
| Root graph, copied group and consumer-only copy | Existing M0/LoRA graph tests | Automated; add corpus fixture |
| Subgraph and cross-graph rejection | Existing M0 graph tests | Automated; add corpus fixture |
| Connected Legacy ports and manual migration guidance | Milestone E tests and live acceptance | Automated and live verified |
| Broken collector/resource/region references | Existing focused tests | Automated; add corpus mutations |
| Legacy Attention/Conditioning execution | Existing backend regression tests | Automated; add corpus index |

### 2. Mandatory functional contract

The complete mandatory acceptance list remains authoritative in
`bv-regional-v3-plan.md`. Before completion, every item must be mapped to a named
test or an explicit fresh-session live step. A passing aggregate test count alone
is not acceptance evidence.

Current baseline on 2026-08-25:

- Python: 357 passed;
- frontend: 355 passed before the new Milestone F Goldens;
- TypeScript typecheck: passed;
- focused Milestone F Goldens: 3 passed.

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

The Wiki workspace is `X:\bv_node_wiki`. Its existing uncommitted work is treated
as foreign until its ownership and production foundation are explicitly reconciled.

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

Milestone F must not be closed solely from this checklist or automated tests.

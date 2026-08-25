# BV Regional V3 Milestone F release gate

Status: complete

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

- Python: 360 passed;
- frontend: 366 passed;
- TypeScript typecheck: passed;
- production frontend build: passed;
- focused Milestone F Goldens: 8 passed.

Mandatory acceptance mapping:

| Contract item | Named evidence |
| --- | --- |
| v1/v2 migration | `test_v1_and_v2_normalize_deterministically_to_v3_core_v1`; `released v1 workflow goldens migrate node-locally without rewriting Legacy sidecars` |
| Atomic migration, isolation, reporting and reload rollback | `node-local migration validates every candidate before atomically replacing widgets`; `migration summaries aggregate success, failure and assumed defaults`; `one corrupted node stays byte-identical while another Golden migrates`; `saved migrated Goldens reload canonically without a repeated migration` |
| Incremental deterministic construction | `test_v3_round_trips_canonically`; `test_scope_steps_match_two_sequential_transformer_nodes` |
| Immutable branches | `test_facade_and_transforms_preserve_branch_immutability`; `test_transform_does_not_mutate_a_branch` |
| No context merge | `test_context_facade_exposes_no_context_merge_operation` |
| Unknown capabilities | `test_unknown_capability_is_losslessly_passed_through` |
| Independent core/capability migrations | `test_v1_and_v2_normalize_deterministically_to_v3_core_v1`; `test_registered_capability_migrates_sequentially_and_validates_each_result` |
| Newer versions fail closed | `test_newer_registered_capability_is_preserved_but_required_use_fails_closed`; `unknown future config versions fail closed without mutating the persisted value` |
| Third-party extension isolation | `test_fictitious_resource_extension_is_isolated_and_validated`; `test_registry_instances_do_not_share_mutable_state` |
| Copy/root/Subgraph/workflow identity | `a consumer-only copy has no inferred provider and therefore stays unresolved`; `copying the complete provider-consumer graph preserves two independent real links`; `ComfyUI-authored Subgraph Goldens preserve native links and stable bindings`; fresh-session copy evidence below |
| Hidden-link dependency and collisions | `collector connections are ordinary same-graph links`; `cross-graph collectors are rejected without fallback`; `test_registration_collision_reports_both_sources_and_keeps_first` |
| Live-stack cache invalidation | `test_runtime_value_changes_provider_and_cache_key`; fresh-session external-stack-strength run below |
| Consumer-specific resolution | `test_consumer_reads_materialized_scopes_without_a_runtime_provider`; `a consumer added later discovers only its linked upstream LoRA transformer` |
| LoRA mixing and collector switching | `test_native_and_external_entries_preserve_semantic_order`; `test_merge_and_subtract_allow_independent_collectors_by_entry_id`; `changing region two collector leaves region one collector and resource unchanged` |
| Detector/Detailer resolution | `test_two_jobs_resolve_independent_collectors_and_resources`; `test_missing_collector_and_resource_fail_closed`; Detailer Golden and live execution |
| Legacy visibility and warnings | `Legacy ports hide by default, reveal for compatible drag, and occupied links always win`; `Nodes 2.0 link drags reveal compatible Legacy port labels before drop`; live warning/navigation evidence |
| Legacy consumer regressions | `released Legacy workflow goldens retain their native sidecar wiring`; `Legacy capture index fixes representative released consumer provenance`; `test_published_consumers_accept_and_prefer_legacy_lora_sidecars` |
| Invalid draft fallback | `Regional drafts preserve invalid raw values while canonical execution uses explicit fallbacks`; live fallback execution |
| Toast navigation | Fresh-session `Open field` navigation to owning Regional node, editor, Document section and canvas-width field |
| Old layout recovery | `old layouts remain unchanged and report newly registered namespaced panels`; fresh-session old-layout load and Factory reset |
| Shared frontend/backend fixtures | `test_regional_schema_contract.py`; `regional_milestone_f_goldens.test.mjs` |
| Resource Picker state and link update | `the production picker renders one resource choice from persisted ids`; `an unresolved production selection remains explicit`; `adding an advanced LoRA stack commits through the graph-linking helper`; `collector reconciliation refreshes unresolved state in both LoRA editors` |
| Released Legacy corpus coverage | `legacy_workflow_goldens.json` and its provenance index, exercised by `regional_milestone_f_goldens.test.mjs` |
| Golden load/runtime/save expectations | All eight named tests in `regional_milestone_f_goldens.test.mjs` plus the backend workflow Golden tests |
| Fresh-session visual/functional gate | Recorded evidence below on isolated port `8200` |

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

The renderer-neutral Wiki foundation and the four Regional V3 drafts are committed
locally in the separate `X:\bv_node_wiki` repository (`47b4421` and `db8ac8e`).
They remain an unpublished draft: navigation integration, remote push and public
publication are separate release states and are not claimed by this gate.

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
- changing one external `easy loraStack` model strength from `1.0` to `0.5` in a
  further isolated copy invalidated the live provider/downstream cache and produced
  new image output `00285`;
- copying a complete four-provider M0 graph produced a second consumer with four
  remapped native links; copying that consumer alone produced no links and left
  its visible picker values unresolved instead of reconnecting by name;
- an editor tab was floated, the adjusted state was detected, and Factory reset
  restored the dock; the saved Milestone E old-layout fixture still exposed the
  newly registered Document tab and could be reset to Factory;
- invalid canvas-width draft fallback and its `Open field` navigation to the
  Document tab were live accepted during the Milestone E test session.

All fresh-session checks listed above have live evidence. The final evidence audit
and documentation review are complete; the separate Wiki draft is locally
versioned without claiming publication.

Milestone F must not be closed solely from this checklist or automated tests.

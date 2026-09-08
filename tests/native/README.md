# Native SmartPipe lifecycle regression

`smart_pipe_lifecycle.html` runs against the installed ComfyUI frontend bundle in an isolated page. It creates detached native graphs and registers a native `LGraphNode` subclass through the real SmartPipe extension's `beforeRegisterNodeDef` and `nodeCreated` hooks. It does not load, queue, or mutate a user's ComfyUI workflow.

Serve `/native/` from the installed frontend `static` directory and `/repo/` from this checkout, bound to localhost. Open `/repo/tests/native/smart_pipe_lifecycle.html` and click **Run detached lifecycle tests**. Results appear as JSON in the page and `globalThis.__nativeSmartPipeResult`.

The bundle filenames and Vue/Pinia aliases target frontend assets `settingStore-CwkLtSKP.js` and `vendor-vue-core-BZZQdWHo.js`. Recheck aliases when upgrading the installed frontend. This fixture is a manually executed native integration test; ordinary `npm test` does not execute it.

Checks cover registered lifecycle callbacks, explicit slot identity serialization, compact visual index 3 mapping to backend ordinal 5, native slot prototypes, complete graph save/load cycles, native subgraph conversion and two instances sharing a definition, external link endpoints, and duplicate/hidden output ghosts.

For original-code comparison, `?original=1` loads four unmodified modules from `/repo/.tmp/smartpipe-original/`: `bv_smart_pipe.js`, `bv_smart_pipe_slots.js`, `bv_smart_pipe_merge_model.js`, and `bv_smart_pipe_routing.js`. Prepare these from the chosen original commit with `git show`; do not replace production modules. The reference original for this regression is `018745f5`.

A passing fixture proves native graph/slot integration for this scenario. It does not prove rendered Classic/Nodes2 hit geometry, the application's undo-history integration, all frontend versions, or a GPU workflow execution.

## Historical explicit-provider Global LoRA acceptance

Run `node tests/native/build_global_lora.cjs` from the repository root with local UI dependencies available. The fixtures use the same `/repo/` and `/native/` static mapping described above. Open `/repo/tests/native/global_lora.html` and click **Run Global LoRA acceptance**. The page exposes JSON in `#result` and `globalThis.__globalLoraResult`.

Before the test, export the actual Native Conditioning contract to `.tmp/native-conditioning-contract.json` using the production class loader from `tests/test_regional_nodes.py`: `load_node_module().BVRegionalNativeConditioningNode`, collecting `INPUT_TYPES()` as `inputs`, `RETURN_TYPES` as `return_types`, and `RETURN_NAMES` as `return_names`. Do not substitute hardcoded output definitions.

The fixture renders production BVUI registry/pickers/catalog with synthetic metadata, opens the real picker popovers, clicks Global and entry switches, checks safe Civitai links without following them, and adds a multipass item to its selected regional target. Native detached graphs preserve registry inventories and occurrence IDs through three root, shared-definition and nested reloads and remove/readd. A native node factory built from the exported backend schema tests the old Conditioning snapshot plus appended MODEL input/output through root and nested reloads.

This proves native LiteGraph serialization and production component behavior. It does not load the complete Comfy app node factory, DG execution bridge, application Undo history, `graphToPrompt`, queue, or GPU. Registry node wrappers and sampler sockets are synthetic fixtures; the parser, resource inventory, BVUI components, and LiteGraph runtime are real.

`global_lora_editor.html` is a manual visual fixture using the shared BVUI theme and production editor. It stores **synthetic** Save results in the test origin's `bv-global-fixture-saved` localStorage key, allowing real Save-button/browser-reload verification. It is not a running ComfyUI workflow. No private media or remote downloads are used.

The historical explicit-provider Global fixture also renders `LoraRegistrySourcesPanel` and tests Global-only Registry selection with no manual stack resources. Production parser/commit/DG reconciliation is invoked on native nodes across three reloads. `global_lora_app.ts` substitutes only the application singleton for detached execution; discovery, config and provider reconciliation stay production code. Visible JSON is a compact total/pass/failure report; `globalThis.__globalLoraResult` retains the full list.

`lora_catalog_client.html` exercises the real singleton fetch/cache/library-loader path with synthetic current API data. `?legacy=1` omits compatibility and civitai_url to model an older running backend. Click **Check client flow and grid**; expected9/9 for both variants. Layout checks and visual review use the regular shared theme and grid cards, without private media. The build helper includes this fixture.


## Current exclusive workflow Global acceptance

The explicit SourcesPanel workflow above documents an earlier intermediate implementation. The current interaction replaces that panel in the Regional Editor with one default-on checkbox immediately above Global Prompt and selects the workflow Global Registry through an exclusive Registry switch.

Run `node tests/native/build_global_lora.cjs`, open `/repo/tests/native/exclusive_global_lora.html` with the static mappings above, and click **Run exclusive Global acceptance**. The final frozen implementation passed **46/46** checks on 2026-09-07. The fixture uses synthetic metadata only.

Coverage includes exclusive switching across root and native subgraphs, shared-definition deduplication, three save/reload cycles, active-copy conflicts without an arbitrary winner, explicit off/on conflict resolution, removal, real visible peer-switch refresh, conflict-callout refresh, two independent production OptionsPanels, default-on and opt-out behavior, manual-provider preservation, and migration of obsolete Regional Prompt `registry_ids` without dangling dependencies. Checkbox placement immediately above Global Prompt is checked geometrically and visually.

The registry views use the production React host and lifecycle with a synthetic native DOM-widget bridge. Config, inventory, discovery, and DG reconciliation are production modules; the installed LiteGraph runtime is real. This does not prove full Comfy application node construction, Undo history, `graphToPrompt`, queue execution, or GPU behavior. The historical explicit-provider fixture is not the current Regional Prompt acceptance gate.


## Registry autogrow and automatic persistence acceptance

Build with `node tests/native/build_global_lora.cjs` and open `/repo/tests/native/registry_ux.html`. Click **Run Registry UX checks**. Final result on 2026-09-08: **23/23 passed**. Page JSON includes actual size measurements.

The installed native LiteGraph node grows from 229 to 402 body pixels (340 widget minimum; title lies outside node.size). Overflow scrolls; manual 520x300 and 560x700 sizes survive refresh, and 560x700 survives native serialization/reload. At the larger manual size, actual content client height expands to 630 pixels, above the automatic cap.

Production Registry dialog checks cover add stack, rename, strength, Undo/Redo, catalog addition, external Global flag synchronization, preservation of a peer change before rerender, and typed strength blur immediately followed by real Close/reopen. Auto-save writes synthetic localStorage only. Catalog windows render in real 2000x1200 and 640x480 iframe viewports: respectively 1600x1050 and clamped 608x448 with 16-pixel margins.

Boundary: production React host/UI/config/presentation modules and installed native graph runtime; native DOM-widget bridge and user-resize signal are synthetic adapters. The bridge uses native widget computeSize and real DOM/ResizeObserver measurement. This does not prove full Comfy canvas pointer hit-testing, app Undo, queue or GPU execution. A final real browser screenshot of the dialog was visually inspected; no private media is used.

## Automatic catalog pagination regression

Build `node tests/native/build_global_lora.cjs`, open `/repo/tests/native/catalog_incremental.html`, then click **Run automatic pagination regression**. Final full-library result: **9/9** on 2026-09-08. The236synthetic-item catalog initially fills its actual grid viewport without pressing Load, scrolls to all236, filters to100 and reaches all matches, survives smaller-window scrolling and larger-window refill, and reaches236 again after clearing. Test actions scroll the production grid; the Load button is never clicked. Real animation frames and DOM-count progress are awaited because fixed60ms pacing can race rendering in a background browser.

**Run initial fill reproduction** runs the original symptom twice. Add `?minimal=1` to isolate only the shared IncrementalResourceList at1200x600 without the catalog/API. Before the fix both full and minimal views were reproducibly stuck8/236 with clientHeight equal to scrollHeight. **Probe scroll trigger** is a test-only causal probe: one scroll event changed8to16 and stayed16, identifying the absent initial/layout trigger. The fix is tested against real React, DOM measurements, ResizeObserver and scrolling; all metadata is synthetic and no private media is loaded.

## Quick Edit spacing and native textarea resizing

Open `/repo/tests/native/quick_prompt_layout.html` after the shared build helper. The synthetic fixture renders the actual QuickPromptEditor. **Measure Quick Edit layout** reports real bounds; **Check scroll reachability** verifies compact references, nonoverlapping fields, reachable positive/negative resize grips and fixed header/footer. **Small Quick Edit window** changes managed geometry; reveal buttons scroll the real outer body. Native textarea grips must also be dragged using the browser UI; style-height injection alone is not acceptance.

Final2026-09-08:5/5checks with both fields enlarged by real native drags,5/5at380x420, and5/5after selecting Region1. Both fields were then actually resized back through their reachable grips. The original reference row was270px and positive/negative overlapped39px with no scroll; after the scoped QuickEdit parent-grid fix references occupy18px and the outer body scrolls. Probe natural Quick Edit rows is an explicit test-only single-variable diagnosis; do not click it for final production verification.

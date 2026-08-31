# Titlebar provider-port runtime canary — THROW AWAY

**DO NOT MERGE OR RELEASE.** This branch-only prototype asks one narrow question: can current Classic ComfyUI use a provider slot's `pos` as a titlebar anchor while leaving the canonical slot arrays and link indices untouched and natively compacting the remaining body rows?

## Activation boundary

- While this branch-only module is present, Python always registers exactly two
  node types; there is no environment-variable activation gate:
  - `BV Titlebar Port Canary Sender (THROW AWAY)`
  - `BV Titlebar Port Canary Receiver (THROW AWAY)`
- The JS extension targets only those two exact names and remains inert for every
  production node.
- Use only a disposable, task-owned ComfyUI runtime and workflow. Do not save a user workflow with a projected slot until the serializer probe has been reviewed.

## Surface boundary

- The central product presentation supports Classic titlebar anchors and
  suspends/restores them when the node transitions to or from Nodes 2.0.
- The throw-away Canary's own `A`/`B`/`C` adapter is deliberately Classic-only.
  In Nodes 2.0 it must return fail-closed `UNSUPPORTED_SURFACE` before mutating
  `pos`. This is an adapter capability check, not a claim that the central
  product presentation lacks Nodes 2.0 lifecycle support.

## Fixed graph contract

- Sender: six outputs; `resource_provider` is canonical output index **2**.
- Receiver: six real socket inputs; `resource_provider` is canonical input index **3**.
- Connect all matching normal socket types if desired, then connect provider **2 → 3** in `Native` mode.
- Both nodes contain `presentation_mode` (`Native`, `A`, `B`, `C`), a note widget, a nonserialized baseline button and a nonserialized status widget. This instrumentation is installed before baseline capture and stays identity/order-stable; mode switches update only the status value, not widget geometry or objects.

## Test sequence

1. Start in `Native`, connect sender output 2 to receiver input 3, then press **Capture Native baseline** on both nodes.
2. Toggle both nodes through A → B → C → Native at least three times.
3. For each state record the status widget after its bounded two-frame refresh: canonical count/index, exact link tuple, structure identity, provider `pos`, serialized provider `pos`, unified `getSlotPosition` world-Y, separately labelled legacy `getConnectionPos` Y, widget Y, `node.size` and `computeSize()`.
4. Confirm draw endpoint, hitbox and drag at each title anchor. Connect/disconnect in every projected mode only after the baseline toggle sequence.
5. Save/reload only the disposable Canary workflow and compare node/workflow serialization. A persisted `pos` is a risk finding, not a success.
6. Repeat the throw-away adapter in Nodes 2.0 to confirm its explicit
   `LiteGraph.vueNodesMode` guard returns fail-closed `UNSUPPORTED_SURFACE`
   before any `pos` mutation. Separately verify that the central product
   presentation suspends Classic anchors in Nodes 2.0 and restores them after
   returning to Classic when debug remains enabled.

The adapter deliberately does not change node size, `computeSize`, widget coordinates, labels, visibility, normal slot positions, arrays or links. Port compaction, widget movement and height changes must be reported as three separate observations.

## Pre-runtime checks

Run from the repository root:

```powershell
python -m unittest discover -s tests -p 'test_titlebar_provider_port_runtime_canary.py' -v
& ui\node_modules\.bin\tsx.cmd --test tests\titlebar_provider_port_canary.test.mjs tests\titlebar_provider_port_runtime_canary.test.mjs
```

The isolated runtime export, activation, ComfyUI restart and browser workflow mutation are separate authorization gates and are intentionally not performed by these commands.

## Removal checklist before any production implementation

- Remove `py/nodes/bv_titlebar_port_canary.py`.
- Remove `js/bv_titlebar_port_canary.js` and `js/bv_titlebar_port_canary_core.js`.
- Remove both focused runtime-canary test files and this note.
- Remove or archive the earlier static Canary files on the throwaway branch.
- Rebuild the validated decision centrally in the shared presentation policy/adapters; do not promote this lifecycle code.
- Preserve the proven central Classic/Nodes 2.0 suspend-and-restore lifecycle
  when removing the throw-away adapter.

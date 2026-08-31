# Titlebar provider-port runtime canary — THROW AWAY

**DO NOT MERGE OR RELEASE.** This branch-only prototype asks one narrow question: can current Classic ComfyUI use a provider slot's `pos` as a titlebar anchor while leaving the canonical slot arrays and link indices untouched and natively compacting the remaining body rows?

## Activation boundary

- Python registers exactly two node types only when `BV_TITLEBAR_PORT_CANARY=1`:
  - `BV Titlebar Port Canary Sender (THROW AWAY)`
  - `BV Titlebar Port Canary Receiver (THROW AWAY)`
- With the variable unset or any other value, no Canary nodes exist. ComfyUI still loads the JS extension shell from `WEB_DIRECTORY`; it is inert because it targets only those two exact names.
- Use only a disposable, task-owned ComfyUI runtime and workflow. Do not save a user workflow with a projected slot until the serializer probe has been reviewed.

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
6. Repeat in Nodes 2.0 only to confirm the explicit `LiteGraph.vueNodesMode` guard returns fail-closed `UNSUPPORTED_SURFACE` before any `pos` mutation; no Nodes2 support is claimed by this Canary.

The adapter deliberately does not change node size, `computeSize`, widget coordinates, labels, visibility, normal slot positions, arrays or links. Port compaction, widget movement and height changes must be reported as three separate observations.

## Pre-runtime checks

Run from the repository root:

```powershell
python -m unittest tests.test_titlebar_provider_port_runtime_canary -v
& ui\node_modules\.bin\tsx.cmd --test tests\titlebar_provider_port_canary.test.mjs tests\titlebar_provider_port_runtime_canary.test.mjs
```

The isolated runtime export, activation, ComfyUI restart and browser workflow mutation are separate authorization gates and are intentionally not performed by these commands.

## Removal checklist before any production implementation

- Remove `py/nodes/bv_titlebar_port_canary.py`.
- Remove `js/bv_titlebar_port_canary.js` and `js/bv_titlebar_port_canary_core.js`.
- Remove both focused runtime-canary test files and this note.
- Remove or archive the earlier static Canary files on the throwaway branch.
- Rebuild the validated decision centrally in the shared presentation policy/adapters; do not promote this lifecycle code.
- Resolve serialization and Nodes 2.0 registration before touching real BV nodes.

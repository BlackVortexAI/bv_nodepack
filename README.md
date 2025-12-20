# 🌀 BV Pipe Nodes (ComfyUI)

This node pack introduces a **config-driven “pipe”** concept for ComfyUI.
A *pipe* is a single connection that can carry **up to 100 values** (any type), identified by **user-defined names**.

The goal is to keep graphs clean: instead of wiring many individual lines, you can pass a single `pipe` and still access named slots.

---

## Included Nodes

### 🌀 BV Pipe Config
**Node key:** `BV Pipe Config`
Creates a new pipe configuration (slot names).

**Inputs**
- `names` *(STRING, multiline)*
  One slot name per line.
  - Empty lines are ignored
  - Commas are treated like new lines
  - Max: 100 names

**Outputs**
- `pipe` *(BV_PIPE)*
  A pipe object containing:
  - `_cfg.names_raw` (original text)
  - `_cfg.names` (parsed list of names)
  - `items` (values list)
  - `map` (name → value)

**Notes**
- The number of *active slots* equals the number of non-empty lines in `names`.

---

### 🌀 BV Pipe
**Node key:** `BV Pipe`
**Category:** `🌀 BV Node Pack/pipe`

A dynamic “carrier” node that provides:
- `pipe` input/output (forwarded)
- up to **100 optional inputs** (`v_001` … `v_100`)
- up to **100 outputs** (`out_001` … `out_100`)

The **UI is driven by the connected pipe config**:
- Only as many slots as configured are shown.
- Slot labels are taken from `BV Pipe Config` lines.

**Inputs**
- `pipe` *(BV_PIPE)*
  The incoming pipe.
- `v_001` … `v_100` *(ANY, optional)*
  Optional overrides for the corresponding slot.

**Outputs**
- `pipe` *(BV_PIPE)*
  Updated pipe containing final values.
- `out_001` … `out_100` *(ANY)*
  Mirrors the final resolved values.

---

## Behavior Details

### Slot naming / labels
- Internal socket names stay stable:
  - Inputs: `v_001` … `v_100`
  - Outputs: `out_001` … `out_100`
- Only the **visible label** changes to your configured names.
- This keeps ComfyUI validation stable and preserves “optional input” behavior.

### Passthrough logic
For each configured slot `i`:
- If the input `v_###` is connected/provided → it **overrides** the value.
- Otherwise the node **passes through** the value from the upstream pipe (`pipe.items[i]`).

This makes chaining pipes possible:

`BV Pipe Config → BV Pipe → BV Pipe → ...`

The values continue downstream unless explicitly overridden.

### Collapsed by default (optional UI behavior)
If you implemented the “collapsed new node” behavior in JS:
- A newly created `BV Pipe` node starts with only `pipe in/out` visible.
- Once a pipe config is connected, it expands to the configured slots.

---

## Recommended Usage

### 1) Create a configuration
1. Add **🌀 BV Pipe Config**
2. Enter slot names, one per line, e.g.

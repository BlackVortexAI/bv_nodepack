# BV Node Pack (ComfyUI)

A small collection of quality-of-life nodes for ComfyUI.

> ⚠️ Note: This pack includes UI logic (JavaScript) for dynamic node updates (also works in Subgraphs/Subflows).

---

## Installation

Clone into your ComfyUI `custom_nodes` folder:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/BlackVortexAI/bv_nodepack.git
```

Restart ComfyUI and (if needed) hard refresh the browser: **Ctrl+F5**

### Uninstall
- Delete the folder in `custom_nodes`
- Restart ComfyUI
- Hard refresh the browser (Ctrl+F5)

---

## Update

```bash
cd ComfyUI/custom_nodes/bv_node_pack
git pull
```

Restart ComfyUI (recommended).

---

## Nodes / Features

### BV Pipe Config
Defines the slot layout (names) for a BV Pipe.

![BV Pipe Config](docs/screenshots/bv_pipe_config.png)

**What it does**
- Define slot names (1 per line, max 100)
- Outputs a single `BV_PIPE` object ("the pipe") used downstream

**How to use**
1. Add **BV Pipe Config**
2. Enter slot names (one per line)
3. Connect its `pipe` output to **BV Pipe**

---

### BV Pipe
A config-driven carrier node that forwards one pipe connection while exposing named slots.

![BV Pipe Connected](docs/screenshots/bv_pipe_connected.png)

**What it does**
- Shows only the slots defined by the connected **BV Pipe Config**
- Lets you override individual slots, while everything else passes through

**Override example**

![BV Pipe Override](docs/screenshots/bv_pipe_override.png)

**Subgraph example**

![BV Pipe Subgraph](docs/screenshots/bv_pipe_subgraph.png)

---

## Quick Start (Pipe)

1. Add **BV Pipe Config** and enter names, e.g.:

```txt
model
clip
vae
seed
prompt
```

2. Connect: `BV Pipe Config (pipe)` → `BV Pipe (pipe)`

3. Optional: connect something to a slot input to override only that slot.

---

## Notes
- Pipes update dynamically (including Subgraphs/Subflows).
- Slot socket IDs stay stable internally (`v_001…v_100`, `out_001…out_100`) while labels come from your config.

# BV Node Pack

BV Node Pack provides composable workflow data carriers and user-interface building blocks for ComfyUI workflows and subgraphs.

## Pipe language

**Smart Pipe**:
A typed, incrementally extensible data carrier whose schema grows along a connected workflow path.
_Avoid_: Bus, global pipe

**Pipe Schema**:
The ordered set of stable slots currently carried by a Smart Pipe.
_Avoid_: Config text, slot list

**Pipe Slot**:
A stable, named and optionally typed position in a Pipe Schema.
_Avoid_: Port index, array position

**Local Slot**:
A Pipe Slot introduced by the current Smart Pipe and added to its downstream schema.
_Avoid_: New input

**Inherited Slot**:
A Pipe Slot received from an upstream Smart Pipe whose identity and name remain unchanged downstream.
_Avoid_: Copied slot

**Missing Slot**:
An expected Inherited Slot whose stable identity is absent from the connected upstream Pipe Schema.
_Avoid_: Empty slot, null slot

## Subgraph UI language

**Subgraph UI Element**:
A persistent presentation element used to arrange exposed controls on a Subgraph, such as a Heading, Spacer, or Divider.
_Avoid_: Layout hack, dummy node

**Subgraph Parameter Selector**:
A user-defined selection control whose visible options are also its emitted values.
_Avoid_: Dynamic text field

**Layout Order**:
The user-defined, persistent ordering of exposed Subgraph inputs and Subgraph UI Elements.
_Avoid_: Widget index, creation order

## Control Center language

**Control**:
A user-defined toggle whose assignments participate in group-state resolution while the Control is active.
_Avoid_: Preset, workflow mode

**Control Assignment**:
The association between a Control, a stably identified group, and its Activate, Mute, or Bypass action.
_Avoid_: Group title mapping

**Control Conflict**:
Two or more active Controls assigning different actions to the same group. Resolution is deterministic: Activate wins over Mute, and Mute wins over Bypass.
_Avoid_: Last toggle wins

**Rack**:
The workflow-level editor for defining Controls, Control Assignments, and Control Center behavior.
_Avoid_: Settings popup

**Base Node State**:
The individual node mode that exists independently of restrictions applied by the Control Center.
_Avoid_: Previous index, default mode

## Regional prompting language

**Region Usage**:
The declared execution purpose of an active region: generation, detailer, or both.
_Avoid_: Region type, output toggle

**Detailer-only Region**:
An active region whose geometry is exported for downstream detail workflows but does not participate in initial generation conditioning.
_Avoid_: Disabled region, hidden region

**Detailer Plan**:
An ordered, backend-neutral list of detail jobs derived from enabled Detailer and Both regions.
_Avoid_: Batch, detector workflow

**Detailer Job**:
One loop iteration with stable region identity, composed mask, prompt context and an optional named detector assignment.
_Avoid_: Crop, pass

**Detector Binding**:
A capability-validated bundle containing only detector outputs that are actually usable, optionally including BBOX, segmentation and SAM.
_Avoid_: Detector splitter, null detector

**Detector Registry**:
A workflow-local mapping from stable detector IDs to Detector Bindings used by Detailer Jobs.
_Avoid_: Detector list, global detectors

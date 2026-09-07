# Regional editor tools and reference authoring

The shared BV UI `SegmentedToggleGroup` exposes independent pressed states on one
line, with an overflow menu for options that do not fit. `ToolTabs` displays only
enabled tools. Changing tabs does not disable tools. Disabling a tool retains its
configuration and filters it out of execution. Legacy documents without explicit
`tool_settings` retain their existing behavior; empty new documents show no tool
panel. Usage retains generation, detailer and both; at least one must remain on.

Both the Regional and Quick Prompt editors use shared `PromptPairFields`.
The `@ references` switch enables suggestions only. Literal artist syntax stays
plain text. Selecting a result inserts a display label and stores UTF-16 offsets
with collector/resource UUIDs. Editing through a mention removes that binding;
edits outside it shift offsets. Missing places remain visible. Catalog changes
close the popup rather than silently changing its selected identity. Each prompt
supports up to 100 mentions. Available native image previews appear in suggestions
and on the stored-reference markers; generated sources may have no preview yet.

Saved mentions are preserved when suggestions are off. Model application is
adapter-specific: [Krea 2 Identity Edit](krea2-identity-edit.md) supports mentions
bound to its selected source image. Other model paths reject unsupported bound
mentions explicitly; disabling suggestions does not remove their bindings.
The Reference tools panel selects the source image through the existing Registry/DG
configuration. Workflow clipboard copies remap
mentions when their registry is included; plain text clipboard contains only text.

Region headings include the current region name with bounded width and tooltip.
All controls and prompt assistance are shared infrastructure; Regional-specific
views supply only domain data and callbacks.

## Connected canvas planning image

The existing canvas image picker offers Input image by default for documents with
no remembered selection. Last Sent Image and explicit history choices remain
available. The shared inputImagePreview resolver reads the actual connected IMAGE
output through native Root/Subgraph boundaries without executing nodes or walking
through image transformations. Native LoadImage uses its current filename widget;
other unambiguous image outputs expose only an available previous preview, labeled
accordingly. Linked filename inputs, missing links, bypassed/muted sources and
ambiguous image outputs have no preview. The editor refreshes the read-only source
at 250 ms intervals while open and releases the timer when closed. No asynchronous
image callback writes preview state. Disconnects clear the source on the next
refresh. Canvas dimensions, regions, tensors and workflow wiring are untouched.

Quick Edit uses the same active-tool resolver, tool tabs and LoRA/LUT pickers as
the full editor. Background shares the global tool scope. Regions expose the
same Generation/Detailer usage toggles and Detailer picker. Tool flags preserve
LoRA/LUT configuration when disabled. Usage reconciliation follows the existing
Full editor contract, which removes Detailer jobs for ineligible regions.
Document writes start from the current widget document; editor activation reloads
all scoped configuration. Tool-tab selection is local presentation state, while
active flags, usage and picker configuration persist across editor switches.

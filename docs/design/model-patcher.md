# BV Model Patcher

Model preparation is separate from global/regional attention. The first supported
patch kind is a constant **basis LoRA stack**; no LLLite, ControlNet or other patch
implementation is implied by the general node name.

## Usage

1. In LoRA Registry, open a stack and enable **Basis stack**. Its IDs, entries,
   order, enable states and separate MODEL/CLIP strengths are retained.
2. Insert **BV Model Patcher** before the attention node. Connect MODEL and,
   optionally, CLIP; use the returned MODEL and CLIP downstream.
3. Select the Registry under **Add basis Registry**. Existing Registry/Collector
   DG transport delivers its live resources, including across native subgraphs.
   Additional selected Registries can be reordered or removed in the same list.

Only basis stacks of selected Registries apply. Registry selection order, then
stored stack order, then entry order determines loading. Normal stacks remain
available to the existing global/regional system. Missing roles mean normal;
old workflows are not automatically reclassified.

Without a selected/active basis stack, MODEL and CLIP pass through by identity.
Without CLIP, only model strengths apply; CLIP strengths are ignored and the CLIP
output is None. Connect CLIP when a basis patch must affect the text encoder.
Both-zero entries are skipped. Native safe LoRA loading preserves separate and
negative strengths, and errors propagate. The input patchers are never changed.

## Separation and identities

The optional `role: "basis"` survives Registry materialization and Collector
reidentification. Normal is omitted when canonicalizing persisted configurations.
The normal picker excludes basis stacks. Existing global/regional assignments
of a reclassified stack fail explicitly: remove that assignment and select its
Registry in Model Patcher. Neither V3 nor legacy assignment routing may apply it.

Result MODEL/CLIP patchers carry separate `bv_basis_lora_stacks` attachments keyed
by Collector+stack identity. Chaining a second application of the same stack to
the same MODEL or CLIP is rejected. Independent branches from the original input
remain valid. This does not detect weights already merged into a checkpoint or
the same file deliberately registered under another identity.

The configuration stores an ordered list of up to 20 Registry IDs. Missing,
duplicate or extra runtime providers fail closed; display labels are never IDs.
Clipboard copies remap copied Registry identities while retaining external ones.
DG routing, receiver lifetime and projected provider ports use the shared
Registry lifecycle; inline UI uses the shared React node host and BV UI controls.

The patcher supplies the constant basis stack. Regional LoRAs in Identity Edit
are applied separately by the [Krea 2 Identity Edit adapter](krea2-identity-edit.md),
which preserves those basis weights across regional model variants. Static/CPU
tests and UI builds are not proof of a completed GPU generation or native graph UI test.

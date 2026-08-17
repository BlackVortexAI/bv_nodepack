# BV Global Completion

## Goal

BV Global Completion is a nodepack-wide completion module, not a Regional Editor feature. It provides one search, ranking, insertion, configuration and data-loading implementation for both BV-owned editors and eligible ComfyUI multiline text widgets. It is intended to replace separate tag-completion extensions for users who enable its global integration.

## Module and adapters

The deep module exposes one field-oriented interface: attach an eligible text field with context, update its context, and detach it. The implementation owns caret parsing, provider aggregation, ranking, dropdown rendering, keyboard handling, insertion, cancellation and diagnostics.

Adapters sit at the field-discovery seam:

- `BV React adapter`: explicitly registers Regional Editor, Quick Edit and future BV textareas and supplies document, scope, polarity and model-profile context.
- `ComfyUI classic-widget adapter`: discovers real multiline STRING widgets and registers their textarea lifecycle.
- `ComfyUI Nodes 2.0 adapter`: observes node DOM creation/removal and maps eligible node textareas to their graph widget metadata.

Adapters must never implement their own suggestion logic or dropdown. Fields are tracked through a `WeakMap`; repeated discovery must not attach duplicate listeners.

## Eligibility and coexistence

Global discovery targets prompt-capable multiline textareas, not every input on the page. Code editors, logs, JSON widgets, hidden widgets and known incompatible inputs are excluded. The module supports:

- global enable/disable;
- per-node and per-widget allow/deny rules;
- `bv.autocomplete: false` as the native BV opt-out;
- respect for common `tagcomplete: false` and `pysssss.autocomplete: false` opt-outs;
- an attachment marker and conflict diagnostics.

Two completion dropdowns on one field are not a supported configuration. When BV Global Completion is enabled, users should disable competing completion extensions. Best-effort foreign-listener detection may warn, but must not remove or mutate another extension.

## Provider seam

Providers return normalized candidates only. Initial provider families:

- local CSV/TSV tag data;
- embeddings;
- LoRAs;
- wildcards;
- recent and favorite terms;
- AST/context suggestions.

Future providers may add spelling, translation or language assistance without changing field adapters. Model profiles control active providers, separators, underscore conversion, escaping and whether suggestions are tag-oriented or natural-language-oriented.

The normalized suggestion contract is versioned and metadata-capable from version 1. Every candidate has a stable ID, insertion text, label, source and optional ranking value. Optional metadata is namespaced and may carry descriptions, translations, aliases, category/subcategory, provenance, source URLs, franchise/work, medium, character, creator/artist/studio, usage statistics, rating distribution, derived risk values, sample size, confidence and derivation method. Unknown metadata fields must survive cache/index round-trips and be ignored safely by older renderers.

The compact dropdown renders only universally useful fields. A details affordance may progressively reveal richer metadata when present; providers are never required to fabricate absent fields. Measured, sourced and derived values remain distinguishable in both storage and UI.

Large datasets are loaded lazily. Search work must be cancellable, debounced and isolated from UI rendering. Optional dependencies and model-specific providers use delayed imports and cannot prevent the rest of the nodepack from loading.

## Editing contract

- Suggestions never change text without explicit acceptance.
- Insertion preserves selection and dispatches normal input semantics.
- Acceptance is one undoable edit in both ComfyUI widgets and BV editors.
- While the dropdown is open, its navigation keys do not propagate to ComfyUI.
- Escape closes completion before it cancels a broader editor action.
- Detaching a field removes all listeners and pending work.

## Delivery order

1. Completion engine and fake provider tests.
2. Explicit BV React adapter.
3. Local CSV/TSV provider and configuration.
4. Classic ComfyUI widget adapter.
5. Nodes 2.0 DOM adapter.
6. Embedding, LoRA and wildcard providers.
7. Conflict diagnostics and performance hardening.

## Deferred dataset enrichment project

A separate follow-up project may generate a provenance-aware enriched tag dataset for the completion providers. Candidate fields include canonical tag, category, aliases, usage counts, source links, a concise explanation, rating-distribution statistics, an explicitly derived NSFW-risk score and confidence/sample size. Research must settle authoritative sources, licensing, redistribution, update cadence and rate-limit-safe acquisition before implementation.

Measured source fields and derived fields must remain distinguishable. An NSFW-risk value is statistical correlation in the source corpus, never a content guarantee or safety classifier. The autocomplete UI must expose provenance and uncertainty rather than presenting such values as facts about every generated image.

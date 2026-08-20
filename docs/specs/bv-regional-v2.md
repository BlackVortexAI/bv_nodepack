# BV Regional v2

BV Regional v2 extends the v1 document contract with explicit per-region consumer routing. All geometry, prompt, mask, priority, overlap, and authoring semantics remain unchanged.

## Region usage

Every region requires a `usage` value:

- `generation`: participates only in regional generation.
- `detailer`: is excluded from generation and is available only to detailer integrations.
- `both`: participates in generation and is available to detailer integrations.

`enabled: false` disables the region for every consumer. The `BV Regional Detailer Mask` node accepts only enabled `detailer` or `both` regions.

## Migration

The runtime and editor accept v1 documents and migrate them in memory to v2. Every imported v1 region receives `usage: "generation"`, which preserves its previous rendering behavior. Newly serialized documents use version 2.

Region-only imports accept `bv.regions` versions 1 and 2. Version 1 region bundles receive the same `generation` default during import.

The machine-readable contract is [`schemas/bv_regional_v2.schema.json`](../../schemas/bv_regional_v2.schema.json). The v1 schema remains available for legacy validation.

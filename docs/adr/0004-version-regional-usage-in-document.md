# Version regional usage in the BV document

BV Regional v2 stores each region's `usage` as `generation`, `detailer`, or `both` in the canonical document. This keeps execution intent portable with exported regions and avoids a second sidecar that every compiler would need to receive; v1 imports migrate deterministically to `generation`, preserving all existing render results. `enabled` remains an independent whole-region switch, while usage decides which active consumers may compile the region.

# BV Local Completion Data

BV ships with `bv_default_tags.csv` as its default tag dataset so prompt completion does
not depend on another custom-node package. Additional `.csv` and `.tsv` datasets
can be placed alongside it. Dataset selection and ordering are managed by the BV
completion settings UI.

Supported inputs:

- legacy four-column rows: `tag,category_id,post_count,aliases`;
- an extended header format beginning with `tag` or `term`.

Extended columns such as `description`, `source`, `nsfw_score`, provenance or
future custom metadata are preserved by the provider. You can alternatively set
the `BV_COMPLETION_DATASET` environment variable to an absolute CSV/TSV path.

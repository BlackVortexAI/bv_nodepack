# Enriched tag dataset for BV Global Completion

Research date: 2026-08-17
Scope: Danbooru and Gelbooru first-party APIs/documentation/source code

## Conclusion

An enriched BV tag catalog is feasible, but CSV/TSV should be an interchange format, not the authoritative store. The recommended authoritative format is SQLite with normalized tables for tags, aliases, implications, descriptions, provenance, relationships, and rating statistics. JSONL is useful for append-only ingestion snapshots; CSV/TSV is useful for user editing and exports.

The most important contract is that every value declares whether it is:

- **source fact**: returned directly by a named API field or source record;
- **measured statistic**: computed from a defined post population;
- **derived relation**: inferred from categories, implications, wiki text, or co-occurrence;
- **curated assertion**: manually authored or reviewed;
- **model-generated suggestion**: not trusted until reviewed.

An `nsfw_probability` can be a useful warning and ranking signal, but it is only a historical conditional frequency. It is **not a guarantee that a prompt will or will not generate NSFW content**. Model, checkpoint, surrounding prompt, sampler, seed, and generation policy remain decisive.

## What the primary sources expose

### Danbooru

Danbooru exposes JSON endpoints for the entities needed by the catalog:

- `/tags.json`: canonical tag name, numeric category, and aggregate `post_count`.
- `/wiki_pages.json`: wiki title/body and additional metadata.
- `/tag_aliases.json`: antecedent and consequent tag relationships with status.
- `/tag_implications.json`: antecedent and consequent tag relationships with status.
- `/posts.json`: per-post rating and category-separated tag strings.
- `/counts/posts.json?tags=...`: count for a tag query, suitable for rating-conditioned counts when used conservatively.

The route/controller surface is visible in the official Danbooru source tree and the generated route-oriented API description. The generated OpenAPI file explicitly warns that it is only an auto-generated baseline and may require manual curation, so it must not be treated as a stable formal specification: [Danbooru OpenAPI baseline](https://gist.github.com/evazion/0f28c3fc8b6885f27a586b5f5786b363).

Danbooru's source defines four post ratings: `g` (General), `s` (Sensitive), `q` (Questionable), and `e` (Explicit). It defines `nsfw` as `q` or `e`, and `sfw` as `g` or `s`: [official `Post` model](https://github.com/danbooru/danbooru/blob/master/app/models/post.rb#L31-L45). This exact source taxonomy must be stored with the statistic; it must not be silently translated to another site's rating semantics.

The tag category is an ontology class, not a media/franchise graph. The standard Danbooru codes are `0` general, `1` artist, `3` copyright, `4` character, and `5` meta: [official category mapping](https://github.com/danbooru/danbooru/blob/master/app/logical/tag_category.rb#L7-L47). Category and aggregate post count are source facts; the official tag model exposes both but does not expose rating-specific tag counts: [official `Tag` model](https://github.com/danbooru/danbooru/blob/master/app/models/tag.rb#L29-L46). A copyright tag can name a franchise, game, anime, manga, or other work; the category alone does not tell which one.

Useful direct retrieval examples:

```text
GET https://danbooru.donmai.us/tags.json?search[name_matches]=blue_hair&limit=20
GET https://danbooru.donmai.us/wiki_pages.json?search[title]=blue_hair
GET https://danbooru.donmai.us/tag_aliases.json?search[antecedent_name]=...
GET https://danbooru.donmai.us/tag_implications.json?search[antecedent_name]=...
GET https://danbooru.donmai.us/counts/posts.json?tags=blue_hair rating:e
```

Spaces and brackets must be URL-encoded by the client. Requests should use `only=` where supported, paginate deterministically, cache results, identify the client with a descriptive `User-Agent`, and back off on `429`/`5xx`. Danbooru supports API-key authentication through HTTP Basic authentication or the `login` and `api_key` query parameters; credentials must never be embedded in a distributed catalog. See the authentication schemes in the [API baseline](https://gist.github.com/evazion/0f28c3fc8b6885f27a586b5f5786b363#file-openapi-yaml).

Danbooru's current API help states a global read limit of 10 requests/second, with maximum page sizes of 200 for posts and 1000 for most other endpoints, and exposes current buckets in `X-Rate-Limit`. These are operational policy rather than a schema guarantee and must not become timeless constants. The application also exposes `/rate_limits`; production policy can change. The importer should therefore be serialized, cached, resumable, and driven by response status/headers. Canonical help: [Danbooru API help](https://danbooru.donmai.us/wiki_pages/help:api). The terms explicitly require clients to respect rate limits and not bypass restrictions: [official Terms of Service source](https://github.com/danbooru/danbooru/blob/master/app/views/static/terms_of_service.html.erb#L30-L79).

The official repository states that an optional internal job exports public API data to BigQuery, but this does not establish a public bulk-download contract: [official repository README](https://github.com/danbooru/danbooru#google-apis). Historical third-party Danbooru datasets are not automatically licensed or current primary sources.

### Gelbooru

Gelbooru's older DAPI help page explicitly says it is out of date and points to [the current first-party API wiki](https://gelbooru.com/index.php?page=wiki&s=view&id=18780). The documented base shape is:

```text
/index.php?page=dapi&s=<entity>&q=index&json=1
```

The tag endpoint is `/index.php?page=dapi&s=tag&q=index`; its documented filters include `id`, `after_id`, `name`, `names`, and `name_pattern`, with ordering by date, count, or name. The documented default limit is 100. Tag records provide inventory/category/count, not explanations or an NSFW probability. BV must probe and version the actual response schema rather than assume Danbooru-compatible fields. Gelbooru API access uses `api_key` and `user_id`; those credentials remain local secrets. Gelbooru documents the ratings General, Sensitive, Questionable, and Explicit and the `rating:` search metatag: [first-party search options](https://gelbooru.com/index.php?page=wiki&s=view&id=25921).

Gelbooru's public API documentation is weaker for bulk wiki, alias, implication, rate-limit, and licensing guarantees than Danbooru's inspectable source. Therefore:

- treat Gelbooru as a separate source namespace;
- never merge records merely because tag strings are equal;
- retain raw payload snapshots and observed schema version;
- do not redistribute a harvested Gelbooru catalog until permission/terms are explicitly confirmed.

## Descriptions and explanations

Danbooru wiki bodies are the strongest first-party starting point for a short explanation, but they are long-form DText and can contain links, lists, examples, warnings, and historical notes. BV should store:

- the unmodified source body or its hash in the ingestion store;
- source title, URL, revision/update timestamp when available;
- a separately derived `short_description`;
- derivation method and review state.

`short_description` must not masquerade as a verbatim source fact. Recommended states are `source_excerpt`, `rule_summary`, `human_summary`, and `model_summary`. Model summaries should default to `unreviewed` and must link back to the source wiki.

## Ontology and provenance relationships

### Directly available

The following are defensible source facts when returned by the relevant API:

- tag name and site-local tag ID;
- broad category (`general`, `artist`, `copyright`, `character`, `meta`);
- aggregate post count;
- wiki body/title;
- alias direction (`antecedent -> consequent`) and status;
- implication direction (`antecedent -> consequent`) and status;
- per-post rating and category-separated tag strings;
- artist records/URLs when separately acquired from Danbooru's artist API.

### Not directly guaranteed by category

These claims require explicit evidence or derivation:

- `copyright` represents an anime versus manga versus game;
- one copyright tag is the parent franchise of another;
- a character belongs to a particular work;
- an artist is the illustrator/creator of a character or franchise;
- a tag represents an animation studio, publisher, voice actor, or real person;
- a work was adapted from manga to anime;
- one tag is ambiguous between multiple real-world entities.

Danbooru implications can provide strong edges (for example, a character tag implying a copyright tag), but an implication means “using A entails B” in Danbooru tagging. It is not universally equivalent to `character_of`, `created_by`, or `parent_franchise`. The raw implication must be retained; a semantic edge can be derived only with a declared rule and confidence.

Recommended derived relationship types:

- `character_of_work`
- `work_in_franchise`
- `adaptation_of`
- `created_by`
- `illustrated_by`
- `published_by`
- `developed_by`
- `studio_of`
- `portrays_real_person`
- `related_to`
- `ambiguous_with`

Each edge must carry `assertion_kind`, `confidence`, `evidence_source`, `evidence_locator`, `rule_version`, and `review_status`. Co-occurrence alone may suggest `related_to`; it is insufficient for directional authorship or ownership claims.

## Rating statistics and NSFW risk

### Recommended definition

For source `S`, snapshot time `T`, and tag `t`:

```text
N_total = N_g + N_s + N_q + N_e
P_nsfw_raw = (N_q + N_e) / N_total
P_explicit_raw = N_e / N_total
P_sensitive_or_higher_raw = (N_s + N_q + N_e) / N_total
```

These are **measured statistics**, not source fields. Store all four counts, the population definition, visibility policy, timestamp, source, and query/dump revision. Never store only the percentage.

For low counts, use a smoothed display estimate, for example a beta-binomial posterior mean:

```text
P_nsfw_smoothed = (N_q + N_e + alpha) / (N_total + alpha + beta)
```

`alpha` and `beta` must be recorded as part of a versioned method. Also expose sample size and a confidence/credible interval. A simple product UI can map the interval conservatively to labels such as `low`, `mixed`, `high`, or `insufficient_data`; the raw value remains available.

### Efficient computation

Per-tag count calls are feasible for a small curated catalog, but expensive for hundreds of thousands of tags. Danbooru's count controller accepts a normal tag query and returns a post count; it defaults to an estimated count and permits `estimate_count=false`: [official count controller](https://github.com/danbooru/danbooru/blob/master/app/controllers/counts_controller.rb#L2-L14). Exact bulk counting can be materially more expensive. Preferred order:

1. Use an explicitly permitted bulk metadata source and aggregate locally.
2. Otherwise compute only for the active/top-N catalog, incrementally and rate-limited.
3. Cache count results by `(source, tag, rating taxonomy, snapshot)`.
4. Recalculate popular/recently changed tags more often than the long tail.

If aggregating posts, use the post's canonical rating field and tag strings from the same snapshot. Deleted, pending, banned, hidden, and account-inaccessible posts can change the denominator; record the visibility scope. Alias canonicalization must also be snapshot-consistent.

### Safety limitation

The statistic answers: “Among visible source posts carrying this tag in this snapshot, what fraction had these source ratings?” It does **not** answer:

- whether a tag is intrinsically sexual;
- whether a model learned the same distribution;
- whether a specific prompt will produce NSFW output;
- whether a result is appropriate under a user's policy or jurisdiction.

The UI should label it `historical NSFW association`, show sample size/source date, and avoid definitive wording such as “safe tag”.

## Recommended storage model

### SQLite authoritative store

SQLite is preferable internally because aliases, implications, multiple descriptions, provenance records, source snapshots, and ontology edges are one-to-many/many-to-many data. It also enables indexed prefix/fuzzy lookup without loading a large flat file into memory.

Suggested tables:

```text
sources(source_id, name, base_url, terms_url, rating_taxonomy, retrieved_at)
snapshots(snapshot_id, source_id, retrieved_at, cursor, schema_version, payload_hash)
tags(tag_id, source_id, source_tag_id, canonical_name, category_code,
     category_label, post_count, active, first_seen_at, last_seen_at)
tag_texts(tag_id, language, text_kind, body, source_url, source_revision,
          assertion_kind, confidence, review_status)
aliases(source_id, antecedent_tag_id, consequent_tag_id, status, snapshot_id)
implications(source_id, antecedent_tag_id, consequent_tag_id, status, snapshot_id)
rating_stats(tag_id, snapshot_id, count_g, count_s, count_q, count_e,
             population_scope, method_id)
relations(subject_tag_id, predicate, object_tag_id, assertion_kind,
          confidence, evidence_source, evidence_locator, rule_version,
          review_status)
external_links(tag_id, link_kind, url, assertion_kind, confidence)
```

JSONL is recommended for immutable raw API ingestion/events because it is streamable and diffable by record, but it is not ideal for interactive relational queries. Preserve raw payload hashes even if raw bodies are not distributed.

### Extensible CSV/TSV export

A flat user-facing export can use one row per canonical tag:

```text
schema_version
source
source_tag_id
tag
category_code
category_label
post_count
short_description
description_kind
description_language
wiki_url
aliases_json
implications_json
entity_kind
entity_kind_assertion
entity_kind_confidence
parent_entities_json
creator_entities_json
media_types_json
ambiguity_notes
rating_taxonomy
count_general
count_sensitive
count_questionable
count_explicit
nsfw_probability_raw
nsfw_probability_smoothed
nsfw_interval_low
nsfw_interval_high
nsfw_sample_size
nsfw_method_version
source_snapshot_at
provenance_json
review_status
```

JSON-encoded array/object cells avoid delimiter collisions but are intentionally an export compromise. A lossless export should be a ZIP containing normalized CSV tables plus a manifest, or SQLite itself.

## Update pipeline

1. **Acquire** API records serially with authentication kept in local configuration, backoff, resumable cursors, and response hashing.
2. **Stage** immutable JSONL payloads with source, retrieval time, request parameters, response status, and schema fingerprint.
3. **Normalize** into SQLite without cross-source identity merging.
4. **Canonicalize** active aliases while retaining the original alias edge and status.
5. **Enrich** wiki descriptions and implications as separate evidence records.
6. **Measure** rating counts using a versioned population definition.
7. **Derive** entity kinds and semantic relations only through versioned rules; flag ambiguity.
8. **Review** model-generated descriptions/relations before treating them as curated.
9. **Publish** a manifest containing source snapshots, method versions, row counts, hashes, and license/permission status.
10. **Export** compact CSV/TSV profiles for autocomplete while the runtime queries SQLite.

Updates should be atomic: build a new database, validate counts/foreign keys, then swap it into place. Do not mutate the active catalog row-by-row while ComfyUI is querying it.

## Redistribution and licensing

The Danbooru application source uses a permissive two-clause BSD-style license, as shown by the [official repository license](https://github.com/danbooru/danbooru/blob/master/LICENSE). That software license does **not automatically license API data, wiki prose, tag compilations, or uploaded media for redistribution**.

Danbooru's Terms of Service describe tags, wiki pages, and links as generally factual information, while also defining rights around user submissions; this is not the same thing as an explicit blanket dataset license: [official Terms of Service source](https://github.com/danbooru/danbooru/blob/master/app/views/static/terms_of_service.html.erb#L82-L140). Its privacy policy contemplates third parties accessing, archiving, or redistributing public API/dump information, but again does not provide a standalone dataset license: [official privacy-policy source](https://github.com/danbooru/danbooru/blob/master/app/views/static/privacy_policy.html.erb#L151-L218).

No sufficiently explicit first-party license for redistributing a derived bulk tag/wiki database was established in this research. Gelbooru's API documentation likewise does not grant redistribution rights. Therefore the safe project posture is:

- ship the importer/schema, not a scraped full database, until permission is confirmed;
- let users build a local catalog with their own credentials and acceptance of source terms;
- distribute only manually authored BV metadata or source data with an explicit compatible license;
- retain source URLs, retrieval dates, hashes, and attribution;
- never bundle post images for this feature;
- obtain legal/owner clarification before publishing a prebuilt enriched catalog.

This is a product-risk finding, not legal advice.

## Recommended MVP boundary

Build this in two layers:

1. **BV Completion Core**: SQLite schema, local CSV/TSV import/export, ranking, descriptions, provenance display, and optional NSFW-association badges.
2. **Catalog Builder**: separately invoked, resumable source adapters for Danbooru/Gelbooru, with credentials, throttling, raw snapshots, and review tooling.

For the first shippable dataset, support source facts (`tag`, category, count, aliases, implications, wiki link), a reviewed short description, and transparent four-bucket rating counts. Defer automated franchise/creator graphs until evidence rules and review UX exist. This avoids presenting plausible but unsupported ontology guesses as facts.

## Primary source index

- [Danbooru official source repository](https://github.com/danbooru/danbooru)
- [Danbooru `Post` rating definitions](https://github.com/danbooru/danbooru/blob/master/app/models/post.rb#L31-L45)
- [Danbooru tag fields](https://github.com/danbooru/danbooru/blob/master/app/models/tag.rb#L29-L46)
- [Danbooru category mapping](https://github.com/danbooru/danbooru/blob/master/app/logical/tag_category.rb#L7-L47)
- [Danbooru wiki-page model](https://github.com/danbooru/danbooru/blob/master/app/models/wiki_page.rb#L2-L23)
- [Danbooru alias model](https://github.com/danbooru/danbooru/blob/master/app/models/tag_alias.rb#L2-L29)
- [Danbooru implication model](https://github.com/danbooru/danbooru/blob/master/app/models/tag_implication.rb#L2-L39)
- [Danbooru count controller](https://github.com/danbooru/danbooru/blob/master/app/controllers/counts_controller.rb#L2-L14)
- [Danbooru post-query metatags](https://github.com/danbooru/danbooru/blob/master/app/logical/post_query_builder.rb)
- [Danbooru route-generated API baseline](https://gist.github.com/evazion/0f28c3fc8b6885f27a586b5f5786b363)
- [Danbooru application license](https://github.com/danbooru/danbooru/blob/master/LICENSE)
- [Gelbooru current first-party API wiki](https://gelbooru.com/index.php?page=wiki&s=view&id=18780)
- [Gelbooru first-party search/rating options](https://gelbooru.com/index.php?page=wiki&s=view&id=25921)

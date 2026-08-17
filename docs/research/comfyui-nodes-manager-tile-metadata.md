# ComfyUI Nodes Manager tile metadata research

Research date: 2026-08-17

## Conclusion

The wide image at the top of a node-pack tile in the current Nodes Manager is
the Registry **banner**, not a README image. It is configured together with a
separate square icon in `pyproject.toml`:

```toml
[tool.comfy]
PublisherId = "blackvortex"
DisplayName = "BV-NodePack"
Icon = "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/docs/assets/registry/bv-nodepack-icon.png"
Banner = "https://raw.githubusercontent.com/BlackVortexAI/bv_nodepack/main/docs/assets/registry/bv-nodepack-banner.png"
```

The official specification says both fields are used by the Comfy Registry and
ComfyUI-Manager. `Icon` must be SVG, PNG, JPG, or GIF, square, and no larger
than 400 x 400 pixels. `Banner` accepts the same file formats and must be 21:9.
The specification does not currently state a maximum banner resolution. See
the official [`pyproject.toml` specification](https://docs.comfy.org/registry/specifications#icon-optional).

For BV, create and publish both assets. A 400 x 400 PNG or SVG icon and a
1680 x 720 (21:9) PNG banner are conservative choices. The banner should carry
the recognizable BV visual identity and remain readable after center-cropping;
the icon should work without small text. The URL must be publicly and directly
fetchable. The official example uses `raw.githubusercontent.com`.

## Current BV repository state

The repository already has the main Registry metadata and an automated publish
workflow:

- `[project].name = "bv_nodepack"`
- `[project].version = "0.3.1"`
- a detailed `[project].description`
- `[project.urls]` for repository, issues, and documentation
- `[tool.comfy].PublisherId = "blackvortex"`
- `[tool.comfy].DisplayName = "BV-NodePack"`
- `.github/workflows/publish.yml` using the official publish action

The missing pieces for the visual tile are that `Icon` is currently empty and
`Banner` is absent. The existing `docs/assets/bv-nodepack-hero.svg` is a README
hero and is not automatically discovered as Registry artwork.

Recommended repository layout:

```text
docs/assets/registry/
  bv-nodepack-icon.svg       # or .png; square, max 400 x 400
  bv-nodepack-banner.png     # 21:9, e.g. 1680 x 720
```

After the files exist on the public GitHub repository, add their raw URLs to
`[tool.comfy]`. Do not point at a local path or at the normal GitHub HTML file
page. A branch-based `main` URL is easy to maintain; an immutable commit URL is
more reproducible but must be changed whenever the artwork changes. Image-cache
delay when replacing content behind an unchanged URL is a practical possibility,
not a behavior guaranteed by the official documentation.

## Metadata that drives the listing

The documented author-controlled fields are:

| Field | Status | Listing purpose |
| --- | --- | --- |
| `[project].name` | required | Globally unique Registry node ID and install name; immutable after creation |
| `[project].version` | required | Three-part semantic version used for releases and upgrades |
| `[project].description` | recommended | Short node-pack summary shown by Registry/Manager clients |
| `[project.urls].Repository` | required | Source repository |
| `[project.urls].Documentation` | recommended | Documentation destination |
| `[project.urls]."Bug Tracker"` | recommended | Support/issues destination |
| `[tool.comfy].PublisherId` | required | Globally unique Registry publisher identity |
| `[tool.comfy].DisplayName` | optional | User-facing pack name; can be changed later |
| `[tool.comfy].Icon` | optional | Square icon URL, max 400 x 400 |
| `[tool.comfy].Banner` | optional | Wide 21:9 banner URL |
| `[tool.comfy].requires-comfyui` | optional | Compatible ComfyUI version constraint |
| `[project].dependencies` | optional | Python/frontend package requirements; the frontend package can express frontend-version compatibility |
| `[project].classifiers` | recommended | OS and accelerator discovery metadata |

These definitions and validation rules come from the official
[`pyproject.toml` specification](https://docs.comfy.org/registry/specifications).
The Registry API response additionally contains tags, compatibility projections,
download counts, ratings, repository stars, status, and publisher data. Those
fields explain other card/filter data, but the current `pyproject.toml`
specification does not document a free-form `[tool.comfy]` tags key. BV should
therefore not invent one. See the official
[`GET /nodes/{nodeId}` schema](https://docs.comfy.org/registry/api-reference/nodes/retrieve-a-specific-node-by-id).

The current BV description is accurate but very long for a compact card. A
shorter first sentence would improve scanning, for example:

> Regional prompting, structured prompts, Smart Pipes, Subgraph controls, and
> workflow utilities for current ComfyUI.

This is a content recommendation, not a Registry length requirement; the
official specification only calls for a brief description.

## Publishing and update behavior

The Comfy Registry is the backend that powers ComfyUI-Manager. The supported
publication flow is:

1. Create a publisher at the Comfy Registry. Its ID is globally unique and
   cannot be changed later.
2. Create a Registry publishing API key.
3. Maintain the metadata in `pyproject.toml`.
4. Increment `[project].version` using semantic versioning.
5. Publish with `comfy node publish`, or run the official GitHub publish action.

The official publishing guide explicitly shows a workflow triggered by changes
to `pyproject.toml`, and says that pushing an updated version causes the updated
node to appear in the Registry. See
[`Publishing Nodes`](https://docs.comfy.org/registry/publishing#publish-to-the-registry).
BV already has `.github/workflows/publish.yml` and therefore only needs the
assets, metadata entries, a version increment, and a successful workflow run.
The repository secret `REGISTRY_ACCESS_TOKEN` must exist for that action.

Published versions are immutable. To change packaged contents, publish a new
version; a released version cannot be overwritten. A faulty version can be
deprecated in the Registry UI, which warns installed users and directs them to
a newer version. See the official
[`Registry overview`](https://docs.comfy.org/registry/overview#frequently-asked-questions).

The official Registry API also exposes an update operation for node-level
metadata, including `banner_url`, `description`, `icon`, repository, tags, and
compatibility fields. This proves that visual metadata is node-level data, but
the documented, repository-centered workflow remains `pyproject.toml` plus a
new publish. See
[`Update a specific node`](https://docs.comfy.org/api-reference/registry/update-a-specific-node).

## Documentation inconsistency

The publishing tutorial's generated example still comments that `Icon` permits
"MAX. 800x400px". That conflicts with the dedicated current specification,
which defines `Icon` as square and at most 400 x 400 and defines `Banner`
separately as 21:9. Treat the dedicated specification as normative: use a
maximum 400 x 400 square icon and a separate 21:9 banner. Compare
[`Publishing Nodes: Add Metadata`](https://docs.comfy.org/registry/publishing#add-metadata)
with the
[`pyproject.toml` Icon/Banner specification](https://docs.comfy.org/registry/specifications#icon-optional).

## Legacy Manager boundary

The old Manager database is not the place to add this artwork. The official
ComfyUI-Manager repository describes `node_db` as the JSON database powering
the **legacy** registry system and identifies the online Custom Node Registry as
the replacement. See the official
[`node_db` README](https://github.com/Comfy-Org/ComfyUI-Manager/blob/main/node_db/README.md).

Therefore:

- do not add image metadata to the README and expect Manager discovery;
- do not submit a local/legacy `custom-node-list.json` image change for this;
- publish `Icon` and `Banner` through BV's Registry `pyproject.toml` metadata.

## Concrete BV implementation checklist

1. Design a square BV icon, at most 400 x 400, without small copy.
2. Design a 21:9 BV banner (recommended working size: 1680 x 720) with safe
   margins and minimal text.
3. Commit both under `docs/assets/registry/` and verify their raw GitHub URLs
   return the image directly without authentication.
4. Set both `Icon` and `Banner` in `[tool.comfy]`.
5. Optionally shorten the project description's opening sentence for the card.
6. Increment the semantic version; do not try to replace release `0.3.1`.
7. Push and confirm the publish workflow succeeds.
8. Verify the Registry detail page and current Nodes Manager tile at normal and
   narrow widths; specifically inspect crop, contrast, transparent SVG handling,
   description truncation, and icon/banner fallback.

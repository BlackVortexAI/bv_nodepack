import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => readFile(path.join(root, relativePath), "utf8");

const cyclonePath = "M11.08 2.736a2 2 0 0 1-.286 2.814";
const legacySpiralPath = "M24 12C5 31 9 61";

test("brand variants share the canonical Fluent Cyclone geometry and approved fills", async () => {
  const variants = new Map([
    ["docs/assets/brand/bv-cyclone.svg", "#1345B7"],
    ["docs/assets/brand/bv-cyclone-light.svg", "#5A7DCD"],
    ["docs/assets/brand/bv-cyclone-white.svg", "#FFFFFF"],
    ["docs/assets/brand/bv-cyclone-black.svg", "#000000"],
  ]);

  for (const [relativePath, fill] of variants) {
    const svg = await read(relativePath);
    assert.match(svg, new RegExp(cyclonePath.replace(/[.]/g, "\\.")));
    assert.ok(svg.includes(`fill="${fill}"`), `${relativePath} must use ${fill}`);
  }
});

test("published brand graphics no longer contain the hand-drawn spiral", async () => {
  const assets = [
    "docs/assets/bv-nodepack-hero.svg",
    "docs/assets/registry/bv-nodepack-icon.svg",
    "docs/assets/registry/bv-nodepack-banner.svg",
    "docs/assets/publishing/bv-nodepack-workflow-cover.svg",
  ];

  for (const relativePath of assets) {
    const svg = await read(relativePath);
    assert.ok(svg.includes(cyclonePath), `${relativePath} must use the canonical geometry`);
    assert.ok(!svg.includes(legacySpiralPath), `${relativePath} still contains the legacy spiral`);
  }
});

test("UI tokens use the approved Cool Graphite palette with independent semantic colors", async () => {
  const css = await read("ui/src/index.css");
  assert.match(css, /--bv-ui-brand:#1345b7;/);
  assert.match(css, /--bv-ui-action:#2d518f;/);
  assert.match(css, /--bv-ui-border-strong:#424d5c;/);
  assert.match(css, /--bv-ui-danger:#7b3f4b;/);
  assert.match(css, /--bv-ui-warning:#80612e;/);
  assert.match(css, /--bv-ui-success:#356f59;/);
  assert.match(css, /--bv-ui-info:#355f78;/);
});

test("third-party notices include the Fluent Emoji MIT attribution", async () => {
  const notice = await read("THIRD_PARTY_NOTICES.md");
  assert.match(notice, /## Microsoft Fluent Emoji/);
  assert.match(notice, /Copyright \(c\) Microsoft Corporation\./);
  assert.match(notice, /MIT License/);
});

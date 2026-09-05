import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = relativePath => readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("Cool Graphite is the only active default behind separate theme and appearance axes", async () => {
  const theme = await read("ui/src/ui/theme.ts");
  assert.match(theme, /BV_THEME_NAMES = \["cool-graphite"\]/);
  assert.match(theme, /BvAppearance = "auto" \| "dark" \| "light"/);
  assert.match(theme, /theme: "cool-graphite"/);
  assert.match(theme, /appearance: "auto"/);
  assert.match(theme, /documentElement/);
  assert.doesNotMatch(theme, /localStorage|workflow/);
});

test("Cool Graphite owns central semantic tokens for both appearances", async () => {
  const css = await read("ui/src/index.css");
  for (const color of ["#0f1217", "#1d222a", "#424d5c", "#2d518f", "#1345b7", "#356f59", "#80612e", "#7b3f4b", "#355f78"])
    assert.ok(css.includes(color), `missing approved token ${color}`);
  for (const token of ["--bv-ui-surface-hover", "--bv-ui-action-active", "--bv-ui-focus-ring", "--bv-ui-selection-bg", "--bv-ui-disabled", "--bv-ui-info-bg"])
    assert.ok(css.includes(token), `missing derived state ${token}`);
  assert.match(css, /data-bv-appearance="light"/);
  assert.match(css, /data-bv-appearance="auto"[^]+comfy-theme-light/);
});

test("semantic controls and portals consume theme tokens without naming a concrete theme", async () => {
  const actions = await read("ui/src/ui/components/actions.tsx");
  const floating = await read("ui/src/ui/components/floating.tsx");
  const showcase = await read("ui/src/showcase.tsx");
  assert.match(actions, /\|"info"/);
  assert.doesNotMatch(actions + floating, /cool-graphite|#[0-9a-f]{3,8}/i);
  for (const intent of ["success", "warning", "danger", "info"])
    assert.ok(showcase.includes(`intent="${intent}"`), `showcase misses ${intent}`);
});

test("canvas widget hosts bridge shared controls to ComfyUI node-widget tokens", async () => {
  const css = await read("ui/src/index.css");
  const hostRule = css.match(/\.bv-react-node-widget-host\{[^}]+\}/)?.[0] ?? "";
  assert.match(hostRule, /--bv-widget-text:var\(--color-base-foreground,currentColor\)/);
  assert.match(hostRule, /--bv-widget-surface:var\(--color-component-node-widget-background,transparent\)/);
  for (const mapping of [
    "--bv-ui-bg:var(--bv-widget-surface)",
    "--bv-ui-surface:var(--bv-widget-surface)",
    "--bv-ui-surface-raised:var(--bv-widget-surface)",
    "--bv-ui-surface-subtle:var(--bv-widget-subtle)",
    "--bv-ui-surface-hover:var(--bv-widget-hover)",
    "--bv-ui-surface-active:var(--bv-widget-active)",
    "--bv-ui-input:var(--bv-widget-surface)",
  ]) assert.ok(hostRule.includes(mapping), `widget host misses ${mapping}`);
  assert.match(css, /\.bv-readonly-text-block\{[^}]*background:var\(--bv-ui-input\)/);
  assert.match(css, /\.bv-compact-resource-row\{[^}]*background:var\(--bv-ui-surface-subtle\)/);
  assert.doesNotMatch(css, /\.bv-readonly-text-block\{[^}]*#[0-9a-f]{3,8}/i);
  assert.match(hostRule, /box-sizing:border-box/);
  assert.match(css, /\.bv-react-node-widget-scroll\{[^}]*scrollbar-color:var\(--bv-widget-muted\) transparent[^}]*scrollbar-width:thin/);
  assert.match(css, /\.bv-react-node-widget-scroll::-webkit-scrollbar-thumb\{[^}]*background:var\(--bv-widget-muted\)[^}]*border:2px solid var\(--bv-widget-surface\)/);
});

test("alternative concepts remain non-production catalog specifications", async () => {
  const catalog = JSON.parse(await read("docs/design/theme-catalog.json"));
  assert.deepEqual(catalog.productionThemes.map(theme => theme.id), ["cool-graphite"]);
  assert.equal(catalog.productionThemes[0].status, "active-default");
  assert.deepEqual(catalog.draftConcepts.map(theme => theme.name), ["Precision White", "Industrial Atelier", "Technical Glass", "Monochrome Studio", "Comfy Native", "GitHub Dark"]);
  assert.ok(catalog.draftConcepts.every(theme => theme.status === "catalog-spec-only"));
});

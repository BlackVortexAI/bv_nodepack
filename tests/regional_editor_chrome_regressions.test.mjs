import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const menus = read("../ui/src/regional/EditorMenus.tsx");
const tree = read("../ui/src/ui/components/RegionLayerTree.tsx");
const windowChrome = read("../ui/src/ui/window.tsx");
const styles = read("../ui/src/index.css");
const editor = read("../ui/src/regional/RegionalEditor.tsx");

test("regional header popovers remain mounted while their portal actions are clicked", () => {
  assert.doesNotMatch(menus, /window\.addEventListener\("pointerdown"/);
  assert.match(styles, /\.bv-anchored-popover\.bv-popover\s*\{[^}]*min-width:/);
  assert.match(styles, /\.bv-anchored-popover\.bv-popover:has\(\.bv-menu-stack\)\s*\{[^}]*width:/);
});

test("merge is a contextual region-tree action instead of a header menu", () => {
  assert.doesNotMatch(menus, /controlled\("layers"/);
  assert.match(tree, /aria-label="Merge selected layers"/);
  assert.match(tree, /disabled=\{!props\.canMergeLayers\}/);
});

test("split disconnected areas uses a separation icon and explicit label", () => {
  assert.match(tree, /name="separate"/);
  assert.match(tree, /<span>Split<\/span>/);
});

test("the window shelf participates in the BV theme token scope", () => {
  assert.match(windowChrome, /node\.className = "bv-ui-window-shelf bv-ui bv-density-compact"/);
});

test("factory layout groups Document behind the initially active Global tab", () => {
  assert.match(editor, /type:"tabset", weight:75, selected:0, children:\[\s*\{ type:"tab", id:"bv\.regional\.global"[\s\S]*?\{ type:"tab", id:"bv\.regional\.document"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applySeedAction, materializeSeedControl, randomSeed } from "../js/bv_seed_model.js";

const seedUi = readFileSync(new URL("../js/bv_seed.js", import.meta.url), "utf8");

test("random each time writes the random seed sentinel", () => {
  assert.equal(applySeedAction("random-each", 42), -1);
});

test("new fixed random stores a reproducible fixed seed", () => {
  const result = applySeedAction("new-fixed", 42, undefined, () => 0.5);
  assert.ok(Number.isSafeInteger(result));
  assert.equal(result, randomSeed(() => 0.5));
});

test("use last queued falls back safely when no last seed exists", () => {
  assert.equal(applySeedAction("use-last", 42, undefined), 42);
  assert.equal(applySeedAction("use-last", 42, 99), 99);
});

test("prompt materialization keeps the visible random sentinel untouched", () => {
  const visible = -1;
  const resolved = materializeSeedControl(visible, () => 0.5);
  assert.equal(visible, -1);
  assert.equal(resolved, randomSeed(() => 0.5));
});

test("seed field and action buttons consume the active ComfyUI canvas theme", () => {
  assert.match(seedUi, /\.WIDGET_BGCOLOR/);
  assert.match(seedUi, /\.WIDGET_OUTLINE_COLOR/);
  assert.match(seedUi, /\.WIDGET_TEXT_COLOR/);
  assert.match(seedUi, /\.WIDGET_SECONDARY_TEXT_COLOR/);
  for (const color of ["#242424", "#666", "#aaa", "#ddd"]) assert.doesNotMatch(seedUi, new RegExp(color, "i"));
});

test("seed actions are real renderer widgets instead of Classic-only painted hit regions",()=>{
  assert.match(seedUi,/addWidget\?\.\("button", name/);
  assert.match(seedUi,/bv_seed_action_use-last/);
  assert.doesNotMatch(seedUi,/seedWidget\.computeLayoutSize = function/);
  assert.doesNotMatch(seedUi,/seedWidget\.draw = function/);
});

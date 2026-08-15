import test from "node:test";
import assert from "node:assert/strict";
import { applySeedAction, materializeSeedControl, randomSeed } from "../js/bv_seed_model.js";

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

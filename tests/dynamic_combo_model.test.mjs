import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDynamicComboSelection, parseDynamicComboOptions } from "../js/bv_dynamic_combo_model.js";

test("dynamic combo options are trimmed and empty lines ignored", () => {
  assert.deepEqual(parseDynamicComboOptions(" low \n\nmedium\r\n high "), ["low", "medium", "high"]);
});

test("removed selection falls back to the first available option", () => {
  assert.equal(normalizeDynamicComboSelection("option_a", ["low", "medium", "high"]), "low");
  assert.equal(normalizeDynamicComboSelection("medium", ["low", "medium", "high"]), "medium");
});

test("empty option lists keep the current value for backend validation", () => {
  assert.equal(normalizeDynamicComboSelection("medium", []), "medium");
});

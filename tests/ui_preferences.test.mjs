import test from "node:test";
import assert from "node:assert/strict";
import { applyReducedEffects, applyUiSize, normalizeUiSize } from "../ui/src/ui/preferences.ts";

function fakeRoot() {
    const classes = new Set();
    return { classes, classList:{
        add: (...names) => names.forEach(name => classes.add(name)),
        remove: (...names) => names.forEach(name => classes.delete(name)),
        toggle: (name, force) => force ? classes.add(name) : classes.delete(name),
    } };
}

test("BV UI size normalizes unknown settings to the comfortable default", () => {
    assert.equal(normalizeUiSize("compact"), "compact");
    assert.equal(normalizeUiSize("large"), "large");
    assert.equal(normalizeUiSize("legacy"), "default");
});

test("BV UI preferences replace global size classes without touching unrelated classes", () => {
    const root = fakeRoot();
    root.classes.add("comfy-theme-dark");
    applyUiSize("compact", root);
    applyUiSize("large", root);
    assert.deepEqual([...root.classes].sort(), ["bv-ui-size-large", "comfy-theme-dark"]);
    applyReducedEffects(true, root);
    assert.equal(root.classes.has("bv-ui-reduced-effects"), true);
    applyReducedEffects(false, root);
    assert.equal(root.classes.has("bv-ui-reduced-effects"), false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { applyReducedEffects, applyUiPreferences, applyUiSize, bindMaturePreviewPersistence, getMaturePreviewVisibility, LORA_MATURE_PREVIEWS_SETTING_ID, normalizeUiSize, setMaturePreviewVisibility, subscribeMaturePreviewVisibility } from "../ui/src/ui/preferences.ts";

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

test("mature preview visibility persists once and notifies only real changes",()=>{
  const writes=[],seen=[];
  bindMaturePreviewPersistence(value=>writes.push(value));
  setMaturePreviewVisibility(false,false);
  const unsubscribe=subscribeMaturePreviewVisibility(value=>seen.push(value));
  assert.equal(setMaturePreviewVisibility("true"),false);
  assert.equal(setMaturePreviewVisibility(true),true);
  assert.equal(setMaturePreviewVisibility(true),true);
  unsubscribe();
  setMaturePreviewVisibility(false,false);
  assert.deepEqual(writes,[true]);
  assert.deepEqual(seen,[true]);
});

test("ComfyUI preference hydration restores mature previews without writing back",()=>{
  const writes=[];
  bindMaturePreviewPersistence(value=>writes.push(value));
  setMaturePreviewVisibility(false,false);
  globalThis.document={documentElement:fakeRoot()};
  try{
    applyUiPreferences({getSettingValue:(id,fallback)=>id===LORA_MATURE_PREVIEWS_SETTING_ID?true:fallback});
    assert.equal(getMaturePreviewVisibility(),true);
    assert.deepEqual(writes,[]);
  }finally{delete globalThis.document}
});

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

test("seed action buttons take over the press and fire exactly once on a release inside the widget", () => {
  const source = seedUi.match(/function seedButtonPointerDown\(pointer, node, canvas\) \{[\s\S]*?\r?\n\}\r?\n/)?.[0];
  assert.ok(source, "seedButtonPointerDown must exist in bv_seed.js");
  assert.match(seedUi, /button\.onPointerDown = seedButtonPointerDown;/);
  const seedButtonPointerDown = new Function(`${source}; return seedButtonPointerDown;`)();
  const widget = { name: "bv_seed_action_new-fixed", y: 26, height: 20, value: null };
  // node geometry the way the core hit test sees it: only this widget's rows answer with the widget
  const hits = [];
  const node = { pos: [100, 50], size: [200, 130], getWidgetOnPos(x, y) { hits.push([x, y]); const ly = y - this.pos[1], lx = x - this.pos[0]; return lx >= 6 && lx <= this.size[0] - 6 && ly >= widget.y - 2 && ly <= widget.y + widget.height + 2 ? widget : null; } };
  const canvas = { graph_mouse: [0, 0], dirty: 0, node_widget: [node, widget], setDirty() { this.dirty++; } };
  class FakePointer { constructor(down) { this.eDown = down; this.eUp = undefined; this._finally = undefined; } set finally(fn) { try { this._finally?.(); } finally { this._finally = fn; } } get finally() { return this._finally; } reset() { this._finally?.(); this._finally = undefined; this.eDown = this.eUp = undefined; } }
  const press = (extra = {}) => { const calls = []; widget.callback = (...args) => calls.push(args); widget.clicked = false; delete widget.disabled; delete widget.computedDisabled; Object.assign(widget, extra); const pointer = new FakePointer({ canvasX: 150, canvasY: 86 }); canvas.node_widget = [node, widget]; return { pointer, calls, taken: seedButtonPointerDown.call(widget, pointer, node, canvas) }; };
  const inside = { canvasX: 150, canvasY: 90 }, below = { canvasX: 150, canvasY: 120 }, right = { canvasX: 350, canvasY: 90 };
  // 1) clean click: press, release inside via onClick, cleanup
  let run = press(); assert.equal(run.taken, true); assert.equal(run.calls.length, 0, "press alone fires nothing");
  run.pointer.eUp = inside; run.pointer.onClick(inside); assert.equal(run.calls.length, 1); assert.equal(widget.clicked, true); assert.equal(run.calls[0][4], inside, "release event is passed to the callback");
  run.pointer.reset(); assert.equal(canvas.node_widget, null, "finally clears the canvas widget reference");
  // 2) drag-classified press released inside the widget: exactly one fire through onDragEnd
  run = press(); run.pointer.onDragStart(); run.pointer.onDrag({}); run.pointer.eUp = inside; run.pointer.onDragEnd(inside); assert.equal(run.calls.length, 1); run.pointer.reset(); assert.equal(canvas.node_widget, null);
  // 3) release outside the widget (below, beside, no event): no fire, still cleaned up
  for (const outside of [below, right, undefined]) { run = press(); run.pointer.eUp = outside; run.pointer.onDragEnd(outside); run.pointer.onClick(outside); assert.equal(run.calls.length, 0, `no fire for release ${JSON.stringify(outside)}`); run.pointer.reset(); assert.equal(canvas.node_widget, null); }
  // 4) release hit test uses the node's widget geometry, not the button's own guess
  assert.ok(hits.length >= 5, "getWidgetOnPos consulted on release");
  // 5) disabled at press: press stays with the canvas; disabled between press and release: no fire
  run = press({ disabled: true }); assert.equal(run.taken, false); assert.equal(run.calls.length, 0);
  run = press(); widget.computedDisabled = true; run.pointer.onClick(inside); assert.equal(run.calls.length, 0, "disabled at release does not fire"); run.pointer.reset();
  // 6) no pointer object: nothing is taken over
  assert.equal(seedButtonPointerDown.call(widget, undefined, node, canvas), false);
});

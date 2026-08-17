import assert from "node:assert/strict";
import test from "node:test";
import { regionsInPaintOrder, regionsInPriorityOrder, shouldAppendFinalBrushPoint, shouldStartSelectionMove, synchronizeRegionPriorities } from "../ui/src/regional/interaction.ts";

test("select ignores pointer jitter instead of mutating a compound brush mask", () => {
    assert.equal(shouldStartSelectionMove({ x: 100, y: 100 }, { x: 101, y: 101 }), false);
    assert.equal(shouldStartSelectionMove({ x: 100, y: 100 }, { x: 104, y: 100 }), true);
});

test("lower numeric region priority is painted last and therefore appears on top", () => {
    const regions = [{ id: "p0", priority: 0 }, { id: "p1", priority: 1 }];
    assert.deepEqual(regionsInPaintOrder(regions).map(region => region.id), ["p1", "p0"]);
});

test("sidebar order assigns P0 to the topmost region", () => {
    const regions = [{ id: "top", priority: 9 }, { id: "bottom", priority: -4 }];
    synchronizeRegionPriorities(regions);
    assert.deepEqual(regions.map(region => region.priority), [0, 1]);
});

test("highest semantic priority is listed first", () => {
    const regions = [{ id: "p2", priority: 2 }, { id: "p0", priority: 0 }, { id: "p1", priority: 1 }];
    assert.deepEqual(regionsInPriorityOrder(regions).map(region => region.id), ["p0", "p1", "p2"]);
});

test("only drawing appends the pointer-up point to a brush stroke", () => {
    assert.equal(shouldAppendFinalBrushPoint("draw-brush"), true);
    assert.equal(shouldAppendFinalBrushPoint("move"), false);
    assert.equal(shouldAppendFinalBrushPoint("resize"), false);
});

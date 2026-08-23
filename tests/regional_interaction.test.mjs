import assert from "node:assert/strict";
import test from "node:test";
import { addGeometryLayerTarget, regionsInPaintOrder, regionsInPriorityOrder, shouldAppendFinalBrushPoint, shouldClosePolygon, shouldStartSelectionMove, synchronizeRegionPriorities } from "../ui/src/regional/interaction.ts";
import { mergeSelectedLayers, selectLayers, splitCompoundLayer } from "../ui/src/regional/layerOperations.ts";
import { connectedAreas } from "../ui/src/regional/connectedComponents.ts";

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

test("polygon closes when a later click returns to its first point", () => {
    const first = { x: 120, y: 80 };
    assert.equal(shouldClosePolygon(3, first, { x: 126, y: 86 }), true);
    assert.equal(shouldClosePolygon(3, first, { x: 140, y: 80 }), false);
    assert.equal(shouldClosePolygon(2, first, first), false);
});

test("add geometry extends the selected editable layer regardless of its existing geometry type", () => {
    const layer = { id: "brush-layer", enabled: true, authoring: { locked: false }, geometries: [{ type: "brush_stroke" }] };
    assert.equal(addGeometryLayerTarget(layer), "brush-layer");
    assert.equal(addGeometryLayerTarget({ id: "rectangle-layer", enabled: true, authoring: { locked: false }, geometries: [{ type: "rect" }] }), "rectangle-layer");
});

test("add geometry creates a layer when the selection cannot be extended", () => {
    assert.equal(addGeometryLayerTarget(null), null);
    assert.equal(addGeometryLayerTarget({ id: "locked", enabled: true, authoring: { locked: true }, geometries: [{ type: "brush_stroke" }] }), null);
    assert.equal(addGeometryLayerTarget({ id: "disabled", enabled: false, authoring: { locked: false }, geometries: [{ type: "brush_stroke" }] }), null);
});

test("layer selection supports toggle and visual range selection", () => {
    const order = ["top", "middle", "bottom"];
    const first = selectLayers({ ids: [], primary: null, anchor: null }, "top", order, "replace");
    const toggled = selectLayers(first, "bottom", order, "toggle");
    assert.deepEqual(toggled.ids, ["top", "bottom"]);
    const range = selectLayers(first, "bottom", order, "range");
    assert.deepEqual(range.ids, ["top", "middle", "bottom"]);
    assert.equal(range.primary, "bottom");
});

test("merge preserves original mask groups while creating one compound editor layer", () => {
    const region = { geometry: [
        { id: "add-a", layer_id: "layer-a", type: "rect", operation: "add", authoring: { name: "A", visible: true, locked: false } },
        { id: "cut-a", layer_id: "layer-a", type: "rect", operation: "subtract", authoring: { name: "A", visible: true, locked: false } },
        { id: "add-b", layer_id: "layer-b", type: "brush_stroke", operation: "add", authoring: { name: "B", visible: true, locked: false } },
    ] };
    assert.equal(mergeSelectedLayers(region, ["layer-a", "layer-b"], "layer-b"), true);
    assert.deepEqual(region.geometry.map(item => item.layer_id), ["layer-b", "layer-b", "layer-b"]);
    assert.deepEqual(region.geometry.map(item => item.mask_group_id), ["layer-a", "layer-a", "layer-b"]);
    assert.deepEqual(region.geometry.map(item => item.authoring.name), ["B", "B", "B"]);
});

test("split compound layer restores independent editable layers without changing operations", () => {
    const region = { geometry: [
        { id: "add-a", layer_id: "compound", mask_group_id: "group-a", operation: "add", authoring: { name: "Combined", visible: true, locked: false } },
        { id: "cut-a", layer_id: "compound", mask_group_id: "group-a", operation: "subtract", authoring: { name: "Combined", visible: true, locked: false } },
        { id: "add-b", layer_id: "compound", mask_group_id: "group-b", operation: "add", authoring: { name: "Combined", visible: true, locked: false } },
    ] };
    const ids = ["split-a", "split-b"];
    assert.deepEqual(splitCompoundLayer(region, "compound", () => ids.shift()), ["split-a", "split-b"]);
    assert.deepEqual(region.geometry.map(item => item.layer_id), ["split-a", "split-a", "split-b"]);
    assert.deepEqual(region.geometry.map(item => item.mask_group_id), [undefined, undefined, undefined]);
    assert.deepEqual(region.geometry.map(item => item.authoring.name), ["Combined 1", "Combined 1", "Combined 2"]);
});

test("connected areas separates two brush islands but keeps diagonal pixels together", () => {
    const alpha = new Uint8ClampedArray([
        255, 0, 0, 255,
        0, 255, 0, 255,
        0, 0, 0, 0,
    ]);
    const result = connectedAreas(alpha, 4, 3);
    assert.equal(result.areas.length, 2);
    assert.deepEqual(result.areas.map(area => ({ x: area.x, y: area.y, width: area.width, height: area.height, pixels: area.pixels })), [
        { x: 0, y: 0, width: 2, height: 2, pixels: 2 },
        { x: 3, y: 0, width: 1, height: 2, pixels: 2 },
    ]);
});

test("connected areas ignores an effectively invisible antialiasing bridge", () => {
    const alpha = new Uint8ClampedArray([255, 255, 1, 255, 255]);
    const result = connectedAreas(alpha, 5, 1);
    assert.equal(result.areas.length, 2);
    assert.deepEqual(result.areas.map(area => area.pixels), [2, 2]);
});

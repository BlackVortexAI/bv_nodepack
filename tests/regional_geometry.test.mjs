import assert from "node:assert/strict";
import test from "node:test";
import { boundsOf, hitTest, moveGeometry, setBounds } from "../ui/src/regional/geometry.ts";

const point = (x, y) => ({ x, y, pressure: 1 });

test("ellipse hit testing uses the ellipse rather than its bounding box", () => {
    const ellipse = { id: "ellipse", type: "ellipse", operation: "add", x: .2, y: .2, width: .6, height: .4 };
    assert.equal(hitTest(ellipse, point(.5, .4)), true);
    assert.equal(hitTest(ellipse, point(.21, .21)), false);
});

test("polygon supports bounds, point-in-polygon hit testing, move, and resize", () => {
    const polygon = { id: "polygon", type: "polygon", operation: "add", points: [point(.2, .2), point(.8, .2), point(.5, .8)] };
    assert.deepEqual(boundsOf(polygon), { x: .2, y: .2, width: .6000000000000001, height: .6000000000000001 });
    assert.equal(hitTest(polygon, point(.5, .4)), true);
    assert.equal(hitTest(polygon, point(.1, .1)), false);
    assert.deepEqual(moveGeometry(polygon, -.5, 0).points.map(({ x, y }) => ({ x, y })), [{ x: 0, y: .2 }, { x: .6000000000000001, y: .2 }, { x: .3, y: .8 }]);
    const resized = setBounds(polygon, { x: .1, y: .1, width: .3, height: .3 });
    assert.deepEqual(boundsOf(resized), { x: .1, y: .1, width: .30000000000000004, height: .30000000000000004 });
});

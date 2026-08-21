import assert from "node:assert/strict";
import test from "node:test";
import { visibleExternalDetectorSlots } from "../ui/src/regional/detectorExternalInputs.ts";

test("external detector inputs start with one free slot", () => {
    assert.deepEqual(visibleExternalDetectorSlots([]), [1]);
});

test("connecting a slot exposes exactly the next slot", () => {
    assert.deepEqual(visibleExternalDetectorSlots([1]), [1, 2]);
    assert.deepEqual(visibleExternalDetectorSlots([1, 2, 3]), [1, 2, 3, 4]);
});

test("external detector inputs retain gaps required by later connections and cap at ten", () => {
    assert.deepEqual(visibleExternalDetectorSlots([1, 3]), [1, 2, 3, 4]);
    assert.equal(visibleExternalDetectorSlots([10]).length, 10);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
    DETAILER_UI_NODES,
    detailerUiLabel,
} from "../ui/src/regional/detailerLoopUi.ts";

test("detailer UI uses consistent human-readable connector terminology", () => {
    assert.equal(detailerUiLabel("BV Detailer Loop Start", "detailer_plan"), "detailer plan");
    assert.equal(detailerUiLabel("BV Detailer Loop Job Resolver", "detailer_plan"), "detailer plan");
    assert.equal(detailerUiLabel("BV Detailer Loop End", "detailer_plan"), "detailer plan");
    assert.equal(detailerUiLabel("BV Detailer Loop Detect to SEGS (Impact)", "detector_registry"), "detector registry");
    assert.equal(detailerUiLabel("BV Detailer Loop Detect to SEGS (Impact)", "segs"), "SEGS");
    assert.equal(detailerUiLabel("BV Detector Binding", "bbox_detector"), "BBOX detector");
    assert.ok(DETAILER_UI_NODES.has("BV Regional Detailer Mask"));
});

test("LUT Loop Start identifies both accepted plan sources", () => {
    assert.equal(detailerUiLabel("BV LUT Loop Start", "plan"), "regional or lut_plan");
});

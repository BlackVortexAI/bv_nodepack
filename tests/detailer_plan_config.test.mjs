import assert from "node:assert/strict";
import test from "node:test";
import { defaultDetailerPlan, parseDetailerPlanConfig, serializeDetailerPlanConfig } from "../ui/src/regional/detailerPlanConfig.ts";

const regions = [
    { id: "gen", name: "Generation", enabled: true, usage: "generation", priority: 0 },
    { id: "eyes", name: "Eyes", enabled: true, usage: "detailer", priority: 2 },
    { id: "face", name: "Face", enabled: true, usage: "both", priority: 1 },
    { id: "off", name: "Off", enabled: false, usage: "detailer", priority: 0 },
];

test("default plan creates ordered jobs for enabled detailer consumers only", () => {
    const plan = defaultDetailerPlan(regions);
    assert.deepEqual(plan.jobs.map(job => job.region_ids), [["face"], ["eyes"]]);
});

test("configured plan preserves grouping and detector assignment", () => {
    const plan = parseDetailerPlanConfig(JSON.stringify({ jobs: [{
        region_ids: ["face", "eyes"], primary_region_id: "eyes",
        mask_composition: "intersection", prompt_composition: "primary", detector_id: "eyes-v8",
    }] }), regions);
    assert.deepEqual(plan.jobs[0], {
        region_ids: ["face", "eyes"], primary_region_id: "eyes",
        mask_composition: "intersection", prompt_composition: "primary", detector_id: "eyes-v8",
        conditioning: { global_influence: 1, background_influence: 0.35, primary_region_influence: 1, context_region_influence: 1 },
        detector: { roi_padding: 0.15, threshold: 0.5, dilation: 0, crop_factor: 1.5, drop_size: 10 },
    });
    assert.equal(JSON.parse(serializeDetailerPlanConfig(plan)).schema, "bv.detailer_plan");
});

test("plan preserves bounded conditioning and detector settings", () => {
    const plan = parseDetailerPlanConfig(JSON.stringify({ jobs: [{
        region_ids: ["face"], conditioning: { global_influence: 1.2, background_influence: 0.2, primary_region_influence: 1.4, context_region_influence: 0.75 },
        detector: { roi_padding: 0.25, threshold: 0.65, dilation: 4, crop_factor: 2, drop_size: 16, query: "eyes", labels: ["eye"] },
    }] }), regions);
    assert.equal(plan.jobs[0].conditioning.primary_region_influence, 1.4);
    assert.deepEqual(plan.jobs[0].detector, { roi_padding: 0.25, threshold: 0.65, dilation: 4, crop_factor: 2, drop_size: 16, query: "eyes", labels: ["eye"] });
});

test("plan drops unavailable regions and repairs its primary region", () => {
    const plan = parseDetailerPlanConfig(JSON.stringify({ jobs: [{
        region_ids: ["gen", "eyes", "missing"], primary_region_id: "missing",
    }] }), regions);
    assert.deepEqual(plan.jobs[0].region_ids, ["eyes"]);
    assert.equal(plan.jobs[0].primary_region_id, "eyes");
});

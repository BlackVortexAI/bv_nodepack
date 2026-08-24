import assert from "node:assert/strict";
import test from "node:test";
import {resourcePickerOptions} from "../ui/src/ui/components/ResourcePicker.tsx";
import {reconcileDetailerEasyConfig} from "../ui/src/regional/detailerEasyMode.tsx";

test("detailer resources use one choice and disambiguate duplicate names only",()=>{
 const options=resourcePickerOptions([
  {id:"registry-a",label:"Registry #10",resources:[{id:"face",label:"Face"},{id:"hand",label:"Hand"}]},
  {id:"registry-b",label:"Registry #20",resources:[{id:"face-2",label:"Face"}]},
 ]);
 assert.deepEqual(options.map(item=>item.label),["Face · Registry #10","Hand","Face · Registry #20"]);
 assert.deepEqual(options[2],{value:JSON.stringify(["registry-b","face-2"]),collectorId:"registry-b",resourceId:"face-2",label:"Face · Registry #20"});
});

test("Regional Prompt easy mode keeps exactly one stable job per eligible region",()=>{
 const regions=[{id:"face",name:"Face",usage:"both"},{id:"hand",name:"Hand",usage:"detailer"},{id:"body",name:"Body",usage:"generation"}];
 const existing={version:1,jobs:[{id:"face-job",region_ids:["face"],primary_region_id:"face",mask_composition:"union",prompt_composition:"context",conditioning:{global_influence:1,background_influence:.35,primary_region_influence:1,context_region_influence:1},detector_assignments:[]}]};
 const next=reconcileDetailerEasyConfig(existing,regions);
 assert.deepEqual(next.jobs.map(job=>job.region_ids),[["face"],["hand"]]);
 assert.equal(next.jobs[0],existing.jobs[0]);
 assert.equal(next.jobs[1].detector_assignments.length,0);
});

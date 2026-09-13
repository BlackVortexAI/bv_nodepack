import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateRegionalNode} from '../ui/src/regional/milestoneE.ts';
import {reconcileDetailerEasyConfig} from '../ui/src/regional/detailerEasyMode.tsx';
import {reconcileRegionalJobs,restoreRegionalJobs} from '../ui/src/regional/regionalJobConfig.ts';
import {parseDetailerPlanConfig} from '../ui/src/regional/detailerPlanConfig.ts';

const doc={schema:'bv.regional',version:2,document_id:'doc',title:'Test',canvas:{width:1024,height:1024},prompts:{global:{positive_source:'',negative_source:''},background:{positive_source:'',negative_source:''}},negative_mode:'auto',overlap:{mode:'joint'},regions:[]};
test('load repairs orphan LUT and detailer jobs while preserving global LUT',()=>{
 const node={widgets:[{name:'regional_json',value:JSON.stringify(doc)},{name:'lut_v3_config_json',value:JSON.stringify({version:1,jobs:[{id:'gone',scope:'regional',region_ids:['gone']},{id:'global',scope:'global',region_ids:[]}]})},{name:'detailer_v3_config_json',value:JSON.stringify({version:1,jobs:[{id:'gone',region_ids:['gone'],primary_region_id:'gone'}]})}]};
 assert.equal(migrateRegionalNode(node).error,undefined);
 assert.deepEqual(JSON.parse(node.widgets[1].value).jobs.map(j=>j.id),['global']);
 assert.deepEqual(JSON.parse(node.widgets[2].value).jobs,[]);
 assert.equal(migrateRegionalNode(node).migrated,false);
});
test('easy mode retains a configured multi-region detailer job',()=>{
 const job={id:'shared',region_ids:['a','b'],primary_region_id:'a',detector_assignments:[{id:'one'},{id:'two'}]};
 const next=reconcileDetailerEasyConfig({version:1,jobs:[job]},[{id:'a',usage:'both'},{id:'b',usage:'detailer'}]);
 assert.deepEqual(next.jobs,[job]);
});

test('multi-region cleanup preserves settings, disabled regions, order and all detector assignments',()=>{
 const source={version:1,jobs:[{id:'mixed',region_ids:['gone','kept'],primary_region_id:'gone',mask_composition:'subtract',detector_assignments:[{id:'a'},{id:'b'}]},{id:'global',scope:'global',region_ids:[],strength:.7}]};
 const next=reconcileRegionalJobs(source,{...doc,regions:[{id:'kept',enabled:false}]});
 assert.deepEqual(next.jobs[0],{...source.jobs[0],region_ids:['kept'],primary_region_id:'kept'});
 assert.deepEqual(next.jobs[1],source.jobs[1]);assert.deepEqual(source.jobs[0].region_ids,['gone','kept']);
});

test('Undo revives memberships and job order while keeping subsequent tool edits',()=>{
 const before={...doc,regions:[{id:'gone'},{id:'kept'}]},after={...doc,regions:[{id:'kept'}]};
 const saved={lut_v3_config_json:{version:1,jobs:[{id:'only',scope:'regional',region_ids:['gone'],strength:.3},{id:'shared',scope:'regional',region_ids:['gone','kept'],strength:.4},{id:'global',scope:'global',region_ids:[],strength:.5}]},detailer_v3_config_json:{version:1,jobs:[{id:'detail',region_ids:['gone','kept'],primary_region_id:'gone',detector_assignments:[{id:'old'}]}]}};
 const current=Object.fromEntries(Object.entries(saved).map(([key,value])=>[key,reconcileRegionalJobs(value,after)]));
 current.lut_v3_config_json.jobs[0].strength=.9;current.detailer_v3_config_json.jobs[0].detector_assignments=[{id:'new'}];
 assert.deepEqual(restoreRegionalJobs(current,after,after,saved),current,'prompt-only Undo preserves tool edits');
 const restored=restoreRegionalJobs(current,after,before,saved);
 assert.deepEqual(restored.lut_v3_config_json.jobs.map(j=>j.id),['only','shared','global']);
 assert.equal(restored.lut_v3_config_json.jobs[1].strength,.9);
 assert.deepEqual(restored.detailer_v3_config_json.jobs[0].detector_assignments,[{id:'new'}]);
 assert.equal(restored.detailer_v3_config_json.jobs[0].primary_region_id,'gone');
 assert.deepEqual(restoreRegionalJobs(restored,before,after,current),current);
});

test('invalid job sidecar prevents partial migration; references are never catalog-pruned',()=>{
 const reference={collector_id:'disconnected',resource_id:'vacant',role:'source'};
 const original={...doc,reference_images:[reference]};
 const widgets=[{name:'regional_json',value:JSON.stringify(original)},{name:'lut_v3_config_json',value:JSON.stringify({version:1,jobs:[{id:'gone',region_ids:['gone']}]})},{name:'detailer_v3_config_json',value:'{'},{name:'reference_v3_config_json',value:JSON.stringify({version:1,collector_ids:['disconnected']})}];
 const before=JSON.stringify(widgets);assert.ok(migrateRegionalNode({widgets}).error);assert.equal(JSON.stringify(widgets),before);
 widgets[2].value=JSON.stringify({version:1,jobs:[]});
 assert.equal(migrateRegionalNode({widgets}).error,undefined);
 assert.deepEqual(JSON.parse(widgets[0].value).reference_images,[reference]);
 assert.deepEqual(JSON.parse(widgets[3].value).collector_ids,['disconnected']);
});

test('detailer parse and save retains multi-region jobs with the supported single detector',()=>{
 const job={id:'job',region_ids:['a','b'],primary_region_id:'a',detector_assignments:[{id:'one',source:{collector_id:'c',resource_id:'one'},options:{}}]};
 const regions=[{id:'a',usage:'both'},{id:'b',usage:'both'}];
 const parsed=parseDetailerPlanConfig(JSON.stringify({version:1,jobs:[job]}),regions);
 assert.deepEqual(parsed.jobs[0].region_ids,['a','b']);assert.deepEqual(parsed.jobs[0].detector_assignments.map(a=>a.id),['one']);
 assert.deepEqual(parseDetailerPlanConfig(JSON.stringify(parsed),regions),parsed);
});

test('Undo of a partially deleted job never restores a primary outside its revived membership',()=>{
 const before={...doc,regions:[{id:'a'},{id:'b'}]},after={...doc,regions:[{id:'b'}]};
 const saved={detailer_v3_config_json:{version:1,jobs:[{id:'job',region_ids:['a','b'],primary_region_id:'b'}]}};
 const current={detailer_v3_config_json:{version:1,jobs:[]}};
 const result=restoreRegionalJobs(current,after,before,saved);
 assert.deepEqual(result.detailer_v3_config_json.jobs,[{id:'job',region_ids:['a'],primary_region_id:'a'}]);
});

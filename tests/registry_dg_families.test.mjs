import assert from 'node:assert/strict';
import test from 'node:test';
import {activateNewRegistryDgConsumer,restoreRegistryDgActivation,isRegistryDgPilot} from '../ui/src/regional/loraRegistryDgAdapter.ts';
import {registryChannelFamily,registryFamilyEnabled,enableRegistryFamily,uniqueWorkflowRegistry} from '../ui/src/regional/registryDgFamilies.ts';
import {prepareDgClipboard} from '../ui/src/regional/dgRouting.ts';
import {installRegistryDgLifecycle} from '../ui/src/regional/registryDgLifecycle.ts';

test('fresh family defaults never leak into legacy/V1 snapshots',()=>{
 for(const [type,families] of [['BV Regional Prompt',['lut','detailer']],['BV Regional LoRA',[]],['BV Regional LUT Plan',['lut']],['BV Regional Detailer Plan',['detailer']],['BV LUT Loop Start',['lut']]]){
  const node={type,properties:{kept:1}};activateNewRegistryDgConsumer(node);
  assert.deepEqual(node.properties.bvRegistryDgFamilies??[],families);
  const snapshot=structuredClone(node.properties);
  restoreRegistryDgActivation(node,{properties:{bvRegistryDgVersion:1}});
  assert.equal(registryFamilyEnabled(node,'lut'),false);assert.equal(registryFamilyEnabled(node,'detailer'),false);
  assert.equal(isRegistryDgPilot(node),true);
  restoreRegistryDgActivation(node,{properties:snapshot});assert.deepEqual(node.properties.bvRegistryDgFamilies??[],families);
  restoreRegistryDgActivation(node,{});assert.equal(node.properties.bvRegistryDgFamilies,undefined);assert.equal(node.properties.kept,1);
  enableRegistryFamily(node,'lut');enableRegistryFamily(node,'lut');assert.deepEqual(node.properties.bvRegistryDgFamilies??[],families.includes('lut')?['lut']:[]);
 }
 const prompt={type:'BV Regional Prompt'};
 assert.equal(registryChannelFamily(prompt,'lut_resource_provider_40'),'lut');
 assert.equal(registryChannelFamily(prompt,'lut_resource_provider_41'),null);
 assert.equal(registryChannelFamily(prompt,'detailer_resource_provider_20'),'detailer');
 assert.equal(registryChannelFamily(prompt,'external_detector_1'),null);
 assert.equal(registryChannelFamily(prompt,'resource_provider_1'),null);
});

test('catalog resolves family-scoped identities across instances with concrete ownership',()=>{
 const lut={type:'BV LUT Registry',widgets:[{name:'config_json',value:JSON.stringify({collector_id:'same'})}]};
 const detector={type:'BV Detector Registry',widgets:[{name:'config_json',value:JSON.stringify({collector_id:'same'})}]};
 const root={_nodes:[lut]},child={rootGraph:root,_nodes:[detector]};root._nodes.push({subgraph:child});
 const node={graph:{_nodes:[]},__bvConcreteGraph:child};
 assert.equal(uniqueWorkflowRegistry(node,'lut','same'),lut);assert.equal(uniqueWorkflowRegistry(node,'detector','same'),detector);
 child._nodes.push({...lut});assert.equal(uniqueWorkflowRegistry(node,'lut','same'),null);
 assert.equal(uniqueWorkflowRegistry(node,'detector','same'),detector);
});

test('plan lifecycle cancels stale creation/configure/remove work and restores only saved families',()=>{
 const pending=[],old=globalThis.queueMicrotask;globalThis.queueMicrotask=fn=>pending.push(fn);
 try {for(const type of ['BV Regional LUT Plan','BV Regional Detailer Plan','BV LUT Loop Start']){
  let prepared=0;class Node{}
  installRegistryDgLifecycle(Node,()=>prepared++);
  const node=Object.assign(new Node(),{type,properties:{},inputs:[]});
  node.onNodeCreated();const fresh=structuredClone(node.properties);
  node.__bvLutV3Scheduled=true;node.onConfigure({properties:{}});
  assert.equal(node.properties.bvRegistryDgFamilies,undefined);assert.equal(node.__bvLutV3Scheduled,false);
  pending.splice(0).forEach(fn=>fn());assert.equal(prepared,1);
  node.onConfigure({properties:fresh});node.onRemoved();pending.splice(0).forEach(fn=>fn());assert.equal(prepared,1);
  node.onAdded();pending.splice(0).forEach(fn=>fn());assert.equal(prepared,2);
  assert.deepEqual(node.properties.bvRegistryDgFamilies,fresh.bvRegistryDgFamilies);
 }}finally{globalThis.queueMicrotask=old}
});

test('composite clipboard remaps all Prompt families and preserves external and manual identities',()=>{
 const id=crypto.randomUUID(),resource=crypto.randomUUID();
 const provider=(type,transport,config)=>({type,properties:{bvDgSenderId:transport,bvRegistryDgSource:true,bvRegistryDgPilotSource:true},widgets_values:[JSON.stringify(config)]});
 const lora=provider('BV LoRA Registry','lora',{schema:'bv.lora_registry_config',version:1,registry_id:id,stacks:[{id:resource,name:'Stack',enabled:true,entries:[]}]});
 const lut=provider('BV LUT Registry','lut',{schema:'bv.lut_registry_config',version:1,collector_id:id,luts:[{id:'warm',lut_name:'Built-in: Warm Contrast'}]});
 const detector=provider('BV Detector Registry','detector',{schema:'bv.detector_registry_config',version:2,collector_id:id,detectors:[{id:'face',provider:'ultralytics',model_name:'bbox/face.pt'}]});
 detector.inputs=[{name:'external_detector_1',type:'BV_DETECTOR',link:90}];
 const prompt={type:'BV Regional Prompt',properties:{bvRegistryDgVersion:1,bvRegistryDgFamilies:['lut','detailer'],bvLoraDgSelections:{resource_provider_1:'lora'},bvRegistryDgSelections:{lut_resource_provider_1:'lut',lut_resource_provider_2:'detector',detailer_resource_provider_1:'detector'},bvRegistryDgSourceKinds:{lut_resource_provider_1:'lut',lut_resource_provider_2:'detector',detailer_resource_provider_1:'detector'}},widgets_values:['','',JSON.stringify({version:3,entries:[{source:{kind:'external',collector_id:id,resource_id:resource}}]}),JSON.stringify({version:1,jobs:[{detector_assignments:[{source:{collector_id:id,resource_id:'face'}}]}]}),JSON.stringify({version:1,jobs:[{lut_source:{collector_id:id,resource_id:'warm'},detector_source:{collector_id:id,resource_id:'face'}},{lut_source:{collector_id:'external',resource_id:'keep'}}]})]};
 const original={nodes:[lora,lut,detector,prompt]},before=structuredClone(original),copy=prepareDgClipboard(original);
 const [l,c,d,p]=copy.nodes,lc=JSON.parse(l.widgets_values[0]),cc=JSON.parse(c.widgets_values[0]),dc=JSON.parse(d.widgets_values[0]);
 assert.equal(new Set([lc.registry_id,cc.collector_id,dc.collector_id,id]).size,4);
 assert.equal(JSON.parse(p.widgets_values[2]).entries[0].source.collector_id,lc.registry_id);
 assert.equal(JSON.parse(p.widgets_values[3]).jobs[0].detector_assignments[0].source.collector_id,dc.collector_id);
 const jobs=JSON.parse(p.widgets_values[4]).jobs;assert.equal(jobs[0].lut_source.collector_id,cc.collector_id);assert.equal(jobs[0].detector_source.collector_id,dc.collector_id);
 assert.equal(jobs[0].lut_source.resource_id,'warm');assert.equal(jobs[0].detector_source.resource_id,'face');assert.equal(jobs[1].lut_source.collector_id,'external');
 assert.equal(p.properties.bvRegistryDgSelections.lut_resource_provider_1,c.properties.bvDgSenderId);
 assert.deepEqual(d.inputs,detector.inputs);assert.deepEqual(original,before);
 const loop={type:'BV LUT Loop Start',properties:{bvRegistryDgFamilies:['lut'],bvRegistryDgSelections:{resource_provider_1:'lut'},bvRegistryDgSourceKinds:{resource_provider_1:'lut'}}};
 const loopCopy=prepareDgClipboard({nodes:[lut,loop]});assert.equal(loopCopy.nodes[1].properties.bvRegistryDgSelections,undefined,'inherited plan config, not a copied transport selection, drives the loop');
 assert.throws(()=>prepareDgClipboard({nodes:[lut,{...structuredClone(lut),properties:{bvRegistryDgSource:true,bvDgSenderId:'other'}}]}),/ambiguous copied domain/);
});

test('copying unrelated legacy configs is byte-preserving, even when empty or malformed',()=>{
 for(const value of ['{}','not-json','']){
  const original={nodes:[{type:'BV Regional LUT Plan',widgets_values:[value]},{type:'BV Regional Detailer Plan',widgets_values:[value]},{type:'BV Regional Prompt',widgets_values:['','',value,value,value]}]};
  assert.deepEqual(prepareDgClipboard(original),original);
 }
});

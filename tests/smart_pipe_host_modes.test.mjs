import test from 'node:test';
import assert from 'node:assert/strict';
import {promptModeState,materializeAddressedPipeLinks,prunePromptBranches,effectiveSmartPipeEdges} from '../js/bv_smart_pipe_routing.js';

const descriptor=(id,ancestorModes=[],predecessorId=null)=>({address:id,executionId:id,kind:'pipe',node:{mode:0},ancestorModes,route:{nodeId:id,predecessorId}});
const pipe=()=>({class_type:'BV Smart Pipe',inputs:{}});
for(const mode of [0,2,4])test(`nested host mode ${mode} preserves independent execution and effective DG`,()=>{
 const descriptors=[descriptor('base'),descriptor('inner',[0,mode]),descriptor('receiver'),descriptor('independent')];
 const registry={inner:{predecessorAddress:'base'},receiver:{predecessorAddress:'inner'}},before=JSON.stringify(registry);
 const prompt={base:pipe(),receiver:pipe(),preview:{class_type:'PreviewAny',inputs:{source:['receiver',0]}},independent:pipe()};
 if(mode===0)prompt.inner=pipe();
 const state=promptModeState(descriptors,registry),addresses=Object.fromEntries(descriptors.map(d=>[d.executionId,d.address]));
 materializeAddressedPipeLinks(prompt,addresses,registry,state);prunePromptBranches(prompt,state.prunedExecutionIds);
 assert.ok(prompt.independent);
 if(mode===2){assert.equal(prompt.receiver,undefined);assert.equal(prompt.preview,undefined);assert.deepEqual(effectiveSmartPipeEdges(prompt,descriptors),[]);}
 else{assert.deepEqual(prompt.receiver.inputs.pipe,[mode===4?'base':'inner',0]);assert.ok(effectiveSmartPipeEdges(prompt,descriptors).some(e=>e.target==='receiver'&&e.source===(mode===4?'base':'inner')));}
 assert.equal(JSON.stringify(registry),before);assert.ok(descriptors.every(d=>d.node.mode===0));
});
test('multiple bypassed ancestors resolve a real external source and reject cycles or autonomous sources',()=>{
 const descriptors=[descriptor('base'),descriptor('one',[4]),descriptor('two',[4,4]),descriptor('receiver')];
 const addresses=Object.fromEntries(descriptors.map(d=>[d.executionId,d.address]));
 for(const registry of [{one:{predecessorAddress:'base'},two:{predecessorAddress:'one'},receiver:{predecessorAddress:'two'}},{one:{predecessorAddress:'two'},two:{predecessorAddress:'one'},receiver:{predecessorAddress:'two'}},{receiver:{predecessorAddress:'two'}}]){
  const prompt={base:pipe(),receiver:pipe()},run=()=>materializeAddressedPipeLinks(prompt,addresses,registry,promptModeState(descriptors,registry));
  if(registry.one?.predecessorAddress==='base'){run();assert.deepEqual(prompt.receiver.inputs.pipe,['base',0]);}
  else assert.throws(run,/Bypass cycle|no predecessor/);
 }
});
test('physical bypass source wins over stale wireless selection and unresolved physical source fails closed',()=>{
 const descriptors=[descriptor('physical'),descriptor('stale'),descriptor('inner',[4]),descriptor('receiver')],registry={inner:{predecessorAddress:'stale'},receiver:{predecessorAddress:'inner'}};
 const addresses=Object.fromEntries(descriptors.map(d=>[d.executionId,d.address]));
 descriptors[2].physicalPredecessorAddress='physical';
 const prompt={physical:pipe(),stale:pipe(),receiver:pipe()};
 materializeAddressedPipeLinks(prompt,addresses,registry,promptModeState(descriptors,registry));assert.deepEqual(prompt.receiver.inputs.pipe,['physical',0]);
 descriptors[2].physicalPredecessorAddress=null;
 assert.throws(()=>materializeAddressedPipeLinks({receiver:pipe()},addresses,registry,promptModeState(descriptors,registry)),/no predecessor/);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {register} from 'node:module';
register(new URL('./fixtures/comfy_source_loader.mjs',import.meta.url));
const {installLoraV3Ui}=await import('../ui/src/regional/loraV3Ui.tsx');
const {isRegistryDgPilot}=await import('../ui/src/regional/loraRegistryDgAdapter.ts');
const {queueDgUpgrade,scheduleDgUpgrade}=await import('../ui/src/regional/dgRouting.ts');

test('real consumer lifecycle enables fresh nodes but never leaks defaults into legacy snapshots',()=>{
 const micro=[],timers=[],oldMicro=globalThis.queueMicrotask,oldTimeout=globalThis.setTimeout;
 globalThis.queueMicrotask=fn=>micro.push(fn);globalThis.setTimeout=fn=>timers.push(fn);
 try{for(const type of ['BV Regional Prompt','BV Regional LoRA']){
  let created=0,configured=0,added=0;
  class Node{onNodeCreated(){created++;return 41}onConfigure(){configured++;return 42}onAdded(){added++;return 43}}
  installLoraV3Ui(Node,{name:type});
  const node=new Node();Object.assign(node,{type,properties:{kept:true},inputs:[{name:'ordinary',link:7}],outputs:[],widgets:[]});
  assert.equal(node.onNodeCreated(),41);assert.equal(created,1);assert.equal(node.properties.bvRegistryDgVersion,1);assert.equal(isRegistryDgPilot(node),true);
  const saved=structuredClone(node.properties);let stale=0;
  queueDgUpgrade(node,()=>stale++);scheduleDgUpgrade(node,()=>stale++);
  node.__bvLoraPendingConfig={stale:true};node.__bvLoraReconcileScheduled=true;
  const legacy={properties:{kept:true}},before=structuredClone(legacy);
  Object.assign(node.properties,legacy.properties); // native configure merges before callback
  assert.equal(node.onConfigure(legacy),42);assert.equal(configured,1);
  assert.equal(isRegistryDgPilot(node),false);assert.equal(node.properties.bvRegistryDgVersion,undefined);
  assert.equal(node.__bvLoraPendingConfig,undefined);assert.equal(node.__bvLoraReconcileScheduled,false);
  assert.deepEqual(node.inputs,[{name:'ordinary',link:7}]);assert.deepEqual(legacy,before);
  // Run creation and deliberately scheduled old work, not the new upgrade task.
  micro.splice(0,micro.length-1).forEach(fn=>fn());timers.splice(0).forEach(fn=>fn());assert.equal(stale,0);
  assert.equal(node.onAdded(),43);assert.equal(added,1);assert.equal(isRegistryDgPilot(node),false);
  node.onConfigure({properties:saved});assert.equal(node.properties.bvRegistryDgVersion,1);
  node.onConfigure();assert.equal(node.properties.bvRegistryDgVersion,1);
  node.onConfigure({});assert.equal(isRegistryDgPilot(node),false);
  node.onConfigure({properties:{bvRegistryDgVersion:2}});assert.equal(isRegistryDgPilot(node),false);assert.equal(node.properties.bvRegistryDgVersion,2);
  node.onConfigure({properties:{bvRegistryDgPilot:true}});assert.equal(isRegistryDgPilot(node),true);
  node.onConfigure({properties:{bvLoraDgSelections:{resource_provider_1:'stable'}}});assert.equal(isRegistryDgPilot(node),true);
  node.onConfigure({properties:{}});assert.equal(isRegistryDgPilot(node),false);
  micro.length=timers.length=0;
 }}finally{globalThis.queueMicrotask=oldMicro;globalThis.setTimeout=oldTimeout}
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {parseModelPatcherConfig} from '../ui/src/regional/modelPatcherConfig.ts';
import {strictLoraRegistryConfig,parseLoraRegistryConfig} from '../ui/src/regional/loraRegistryConfig.ts';
import {loraRegistryResources} from '../ui/src/regional/loraV3Graph.ts';
import {activateNewRegistryDgConsumer} from '../ui/src/regional/loraRegistryDgAdapter.ts';
import {registryChannelFamily,registryKindAllowed} from '../ui/src/regional/registryDgFamilies.ts';
import {prepareDgClipboard} from '../ui/src/regional/dgRouting.ts';

test('basis role survives parsing and is excluded from regular picker',()=>{
 const config={schema:'bv.lora_registry_config',version:1,registry_id:crypto.randomUUID(),stacks:[{id:crypto.randomUUID(),name:'Base',role:'basis',enabled:true,entries:[]},{id:crypto.randomUUID(),name:'Style',enabled:true,entries:[]}]};
 assert.equal(strictLoraRegistryConfig(config).stacks[0].role,'basis');
 assert.equal('role' in parseLoraRegistryConfig(config).stacks[1],false);
 assert.deepEqual(loraRegistryResources({type:'BV LoRA Registry',widgets:[{name:'config_json',value:JSON.stringify(config)}]}).map(x=>x.label),['Style']);
 config.stacks[0].role='bad';assert.equal(strictLoraRegistryConfig(config),null);
});
test('basis family is confined to model patcher and LoRA registries',()=>{
 const node={type:'BV Model Patcher'};activateNewRegistryDgConsumer(node);
 assert.deepEqual(node.properties.bvRegistryDgFamilies,['basis']);
 assert.equal(registryChannelFamily(node,'base_resource_provider_20'),'basis');
 assert.equal(registryChannelFamily(node,'base_resource_provider_21'),null);
 assert.equal(registryKindAllowed('basis','lora'),true);assert.equal(registryKindAllowed('basis','reference'),false);
});
test('patcher clipboard remaps copied Registry and preserves external selection/order',()=>{
 const id=crypto.randomUUID(),external=crypto.randomUUID();
 const registry={type:'BV LoRA Registry',properties:{bvDgSenderId:'sender',bvRegistryDgSource:true},widgets_values:[JSON.stringify({schema:'bv.lora_registry_config',version:1,registry_id:id,stacks:[{id:crypto.randomUUID(),name:'Base',role:'basis',enabled:true,entries:[]}]})]};
 const patcher={type:'BV Model Patcher',properties:{bvRegistryDgFamilies:['basis'],bvRegistryDgSelections:{base_resource_provider_1:'sender'},bvRegistryDgSourceKinds:{base_resource_provider_1:'lora'}},widgets_values:[JSON.stringify({version:1,collector_ids:[external,id]})]};
 const original={nodes:[registry,patcher]},before=structuredClone(original),copy=prepareDgClipboard(original);
 const newId=JSON.parse(copy.nodes[0].widgets_values[0]).registry_id;
 assert.notEqual(newId,id);assert.deepEqual(JSON.parse(copy.nodes[1].widgets_values[0]).collector_ids,[external,newId]);
 assert.deepEqual(original,before);
 assert.deepEqual(JSON.parse(prepareDgClipboard({nodes:[patcher]}).nodes[0].widgets_values[0]).collector_ids,[external,id]);
});
test('selection rejects duplicates and retains order',()=>{
 const ids=[crypto.randomUUID(),crypto.randomUUID()];
 assert.deepEqual(parseModelPatcherConfig({version:1,collector_ids:ids}).collector_ids,ids);
 assert.throws(()=>parseModelPatcherConfig({version:1,collector_ids:[ids[0],ids[0]]}));
});

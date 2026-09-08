import assert from 'node:assert/strict';
import test from 'node:test';
import {strictLoraRegistryConfig,parseLoraRegistryConfig} from '../ui/src/regional/loraRegistryConfig.ts';
import {loraRegistryResources} from '../ui/src/regional/loraV3Graph.ts';
import {activateNewRegistryDgConsumer} from '../ui/src/regional/loraRegistryDgAdapter.ts';
import {registryChannelFamily,allowedRegistryFamilies} from '../ui/src/regional/registryDgFamilies.ts';

test('basis role survives parsing and is excluded from regular picker',()=>{
 const config={schema:'bv.lora_registry_config',version:1,registry_id:crypto.randomUUID(),stacks:[{id:crypto.randomUUID(),name:'Base',role:'basis',enabled:true,entries:[]},{id:crypto.randomUUID(),name:'Style',enabled:true,entries:[]}]};
 assert.equal(strictLoraRegistryConfig(config).stacks.find(stack=>stack.name==='Base').role,'basis');
 assert.equal('role' in parseLoraRegistryConfig(config).stacks.find(stack=>stack.name==='Style'),false);
 assert.deepEqual(loraRegistryResources({type:'BV LoRA Registry',widgets:[{name:'config_json',value:JSON.stringify(config)}]}).map(x=>x.label),['Style']);
 config.stacks[0].role='bad';assert.equal(strictLoraRegistryConfig(config),null);
});
test('unpublished model patcher has no Registry transport ownership',()=>{
 const node={type:'BV Model Patcher'};activateNewRegistryDgConsumer(node);
 assert.deepEqual(allowedRegistryFamilies(node),[]);
 assert.equal(node.properties?.bvRegistryDgFamilies,undefined);
 assert.equal(registryChannelFamily(node,'base_resource_provider_1'),null);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {parseLoraV3Config, serializeLoraV3Config, loraV3CollectorIds} from '../ui/src/regional/loraV3Config.ts';
import {prepareDgClipboard} from './fixtures/dgCanaryPrototype.ts';
import '../ui/src/regional/loraRegistryDgAdapter.ts';

test('explicit registry binding survives repeated normalization and manual entry removal',()=>{
 const explicit=crypto.randomUUID(),manual=crypto.randomUUID();
 let config={version:3,registry_ids:[explicit],entries:[{id:crypto.randomUUID(),source:{kind:'external',collector_id:manual,resource_id:crypto.randomUUID()},targets:[{scope:'global'}]}],steps:[]};
 config=parseLoraV3Config(config);
 const saved=serializeLoraV3Config(config);
 for(let i=0;i<5;i++)config=parseLoraV3Config(serializeLoraV3Config(config));
 assert.equal(serializeLoraV3Config(config),saved);
 assert.deepEqual(loraV3CollectorIds(config),[explicit,manual]);
 assert.deepEqual(loraV3CollectorIds({...config,entries:[]}),[explicit]);
 assert.deepEqual(loraV3CollectorIds({...config,registry_ids:[],entries:[]}),[]);
 assert.deepEqual(loraV3CollectorIds({...config,registry_ids:[manual]}),[manual]);
});

for(const placement of ['root','nested','shared-definition'])test(`registry-only clipboard remaps copied domain and preserves external IDs (${placement})`,()=>{
 const rid=crypto.randomUUID(),external=crypto.randomUUID();
 const registry={id:1,type:'BV LoRA Registry',properties:{bvDgSenderId:'transport',bvRegistryDgPilotSource:true},widgets_values:[JSON.stringify({schema:'bv.lora_registry_config',version:1,registry_id:rid,stacks:[]})]};
 const config={version:3,entries:[],steps:[],registry_ids:[rid,external]};
 const receiver={id:2,type:'BV Regional LoRA',properties:{bvRegistryDgPilot:true,bvLoraDgSelections:{resource_provider_1:'transport'}},widgets_values:['merge',JSON.stringify(config)]};
 const original=placement==='root'?{nodes:[registry,receiver]}:{nodes:[receiver,...(placement==='shared-definition'?[{id:10,type:'Subgraph',subgraphId:'shared'},{id:11,type:'Subgraph',subgraphId:'shared'}]:[])],subgraphs:[{id:'shared',nodes:[registry]}]};
 const before=structuredClone(original),copied=prepareDgClipboard(original);
 const copiedRegistry=placement==='root'?copied.nodes[0]:copied.subgraphs[0].nodes[0];
 const copiedReceiver=placement==='root'?copied.nodes[1]:copied.nodes[0];
 const nextRegistry=JSON.parse(copiedRegistry.widgets_values[0]),nextConfig=JSON.parse(copiedReceiver.widgets_values[1]);
 assert.notEqual(nextRegistry.registry_id,rid);
 assert.deepEqual(nextConfig.registry_ids,[nextRegistry.registry_id,external]);
 assert.deepEqual(nextConfig.entries,[]);
 assert.deepEqual(original,before);
 const receiverOnly=prepareDgClipboard({nodes:[receiver]});
 assert.deepEqual(JSON.parse(receiverOnly.nodes[0].widgets_values[1]).registry_ids,[rid,external]);
});

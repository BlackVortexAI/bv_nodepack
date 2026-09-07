import assert from 'node:assert/strict';
import test from 'node:test';
import {regionalActiveTools} from '../ui/src/regional/regionalToolState.ts';
import {prepareCompositeRegistryClipboard} from '../ui/src/regional/registryDgClipboard.ts';
import {registryChannelFamily,allowedRegistryFamilies} from '../ui/src/regional/registryDgFamilies.ts';
import {sourceRegionalPrompt} from '../ui/src/regional/regionalSourceDocument.ts';

test('global reference switch preserves selection and is never a region tool',()=>{
 const source={collector_id:crypto.randomUUID(),resource_id:crypto.randomUUID(),role:'source'};
 const document={reference_images:[source],tool_settings:{references:true}};
 const tools=(region=null)=>regionalActiveTools(document,region,{entries:[]},{regions:{}},{jobs:[]});
 assert.deepEqual(tools(),['references']);
 document.tool_settings.references=false;assert.deepEqual(tools(),[]);
 assert.equal(document.reference_images[0],source);
 assert.deepEqual(tools({id:'r',tool_settings:{references:true}}),[]);
});

test('copying a reference registry and prompt remaps assignment collector but preserves logical slot',()=>{
 const collector_id=crypto.randomUUID(),resource_id=crypto.randomUUID();
 const registry={type:'BV Reference Registry',widgets_values:[JSON.stringify({schema:'bv.reference_registry_config',version:1,collector_id,entries:[{id:resource_id,slot:'media0'}]})]};
 const document={reference_images:[{collector_id,resource_id,role:'source'}],prompts:{},regions:[]};
 const prompt={type:'BV Regional Prompt',widgets_values:[JSON.stringify(document)]};
 prepareCompositeRegistryClipboard([registry,prompt]);
 const next=JSON.parse(prompt.widgets_values[0]).reference_images[0];
 assert.equal(next.collector_id,JSON.parse(registry.widgets_values[0]).collector_id);
 assert.notEqual(next.collector_id,collector_id);assert.equal(next.resource_id,resource_id);
});

test('Krea consumes reference family through actual Regional ancestry',()=>{
 const prompt={id:1,type:'BV Regional Prompt',outputs:[{type:'BV_REGIONAL',links:[3]}]};
 const graph={links:{3:{origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:'BV_REGIONAL'}},getNodeById:id=>id===1?prompt:null};
 const model={id:2,type:'BV Regional Krea 2 Attention',graph,inputs:[{name:'regional',type:'BV_REGIONAL',link:3}]};
 assert.equal(sourceRegionalPrompt(model),prompt);
 assert.deepEqual(allowedRegistryFamilies(model),['reference']);
 assert.equal(registryChannelFamily(model,'reference_resource_provider_1'),'reference');
 assert.equal(registryChannelFamily(model,'resource_provider_1'),null);
});

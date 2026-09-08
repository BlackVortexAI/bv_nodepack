import assert from 'node:assert/strict';
import test from 'node:test';
import {createLoraCatalogClient} from '../ui/src/regional/loraCatalogClient.ts';
import {catalogBackendUpdateRequired,loraRoutingPresentation} from '../ui/src/regional/loraCatalogPresentation.ts';
import {safeCivitaiUrl} from '../ui/src/regional/loraRegistryConfig.ts';

const oldItem={name:'synthetic.safetensors',display_name:'Synthetic',tags:[],trigger_words:[]};
const currentItem={...oldItem,civitai_url:null,compatibility:{status:'unknown',family:null,reason:'Adapter targets have not been verified.',target_model:'unknown'}};

test('old payload absence is a backend update state, not an unknown adapter claim',()=>{
 assert.equal(catalogBackendUpdateRequired([oldItem]),true);
 assert.equal(loraRoutingPresentation(oldItem),null);
 assert.equal(catalogBackendUpdateRequired([]),false);
});

test('present unknown evidence and absent Civitai attribution are valid current payload',()=>{
 assert.equal(catalogBackendUpdateRequired([currentItem]),false);
 const presentation=loraRoutingPresentation(currentItem);
 assert.ok(presentation);
 assert.equal(presentation.label,'Not checked');
 assert.match(presentation.description,/not been verified/i);
 assert.doesNotMatch(presentation.description,/backend.*update/i);
 assert.equal(safeCivitaiUrl(currentItem.civitai_url),null);
});

test('catalog fetch preserves compatibility and Civitai values including null',async()=>{
 const item={...currentItem,civitai_url:'https://civitai.com/models/123?modelVersionId=456',compatibility:{status:'token_candidate',family:'Krea 2',reason:'Candidate',target_model:'unknown'}};
 const client=createLoraCatalogClient(async()=>({ok:true,json:async()=>({schema:'bv.lora_catalog',version:1,items:[item,currentItem]})}));
 const result=await client.load({apiURL:path=>path});
 assert.deepEqual(result.items,[item,currentItem]);
 assert.equal(result.items[1].civitai_url,null);
 assert.equal(result.items[0].compatibility.target_model,'unknown');
});

test('frontend Civitai link rejects unsafe or download URLs but accepts proven model URL',()=>{
 for(const value of ['javascript:alert(1)','https://civitai.com.evil.test/models/1','https://evil.test@civitai.com/models/1','https://civitai.com/api/download/models/1','https://civitai.com:999/models/1','https://civitai.com/models/1\n'])assert.equal(safeCivitaiUrl(value),null);
 assert.equal(safeCivitaiUrl('https://civitai.com/models/123?modelVersionId=456'),'https://civitai.com/models/123?modelVersionId=456');
});

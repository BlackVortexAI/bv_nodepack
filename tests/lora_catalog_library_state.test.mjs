import assert from"node:assert/strict";
import test from"node:test";
import{clearLoraCatalogLibraryState,readLoraCatalogLibraryState,writeLoraCatalogLibraryState}from"../ui/src/regional/loraCatalogLibraryState.ts";

test("LoRA library session state survives close and reopen without entering registry config",()=>{
  const key=crypto.randomUUID();clearLoraCatalogLibraryState(key);
  const state=readLoraCatalogLibraryState(key);
  state.filters={...state.filters,query:"nyamena",directory:"Characters",baseModel:["Anima","Flux"],tag:["character","style"],type:["LoRA"],category:["Character"],author:["KurutAI"]};
  state.view="list";state.expanded=["","Characters"];state.selectedName="Characters/nyamena.safetensors";
  writeLoraCatalogLibraryState(key,state);
  const reopened=readLoraCatalogLibraryState(key);
  assert.deepEqual(reopened,state);
  reopened.filters.query="mutated copy";reopened.expanded.push("Other");
  assert.deepEqual(readLoraCatalogLibraryState(key),state);
  const registryJson=JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:key,stacks:[]});
  assert.doesNotMatch(registryJson,/nyamena|directory|selectedName|view/);
  clearLoraCatalogLibraryState(key);
  assert.equal(readLoraCatalogLibraryState(key).filters.query,"");
});

test("LoRA library migrates old scalar facet state into isolated arrays",()=>{
  const key=crypto.randomUUID();clearLoraCatalogLibraryState(key);
  writeLoraCatalogLibraryState(key,{filters:{query:"",directory:"",baseModel:"Anima",tag:"character",type:"LoRA",category:"",author:""},view:"grid",expanded:[""],selectedName:""});
  const migrated=readLoraCatalogLibraryState(key);
  assert.deepEqual(migrated.filters.baseModel,["Anima"]);
  assert.deepEqual(migrated.filters.tag,["character"]);
  assert.deepEqual(migrated.filters.category,[]);
  migrated.filters.baseModel.push("Flux");
  assert.deepEqual(readLoraCatalogLibraryState(key).filters.baseModel,["Anima"]);
});

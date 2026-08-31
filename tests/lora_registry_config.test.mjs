import assert from "node:assert/strict";
import test from "node:test";
import { createScrubSnapshotSession, numberScrubValue } from "../ui/src/ui/components/compactInteractions.ts";
import {
  activeLoraCount,
  applyEntryStrengthDelta,
  applyStackStrengthDelta,
  addLoraEntryToLatestStored,
  addLoraEntryToStack,
  clearLoraRegistryStacks,
  emptyLoraRegistryConfig,
  freshenLoraRegistryIdentities,
  loraRegistryIsEmptyActive,
  loraRegistryValidation,
  newLoraRegistryEntry,
  newLoraRegistryStack,
  moveLoraEntry,
  needsFreshLoraRegistryId,
  parseLoraRegistryConfig,
  readSharedStrength,
  searchLoraCatalog,
  serializeLoraRegistryConfig,
  shouldPersistNormalizedLoraConfig,
  strictLoraRegistryConfig,
  writeSharedStrength,
} from "../ui/src/regional/loraRegistryConfig.ts";

test("LoRA registry config preserves nested stack and entry identities",()=>{
  const value=emptyLoraRegistryConfig(),portrait=newLoraRegistryStack("Portrait"),style=newLoraRegistryStack("Style");
  portrait.entries.push(newLoraRegistryEntry("people/portrait.safetensors"));
  style.entries.push(newLoraRegistryEntry("styles/ink.safetensors"));
  style.entries[0].model_strength=.75;style.entries[0].clip_strength=.5;
  value.stacks.push(portrait,style);
  const parsed=parseLoraRegistryConfig(serializeLoraRegistryConfig(value));
  assert.equal(parsed.registry_id,value.registry_id);
  assert.deepEqual(parsed.stacks.map(stack=>stack.id),[portrait.id,style.id]);
  assert.equal(parsed.stacks[1].entries[0].id,style.entries[0].id);
  assert.equal(parsed.stacks[1].entries[0].model_strength,.75);
});

test("stable entry reorder preserves identity, data and serialization",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Order");
  const entries=["a","b","c"].map((name,index)=>{const entry=newLoraRegistryEntry(`${name}.safetensors`);entry.enabled=index!==1;entry.model_strength=.2+index;entry.clip_strength=.1+index;return entry});
  stack.entries=entries;value.stacks=[stack];
  const moved=moveLoraEntry(value,stack.id,entries[2].id,entries[0].id,"before");
  const parsed=parseLoraRegistryConfig(serializeLoraRegistryConfig(moved));
  assert.deepEqual(parsed.stacks[0].entries.map(entry=>entry.id),[entries[2].id,entries[0].id,entries[1].id]);
  assert.deepEqual(parsed.stacks[0].entries.map(({lora_name,enabled,model_strength,clip_strength})=>({lora_name,enabled,model_strength,clip_strength})),[
    {lora_name:"c.safetensors",enabled:true,model_strength:2.2,clip_strength:2.1},
    {lora_name:"a.safetensors",enabled:true,model_strength:.2,clip_strength:.1},
    {lora_name:"b.safetensors",enabled:false,model_strength:1.2,clip_strength:1.1},
  ]);
  assert.equal(moveLoraEntry(value,stack.id,crypto.randomUUID(),entries[0].id,"before"),value);
});

test("entry and stack strength deltas preserve mixed values including disabled entries",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Mixed"),first=newLoraRegistryEntry("one.safetensors"),second=newLoraRegistryEntry("two.safetensors");
  first.model_strength=.8;first.clip_strength=.55;second.enabled=false;second.model_strength=-4.95;second.clip_strength=.1;stack.entries=[first,second];value.stacks=[stack];
  const entryChanged=applyEntryStrengthDelta(value,stack.id,first.id,.1);
  assert.deepEqual([entryChanged.stacks[0].entries[0].model_strength,entryChanged.stacks[0].entries[0].clip_strength],[.9,.65]);
  const changed=applyStackStrengthDelta(value,stack.id,.1);
  assert.deepEqual([changed.stacks[0].entries[0].model_strength,changed.stacks[0].entries[0].clip_strength],[.9,.65]);
  assert.deepEqual([changed.stacks[0].entries[1].model_strength,changed.stacks[0].entries[1].clip_strength],[-4.85,.2]);
  assert.equal(changed.stacks[0].entries[1].enabled,false);
  assert.deepEqual([first.model_strength,first.clip_strength],[.8,.55]);
});

test("LoRA scrubbing applies stable 0.05 increments and cancel restores the complete snapshot",()=>{
  const initial=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Scrub"),entry=newLoraRegistryEntry("one.safetensors");stack.entries=[entry];initial.stacks=[stack];
  const totals=[5,10,15].map(dx=>numberScrubValue(0,dx,.01,-10,10,.05));assert.deepEqual(totals,[.05,.1,.15]);assert.ok(totals.map((value,index)=>value-(totals[index-1]??0)).every(increment=>Math.abs(increment-.05)<1e-12));
  let current=initial;const session=createScrubSnapshotSession();session.start(current);current=applyEntryStrengthDelta(current,stack.id,entry.id,.05);current=applyStackStrengthDelta(current,stack.id,.1);assert.notDeepEqual(current,initial);session.cancel(value=>{current=value});assert.deepEqual(current,initial);assert.equal(session.active(),false);
});

test("entry and stack strength deltas preserve relative differences at clamp boundaries",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Boundary"),first=newLoraRegistryEntry("one.safetensors"),second=newLoraRegistryEntry("two.safetensors");
  first.model_strength=4.9;first.clip_strength=4;second.enabled=false;second.model_strength=-4.8;second.clip_strength=-3.6;stack.entries=[first,second];value.stacks=[stack];
  const entryChanged=applyEntryStrengthDelta(value,stack.id,first.id,.5),changedEntry=entryChanged.stacks[0].entries[0];
  assert.deepEqual([changedEntry.model_strength,changedEntry.clip_strength],[5,4.1]);
  assert.ok(Math.abs((changedEntry.model_strength-changedEntry.clip_strength)-.9)<1e-9);
  const stackChanged=applyStackStrengthDelta(value,stack.id,-.5),changed=stackChanged.stacks[0].entries;
  assert.deepEqual([changed[0].model_strength,changed[0].clip_strength,changed[1].model_strength,changed[1].clip_strength],[4.7,3.8,-5,-3.8]);
  assert.ok(Math.abs((changed[0].model_strength-changed[0].clip_strength)-.9)<1e-9);
  assert.ok(Math.abs((changed[1].model_strength-changed[1].clip_strength)-(-1.2))<1e-9);
  assert.equal(changed[1].enabled,false);
});

test("entry and stack switches preserve configuration while producing an empty active state",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Compare");
  const first=newLoraRegistryEntry("one.safetensors"),second=newLoraRegistryEntry("two.safetensors");
  first.enabled=false;stack.entries.push(first,second);value.stacks.push(stack);
  assert.equal(activeLoraCount(stack),1);assert.equal(loraRegistryIsEmptyActive(value),false);
  stack.enabled=false;
  assert.equal(activeLoraCount(stack),0);assert.equal(loraRegistryIsEmptyActive(value),true);
  const parsed=parseLoraRegistryConfig(serializeLoraRegistryConfig(value));
  assert.equal(parsed.stacks[0].name,"Compare");assert.equal(parsed.stacks[0].entries.length,2);assert.equal(parsed.stacks[0].entries[1].enabled,true);
});

test("clearing stacks preserves the stable registry provider identity",()=>{
  const value=emptyLoraRegistryConfig();value.stacks.push(newLoraRegistryStack("Comparison"));
  const cleared=clearLoraRegistryStacks(value);
  assert.equal(cleared.registry_id,value.registry_id);assert.deepEqual(cleared.stacks,[]);assert.equal(loraRegistryIsEmptyActive(cleared),true);
});

test("frontend validation mirrors backend identity path and strength constraints",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Unsafe"),entry=newLoraRegistryEntry("model.safetensors");
  stack.entries=[entry];value.stacks=[stack];assert.equal(loraRegistryValidation(value).valid,true);
  for(const name of ["../outside.safetensors","/absolute/model.safetensors","C:/models/model.safetensors","model.ckpt","folder//model.safetensors"]){
    entry.lora_name=name;assert.equal(loraRegistryValidation(value).invalidPath,true,name);
  }
  entry.lora_name="folder/model.safetensors";stack.id="not-a-uuid";assert.equal(loraRegistryValidation(value).invalidId,true);
  stack.id=crypto.randomUUID().toUpperCase();assert.equal(loraRegistryValidation(value).invalidId,true);
  stack.id=crypto.randomUUID();entry.model_strength=Number.NaN;assert.equal(loraRegistryValidation(value).invalidStrength,true);
  entry.model_strength=1;entry.clip_strength=Number.POSITIVE_INFINITY;assert.equal(loraRegistryValidation(value).invalidStrength,true);
});

test("uppercase UUIDs canonicalize once to the same lowercase runtime identities",()=>{
  const registryId=crypto.randomUUID(),stackId=crypto.randomUUID(),entryId=crypto.randomUUID();
  const raw={schema:"bv.lora_registry_config",version:1,registry_id:registryId.toUpperCase(),stacks:[{id:stackId.toUpperCase(),name:"Canonical",enabled:true,entries:[{id:entryId.toUpperCase(),lora_name:"model.safetensors",enabled:true,model_strength:1,clip_strength:1}]}]};
  const parsed=parseLoraRegistryConfig(raw),strict=strictLoraRegistryConfig(raw);
  assert.equal(parsed.registry_id,registryId);assert.equal(parsed.stacks[0].id,stackId);assert.equal(parsed.stacks[0].entries[0].id,entryId);
  assert.deepEqual(strict,parsed);assert.equal(serializeLoraRegistryConfig(parseLoraRegistryConfig(serializeLoraRegistryConfig(parsed))),serializeLoraRegistryConfig(parsed));
  const copy=freshenLoraRegistryIdentities(parsed);assert.equal(copy.registry_id,copy.registry_id.toLowerCase());assert.equal(copy.stacks[0].id,copy.stacks[0].id.toLowerCase());
});

test("strict config rejects malformed raw structures before normalization",()=>{
  const registryId=crypto.randomUUID(),stackId=crypto.randomUUID(),entryId=crypto.randomUUID(),base={schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[]};
  assert.equal(strictLoraRegistryConfig({...base,stacks:[null]}),null);
  assert.equal(strictLoraRegistryConfig({...base,stacks:[{id:stackId,name:"Broken",enabled:true,entries:[null]}]}),null);
  assert.equal(strictLoraRegistryConfig({...base,stacks:[{id:stackId,name:"Broken",enabled:true,entries:[{id:entryId,lora_name:"model.safetensors",enabled:true,model_strength:1,clip_strength:1,stack_id:stackId}]}]}),null);
  const entry={id:entryId,lora_name:"model.safetensors",enabled:true,model_strength:1,clip_strength:1};
  for(const malformed of [
    {...entry,model_strength:null},{...entry,clip_strength:[]},{...entry,model_strength:{}},{...entry,lora_name:["model.safetensors"]},{...entry,id:{}},{...entry,enabled:"true"},
  ])assert.equal(strictLoraRegistryConfig({...base,stacks:[{id:stackId,name:"Broken",enabled:true,entries:[malformed]}]}),null);
  assert.equal(strictLoraRegistryConfig({...base,stacks:[{id:stackId,name:{value:"Broken"},enabled:true,entries:[]}]}),null);
  assert.equal(strictLoraRegistryConfig({...base,registry_id:{value:registryId}}),null);
});

test("malformed nonblank config is never normalized back into the workflow",()=>{
  assert.equal(shouldPersistNormalizedLoraConfig("{malformed",null),false);
  assert.equal(shouldPersistNormalizedLoraConfig("",null),true);
  assert.equal(shouldPersistNormalizedLoraConfig("{valid}",{registry_id:"canonical"}),true);
});

test("duplicate IDs and duplicate names remain visible validation errors",()=>{
  const id=crypto.randomUUID(),entryId=crypto.randomUUID();
  const parsed=parseLoraRegistryConfig({schema:"bv.lora_registry_config",version:1,registry_id:crypto.randomUUID(),stacks:[
    {id,name:"Same",enabled:true,entries:[{id:entryId,lora_name:"a.safetensors",enabled:true,model_strength:1,clip_strength:1}]},
    {id,name:"same",enabled:true,entries:[{id:entryId,lora_name:"b.safetensors",enabled:true,model_strength:1,clip_strength:1}]},
  ]});
  assert.equal(parsed.stacks[0].id,parsed.stacks[1].id);
  assert.equal(loraRegistryValidation(parsed).valid,false);
  assert.equal(loraRegistryValidation(parsed).duplicateName,"same");
  assert.equal(loraRegistryValidation(parsed).duplicateId,true);
});

test("copy reconciliation gives the copied registry and all nested entries fresh identities",()=>{
  const value=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Portrait");stack.entries.push(newLoraRegistryEntry("portrait.safetensors"));value.stacks.push(stack);
  assert.equal(needsFreshLoraRegistryId("1",value.registry_id,[{nodeId:"1",registryId:value.registry_id},{nodeId:"2",registryId:value.registry_id}]),false);
  assert.equal(needsFreshLoraRegistryId("2",value.registry_id,[{nodeId:"1",registryId:value.registry_id},{nodeId:"2",registryId:value.registry_id}]),true);
  const copy=freshenLoraRegistryIdentities(value);
  assert.notEqual(copy.registry_id,value.registry_id);assert.notEqual(copy.stacks[0].id,value.stacks[0].id);assert.notEqual(copy.stacks[0].entries[0].id,value.stacks[0].entries[0].id);
  assert.equal(copy.stacks[0].name,"Portrait");assert.equal(copy.stacks[0].entries[0].lora_name,"portrait.safetensors");
});

test("catalog search covers filename, model, author, tags and trigger words",()=>{
  const items=[
    {name:"styles/ink.safetensors",display_name:"Ink",base_model:"Anima",author:"Mina",tags:["line art"],trigger_words:["ink style"],description:"",size:1,preview_url:null,preview_safe:false,metadata_sources:[]},
    {name:"photo.safetensors",display_name:"Photo",base_model:"SDXL",author:"",tags:[],trigger_words:[],description:"",size:1,preview_url:null,preview_safe:false,metadata_sources:[]},
  ];
  assert.deepEqual(searchLoraCatalog(items,"anima mina").map(item=>item.name),["styles/ink.safetensors"]);
  assert.deepEqual(searchLoraCatalog(items,"line ink").map(item=>item.name),["styles/ink.safetensors"]);
  assert.deepEqual(searchLoraCatalog(items,"photo").map(item=>item.name),["photo.safetensors"]);
});

test("catalog search returns early for blank queries and stops at its result limit",()=>{
  let tailReads=0;
  const match=index=>({name:`match-${index}.safetensors`,display_name:`Match ${index}`,base_model:"",author:"",tags:[],trigger_words:[],description:"",preview_url:null,preview_safe:false});
  const tail=Array.from({length:100},(_,index)=>({get name(){tailReads++;return`tail-${index}.safetensors`},display_name:"Tail",base_model:"",author:"",tags:[],trigger_words:[],description:"",preview_url:null,preview_safe:false}));
  assert.deepEqual(searchLoraCatalog([...Array.from({length:12},(_,index)=>match(index)),...tail],"match",12).map(item=>item.name),Array.from({length:12},(_,index)=>`match-${index}.safetensors`));
  assert.equal(tailReads,0);
  assert.deepEqual(searchLoraCatalog(tail,"   ",12),[]);assert.equal(tailReads,0);
});

test("primary Strength preserves mixed legacy values until an explicit dual write",()=>{
  const mixed=newLoraRegistryEntry("mixed.safetensors");mixed.model_strength=.8;mixed.clip_strength=.55;
  assert.deepEqual(readSharedStrength(mixed),{kind:"mixed",model:.8,clip:.55});
  assert.deepEqual([mixed.model_strength,mixed.clip_strength],[.8,.55]);
  const written=writeSharedStrength(mixed,.7);
  assert.notEqual(written,mixed);
  assert.deepEqual([written.model_strength,written.clip_strength],[.7,.7]);
  assert.deepEqual([mixed.model_strength,mixed.clip_strength],[.8,.55]);
  assert.deepEqual(readSharedStrength(written),{kind:"value",value:.7});
});

test("library add targets stacks by stable identity and fails closed for stale targets",()=>{
  const value=emptyLoraRegistryConfig(),first=newLoraRegistryStack("First"),second=newLoraRegistryStack("Second");
  value.stacks.push(first,second);
  const added=addLoraEntryToStack(value,second.id,"styles/ink.safetensors");
  assert.equal(added.added,true);assert.ok(added.entryId);
  assert.equal(added.config.stacks[0].entries.length,0);
  assert.equal(added.config.stacks[1].entries.length,1);
  assert.equal(added.config.stacks[1].entries[0].lora_name,"styles/ink.safetensors");
  assert.notEqual(added.config,value);
  const stale=addLoraEntryToStack(value,crypto.randomUUID(),"styles/ink.safetensors");
  assert.deepEqual(stale,{config:value,added:false});
});

test("library add merges into the latest stored config instead of its open-time snapshot",()=>{
  const opened=emptyLoraRegistryConfig(),stack=newLoraRegistryStack("Concurrent"),first=newLoraRegistryEntry("one.safetensors"),second=newLoraRegistryEntry("two.safetensors");
  stack.entries.push(first,second);opened.stacks.push(stack);
  const latest=structuredClone(opened);latest.stacks[0].enabled=false;latest.stacks[0].entries.reverse();latest.stacks[0].entries[0].model_strength=.42;
  let stored=serializeLoraRegistryConfig(latest);
  const merged=addLoraEntryToLatestStored(()=>stored,stack.id,"three.safetensors");
  assert.equal(merged.added,true);assert.equal(merged.config.stacks[0].enabled,false);
  assert.deepEqual(merged.config.stacks[0].entries.slice(0,2).map(entry=>entry.id),[second.id,first.id]);
  assert.equal(merged.config.stacks[0].entries[0].model_strength,.42);
  assert.equal(merged.config.stacks[0].entries[2].lora_name,"three.safetensors");
  stored=serializeLoraRegistryConfig({...latest,stacks:[]});
  const stale=addLoraEntryToLatestStored(()=>stored,stack.id,"four.safetensors");
  assert.equal(stale.added,false);assert.deepEqual(stale.config.stacks,[]);
});

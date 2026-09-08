import assert from 'node:assert/strict';
import test from 'node:test';
import {createLoraRegistryAutosave} from '../ui/src/regional/loraRegistryAutosave.ts';
import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry,serializeLoraRegistryConfig} from '../ui/src/regional/loraRegistryConfig.ts';

function fixture(){
 const initial=emptyLoraRegistryConfig();initial.stacks.push(newLoraRegistryStack('Local'));
 let stored=serializeLoraRegistryConfig(initial);const writes=[];
 const controller=createLoraRegistryAutosave(stored,value=>{stored=value;writes.push(JSON.parse(value))},()=>stored);
 return {controller,writes,get stored(){return stored},external(config){stored=serializeLoraRegistryConfig(config)},initial};
}
const rename=(config,name)=>({...config,stacks:config.stacks.map(s=>s.role==='global'?s:{...s,name})});

test('valid commits persist synchronously and Undo/Redo persist without clearing history',()=>{
 const f=fixture();f.controller.commit(c=>rename(c,'One'));assert.equal(JSON.parse(f.stored).stacks[1].name,'One');
 f.controller.commit(c=>rename(c,'Two'));assert.equal(f.controller.canUndo,true);
 f.controller.undo();assert.equal(JSON.parse(f.stored).stacks[1].name,'One');assert.equal(f.controller.canRedo,true);
 f.controller.redo();assert.equal(JSON.parse(f.stored).stacks[1].name,'Two');assert.equal(f.writes.length,4);
});

test('invalid draft does not overwrite stored state and repaired draft persists',()=>{
 const f=fixture(),before=f.stored;f.controller.commit(c=>rename(c,''));
 assert.equal(f.stored,before);assert.equal(f.writes.length,0);assert.equal(f.controller.value.stacks[1].name,'');
 f.controller.commit(c=>rename(c,'Repaired'));assert.equal(JSON.parse(f.stored).stacks[1].name,'Repaired');
});

test('external Global deselection rebases both past and future so Undo never steals Global',()=>{
 const f=fixture();f.controller.commit(c=>({...c,stacks:c.stacks.map(s=>s.role==='global'?{...s,enabled:true}:s)}));
 f.controller.commit(c=>rename(c,'One'));f.controller.commit(c=>rename(c,'Two'));f.controller.undo();
 const peer=JSON.parse(f.stored);peer.stacks[0].enabled=false;f.external(peer);f.controller.sync(f.stored);
 f.controller.redo();assert.equal(JSON.parse(f.stored).stacks[0].enabled,false);
 f.controller.undo();f.controller.undo();assert.equal(JSON.parse(f.stored).stacks[0].enabled,false);
});

test('invalid local draft and external catalog addition both survive repair',()=>{
 const f=fixture();f.controller.commit(c=>rename(c,''));const peer=JSON.parse(f.stored),entry=newLoraRegistryEntry('external.safetensors');peer.stacks[1].entries.push(entry);f.external(peer);
 f.controller.commit(c=>rename(c,'Repaired'));
 assert.equal(JSON.parse(f.stored).stacks[1].name,'Repaired');assert.deepEqual(JSON.parse(f.stored).stacks[1].entries,[entry]);
 f.controller.undo();assert.deepEqual(f.controller.value.stacks[1].entries,[entry]);assert.equal(f.controller.value.stacks[1].name,'');
});

test('stale object commit cannot overwrite externally changed Global flag or added entries',()=>{
 const f=fixture(),draft=rename(structuredClone(f.controller.value),'Draft');const peer=JSON.parse(f.stored);peer.stacks[0].enabled=true;peer.stacks[1].entries.push(newLoraRegistryEntry('external.safetensors'));f.external(peer);
 f.controller.commit(draft);
 assert.equal(JSON.parse(f.stored).stacks[0].enabled,true);assert.equal(JSON.parse(f.stored).stacks[1].entries.length,1);assert.equal(JSON.parse(f.stored).stacks[1].name,'Draft');
});

test('self-notification does not trigger recursive writes',()=>{
 const f=fixture();f.controller.commit(c=>rename(c,'One'));for(let i=0;i<5;i++)f.controller.sync(f.stored);assert.equal(f.writes.length,1);
});

test('a failed save remains retryable instead of becoming a falsely saved baseline',()=>{
 const initial=emptyLoraRegistryConfig();initial.stacks.push(newLoraRegistryStack('Local'));let attempts=0;
 const controller=createLoraRegistryAutosave(initial,()=>{attempts++;if(attempts===1)throw new Error('synthetic write failure')});
 assert.throws(()=>controller.commit(c=>rename(c,'Changed')),/synthetic/);
 controller.commit(c=>c);assert.equal(attempts,2);
});

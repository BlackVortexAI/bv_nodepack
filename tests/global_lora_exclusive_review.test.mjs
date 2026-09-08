import assert from 'node:assert/strict';
import test from 'node:test';
import {workflowGlobalLoraSelection,exclusiveGlobalLoraChanges} from '../ui/src/regional/loraGlobalRegistry.ts';

function registry(graph,enabled){
 const config={schema:'bv.lora_registry_config',version:2,registry_id:crypto.randomUUID(),stacks:[{id:crypto.randomUUID(),name:'Global',role:'global',enabled,entries:[]}]};
 const node={type:'BV LoRA Registry',graph,widgets:[{name:'config_json',value:JSON.stringify(config)}]};
 graph._nodes.push(node);return{node,config};
}

test('saved conflicting selections have no load-order winner and discovery never mutates',()=>{
 const root={_nodes:[]};root.rootGraph=root;
 const a=registry(root,true),b=registry(root,true),before=[a.node.widgets[0].value,b.node.widgets[0].value];
 for(const nodes of [[a.node,b.node],[b.node,a.node]]){
  root._nodes=nodes;
  const result=workflowGlobalLoraSelection(a.node);
  assert.equal(result.conflict,true);assert.equal(result.active.length,2);
 }
 assert.deepEqual([a.node.widgets[0].value,b.node.widgets[0].value],before);
});

test('rising activation plans one disable per other registry across shared nested definition',()=>{
 const root={_nodes:[]};root.rootGraph=root;
 const shared={_nodes:[],rootGraph:root};root._nodes.push({subgraph:shared},{subgraph:shared});
 const a=registry(root,false),b=registry(shared,true),before=b.node.widgets[0].value;
 const activated={...a.config,stacks:a.config.stacks.map(s=>({...s,enabled:true}))};
 const changes=exclusiveGlobalLoraChanges(a.node,a.config,activated);
 assert.equal(changes.length,1);assert.equal(changes[0].node,b.node);
 assert.equal(changes[0].config.stacks[0].enabled,false);
 assert.equal(b.node.widgets[0].value,before);
 assert.deepEqual(exclusiveGlobalLoraChanges(a.node,activated,activated),[]);
 assert.deepEqual(exclusiveGlobalLoraChanges(a.node,activated,a.config),[]);
});

test('deactivating one source never mutates the remaining source or selects another',()=>{
 const root={_nodes:[]};root.rootGraph=root;
 const a=registry(root,true),b=registry(root,false);
 const disabled={...a.config,stacks:a.config.stacks.map(s=>({...s,enabled:false}))};
 assert.deepEqual(exclusiveGlobalLoraChanges(a.node,a.config,disabled),[]);
 assert.equal(JSON.parse(b.node.widgets[0].value).stacks[0].enabled,false);
});

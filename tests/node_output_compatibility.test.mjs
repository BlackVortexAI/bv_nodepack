import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {reconcileConfiguredNodeOutputs,reconcileLoraRegistryOutputOrder} from '../ui/src/regional/nodeOutputCompatibility.ts';

function fixture(map=true){
 const graph={_nodes:[],links:map?new Map():{},getNodeById(id){return this._nodes.find(n=>String(n.id)===String(id))}};
 const node={id:1,type:'BV LoRA Registry',graph,widgets_values:['unchanged'],outputs:[['resource_provider','BV_RUNTIME_RESOURCE_PROVIDER'],['lora_count','INT'],['registry_summary','STRING']].map(([name,type],i)=>({name,type,slot_index:i,links:[10+i]}))};
 graph._nodes.push(node);
 for(let i=0;i<3;i++){
  const target={id:2+i,graph,inputs:[{link:10+i}]};graph._nodes.push(target);
  const link={id:10+i,origin_id:1,origin_slot:i,target_id:target.id,target_slot:0,type:node.outputs[i].type};
  if(map)graph.links.set(link.id,link);else graph.links[link.id]=link;
 }
 return {node,graph,links:()=>map?[...graph.links.values()]:Object.values(graph.links)};
}
for(const map of [true,false])test(`saved 1.2.3 outputs preserve identities and execution meaning (${map?'Map':'object'})`,()=>{
 const f=fixture(map), original=[...f.node.outputs],targets=f.graph._nodes.slice(1).map(n=>JSON.stringify(n.inputs));
 const before=f.links().map(({origin_slot,...rest})=>rest);
 assert.equal(reconcileConfiguredNodeOutputs(f.graph),1);
 assert.deepEqual(f.node.outputs,[original[1],original[2],original[0]]);
 assert.deepEqual(f.links().map(l=>l.origin_slot),[2,0,1]);
 assert.deepEqual(f.links().map(({origin_slot,...rest})=>rest),before);
 assert.deepEqual(f.graph._nodes.slice(1).map(n=>JSON.stringify(n.inputs)),targets);
 assert.deepEqual(f.node.outputs.map(s=>s.slot_index),[0,1,2]);
 // API consumers use indices; each old consumer must receive its original value.
 const backend=['count','summary','provider'];
 assert.deepEqual(f.links().map(l=>backend[l.origin_slot]),['provider','count','summary']);
 assert.deepEqual(f.node.widgets_values,['unchanged']);
 assert.equal(reconcileConfiguredNodeOutputs(f.graph),0);
});
test('root and nested concrete subgraphs with overlapping node IDs are independent',()=>{
 const a=fixture(),b=fixture(false);a.graph._nodes.push({id:7,subgraph:b.graph});
 assert.equal(reconcileConfiguredNodeOutputs(a.graph),2);
 assert.deepEqual(a.links().map(l=>l.origin_slot),[2,0,1]);assert.deepEqual(b.links().map(l=>l.origin_slot),[2,0,1]);
});
test('missing graph links defer without touching outputs; ready graph can migrate later',()=>{
 const f=fixture(),outputs=f.node.outputs,link=f.graph.links.get(12);f.graph.links.delete(12);
 assert.equal(reconcileLoraRegistryOutputOrder(f.node),false);assert.equal(f.node.outputs,outputs);assert.equal(f.graph.links.get(10).origin_slot,0);
 f.graph.links.set(12,link);assert.equal(reconcileLoraRegistryOutputOrder(f.node),true);
});
test('native Subgraph output boundary retains slot identity and external consumers',()=>{
 const f=fixture(), boundary={id:-20,slots:f.node.outputs.map((slot,i)=>({id:`boundary-${i}`,type:slot.type,linkIds:[10+i]}))};
 f.graph._nodes.splice(1);f.graph.outputNode=boundary;
 f.links().forEach((link,i)=>{link.target_id=boundary.id;link.target_slot=i});
 const external={id:40,inputs:[{link:50}]},instance={id:30,subgraph:f.graph,outputs:[{name:'provider',type:'BV_RUNTIME_RESOURCE_PROVIDER',links:[50]}]};
 const root={_nodes:[instance,external],links:new Map([[50,{id:50,origin_id:30,origin_slot:0,target_id:40,target_slot:0,type:'BV_RUNTIME_RESOURCE_PROVIDER'}]])};
 const before=JSON.stringify([boundary,instance.outputs,external.inputs,[...root.links.values()]]);
 assert.equal(reconcileConfiguredNodeOutputs(root),1);
 assert.deepEqual(f.links().map(link=>link.origin_slot),[2,0,1]);
 assert.deepEqual(f.links().map(link=>link.target_slot),[0,1,2]);
 assert.equal(JSON.stringify([boundary,instance.outputs,external.inputs,[...root.links.values()]]),before);
 assert.equal(reconcileConfiguredNodeOutputs(root),0);
});
test('inconsistent native boundary references leave every output and link unchanged',()=>{
 const f=fixture();f.graph.outputNode={id:-20,slots:[{type:'BV_RUNTIME_RESOURCE_PROVIDER',linkIds:[999]}]};
 f.graph.links.get(10).target_id=-20;
 const before=JSON.stringify([f.node.outputs,f.links()]);
 assert.equal(reconcileConfiguredNodeOutputs(f.graph),0);
 assert.equal(JSON.stringify([f.node.outputs,f.links()]),before);
});
for(const mutate of [f=>f.node.outputs[1].name='resource_provider',f=>f.node.type='Other',f=>f.graph.links.get(11).origin_id=99,f=>f.graph._nodes[2].inputs[0].link=999,f=>f.graph.links.set(99,{origin_id:1,origin_slot:0})])test('invalid or unrelated graph is unchanged',()=>{
 const f=fixture();mutate(f);const outputs=f.node.outputs,snapshot=JSON.stringify([outputs,f.links()]);
 assert.equal(reconcileLoraRegistryOutputOrder(f.node),false);assert.equal(f.node.outputs,outputs);assert.equal(JSON.stringify([outputs,f.links()]),snapshot);
});
test('aliased and separate link stores migrate consistently',()=>{
 for(const alias of [true,false]){const f=fixture();f.graph._links=alias?f.graph.links:Object.fromEntries(f.links().map(l=>[l.id,{...l}]));
 assert.equal(reconcileLoraRegistryOutputOrder(f.node),true);assert.deepEqual(f.links().map(l=>l.origin_slot),[2,0,1]);
 if(!alias)assert.deepEqual(Object.values(f.graph._links).map(l=>l.origin_slot),[2,0,1]);}
});
test('migration is wired to the actual afterConfigureGraph hook before consumer reconciliation',()=>{
 const source=readFileSync(new URL('../ui/src/index.tsx',import.meta.url),'utf8');
 assert.match(source,/afterConfigureGraph\(\)\s*\{\s*reconcileConfiguredNodeOutputs\(\(comfyApp as any\)\.graph\);\s*scheduleRegionalConsumersRefresh/);
});

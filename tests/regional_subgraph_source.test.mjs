import assert from 'node:assert/strict';
import test from 'node:test';
import {sourceRegionalDocument} from '../ui/src/regional/regionalSourceDocument.ts';
import {upstreamLoraTransformer,downstreamLoraConsumers} from '../ui/src/regional/loraV3Graph.ts';
import {resolveNativeInputSource,nativeRegionalAncestors} from '../ui/src/regional/regionalNativeSource.ts';
import {lutConfigOwner,adoptLutLoopConsumers,commitLutSourceConfig} from '../ui/src/regional/lutV3Catalog.ts';
import {installRegistryDgLifecycle} from '../ui/src/regional/registryDgLifecycle.ts';

const type='BV_REGIONAL',doc=id=>JSON.stringify({schema:'bv.regional',version:2,document_id:id,title:id,canvas:{width:64,height:64},prompts:{global:{positive_source:'',negative_source:''},background:{positive_source:'',negative_source:''}},negative_mode:'auto',overlap:{mode:'joint'},regions:[]});
export function regionalHierarchy(){
 let next=1;
 const graph=()=>({_nodes:[],links:new Map(),inputs:[],outputs:[],inputNode:{id:-10},outputNode:{id:-20},getNodeById(id){return this._nodes.find(n=>n.id===id)}});
 const root=graph(),a=graph(),deep=graph(),b=graph();for(const g of [a,deep,b])g.rootGraph=root;
 const node=(g,id,t)=>{const n={id,type:t,graph:g,inputs:[{name:'regional',type,link:null}],outputs:[{name:'regional',type,links:[]}]};g._nodes.push(n);return n};
 const host=(g,c,id)=>Object.assign(node(g,id,'Subgraph'),{subgraph:c});
 const ha=host(root,a,10),hd=host(a,deep,11),hb=host(root,b,12);
 for(const [g,h] of [[a,ha],[deep,hd],[b,hb]]){g.inputs=[{type,linkIds:[]}];g.outputs=[{type,linkIds:[]}];}
 const connect=(g,s,si,t,ti)=>{
  const id=next++,link={id,type,origin_id:s.id,origin_slot:si,target_id:t.id,target_slot:ti};g.links.set(id,link);
  if(s===g.inputNode)g.inputs[si].linkIds.push(id);else s.outputs[si].links.push(id);
  if(t===g.outputNode)g.outputs[ti].linkIds.push(id);else t.inputs[ti].link=id;
  return link;
 };
 const prompt=(g,id,name)=>Object.assign(node(g,id,'BV Regional Prompt'),{widgets:[{name:'regional_json',value:doc(name)}]});
 return {root,a,deep,b,ha,hd,hb,node,prompt,connect};
}

test('confirmed LUT source adopts only its concrete legacy Loop descendants across nested graphs',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.root,1,'same'),other=f.prompt(f.root,2,'same'),mid=f.node(f.a,3,'BV Regional LoRA');
 const loop=f.node(f.deep,4,'BV LUT Loop Start'),foreign=f.node(f.root,5,'BV LUT Loop Start'),unconnected=f.node(f.root,6,'BV LUT Loop Start');
 for(const n of [loop,foreign,unconnected]){n.inputs[0].name='plan';n.inputs[0].type='*';n.properties={keep:1};}
 f.connect(f.root,p,0,f.ha,0);f.connect(f.a,f.a.inputNode,0,mid,0);f.connect(f.a,mid,0,f.hd,0);f.connect(f.deep,f.deep.inputNode,0,loop,0);f.connect(f.root,other,0,foreign,0);
 assert.equal(lutConfigOwner(loop),p);assert.equal(lutConfigOwner(foreign),other);
 assert.equal(loop.properties.bvRegistryDgFamilies,undefined,'reading owner never migrates');
 const pending=[],original=globalThis.setTimeout,ran=[];globalThis.setTimeout=fn=>pending.push(fn);
 try{
  assert.deepEqual(adoptLutLoopConsumers(p,n=>ran.push(n)),[loop]);
  assert.deepEqual(loop.properties.bvRegistryDgFamilies,['lut']);assert.equal(foreign.properties.bvRegistryDgFamilies,undefined);assert.equal(unconnected.properties.bvRegistryDgFamilies,undefined);
  pending.splice(0).forEach(fn=>fn());assert.deepEqual(ran,[loop]);
  adoptLutLoopConsumers(p,n=>ran.push(n));loop.inputs[0].link=null;pending.splice(0).forEach(fn=>fn());assert.equal(ran.length,1,'changed owner cancels stale reconciliation');
  class Loop{};installRegistryDgLifecycle(Loop,()=>{});Object.setPrototypeOf(foreign,Loop.prototype);
  adoptLutLoopConsumers(other,n=>ran.push(n));foreign.onConfigure({properties:{keep:1}});
  pending.splice(0).forEach(fn=>fn());assert.equal(ran.length,1,'real configure invalidates queued adoption');assert.equal(foreign.properties.bvRegistryDgFamilies,undefined);
 }finally{globalThis.setTimeout=original}
});

test('LUT Plan ownership is exact and confirmed save groups flags with config in the root transaction',()=>{
 const f=regionalHierarchy(),plan=f.node(f.root,1,'BV Regional LUT Plan'),loop=f.node(f.root,2,'BV LUT Loop Start');
 plan.outputs[0].type='BV_LUT_PLAN';plan.widgets=[{name:'config_json',value:'old'}];loop.inputs[0]={name:'plan',type:'*',link:null};
 const link=f.connect(f.root,plan,0,loop,0);link.type='BV_LUT_PLAN';
 assert.equal(lutConfigOwner(loop),plan);
 const pending=[],original=globalThis.setTimeout,events=[];globalThis.setTimeout=fn=>pending.push(fn);
 f.root.beforeChange=()=>events.push(['before',plan.widgets[0].value,loop.properties?.bvRegistryDgFamilies]);
 f.root.afterChange=()=>events.push(['after',plan.widgets[0].value,loop.properties?.bvRegistryDgFamilies]);
 try{commitLutSourceConfig(plan,'{"version":1,"jobs":[]}');assert.deepEqual(events,[['before','old',undefined],['after','{"version":1,"jobs":[]}',['lut']]]);
  plan.type='Foreign Transformer';assert.equal(lutConfigOwner(loop),null);
 }finally{globalThis.setTimeout=original}
});

test('Regional document resolves Root -> Sub -> Sub without changing any native link',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.root,1,'root'),sink=f.node(f.deep,1,'BV Regional LUT Plan');
 f.connect(f.root,p,0,f.ha,0);f.connect(f.a,f.a.inputNode,0,f.hd,0);f.connect(f.deep,f.deep.inputNode,0,sink,0);
 const before=[f.root,f.a,f.deep].map(g=>JSON.stringify([...g.links]));
 assert.equal(sourceRegionalDocument(sink)?.document_id,'root');
 assert.deepEqual([f.root,f.a,f.deep].map(g=>JSON.stringify([...g.links])),before);
});
test('Regional document resolves Deep -> Root -> sibling through a LoRA node and concrete owners',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.deep,1,'deep'),mid=f.node(f.root,1,'BV Regional LoRA'),sink=f.node(f.b,1,'BV Regional Detailer Plan');
 f.connect(f.deep,p,0,f.deep.outputNode,0);f.connect(f.a,f.hd,0,f.a.outputNode,0);f.connect(f.root,f.ha,0,mid,0);f.connect(f.root,mid,0,f.hb,0);f.connect(f.b,f.b.inputNode,0,sink,0);
 sink.__bvConcreteGraph=f.b;sink.graph={getNodeById(){throw Error('wrong proxy')}};
 assert.equal(sourceRegionalDocument(sink)?.document_id,'deep');
 f.deep.outputs[0].linkIds=[];assert.equal(sourceRegionalDocument(sink),null);
});
test('Regional source refuses broken backlinks, ambiguous owners and cycles',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.root,1,'root'),sink=f.node(f.a,2,'BV Regional LUT Plan');
 f.connect(f.root,p,0,f.ha,0);const edge=f.connect(f.a,f.a.inputNode,0,sink,0);
 edge.target_slot=7;assert.equal(sourceRegionalDocument(sink),null);edge.target_slot=0;
 const duplicate={...f.ha,id:20};f.root._nodes.push(duplicate);assert.equal(sourceRegionalDocument(sink),null);f.root._nodes.pop();
 p.outputs[0].links=[];assert.equal(sourceRegionalDocument(sink),null);
 const loop=f.node(f.root,3,'BV Regional LoRA');f.connect(f.root,loop,0,loop,0);assert.equal(sourceRegionalDocument(loop),null);
});

test('nearest LoRA writer and downstream order follow Root -> Deep -> Root -> Sibling native links',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.root,1,'root'),outer=f.node(f.root,2,'BV Regional LoRA'),deep=f.node(f.deep,2,'BV Regional LoRA'),sibling=f.node(f.b,2,'BV Regional LoRA');
 f.connect(f.root,p,0,outer,0);f.connect(f.root,outer,0,f.ha,0);f.connect(f.a,f.a.inputNode,0,f.hd,0);f.connect(f.deep,f.deep.inputNode,0,deep,0);
 f.connect(f.deep,deep,0,f.deep.outputNode,0);f.connect(f.a,f.hd,0,f.a.outputNode,0);f.connect(f.root,f.ha,0,f.hb,0);f.connect(f.b,f.b.inputNode,0,sibling,0);
 const graphs=[f.root,f.a,f.deep,f.b],before=graphs.map(g=>JSON.stringify([...g.links]));
 assert.equal(upstreamLoraTransformer(deep),outer);assert.equal(upstreamLoraTransformer(sibling),deep);
 assert.deepEqual(downstreamLoraConsumers(p),[outer,deep,sibling]);
 assert.deepEqual(downstreamLoraConsumers(outer),[deep,sibling]);
 assert.deepEqual(nativeRegionalAncestors(sibling),[deep,outer,p]);
 assert.deepEqual(graphs.map(g=>JSON.stringify([...g.links])),before);
 const broken=f.b.links.get(sibling.inputs[0].link);broken.type='IMAGE';assert.equal(upstreamLoraTransformer(sibling),null);
});

test('native source rejects wrong parent types, edge types and ambiguous Regional inputs',()=>{
 const f=regionalHierarchy(),p=f.prompt(f.root,1,'root'),sink=f.node(f.a,2,'BV Regional LoRA');
 f.connect(f.root,p,0,f.ha,0);const edge=f.connect(f.a,f.a.inputNode,0,sink,0);
 f.ha.inputs[0].type='IMAGE';assert.equal(resolveNativeInputSource(sink,0),null);f.ha.inputs[0].type=type;
 edge.type='IMAGE';assert.equal(resolveNativeInputSource(sink,0),null);edge.type=type;
 assert.equal(upstreamLoraTransformer(sink),p);
 sink.inputs.push({...sink.inputs[0],name:'other'});assert.deepEqual(nativeRegionalAncestors(sink),[]);
});

// Real /object_info inventory from isolated 8200, 2026-09-02. This proves source
// resolution and non-mutation, not model inference for the model-dependent nodes.
const regionalConsumers=['BV Regional LoRA','BV Regional Debug','BV Regional Select','BV Regional Deconstructor','BV Regional Detailer Mask','BV Regional Native Conditioning','BV Regional SDXL Attention','BV Regional Z-Image Attention','BV Regional FLUX.2 Klein 9B Attention','BV Regional Krea 2 Attention','BV Regional Anima Adapter','BV Regional Anima Conditioning','BV Regional Color Control Image','BV Regional Anima LLLite','BV Regional Image Save','BV Regional Detailer Plan','BV Regional LUT Plan','BV Regional Prompt Enhancer','BV Apply Regional Enhancement'];
for(const consumer of regionalConsumers)for(const direction of ['root-deep','deep-sibling'])test(`${consumer}: ${direction} source contract preserves normal ports`,()=>{
 const f=regionalHierarchy(),sourceGraph=direction==='root-deep'?f.root:f.deep,targetGraph=direction==='root-deep'?f.deep:f.b,p=f.prompt(sourceGraph,1,'source'),sink=f.node(targetGraph,2,consumer);
 sink.inputs[0].name=consumer.endsWith(' Plan')?'regional_prompt':'regional';sink.inputs.push({name:'ordinary',type:'IMAGE',link:999});
 if(direction==='root-deep'){f.connect(f.root,p,0,f.ha,0);f.connect(f.a,f.a.inputNode,0,f.hd,0);f.connect(f.deep,f.deep.inputNode,0,sink,0)}
 else{f.connect(f.deep,p,0,f.deep.outputNode,0);f.connect(f.a,f.hd,0,f.a.outputNode,0);f.connect(f.root,f.ha,0,f.hb,0);f.connect(f.b,f.b.inputNode,0,sink,0)}
 const before=JSON.stringify(sink.inputs);assert.equal(sourceRegionalDocument(sink)?.document_id,'source');assert.equal(JSON.stringify(sink.inputs),before);
});

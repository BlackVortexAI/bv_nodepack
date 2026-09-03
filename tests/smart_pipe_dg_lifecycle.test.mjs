import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { promptModeState, reconcileRouteRegistryDestinations } from '../js/bv_smart_pipe_routing.js';

test('ancestor modes are discovered per shared instance with mute taking precedence',async()=>{
 const graph=root(),deep={_nodes:[],name:'Deep'},shared={_nodes:[],name:'Shared'};
 const inner={id:1,type:'BV Smart Pipe',mode:0,graph:deep,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}};
 deep._nodes=[inner];shared._nodes=[{id:30,mode:4,subgraph:deep,properties:{bvSmartPipeHost:{id:'deep',name:'Deep',definitionName:'Deep'}}}];
 graph._nodes=[{id:10,mode:0,subgraph:shared,properties:{bvSmartPipeHost:{id:'a',name:'A',definitionName:'Shared'}}},{id:20,mode:2,subgraph:shared,properties:{bvSmartPipeHost:{id:'b',name:'B',definitionName:'Shared'}}}];
 const mod=await load({graph,registerExtension(){}}),routing=mod.collectExpandedPipeAddresses(graph),state=promptModeState(routing.descriptors);
 assert.deepEqual([...state.prunedExecutionIds],['20:30:1']);
 assert.equal(state.bypassedAddresses.has(routing.descriptors.find(d=>d.executionId==='10:30:1').address),true);
 assert.equal(inner.mode,0);
});

let sequence=0;
async function load(app){
    const key=`__smartPipeTest${++sequence}`;globalThis[key]=app;
    const file=new URL('../js/bv_smart_pipe.js',import.meta.url);
    let source=await readFile(file,'utf8');
    source=source.replace('import { app } from "../../scripts/app.js";',`const app=globalThis.${key};`)
        .replace(/from "(\.\/[^\"]+)"/g,(_,path)=>`from ${JSON.stringify(new URL(path,file).href)}`);
    source+='\nexport { installPromptMaterializer, refreshDgProjection, installSubgraphContextTracking, setupNode, updatePredecessorWidget };';
    return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
const root=()=>({_nodes:[],properties:{bvSmartPipeRootId:'r',bvSmartPipeRoutes:{}}});
const settle=()=>new Promise(resolve=>setImmediate(resolve));

for (const useFacade of [false,true]) test(`source conversion relocates existing cross-scope consumers (facade=${useFacade})`,async()=>{
 const graph=root(),sub={_nodes:[],name:'Consumers'};
 const source={id:1,type:'BV Smart Pipe',graph,properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}};
 const receiver={id:2,type:'BV Smart Pipe',graph:sub,properties:{bvSmartPipe:{routing:{nodeId:'receiver',name:'Receiver',mode:'root'}}}};
 sub._nodes=[receiver];
 const consumerHost={id:10,subgraph:sub,properties:{bvSmartPipeHost:{id:'consumer',name:'Consumers',definitionName:'Consumers'}}};
 graph._nodes=[source,consumerHost];
 graph._convertToSubgraphImpl=function(){
  const inner={_nodes:[],name:'Converted'};
  inner._nodes=[{...source,graph:inner,properties:structuredClone(source.properties)}];
  const node={id:20,subgraph:inner,properties:{bvSmartPipeHost:{id:'converted',name:'Converted',definitionName:'Converted'}}};
  this._nodes=[consumerHost,node];return {node,subgraph:inner};
 };
 const mod=await load({graph,registerExtension(){}}),before=mod.collectExpandedPipeAddresses(graph);
 const address=id=>before.descriptors.find(d=>d.route.nodeId===id).address;
 before.registry[address('receiver')]={predecessorAddress:address('source')};
 const facade=useFacade ? new Proxy(graph,{}) : graph;
 facade._convertToSubgraphImpl(new Set([source]));
 const after=mod.collectExpandedPipeAddresses(graph);
 assert.equal(after.registry[address('receiver')].predecessorAddress,after.descriptors.find(d=>d.route.nodeId==='source').address);
});

test('detached relocation hook rejects missing graph context before native mutation',async()=>{
 const graph=root(),sub={_nodes:[],name:'Detached'};let called=false;
 sub._nodes=[{id:1,type:'BV Smart Pipe',graph:sub,properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}}];
 sub._convertToSubgraphImpl=()=>{called=true};
 graph._nodes=[{id:10,subgraph:sub,properties:{}}];
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 graph._nodes=[];
 assert.throws(()=>sub._convertToSubgraphImpl(),/context is unavailable/);
 assert.equal(called,false);
});

test('copied host remaps routes in every shared parent instance',async()=>{
 const graph=root(),shared={_nodes:[],name:'Shared'},deep={_nodes:[],name:'Deep'};
 deep._nodes=[{id:1,type:'BV Smart Pipe Merge',properties:{bvSmartPipeMerge:{nodeId:'m',sources:[]}}}];
 const host=id=>({id,subgraph:deep,properties:{bvSmartPipeHost:{id:'original',name:'Original'}}});
 shared._nodes=[host(30),host(31)];
 graph._nodes=['A','B'].map((id,index)=>({id:index+10,subgraph:shared,properties:{bvSmartPipeHost:{id,name:id}}}));
 graph.extra={bvSmartPipeRootId:'r',bvSmartPipeRoutes:{}};
 for(const id of ['A','B'])graph.extra.bvSmartPipeRoutes[`r/${id}/original/m`]={kind:'merge',sources:[{key:'pipe_001',address:`r/${id}/original/source`},{key:'pipe_002',address:`r/external-${id}`} ]};
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 const copy=shared._nodes[1].properties.bvSmartPipeHost.id;
 assert.notEqual(copy,'original');
 for(const id of ['A','B']){
  assert.equal(graph.extra.bvSmartPipeRoutes[`r/${id}/${copy}/m`].sources[0].address,`r/${id}/${copy}/source`);
  assert.equal(graph.extra.bvSmartPipeRoutes[`r/${id}/${copy}/m`].sources[1].address,`r/external-${id}`);
  assert.equal(graph.extra.bvSmartPipeRoutes[`r/${id}/original/m`].sources[0].address,`r/${id}/original/source`);
 }
});

test('host backlinks repair only target-confirmed SmartPipe links and restore exact state',async()=>{
 const graph=root(), existing=[9];
 const host={id:1,outputs:[{type:'BV_SMART_PIPE',links:existing},{type:'BV_SMART_PIPE',links:null},{type:'STRING',links:[]}]};
 graph._nodes=[host,{id:2,inputs:[{link:11}]}];graph.outputNode={id:-20};graph.outputs=[{linkIds:[10,12,13,14]}];
 graph._links=new Map([
  [10,{id:10,origin_id:1,origin_slot:0,target_id:-20,target_slot:0}],
  [11,{id:11,origin_id:1,origin_slot:0,target_id:2,target_slot:0}],
  [12,{id:12,origin_id:1,origin_slot:1,target_id:-20,target_slot:0}],
  [13,{id:13,origin_id:99,origin_slot:0,target_id:-20,target_slot:0}],
  [14,{id:14,origin_id:1,origin_slot:2,target_id:-20,target_slot:0}],
  [15,{id:15,origin_id:1,origin_slot:0,target_id:2,target_slot:1}],
 ]);
 const mod=await load({graph,registerExtension(){}});
 const restore=mod.repairHostOutputBacklinks(graph,host);
 assert.equal(host.outputs[0].links,existing);assert.deepEqual(existing,[9,10,11]);
 assert.deepEqual(host.outputs[1].links,[12]);assert.deepEqual(host.outputs[2].links,[]);
 mod.repairHostOutputBacklinks(graph,host);assert.deepEqual(existing,[9,10,11]);
 restore();assert.equal(host.outputs[0].links,existing);assert.deepEqual(existing,[9]);assert.equal(host.outputs[1].links,null);
 mod.repairHostOutputBacklinks(root(),host);assert.deepEqual(existing,[9]);
});

test('native relocation must retain the addressed predecessor when receiver changes host path',async()=>{
 const graph=root();
 const receiver={id:5,type:'BV Smart Pipe',graph,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'receiver',name:'Receiver',mode:'root'}}}};
 graph._convertToSubgraphImpl=function(){
  const sub={_nodes:[],name:'Converted'};
  sub._nodes=[{...receiver,properties:structuredClone(receiver.properties),graph:sub}];
  const node={id:10,subgraph:sub,title:'Converted',properties:{bvSmartPipeHost:{id:'host',name:'Converted',definitionName:'Converted'}}};
  this._nodes=[node];return {node,subgraph:sub};
 };
 graph._nodes=[receiver];const mod=await load({graph,registerExtension(){}});
 const before=mod.collectExpandedPipeAddresses(graph);before.registry[before.descriptors[0].address]={predecessorAddress:'r/external'};
 graph._convertToSubgraphImpl(new Set([receiver]));
 const after=mod.collectExpandedPipeAddresses(graph);
 assert.equal(after.registry[after.descriptors[0].address]?.predecessorAddress,'r/external');
});

test('actual wrapper keeps bypass-restored physical Merge input out of DG while publishing wireless sibling',async()=>{
 const graph=root();
 const make=(id,mode=0,predecessorId=null)=>({id,type:'BV Smart Pipe',mode,graph,inputs:[],outputs:[{name:'pipe',links:[]}],properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:String(id),name:String(id),mode:predecessorId?'follow':'root',predecessorId}}}});
 const a=make(1),bypass=make(2,4,'1'),b=make(3);
 for(const node of [a,bypass,b]){node.addInput=function(name,type){const slot={name,type};this.inputs.push(slot);return slot};node.addOutput=function(name,type){const slot={name,type};this.outputs.push(slot);return slot};}
 const merge={id:4,type:'BV Smart Pipe Merge',graph,inputs:[{name:'pipe_001',link:7}],outputs:[{name:'pipe',links:[]}],properties:{bvSmartPipeMerge:{version:1,nodeId:'merge',sources:[]}}};
 graph._nodes=[a,bypass,b,merge];graph.links={7:{origin_id:2,origin_slot:0,target_id:4,target_slot:0}};graph.getNodeById=id=>graph._nodes.find(node=>node.id===id);
 const output={1:{class_type:'BV Smart Pipe',inputs:{}},3:{class_type:'BV Smart Pipe',inputs:{}},4:{class_type:'BV Smart Pipe Merge',inputs:{}}};
 const app={graph,canvas:{},registerExtension(){},async graphToPrompt(){return {output}}};
 const mod=await load(app),routing=mod.collectExpandedPipeAddresses(graph),address=id=>routing.descriptors.find(d=>d.executionId===String(id)).address;
 merge.properties.bvSmartPipeMerge.sources=[{key:'pipe_001',mode:'wired',address:address(2)},{key:'pipe_002',mode:'wireless',address:address(3)}];
 graph.extra.bvSmartPipeRoutes[address(4)]={kind:'merge',sources:merge.properties.bvSmartPipeMerge.sources};
 const before=JSON.stringify(merge.properties.bvSmartPipeMerge.sources);let edges;
 globalThis.__bvNodePresentationBridge={publishInstanceDgProjection(_canvas,_root,value){edges=value}};
 mod.installPromptMaterializer();await app.graphToPrompt();
 assert.deepEqual(output[4].inputs.pipe_001,['1',0]);assert.deepEqual(output[4].inputs.pipe_002,['3',0]);
 assert.deepEqual(edges,[{source:address(3),target:address(4),targetInput:'pipe_002'}]);
 assert.equal(JSON.stringify(merge.properties.bvSmartPipeMerge.sources),before);assert.equal(merge.inputs[0].link,7);
});

for (const shared of [false,true]) test(`convert/unpack preserves local follow and instance routes inside native transaction (shared=${shared})`,async()=>{
 const graph=root(),parent=shared?{_nodes:[],name:'Shared'}:graph;
 const make=(id,predecessorId=null)=>({id,type:'BV Smart Pipe',graph:parent,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:String(id),name:String(id),mode:predecessorId?'follow':'root',predecessorId}}}});
 const source=make(1),receiver=make(2,'1');parent._nodes=[source,receiver];
 if(shared) graph._nodes=['a','b'].map((id,i)=>({id:i+10,subgraph:parent,properties:{bvSmartPipeHost:{id,name:id,definitionName:'Shared'}}}));
 parent._convertToSubgraphImpl=function(){
  const sub={_nodes:[],name:'New'};
  sub._nodes=[{...source,properties:structuredClone(source.properties),graph:sub}];
  const node={id:30,subgraph:sub,properties:{bvSmartPipeHost:{id:'new',name:'New',definitionName:'New'}}};
  this._nodes=[receiver,node];return {node,subgraph:sub};
 };
 parent._unpackSubgraphImpl=function(host){const node={...host.subgraph._nodes[0],graph:this};this._nodes=[receiver,node];};
 const mod=await load({graph,registerExtension(){}});const before=mod.collectExpandedPipeAddresses(graph);
 const host=parent._convertToSubgraphImpl().node;
 // Native afterChange sees this registry; no deferred monitor is needed.
 const converted=mod.collectExpandedPipeAddresses(graph);
 for(const target of converted.descriptors.filter(d=>d.route.nodeId==='2')) {
  assert.equal(converted.registry[target.address].predecessorAddress,target.address.replace(/2$/,'new/1'));
 }
 const saved=JSON.parse(JSON.stringify(graph.extra.bvSmartPipeRoutes));
 parent._unpackSubgraphImpl(host);
 const unpacked=mod.collectExpandedPipeAddresses(graph);
 for(const target of unpacked.descriptors.filter(d=>d.route.nodeId==='2')) assert.equal(unpacked.registry[target.address].predecessorAddress,target.address.replace(/2$/,'1'));
 assert.equal(before.descriptors.length,unpacked.descriptors.length);
 assert.notDeepEqual(saved,unpacked.registry);
});

test('unsupported native seam refuses operation before topology mutation',async()=>{
 const graph=root();let called=false;graph.convertToSubgraph=()=>{called=true};
 graph._nodes=[{id:1,type:'BV Smart Pipe',graph,properties:{bvSmartPipe:{routing:{nodeId:'1',name:'1',mode:'root'}}}}];
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 assert.throws(()=>graph.convertToSubgraph(),/unsupported native/);assert.equal(called,false);
});

test('unexpected post-native identity change preserves exact original registry and reports changed topology',async()=>{
 const graph=root();
 const receiver={id:1,type:'BV Smart Pipe',graph,properties:{bvSmartPipe:{routing:{nodeId:'old',name:'Receiver',mode:'root'}}}};
 const merge={id:2,type:'BV Smart Pipe Merge',graph,properties:{bvSmartPipeMerge:{nodeId:'merge',sources:[]}}};
 graph._nodes=[receiver,merge];
 graph._convertToSubgraphImpl=function(){
  const sub={_nodes:[],name:'Converted'};sub._nodes=[{...receiver,graph:sub,properties:{bvSmartPipe:{routing:{nodeId:'unexpected',name:'Receiver',mode:'root'}}}}];
  const node={id:3,subgraph:sub,properties:{bvSmartPipeHost:{id:'host',name:'Host',definitionName:'Converted'}}};this._nodes=[merge,node];return {node};
 };
 const mod=await load({graph,registerExtension(){}}),before=mod.collectExpandedPipeAddresses(graph);
 before.registry[before.descriptors[0].address]={predecessorAddress:'external'};
 const original=structuredClone(before.registry);
 assert.throws(()=>graph._convertToSubgraphImpl(),/after native topology changed/);
 assert.deepEqual(graph.extra.bvSmartPipeRoutes,original);
 assert.equal(graph._nodes[1].id,3);
});

test('unpack rejects nested host ID collision before native mutation',async()=>{
 const graph=root();let called=false;
 const inner={_nodes:[],name:'Inner'};inner._nodes=[{id:1,type:'BV Smart Pipe',graph:inner,properties:{bvSmartPipe:{routing:{nodeId:'pipe',name:'Pipe',mode:'root'}}}}];
 const nested={id:2,subgraph:inner,properties:{bvSmartPipeHost:{id:'same',name:'Nested',definitionName:'Inner'}}};
 const parent={_nodes:[nested],name:'Parent'};
 const host={id:3,subgraph:parent,properties:{bvSmartPipeHost:{id:'parent',name:'Parent',definitionName:'Parent'}}};
 graph._nodes=[host,{id:4,subgraph:inner,properties:{bvSmartPipeHost:{id:'same',name:'Other',definitionName:'Inner'}}}];
 graph._unpackSubgraphImpl=()=>{called=true};
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 assert.throws(()=>graph._unpackSubgraphImpl(host),/existing subgraph routing identity/);assert.equal(called,false);
});

test('Merge and source relocation is captured in native Undo/Redo snapshots and survives cleanup',async()=>{
 const graph=root();
 const source={id:1,type:'BV Smart Pipe',graph,properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}};
 const merge={id:2,type:'BV Smart Pipe Merge',graph,properties:{bvSmartPipeMerge:{nodeId:'merge',sources:[]}}};
 graph._nodes=[source,merge];
 const states=[];
 const snapshot=()=>({nodes:graph._nodes,extra:JSON.parse(JSON.stringify(graph.extra))});
 graph.convertToSubgraph=function(){states.push(snapshot());try{return this._convertToSubgraphImpl()}finally{states.push(snapshot())}};
 graph._convertToSubgraphImpl=function(){
  const sub={_nodes:[],name:'Group'};
  sub._nodes=this._nodes.map(node=>({...node,graph:sub,properties:structuredClone(node.properties)}));
  const node={id:3,subgraph:sub,properties:{bvSmartPipeHost:{id:'group',name:'Group',definitionName:'Group'}}};this._nodes=[node];return {node};
 };
 graph._unpackSubgraphImpl=function(host){this._nodes=host.subgraph._nodes.map(node=>({...node,graph:this,properties:structuredClone(node.properties)}))};
 const mod=await load({graph,registerExtension(){}}),initial=mod.collectExpandedPipeAddresses(graph);
 const addr=id=>initial.descriptors.find(d=>d.route.nodeId===id).address;
 initial.registry[addr('merge')]={kind:'merge',sources:[{key:'pipe_003',mode:'wireless',address:addr('source')},{key:'pipe_008',mode:'wireless',address:'external/source'}],projection:{resolvedSlots:[{id:'value'}]}};
 const original=structuredClone(initial.registry);
 const host=graph.convertToSubgraph().node;
 const converted=mod.collectExpandedPipeAddresses(graph),mergeAddress=converted.descriptors.find(d=>d.kind==='merge').address;
 assert.deepEqual(states[1].extra.bvSmartPipeRoutes,converted.registry);
 assert.equal(converted.registry[mergeAddress].sources[0].address,converted.descriptors.find(d=>d.kind==='pipe').address);
 assert.equal(converted.registry[mergeAddress].sources[1].address,'external/source');
 assert.deepEqual(converted.registry[mergeAddress].sources.map(s=>s.key),['pipe_003','pipe_008']);
 assert.deepEqual(converted.registry[mergeAddress].projection,{resolvedSlots:[{id:'value'}]});
 for(const state of [states[0],states[1]]) {
  graph._nodes=state.nodes;graph.extra=structuredClone(state.extra);
  const routing=mod.collectExpandedPipeAddresses(graph),cleanup={};
  const live=new Set(routing.descriptors.map(d=>d.address));
  reconcileRouteRegistryDestinations(routing.registry,live,cleanup,0);
  reconcileRouteRegistryDestinations(routing.registry,live,cleanup,2000);
  assert.deepEqual(routing.registry,state.extra.bvSmartPipeRoutes);
 }
 graph._unpackSubgraphImpl(host);
 assert.deepEqual(graph.extra.bvSmartPipeRoutes,original);
});

test('convert normalizes only selected SmartPipe wildcard output-boundary metadata before native lookup',async()=>{
 const graph=root();graph.outputNode={id:-20};graph.outputs=[{type:'BV_SMART_PIPE'}];
 const source={id:1,type:'BV Smart Pipe',graph,outputs:[{type:'BV_SMART_PIPE'}],properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}};
 graph._nodes=[source];graph._links=new Map([[1,{origin_id:1,origin_slot:0,target_id:-20,target_slot:0,type:'*'}],[2,{origin_id:2,origin_slot:0,target_id:-20,target_slot:0,type:'*'}]]);
 graph._convertToSubgraphImpl=function(){assert.equal(this._links.get(1).type,'BV_SMART_PIPE');assert.equal(this._links.get(2).type,'*');return {}};
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 graph._convertToSubgraphImpl(new Set([source]));
});

test('native failure restores wildcard metadata without touching mismatching endpoints',async()=>{
 const graph=root();graph.outputNode={id:-20};graph.outputs=[{type:'BV_SMART_PIPE'},{type:'STRING'}];
 const source={id:1,type:'BV Smart Pipe',graph,outputs:[{type:'BV_SMART_PIPE'}],properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}};
 const link={origin_id:1,origin_slot:0,target_id:-20,target_slot:0,type:'*'};
 const mismatch={...link,target_slot:1};graph._nodes=[source];graph._links=new Map([[1,link],[2,mismatch]]);
 graph._convertToSubgraphImpl=function(){assert.equal(link.type,'BV_SMART_PIPE');assert.equal(mismatch.type,'*');throw new Error('native failure')};
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 assert.throws(()=>graph._convertToSubgraphImpl(new Set([source])),/native failure/);
 assert.equal(link.type,'*');assert.equal(mismatch.type,'*');
});

test('serialized dynamic port order is restored before native reconnect, preserving slot objects',async()=>{
 const graph=root();graph._nodes=[];
 const mod=await load({graph,registerExtension(){}});
 const first={name:'pipe_001',type:'BV_SMART_PIPE'},third={name:'pipe_003',type:'BV_SMART_PIPE'},output={name:'pipe',type:'BV_SMART_PIPE'};
 const node={inputs:[first,third],outputs:[output,{name:'out_001',type:'*'}]};
 mod.restoreSerializedPipeSlots(node,{inputs:[{name:'pipe_003'}],outputs:[{name:'pipe'}]});
 assert.deepEqual(node.inputs,[third]);assert.equal(node.inputs[0],third);assert.equal(node.outputs[0],output);assert.equal(node.outputs.length,1);
 const original=[...node.inputs];
 assert.throws(()=>mod.restoreSerializedPipeSlots(node,{inputs:[{name:'missing'}],outputs:[]}),/serialized.*slot/i);
 assert.deepEqual(node.inputs,original);
});

test('only known native Add action slots may be created while restoring compact shape',async()=>{
 const graph=root(),mod=await load({graph,registerExtension(){}});
 const port={name:'pipe_003',type:'BV_SMART_PIPE'};
 const node={inputs:[port],outputs:[],addInput(name,type){const input={name,type};this.inputs.push(input);return input}};
 mod.restoreSerializedPipeSlots(node,{inputs:[{name:'pipe_003'},{name:'bv_add_pipe_source',type:'BV_SMART_PIPE',label:'+ Add Pipe Source'}],outputs:[]});
 assert.equal(node.inputs[0],port);assert.equal(node.inputs[1].bvAddPipeSource,true);
 assert.equal(node.inputs[1].label,'+ Add Pipe Source');
});

test('unpack restores original definition link fields even on native failure',async()=>{
 const graph=root(),sub={_nodes:[],name:'Group'};
 const source={id:1,type:'BV Smart Pipe',graph:sub,properties:{bvSmartPipe:{routing:{nodeId:'source',name:'Source',mode:'root'}}}};sub._nodes=[source];
 const link={id:1,origin_id:1,origin_slot:0,target_id:-20,target_slot:0};sub._links=new Map([[1,link]]);
 const host={id:2,subgraph:sub,properties:{bvSmartPipeHost:{id:'group',name:'Group',definitionName:'Group'}}};graph._nodes=[host];
 const add=function(node){node.graph=this;this._nodes.push(node)};graph.add=add;
 graph._unpackSubgraphImpl=function(){link.origin_id=99;link.target_id=100;link.parentId=7;throw new Error('native failure')};
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 const before=structuredClone(link);
 assert.throws(()=>graph._unpackSubgraphImpl(host),/native failure/);
 assert.deepEqual(link,before);assert.equal(sub._links.get(1),link);assert.equal(graph.add,add);
});

test('unpack uses pre-multiClone slot shape rather than expanded clone serialization',async()=>{
 const graph=root(),sub={_nodes:[],name:'Group'};
 const merge={id:1,type:'BV Smart Pipe Merge',graph:sub,inputs:[{name:'pipe_003'}],outputs:[{name:'pipe'}],properties:{bvSmartPipeMerge:{nodeId:'merge',sources:[]}}};sub._nodes=[merge];
 const host={id:2,subgraph:sub,properties:{bvSmartPipeHost:{id:'group',name:'Group',definitionName:'Group'}}};graph._nodes=[host];
 graph.add=function(node){node.graph=this;this._nodes.push(node)};
 let clone;
 graph._unpackSubgraphImpl=function(){
  clone={id:3,type:'BV Smart Pipe Merge',configure(data){this.properties=structuredClone(data.properties);this.inputs=data.inputs.map(s=>({...s}));this.outputs=[{name:'pipe'}]}};
  this.add(clone);
  clone.configure({properties:merge.properties,inputs:[{name:'pipe_001'},{name:'pipe_002'},{name:'pipe_003'}],outputs:[{name:'pipe'}]});
  assert.equal(clone.inputs[0].name,'pipe_003');assert.equal(clone.inputs.length,1);
  this._nodes=this._nodes.filter(n=>n!==host);
 };
 const mod=await load({graph,registerExtension(){}});mod.collectExpandedPipeAddresses(graph);
 graph._unpackSubgraphImpl(host);
 assert.equal(clone.inputs[0].name,'pipe_003');
});

for (const addressed of [false,true]) test(`native removed physical source prunes wireless followers (${addressed?'addressed':'local'})`,async()=>{
 const graph=root();
 const make=(id,mode=0,predecessorId=null)=>({id,type:'BV Smart Pipe',mode,graph,inputs:[{name:'pipe',link:null}],outputs:[{name:'pipe',links:[]}],properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:String(id),name:String(id),mode:predecessorId?'follow':'root',predecessorId}}},addInput(name,type){const slot={name,type};this.inputs.push(slot);return slot},addOutput(name,type){const slot={name,type};this.outputs.push(slot);return slot}});
 const a=make(1,2),b=make(2),c=make(3,0,'2'),d=make(4,0,'3'),independent=make(5);
 b.inputs[0].link=1;graph.links={1:{origin_id:1,origin_slot:0,target_id:2,target_slot:0}};graph.getNodeById=id=>graph._nodes.find(n=>n.id===id);graph._nodes=[a,b,c,d,independent];
 const output=Object.fromEntries([b,c,d,independent].map(n=>[n.id,{class_type:'BV Smart Pipe',inputs:{bv_smart_pipe_route_json:JSON.stringify(n.properties.bvSmartPipe.routing)}}]));
 output.preview={class_type:'Preview',inputs:{source:['4',0]}};
 const app={graph,canvas:{},registerExtension(){},async graphToPrompt(){return {output}}};
 const mod=await load(app);const routing=mod.collectExpandedPipeAddresses(graph);
 if(addressed){const addr=id=>routing.descriptors.find(d=>d.executionId===String(id)).address;graph.extra.bvSmartPipeRoutes={[addr(3)]:{predecessorAddress:addr(2)},[addr(4)]:{predecessorAddress:addr(3)}};}
 mod.installPromptMaterializer();await app.graphToPrompt();assert.deepEqual(Object.keys(output),['5']);
});
test('cold reload restores exact shared deep instance without navigation events',async()=>{
 const previous=globalThis.sessionStorage,storage=new Map();
 globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
 const fixture=()=>{
  const graph={...root(),id:'workflow',extra:{bvSmartPipeRootId:'reload-root'}},shared={id:'shared',_nodes:[],name:'Shared'},deep={id:'deep',_nodes:[],name:'Deep'};
  const inner={id:1,type:'BV Smart Pipe',graph:deep,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}};deep._nodes=[inner];
  const child={id:30,subgraph:deep,title:'Deep',properties:{bvSmartPipeHost:{id:'deep-host',name:'Deep',definitionName:'Deep'}}};shared._nodes=[child];
  graph._nodes=[10,20].map(id=>({id,subgraph:shared,title:`Host ${id}`,properties:{bvSmartPipeHost:{id:`h${id}`,name:`Host ${id}`,definitionName:'Shared'}}}));
  return {graph,shared,deep,inner,child};
 };
 try{
  const a=fixture(),surface=new EventTarget(),app={graph:a.graph,canvas:{canvas:surface,graph:a.graph},registerExtension(){}};
  const mod=await load(app);globalThis.requestAnimationFrame=()=>0;mod.installSubgraphContextTracking();
  surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:a.graph,subgraph:a.shared,fromNode:a.graph._nodes[1]}}));
  surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:a.shared,subgraph:a.deep,fromNode:a.child}}));
  const b=fixture(),fresh={graph:b.graph,canvas:{canvas:new EventTarget(),graph:b.deep},registerExtension(){}};
  const restored=await load(fresh);restored.installSubgraphContextTracking();
  assert.deepEqual(restored.activeDescriptorFor(b.inner)?.hostPath,['h20','deep-host']);
  const saved=storage.get('bv.smartPipe.navigation.v1');
  for(const patch of [{rootId:'other'},{graphId:'other'},{hostPath:['missing','deep-host']},{hostPath:['h20','deep-host','extra']},{hostPath:[]},{version:99}]){
   storage.set('bv.smartPipe.navigation.v1',JSON.stringify({...JSON.parse(saved),...patch}));
   const c=fixture(),cold={graph:c.graph,canvas:{canvas:new EventTarget(),graph:c.deep},registerExtension(){}};
   const rejected=await load(cold);rejected.installSubgraphContextTracking();
   assert.equal(rejected.activeDescriptorFor(c.inner),null,JSON.stringify(patch));
  }
  storage.set('bv.smartPipe.navigation.v1',saved);
  const c=fixture();c.graph._nodes[0].properties.bvSmartPipeHost.id='h20';
  const duplicate=await load({graph:c.graph,canvas:{canvas:new EventTarget(),graph:c.deep},registerExtension(){}});
  duplicate.installSubgraphContextTracking();
  // Inspect supplied descriptors to avoid discovery repairing the deliberately duplicate fixture.
  assert.equal(duplicate.activeDescriptorFor(c.inner,{descriptors:[{node:c.inner,hostPath:['h20','deep-host']},{node:c.inner,hostPath:['h20','deep-host']}]}),null);
  surface.dispatchEvent(new CustomEvent('litegraph:set-graph',{detail:{newGraph:a.shared}}));
  assert.deepEqual(JSON.parse(storage.get('bv.smartPipe.navigation.v1')).hostPath,['h20']);
  assert.equal(JSON.parse(storage.get('bv.smartPipe.navigation.v1')).graphId,'shared');
 }finally{if(previous===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=previous;}
});
const routing=()=>({descriptors:[{executionId:'1',address:'r/a',route:{mode:'root'},node:{inputs:[]}}],registry:{}});

test('actual wrapper isolates publish/clear failures from a valid compiler result',async()=>{
    const result={output:{}};const app={graph:root(),canvas:{},registerExtension(){},async graphToPrompt(){return result}};
    const mod=await load(app);globalThis.__bvNodePresentationBridge={publishInstanceDgProjection(){throw Error('draw failed')},clearInstanceDgProjection(){throw Error('clear failed')}};
    mod.installPromptMaterializer();assert.equal(await app.graphToPrompt(),result);assert.deepEqual(result,{output:{}});
});
test('actual wrapper suppresses stale root publication and preserves compiler rejection',async()=>{
    let release,published=0,cleared=0;
    const app={graph:root(),canvas:{},registerExtension(){},graphToPrompt(){return new Promise(resolve=>release=resolve)}};
    globalThis.__bvNodePresentationBridge={publishInstanceDgProjection(){published++},clearInstanceDgProjection(){cleared++}};
    const mod=await load(app);mod.installPromptMaterializer();const waiting=app.graphToPrompt();app.graph=root();release({output:{}});await waiting;assert.equal(published,0);
    const failing={graph:root(),canvas:{},registerExtension(){},async graphToPrompt(){throw Error('compiler error')}};
    const other=await load(failing);other.installPromptMaterializer();await assert.rejects(failing.graphToPrompt(),/compiler error/);assert.equal(cleared,1);
});
test('actual scheduler settles, coalesces pending revisions, and disables debug without export',async()=>{
    let calls=0,debug=true,release;
    const app={graph:root(),canvas:{},registerExtension(){},graphToPrompt(){calls++;return new Promise(resolve=>release=resolve)}};
    globalThis.__bvNodePresentationBridge={dgDebugVisible:()=>debug,clearInstanceDgProjection(){}};
    const mod=await load(app),snapshot=routing();
    mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,1);
    mod.refreshDgProjection(snapshot);assert.equal(calls,1);
    snapshot.registry.x={predecessorAddress:'other'};mod.refreshDgProjection(snapshot);
    snapshot.registry.x={predecessorAddress:'last'};mod.refreshDgProjection(snapshot);assert.equal(calls,1);
    release({output:{}});await settle();mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,2);
    release({output:{}});await settle();mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,2);
    debug=false;mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,2);
});
test('failed scheduled export retries only after a new valid change',async()=>{
    let calls=0;const app={graph:root(),canvas:{},registerExtension(){},async graphToPrompt(){calls++;if(calls===1)throw Error('missing source');return {output:{}}}};
    globalThis.__bvNodePresentationBridge={dgDebugVisible:()=>true,clearInstanceDgProjection(){}};
    const mod=await load(app),snapshot=routing();mod.refreshDgProjection(snapshot);await settle();mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,1);
    snapshot.registry.x={predecessorAddress:'valid'};mod.refreshDgProjection(snapshot);await settle();assert.equal(calls,2);
});

test('native HTML canvas navigation selects the concrete shared-definition host',async()=>{
    const graph=root(),shared={_nodes:[],name:'Shared'};
    const inner={id:1,type:'BV Smart Pipe',graph:shared,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}};
    shared._nodes=[inner];
    const host=id=>({id,subgraph:shared,title:`Host ${id}`,properties:{bvSmartPipeHost:{id:`h${id}`,name:`Host ${id}`,definitionName:'Shared'}}});
    graph._nodes=[host(10),host(20)];
    const surface=new EventTarget(),app={graph,canvas:{canvas:surface},registerExtension(){}};
    const mod=await load(app);globalThis.requestAnimationFrame=()=>0;
    mod.installSubgraphContextTracking();
    surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:graph,subgraph:shared,fromNode:graph._nodes[1]}}));
    assert.deepEqual(mod.activeDescriptorFor(inner)?.hostPath,['h20']);
});

test('context tracking installs late and is idempotent for the same HTML canvas',async()=>{
    const app={graph:root(),registerExtension(){}};
    const mod=await load(app);
    mod.installSubgraphContextTracking();
    let registrations=0;
    const surface={addEventListener(){registrations++}};
    app.canvas={canvas:surface};
    mod.installSubgraphContextTracking();
    mod.installSubgraphContextTracking();
    assert.equal(registrations,2);
    assert.equal(app.__bvSmartPipeContextTracking,surface);
});

test('repeated instance discovery and restore do not rename the shared native definition',async()=>{
    const graph=root(),shared={_nodes:[],name:'User definition'};
    shared._nodes=[{id:1,type:'BV Smart Pipe',graph:shared,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}}];
    graph._nodes=[10,20].map(id=>({id,title:'User definition',subgraph:shared,properties:{bvSmartPipeHost:{id:`h${id}`,name:`Instance ${id}`,definitionName:'User definition'}}}));
    const app={graph,registerExtension(){}};const mod=await load(app);
    for(let i=0;i<5;i++)mod.collectExpandedPipeAddresses(graph);
    assert.equal(shared.name,'User definition');
    assert.deepEqual(graph._nodes.map(n=>n.properties.bvSmartPipeHost.name),['Instance 10','Instance 20']);
    for(const host of graph._nodes){host.properties=JSON.parse(JSON.stringify(host.properties));delete host.__bvLastHostRoutingTitle;}
    for(let i=0;i<5;i++)mod.collectExpandedPipeAddresses(graph);
    assert.equal(shared.name,'User definition');
    shared.name='Renamed by user';
    mod.collectExpandedPipeAddresses(graph);
    assert.equal(shared.name,'Renamed by user');
    assert.deepEqual(graph._nodes.map(n=>n.properties.bvSmartPipeHost.id),['h10','h20']);
});

test('two-level shared navigation retains the concrete outer and inner host path',async()=>{
    const graph=root(),shared={_nodes:[],name:'Shared'},deep={_nodes:[],name:'Deep'};
    const inner={id:1,type:'BV Smart Pipe',graph:deep,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}};
    deep._nodes=[inner];
    const child={id:30,subgraph:deep,title:'Deep',properties:{bvSmartPipeHost:{id:'deep',name:'Deep',definitionName:'Deep'}}};shared._nodes=[child];
    graph._nodes=[10,20].map(id=>({id,subgraph:shared,title:`Host ${id}`,properties:{bvSmartPipeHost:{id:`h${id}`,name:`Host ${id}`,definitionName:'Shared'}}}));
    const surface=new EventTarget(),app={graph,canvas:{canvas:surface},registerExtension(){}};
    const mod=await load(app);globalThis.requestAnimationFrame=()=>0;mod.installSubgraphContextTracking();
    for(const host of graph._nodes){
        surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:graph,subgraph:shared,fromNode:host}}));
        surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:shared,subgraph:deep,fromNode:child}}));
        assert.deepEqual(mod.activeDescriptorFor(inner)?.hostPath,[`h${host.id}`,'deep']);
    }
});

test('Nodes2 captured combo options retain live choices and wired label',async()=>{
    const graph=root();let captured;
    const make=(id,name)=>({id,type:'BV Smart Pipe',graph,inputs:[],outputs:[],properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:String(id),name,mode:'root'}}}});
    const receiver=make(1,'Receiver'),sender=make(2,'Sender');graph._nodes=[receiver];
    receiver.addWidget=(type,name,value,callback,options)=>{if(type==='combo')captured={...options};return {type,name,value,callback,options};};
    const app={graph,registerExtension(){}};const mod=await load(app);globalThis.requestAnimationFrame=()=>0;mod.setupNode(receiver);
    const values=()=>typeof captured.values==='function'?captured.values():captured.values;
    graph._nodes.push(sender);mod.updatePredecessorWidget(receiver);
    assert.ok(values().some(label=>label.includes('Sender')));
    graph.links={1:{origin_id:2}};graph.getNodeById=id=>graph._nodes.find(n=>n.id===id);receiver.inputs=[{name:'pipe',link:1}];
    mod.updatePredecessorWidget(receiver);assert.deepEqual(values(),['Wired: Sender']);
    receiver.inputs[0].link=null;mod.updatePredecessorWidget(receiver);assert.ok(values().some(label=>label.includes('Sender')));
});

test('Undo reconstruction rebinds the selected shared instance without changing routes',async()=>{
    const graph=root(),surface=new EventTarget(),app={graph,canvas:{canvas:surface},registerExtension(){}};
    const rebuild=()=>{
        const deep={_nodes:[],name:'Deep'},shared={_nodes:[],name:'Shared'};
        const inner={id:1,type:'BV Smart Pipe',graph:deep,properties:{bvSmartPipe:{localSlots:[],inheritedSlots:[],resolvedSlots:[],routing:{nodeId:'inner',name:'Inner',mode:'root'}}}};
        deep._nodes=[inner];
        const child={id:30,subgraph:deep,title:'Deep',properties:{bvSmartPipeHost:{id:'deep',name:'Deep',definitionName:'Deep'}}};shared._nodes=[child];
        graph._nodes=[10,20].map(id=>({id,subgraph:shared,title:`Host ${id}`,properties:{bvSmartPipeHost:{id:`h${id}`,name:`Host ${id}`,definitionName:'Shared'}}}));
        return {deep,shared,inner,child};
    };
    let current=rebuild();const mod=await load(app);globalThis.requestAnimationFrame=()=>0;mod.installSubgraphContextTracking();
    surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:graph,subgraph:current.shared,fromNode:graph._nodes[1]}}));
    surface.dispatchEvent(new CustomEvent('subgraph-opened',{detail:{closingGraph:current.shared,subgraph:current.deep,fromNode:current.child}}));
    const address=mod.activeDescriptorFor(current.inner).address;
    graph.extra.bvSmartPipeRoutes={[address]:{predecessorAddress:'external'}};
    const registry=JSON.stringify(graph.extra.bvSmartPipeRoutes);
    current=rebuild();app.canvas.graph=current.deep;
    surface.dispatchEvent(new CustomEvent('litegraph:set-graph',{detail:{newGraph:current.deep}}));
    assert.equal(mod.activeDescriptorFor(current.inner)?.address,address);
    assert.equal(JSON.stringify(graph.extra.bvSmartPipeRoutes),registry);
    // No first-candidate fallback for an invalid/ambiguous logical host path.
    current=rebuild();app.canvas.graph=current.deep;graph._nodes[1].properties.bvSmartPipeHost.id='gone';
    assert.equal(mod.activeDescriptorFor(current.inner),null);
    current=rebuild();app.canvas.graph=current.deep;graph._nodes[0].properties.bvSmartPipeHost.id='h20';
    const supplied={descriptors:graph._nodes.map((host,i)=>({node:current.inner,address:String(i),hostPath:[host.properties.bvSmartPipeHost.id,'deep']}))};
    assert.equal(mod.activeDescriptorFor(current.inner,supplied),null);
    current=rebuild();app.canvas.graph=current.deep;app.graph={...graph};
    assert.equal(mod.activeDescriptorFor(current.inner),null);
});

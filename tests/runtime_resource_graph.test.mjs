import assert from"node:assert/strict";
import test from"node:test";
import{connectRuntimeResource,disconnectRuntimeResource}from"../ui/src/regional/runtimeResourceGraph.ts";

const TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
const makeGraph=()=>({_nodes:[],links:new Map(),lastLinkId:0,getNodeById(id){return this._nodes.find(node=>node.id===id)}});
const native={
 connect(output,target,input){if(this.graph!==target.graph)return null;const id=++this.graph.lastLinkId;this.graph.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});(this.outputs[output].links??=[]).push(id);target.inputs[input].link=id;return id},
 disconnectInput(input){const id=this.inputs[input]?.link,link=this.graph.links.get(id);if(!link)return false;const source=this.graph.getNodeById(link.origin_id);source.outputs[link.origin_slot].links=source.outputs[link.origin_slot].links.filter(value=>value!==id);this.graph.links.delete(id);this.inputs[input].link=null;return true},
};

test("runtime resource adapter preserves native connect semantics in the concrete owner",()=>{
 const root=makeGraph(),owner=makeGraph(),source=Object.assign({id:1,graph:root,__bvConcreteGraph:owner,outputs:[{type:TYPE,links:[]}]},native),target=Object.assign({id:2,graph:root,__bvConcreteGraph:owner,inputs:[{type:TYPE,link:null}]},native);owner._nodes=[source,target];
 assert.equal(connectRuntimeResource(owner,source,0,target,0),true);const id=target.inputs[0].link;
 assert.equal(owner.links.size,1);assert.equal(root.links.size,0);assert.equal(source.graph,root);assert.equal(target.graph,root);assert.deepEqual(source.outputs[0].links,[id]);
 assert.equal(connectRuntimeResource(owner,source,0,target,0),true);assert.equal(owner.links.size,1);
 assert.equal(disconnectRuntimeResource(owner,target,0),true);assert.equal(owner.links.size,0);assert.equal(target.inputs[0].link,null);assert.equal(source.graph,root);assert.equal(target.graph,root);
});

test("runtime resource adapter restores absent graph properties and thrown native calls",()=>{
 const root=makeGraph(),owner=makeGraph(),prototype={graph:root},source=Object.assign(Object.create(prototype),{id:1,__bvConcreteGraph:owner,outputs:[{type:TYPE,links:[]}],connect(){throw new Error("native failure")}}),target=Object.assign({id:2,graph:root,__bvConcreteGraph:owner,inputs:[{type:TYPE,link:null}]},native);owner._nodes=[source,target];
 assert.equal(Object.hasOwn(source,"graph"),false);assert.throws(()=>connectRuntimeResource(owner,source,0,target,0),/native failure/);assert.equal(Object.hasOwn(source,"graph"),false);assert.equal(source.graph,root);assert.equal(target.graph,root);assert.equal(owner.links.size,0);
});

test("runtime resource adapter rejects cross-owner links without native mutation",()=>{
 const root=makeGraph(),owner=makeGraph(),other=makeGraph();let connects=0;const source={id:1,graph:root,__bvConcreteGraph:owner,outputs:[{type:TYPE,links:[]}],connect(){connects++}},target={id:2,graph:root,__bvConcreteGraph:other,inputs:[{type:TYPE,link:null}],disconnectInput(){throw new Error("must not disconnect")}};
 assert.equal(connectRuntimeResource(owner,source,0,target,0),false);assert.equal(connects,0);assert.equal(owner.links.size,0);assert.equal(root.links.size,0);
});

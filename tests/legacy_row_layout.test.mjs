import assert from 'node:assert/strict';
import test from 'node:test';
import {applyClassicNodePresentation,removeNodePresentation} from '../ui/src/regional/classicNodePresentation.ts';
import {installNodePresentationLifecycle} from '../ui/src/regional/nodePresentationLifecycle.ts';
import {installProjectedPortInteraction} from '../ui/src/regional/projectedPortInteraction.ts';

// Native slotCalculations uses !slot.pos, not slot.hidden, for vertical ranks.
function fixture(){
 const node={pos:[100,200],size:[320,300],properties:{},inputs:['model','clip','regional','lora_registry','lora_bindings','vae','target_latent'].map(name=>({name,link:null})),outputs:['patched_model','positive','negative'].map(name=>({name,links:[]})),widgets:[{name:'mode',computeSize:()=>[0,20]}],
  getInputPos(index){const slot=this.inputs[index];if(slot.pos)return[this.pos[0]+slot.pos[0],this.pos[1]+slot.pos[1]];return[this.pos[0]+10,this.pos[1]+(this.inputs.filter(slot=>!slot.pos&&!slot.widget).indexOf(slot)+.7)*20]},
  getConnectionPos(input,index){return this.getInputPos(index)},
  getInputOnPos(point){return this.inputs.find((slot,index)=>{const p=this.getInputPos(index);return Math.abs(p[0]-point[0])<8&&Math.abs(p[1]-point[1])<8})},
  computeSize(){return[320,40+Math.max(this.inputs.filter(s=>!s.pos).length,this.outputs.filter(s=>!s.pos).length)*20+20]},
  setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
 return node;
}
test('hidden legacy inputs leave no gaps before optional public Krea inputs',()=>{
 const node=fixture(),inputs=[...node.inputs];
 applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
 assert.equal(node.getInputPos(5)[1]-node.getInputPos(2)[1],20);
 assert.equal(node.getInputPos(6)[1]-node.getInputPos(5)[1],20);
 assert.deepEqual(node.inputs,inputs);
 assert.equal(node.getInputOnPos(node.getConnectionPos(true,5)),inputs[5]);
 assert.equal(node.widgets_start_y,106);
 removeNodePresentation(node);
});
test('debug and connected legacy ports restore their rows without changing slot identities',()=>{
 const node=fixture(),inputs=[...node.inputs];
 for(const [debug,link,delta]of [[false,null,20],[true,null,60],[false,42,40],[false,null,20]]){
  inputs[3].link=link;
  applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:debug});
  assert.equal(node.getInputPos(5)[1]-node.getInputPos(2)[1],delta);
  assert.equal(node.getInputOnPos(node.getInputPos(5)),inputs[5]);
  assert.equal(node.inputs[3].link,link);node.inputs.forEach((slot,i)=>assert.equal(slot,inputs[i]));
 }
 removeNodePresentation(node);
 assert.ok(inputs.every(slot=>!Object.hasOwn(slot,'pos')));
});
test('hidden anchors are not clickable and later DG ownership still applies',()=>{
 const node=fixture();
 applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
 const hidden=node.inputs[3],point=[node.pos[0]+hidden.pos[0],node.pos[1]+hidden.pos[1]];
 assert.equal(node.getInputOnPos(point),undefined);
 const provider={name:'reference_resource_provider_1',link:null};node.inputs.push(provider);
 installProjectedPortInteraction(node,slot=>slot===provider);
 assert.equal(node.getInputOnPos(node.getInputPos(7)),undefined);
 assert.equal(node.getInputOnPos(node.getInputPos(5)),node.inputs[5]);
 removeNodePresentation(node);
});
test('native explicit-pos serialization keeps original geometry and input indices',()=>{
 class Node{}
 installNodePresentationLifecycle(Node,{name:'BV Regional Krea 2 Attention'});
 const node=Object.assign(new Node(),fixture()),original=[42,81];node.inputs[3].pos=original;node.inputs[5].link=99;
 applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
 const data={inputs:node.inputs.map(slot=>({name:slot.name,link:slot.link,pos:slot.pos})),outputs:[]};
 node.onSerialize(data);
 assert.equal(data.inputs[3].pos,original);assert.equal(Object.hasOwn(data.inputs[4],'pos'),false);
 assert.equal(data.inputs[5].link,99);assert.deepEqual(data.inputs.map(slot=>slot.name),node.inputs.map(slot=>slot.name));
 removeNodePresentation(node);assert.equal(node.inputs[3].pos,original);
});
test('Classic/Nodes2 transitions restore native positions and compact again',()=>{
 const previous=globalThis.LiteGraph,node=fixture();
 try{
  globalThis.LiteGraph={NODE_SLOT_HEIGHT:20,vueNodesMode:false};
  applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
  assert.equal(Object.hasOwn(node.inputs[3],'pos'),true);
  globalThis.LiteGraph.vueNodesMode=true;
  applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
  assert.equal(Object.hasOwn(node.inputs[3],'pos'),false);
  globalThis.LiteGraph.vueNodesMode=false;
  applyClassicNodePresentation(node,'BV Regional Krea 2 Attention',{legacyDebug:false});
  assert.equal(node.getInputPos(5)[1]-node.getInputPos(2)[1],20);
 }finally{removeNodePresentation(node);globalThis.LiteGraph=previous;}
});

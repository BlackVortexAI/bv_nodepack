import assert from "node:assert/strict";
import test from "node:test";
import {compactLoraConsumerNode,connectLocalLoraCollector,connectLocalLoraCollectors,connectLoraConsumerTree,downstreamLoraConsumers,ensureLoraCollectorOutput,ensureLoraConsumerInput,ensureLoraConsumerInputs,installLoraSizePolicy,linkedLocalLoraCollector,linkedLocalLoraCollectors,localLoraCollectors,migrateLegacyLoraCollectorLink,trimUnusedLoraConsumerInputs,upstreamLoraTransformer} from "../ui/src/regional/loraV3Graph.ts";

const graph=()=>({_nodes:[],links:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}});
const node=(id,type,g)=>({id,type,graph:g,inputs:[],outputs:[],addInput(name,type){this.inputs.push({name,type,link:null})},addOutput(name,type){this.outputs.push({name,type,links:null})}});

test("production LoRA slots use the permanent typed provider contract",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);
  assert.equal(ensureLoraCollectorOutput(collector),0);assert.equal(ensureLoraConsumerInput(consumer),0);
  assert.equal(collector.outputs[0].type,"BV_RUNTIME_RESOURCE_PROVIDER");assert.equal(consumer.inputs[0].hidden,true);
});
test("twenty hidden provider inputs do not reserve four hundred pixels of node height",()=>{
  let applied;const consumer={size:[320,520],inputs:Array.from({length:20},(_,index)=>({name:`resource_provider_${index+1}`,type:"BV_RUNTIME_RESOURCE_PROVIDER",hidden:true})),computeSize:()=>[300,520],setSize(size){applied=size;this.size=size}};
  compactLoraConsumerNode(consumer);assert.deepEqual(applied,[320,120]);assert.deepEqual(consumer.computeSize(),[300,120]);
});
test("provider compaction remains active when ComfyUI recomputes a new node",()=>{
  const consumer={size:[320,520],inputs:Array.from({length:20},(_,index)=>({name:`resource_provider_${index+1}`,type:"BV_RUNTIME_RESOURCE_PROVIDER"})),computeSize:()=>[300,520]};
  installLoraSizePolicy(consumer);assert.deepEqual(consumer.computeSize(),[300,120]);assert.equal(consumer.__bvLoraOriginalComputeSize instanceof Function,true);
});
test("a new consumer removes every unused backend provider slot",()=>{
  const consumer={inputs:Array.from({length:20},(_,index)=>({name:`resource_provider_${index+1}`,type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null})),removeInput(index){this.inputs.splice(index,1)}};
  trimUnusedLoraConsumerInputs(consumer,0);assert.deepEqual(consumer.inputs,[]);
});
test("trimming preserves configured ordinals and any linked later slot",()=>{
  const consumer={inputs:Array.from({length:5},(_,index)=>({name:`resource_provider_${index+1}`,type:"BV_RUNTIME_RESOURCE_PROVIDER",link:index===3?44:null})),removeInput(index){this.inputs.splice(index,1)}};
  trimUnusedLoraConsumerInputs(consumer,2);assert.deepEqual(consumer.inputs.map(slot=>slot.name),["resource_provider_1","resource_provider_2","resource_provider_4"]);
});

test("collector connections are ordinary same-graph links",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);g._nodes.push(collector,consumer);
  collector.connect=function(output,target,input){const id=7;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id};
  assert.equal(connectLocalLoraCollector(consumer,collector),true);assert.equal(linkedLocalLoraCollector(consumer),collector);
});
test("one consumer persists independent typed links for two collectors",()=>{
  const g=graph(),first=node(1,"BV LoRA Stack Collector",g),second=node(2,"BV LoRA Stack Collector",g),consumer=node(3,"BV Regional LoRA",g);g._nodes.push(first,second,consumer);
  let next=20;for(const collector of [first,second])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  consumer.disconnectInput=function(index){const id=this.inputs[index].link;if(id!=null)g.links.delete(id);this.inputs[index].link=null};
  assert.equal(connectLocalLoraCollectors(consumer,[first,second]),true);assert.equal(ensureLoraConsumerInputs(consumer).length,20);
  assert.deepEqual(linkedLocalLoraCollectors(consumer).slice(0,2),[first,second]);assert.equal(consumer.inputs[0].name,"resource_provider_1");assert.equal(consumer.inputs[1].name,"resource_provider_2");
});
test("an unresolved middle collector keeps later provider ordinals stable",()=>{
  const g=graph(),first=node(1,"BV LoRA Stack Collector",g),third=node(3,"BV LoRA Stack Collector",g),consumer=node(4,"BV Regional LoRA",g);g._nodes.push(first,third,consumer);
  let next=40;for(const collector of [first,third])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.equal(connectLocalLoraCollectors(consumer,[first,null,third]),true);assert.deepEqual(linkedLocalLoraCollectors(consumer).slice(0,3),[first,null,third]);
});
test("a legacy single provider link migrates to the first multi-provider input",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);g._nodes.push(collector,consumer);ensureLoraCollectorOutput(collector);consumer.inputs=[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:7}];g.links.set(7,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});collector.outputs[0].links=[7];
  collector.connect=function(output,target,input){g.links.set(8,{origin_id:1,origin_slot:output,target_id:2,target_slot:input});this.outputs[output].links.push(8);target.inputs[input].link=8};consumer.disconnectInput=function(index){const id=this.inputs[index].link;g.links.delete(id);this.inputs[index].link=null};
  assert.equal(migrateLegacyLoraCollectorLink(consumer),true);assert.equal(consumer.inputs[0].link,null);assert.equal(linkedLocalLoraCollectors(consumer)[0],collector);
});

test("cross-graph collectors are rejected without fallback",()=>{
  const local=graph(),external=graph(),collector=node(1,"BV LoRA Stack Collector",external),consumer=node(2,"BV Regional LoRA",local);
  local._nodes.push(consumer);external._nodes.push(collector);
  assert.equal(connectLocalLoraCollector(consumer,collector),false);assert.equal(linkedLocalLoraCollector(consumer),null);
});

test("a consumer-only copy has no inferred provider and therefore stays unresolved",()=>{
  const original=graph(),collector=node(1,"BV LoRA Stack Collector",original),consumer=node(2,"BV Regional LoRA",original);original._nodes.push(collector,consumer);
  collector.connect=function(output,target,input){original.links.set(9,{origin_id:1,origin_slot:output,target_id:2,target_slot:input});this.outputs[output].links=[9];target.inputs[input].link=9};connectLocalLoraCollectors(consumer,[collector]);
  const copiedGraph=graph(),copied=node(20,"BV Regional LoRA",copiedGraph);copiedGraph._nodes.push(copied);ensureLoraConsumerInputs(copied);
  assert.deepEqual(linkedLocalLoraCollectors(copied).filter(Boolean),[]);
});

test("copying the complete provider-consumer graph preserves two independent real links",()=>{
  const g=graph(),first=node(11,"BV LoRA Stack Collector",g),second=node(12,"BV LoRA Stack Collector",g),consumer=node(13,"BV Regional LoRA",g);g._nodes.push(first,second,consumer);
  let next=30;for(const collector of [first,second])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.equal(connectLocalLoraCollectors(consumer,[first,second]),true);assert.deepEqual(linkedLocalLoraCollectors(consumer).slice(0,2),[first,second]);
});

test("picker catalog is restricted to the concrete consumer graph",()=>{
  const local=graph(),external=graph(),first=node(1,"BV LoRA Stack Collector",local),second=node(2,"BV LoRA Stack Collector",external),consumer=node(3,"BV Regional LoRA",local);
  local._nodes.push(first,consumer);external._nodes.push(second);
  assert.deepEqual(localLoraCollectors(consumer),[first]);
});

test("collector discovery supports the Nodes 2.0 comfyClass identity",()=>{
  const g=graph(),collector=node(1,undefined,g),consumer=node(2,"BV Regional Prompt",g);collector.comfyClass="BV LoRA Stack Collector";g._nodes.push(collector,consumer);
  assert.deepEqual(localLoraCollectors(consumer),[collector]);
});

test("collector links stop at the Regional LoRA context transformer",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),transformer=node(2,"BV Regional LoRA",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(collector,transformer,consumer);
  transformer.outputs=[{type:"BV_REGIONAL",links:[5]}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  collector.connect=function(output,target,input){const id=10+target.id;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.deepEqual(downstreamLoraConsumers(transformer),[]);
  assert.equal(connectLoraConsumerTree(transformer,collector),true);
  assert.equal(linkedLocalLoraCollector(transformer),collector);assert.equal(linkedLocalLoraCollector(consumer),null);
});

test("a consumer added later discovers only its linked upstream LoRA transformer",()=>{
  const g=graph(),transformer=node(2,"BV Regional LoRA",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(transformer,consumer);
  transformer.outputs=[{type:"BV_REGIONAL",links:[5]}];consumer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  assert.equal(upstreamLoraTransformer(consumer),transformer);
});

test("a consumer added later also discovers Regional Prompt easy mode",()=>{
  const g=graph(),prompt=node(2,"BV Regional Prompt",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(prompt,consumer);
  prompt.outputs=[{type:"BV_REGIONAL",links:[5]}];consumer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  assert.equal(upstreamLoraTransformer(consumer),prompt);
});

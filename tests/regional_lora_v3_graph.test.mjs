import assert from "node:assert/strict";
import test from "node:test";
import {connectLocalLoraCollector,connectLoraConsumerTree,downstreamLoraConsumers,ensureLoraCollectorOutput,ensureLoraConsumerInput,linkedLocalLoraCollector,localLoraCollectors,upstreamLoraTransformer} from "../ui/src/regional/loraV3Graph.ts";

const graph=()=>({_nodes:[],links:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}});
const node=(id,type,g)=>({id,type,graph:g,inputs:[],outputs:[],addInput(name,type){this.inputs.push({name,type,link:null})},addOutput(name,type){this.outputs.push({name,type,links:null})}});

test("production LoRA slots use the permanent typed provider contract",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);
  assert.equal(ensureLoraCollectorOutput(collector),0);assert.equal(ensureLoraConsumerInput(consumer),0);
  assert.equal(collector.outputs[0].type,"BV_RUNTIME_RESOURCE_PROVIDER");assert.equal(consumer.inputs[0].hidden,true);
});

test("collector connections are ordinary same-graph links",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);g._nodes.push(collector,consumer);
  collector.connect=function(output,target,input){const id=7;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id};
  assert.equal(connectLocalLoraCollector(consumer,collector),true);assert.equal(linkedLocalLoraCollector(consumer),collector);
});

test("cross-graph collectors are rejected without fallback",()=>{
  const local=graph(),external=graph(),collector=node(1,"BV LoRA Stack Collector",external),consumer=node(2,"BV Regional LoRA",local);
  local._nodes.push(consumer);external._nodes.push(collector);
  assert.equal(connectLocalLoraCollector(consumer,collector),false);assert.equal(linkedLocalLoraCollector(consumer),null);
});

test("picker catalog is restricted to the concrete consumer graph",()=>{
  const local=graph(),external=graph(),first=node(1,"BV LoRA Stack Collector",local),second=node(2,"BV LoRA Stack Collector",external),consumer=node(3,"BV Regional LoRA",local);
  local._nodes.push(first,consumer);external._nodes.push(second);
  assert.deepEqual(localLoraCollectors(consumer),[first]);
});

test("one picker selection materializes links to downstream LoRA executors",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),transformer=node(2,"BV Regional LoRA",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(collector,transformer,consumer);
  transformer.outputs=[{type:"BV_REGIONAL",links:[5]}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  collector.connect=function(output,target,input){const id=10+target.id;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.deepEqual(downstreamLoraConsumers(transformer),[consumer]);
  assert.equal(connectLoraConsumerTree(transformer,collector),true);
  assert.equal(linkedLocalLoraCollector(transformer),collector);assert.equal(linkedLocalLoraCollector(consumer),collector);
});

test("a consumer added later discovers only its linked upstream LoRA transformer",()=>{
  const g=graph(),transformer=node(2,"BV Regional LoRA",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(transformer,consumer);
  transformer.outputs=[{type:"BV_REGIONAL",links:[5]}];consumer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  assert.equal(upstreamLoraTransformer(consumer),transformer);
});

import assert from "node:assert/strict";
import test from "node:test";
import {compactLoraConsumerNode,connectLocalLoraCollector,connectLocalLoraCollectors,connectLoraConsumerTree,downstreamLoraConsumers,ensureLoraCollectorOutput,ensureLoraConsumerInput,ensureLoraConsumerInputs,installLoraSizePolicy,linkedLocalLoraCollector,linkedLocalLoraCollectors,localLoraCollectors,loraProviderIdentity,loraProviderResources,loraRegistryResources,loraV3GraphOf,reconcileDownstreamLoraWriters,reconcileLoraWriterCollectors,trimUnusedLoraConsumerInputs,upstreamLoraTransformer} from "../ui/src/regional/loraV3Graph.ts";

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
test("consumer compaction does not preserve an oversized renderer height floor",()=>{
  let applied;const consumer={size:[330,260],inputs:[],computeSize(){return[300,Math.max(Number(this.size?.[1]??0),110)]},setSize(size){applied=size;this.size=size}};
  compactLoraConsumerNode(consumer);assert.deepEqual(applied,[330,110]);
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
test("a V3 Regional LoRA never consumes an unnumbered provider slot",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),consumer=node(2,"BV Regional LoRA",g);g._nodes.push(collector,consumer);ensureLoraCollectorOutput(collector);consumer.inputs=[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:7}];g.links.set(7,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});collector.outputs[0].links=[7];
  assert.equal(linkedLocalLoraCollector(consumer),null);assert.deepEqual(linkedLocalLoraCollectors(consumer).filter(Boolean),[]);
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

test("main LoRA Registry participates in the unchanged local provider graph contract",()=>{
  const g=graph(),registry=node(1,"BV LoRA Registry",g),consumer=node(2,"BV Regional LoRA",g);g._nodes.push(registry,consumer);
  registry.connect=function(output,target,input){const id=81;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id};
  assert.deepEqual(localLoraCollectors(consumer),[registry]);
  assert.equal(connectLocalLoraCollector(consumer,registry),true);
  assert.equal(linkedLocalLoraCollector(consumer),registry);
  assert.equal(registry.outputs[0].type,"BV_RUNTIME_RESOURCE_PROVIDER");
});

test("Regional editor discovers a LoRA Registry through concrete graph ownership",()=>{
  const g=graph(),registry=node(1,"BV LoRA Registry",g),prompt=node(2,"BV Regional Prompt",g),registryId=crypto.randomUUID(),stackId=crypto.randomUUID();g._nodes.push(registry,prompt);
  registry.widgets=[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:stackId,name:"Portrait",enabled:true,entries:[]}]})}];
  registry.connect=function(output,target,input){const id=93;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id};
  registry.__bvConcreteGraph=g;prompt.__bvConcreteGraph=g;delete registry.graph;delete prompt.graph;
  assert.deepEqual(localLoraCollectors(prompt),[registry]);
  assert.deepEqual(loraProviderResources(localLoraCollectors(prompt)[0]).map(({id,label})=>({id,label})),[{id:stackId,label:"Portrait"}]);
  assert.equal(connectLocalLoraCollectors(prompt,[registry]),true);assert.equal(prompt.inputs[0].name,"resource_provider_1");assert.ok(prompt.inputs[0].link!=null);
  assert.deepEqual(linkedLocalLoraCollectors(prompt).slice(0,1),[registry]);
});

test("bound concrete ownership overrides stale renderer graph pointers",()=>{
  const root=graph(),subgraph=graph(),rootRegistry=node(1,"BV LoRA Registry",root),registry=node(2,"BV LoRA Registry",root),prompt=node(3,"BV Regional Prompt",root),registryId=crypto.randomUUID(),stackId=crypto.randomUUID();
  root._nodes.push(rootRegistry);subgraph._nodes.push(registry,prompt);
  registry.widgets=[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:stackId,name:"Subgraph Stack",enabled:true,entries:[]}]})}];
  registry.__bvConcreteGraph=subgraph;prompt.__bvConcreteGraph=subgraph;
  registry.connect=function(output,target,input){const id=94;subgraph.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id};
  assert.equal(loraV3GraphOf(prompt),subgraph);
  assert.deepEqual(localLoraCollectors(prompt),[registry]);
  assert.equal(connectLocalLoraCollectors(prompt,[registry]),true);
  assert.equal(prompt.inputs[0].name,"resource_provider_1");
  assert.ok(subgraph.links.has(94));assert.equal(root.links.has(94),false);
  assert.deepEqual(linkedLocalLoraCollectors(prompt).slice(0,1),[registry]);
});

test("concrete graph ownership keeps root and subgraph LoRA registries isolated",()=>{
  const root=graph(),subgraph=graph(),rootRegistry=node(1,"BV LoRA Registry",root),subRegistry=node(2,"BV LoRA Registry",subgraph),prompt=node(3,"BV Regional Prompt",subgraph);
  root._nodes.push(rootRegistry);subgraph._nodes.push(subRegistry,prompt);for(const candidate of root._nodes)candidate.__bvConcreteGraph=root;for(const candidate of subgraph._nodes)candidate.__bvConcreteGraph=subgraph;delete rootRegistry.graph;delete subRegistry.graph;delete prompt.graph;
  assert.deepEqual(localLoraCollectors(prompt),[subRegistry]);
});

test("local LoRA discovery excludes unrelated nodes even when they share the graph",()=>{
  const g=graph(),registry=node(1,"BV LoRA Registry",g),foreign=node(2,"Unrelated Registry",g),consumer=node(3,"BV Regional LoRA",g);g._nodes.push(registry,foreign,consumer);
  assert.deepEqual(localLoraCollectors(consumer),[registry]);
});

test("LoRA provider adapters preserve manual collectors and expose configured registry stacks",()=>{
  const manual={type:"BV LoRA Stack Collector",widgets:[{name:"collector_id",value:"manual-id"}]};
  assert.equal(loraProviderIdentity(manual),"manual-id");assert.equal(loraRegistryResources(manual),null);
  const registryId=crypto.randomUUID(),enabledId=crypto.randomUUID(),disabledId=crypto.randomUUID();
  const registry={type:"BV LoRA Registry",widgets:[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:enabledId,name:"Enabled",enabled:true,entries:[]},{id:disabledId,name:"Comparison off",enabled:false,entries:[]}]})}]};
  assert.equal(loraProviderIdentity(registry),registryId);
  assert.deepEqual(loraRegistryResources(registry).map(item=>({id:item.id,label:item.label})),[{id:enabledId,label:"Enabled"},{id:disabledId,label:"Comparison off"}]);
});

test("a V3-native manual provider chain exposes every named stack behind its Collector",()=>{
  const g=graph(),first=node(1,"BV Named LoRA Stack",g),second=node(2,"BV Named LoRA Stack",g),collector=node(3,"BV LoRA Stack Collector",g),prompt=node(4,"BV Regional Prompt",g);g._nodes.push(first,second,collector,prompt);
  first.widgets=[{name:"stack_id",value:"stack-a"},{name:"name",value:"Portrait"}];second.widgets=[{name:"stack_id",value:"stack-b"},{name:"name",value:"Style"}];collector.widgets=[{name:"collector_id",value:"22222222-2222-4222-8222-222222222222"}];
  first.outputs=[{name:"registry",type:"BV_LORA_STACK_REGISTRY",links:null},{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[11]}];
  second.inputs=[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:11}];second.outputs=[{name:"registry",type:"BV_LORA_STACK_REGISTRY",links:null},{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[12]}];
  collector.inputs=[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:12}];
  g.links.set(11,{origin_id:1,origin_slot:1,target_id:2,target_slot:0});g.links.set(12,{origin_id:2,origin_slot:1,target_id:3,target_slot:0});
  assert.deepEqual(loraProviderResources(collector).map(({id,label})=>({id,label})),[{id:"stack-a",label:"Portrait"},{id:"stack-b",label:"Style"}]);
  assert.deepEqual(localLoraCollectors(prompt),[collector]);
});

test("malformed or missing registry config fails closed without inventing identity",()=>{
  const entryId=crypto.randomUUID(),stackId=crypto.randomUUID(),registryId=crypto.randomUUID(),invalid=["{broken","",JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:"not-a-uuid",stacks:[]}),JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[null]}),JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:"",name:"Missing identity",enabled:true,entries:[]}]}),JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:stackId,name:"Bad raw type",enabled:true,entries:[{id:entryId,lora_name:["model.safetensors"],enabled:true,model_strength:null,clip_strength:[]}]}]})];
  for(const value of invalid){const registry={type:"BV LoRA Registry",widgets:[{name:"config_json",value}]};assert.equal(loraProviderIdentity(registry),"");assert.deepEqual(loraRegistryResources(registry),[])}
  const uppercase=crypto.randomUUID().toUpperCase(),registry={type:"BV LoRA Registry",widgets:[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:uppercase,stacks:[]})}]};
  assert.equal(loraProviderIdentity(registry),uppercase.toLowerCase());assert.deepEqual(loraRegistryResources(registry),[]);
});

test("collector links stop at the Regional LoRA context transformer",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),transformer=node(2,"BV Regional LoRA",g),consumer=node(3,"BV Regional Native Conditioning",g);g._nodes.push(collector,transformer,consumer);
  transformer.outputs=[{type:"BV_REGIONAL",links:[5]}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  collector.connect=function(output,target,input){const id=10+target.id;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.deepEqual(downstreamLoraConsumers(transformer),[]);
  assert.equal(connectLoraConsumerTree(transformer,collector),true);
  assert.equal(linkedLocalLoraCollector(transformer),collector);assert.equal(linkedLocalLoraCollector(consumer),null);
});

test("an upstream Prompt collector is propagated to a downstream Regional LoRA writer",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),prompt=node(2,"BV Regional Prompt",g),transformer=node(3,"BV Regional LoRA",g);g._nodes.push(collector,prompt,transformer);
  prompt.outputs=[{type:"BV_REGIONAL",links:[5]}];transformer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  collector.connect=function(output,target,input){const id=10+target.id;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  assert.deepEqual(downstreamLoraConsumers(prompt),[transformer]);
  assert.equal(connectLoraConsumerTree(prompt,collector),true);
  assert.equal(linkedLocalLoraCollector(prompt),collector);assert.equal(linkedLocalLoraCollector(transformer),collector);
});

test("a Regional LoRA writer keeps inherited and locally configured collectors",()=>{
  const g=graph(),inherited=node(1,"BV LoRA Stack Collector",g),local=node(2,"BV LoRA Stack Collector",g),prompt=node(3,"BV Regional Prompt",g),writer=node(4,"BV Regional LoRA",g);g._nodes.push(inherited,local,prompt,writer);
  prompt.outputs=[{type:"BV_REGIONAL",links:[5]}];writer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:3,origin_slot:0,target_id:4,target_slot:0});
  let next=20;for(const collector of [inherited,local])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  writer.disconnectInput=function(index){const id=this.inputs[index].link;if(id!=null)g.links.delete(id);this.inputs[index].link=null};
  assert.equal(connectLocalLoraCollectors(prompt,[inherited]),true);
  assert.deepEqual(reconcileLoraWriterCollectors(writer,[local]),[inherited,local]);
  assert.deepEqual(linkedLocalLoraCollectors(writer).slice(0,2),[inherited,local]);
});

test("Nodes 2.0 comfyClass identifies a downstream Regional LoRA writer",()=>{
  const g=graph(),prompt=node(1,"BV Regional Prompt",g),writer=node(2,undefined,g);writer.comfyClass="BV Regional LoRA";g._nodes.push(prompt,writer);
  prompt.outputs=[{type:"BV_REGIONAL",links:[5]}];writer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.deepEqual(downstreamLoraConsumers(prompt),[writer]);
});

test("a late Prompt upgrade re-reconciles an already configured downstream writer",()=>{
  const g=graph(),inherited=node(1,"BV LoRA Stack Collector",g),local=node(2,"BV LoRA Stack Collector",g),prompt=node(3,"BV Regional Prompt",g),writer=node(4,"BV Regional LoRA",g);g._nodes.push(inherited,local,prompt,writer);
  prompt.outputs=[{type:"BV_REGIONAL",links:[5]}];writer.inputs=[{name:"regional",type:"BV_REGIONAL",link:5}];g.links.set(5,{origin_id:3,origin_slot:0,target_id:4,target_slot:0});
  let next=30;for(const collector of [inherited,local])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  writer.disconnectInput=function(index){const id=this.inputs[index].link;if(id!=null)g.links.delete(id);this.inputs[index].link=null};
  reconcileLoraWriterCollectors(writer,[local]);
  connectLocalLoraCollectors(prompt,[inherited]);
  reconcileDownstreamLoraWriters(prompt,target=>target===writer?[local]:[]);
  assert.deepEqual(linkedLocalLoraCollectors(writer).slice(0,2),[inherited,local]);
});

test("reconciling an already correct writer does not reconnect native links",()=>{
  const g=graph(),collector=node(1,"BV LoRA Stack Collector",g),writer=node(2,"BV Regional LoRA",g);g._nodes.push(collector,writer);
  let next=40;collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  writer.disconnectInput=function(index){const id=this.inputs[index].link;if(id!=null)g.links.delete(id);this.inputs[index].link=null};
  reconcileLoraWriterCollectors(writer,[collector]);const originalLink=writer.inputs[0].link,originalNext=next;
  reconcileLoraWriterCollectors(writer,[collector]);
  assert.equal(writer.inputs[0].link,originalLink);assert.equal(next,originalNext);
});

test("shrinking a writer disconnects provider links beyond the desired collector list",()=>{
  const g=graph(),first=node(1,"BV LoRA Stack Collector",g),second=node(2,"BV LoRA Stack Collector",g),writer=node(3,"BV Regional LoRA",g);g._nodes.push(first,second,writer);
  let next=50;for(const collector of [first,second])collector.connect=function(output,target,input){const id=next++;g.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[...(this.outputs[output].links??[]),id];target.inputs[input].link=id};
  writer.disconnectInput=function(index){const id=this.inputs[index].link;if(id!=null)g.links.delete(id);this.inputs[index].link=null};writer.removeInput=function(index){this.inputs.splice(index,1)};
  connectLocalLoraCollectors(writer,[first,second]);
  reconcileLoraWriterCollectors(writer,[second]);
  assert.deepEqual(linkedLocalLoraCollectors(writer).filter(Boolean),[second]);
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

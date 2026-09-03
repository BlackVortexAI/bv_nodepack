import assert from "node:assert/strict";
import test from "node:test";
import { registerDgAdapter, dgSenderChoices, connectDgSender, connectedDgSender, disconnectDgSender, reconcileDgTopology, activateDgReceiver, deactivateDgReceiver, scheduleDgUpgrade } from "../ui/src/regional/dgRouting.ts";
import { connectLocalLoraCollectors, linkedLocalLoraCollectors, localLoraCollectors, loraProviderIdentity } from "../ui/src/regional/loraV3Graph.ts";
import {installProjectedClipboard,installProjectedPortCanvasInteraction} from "../ui/src/regional/projectedPortInteraction.ts";
import { prepareDgClipboard, connectDgCanarySender, disconnectDgCanarySender, dgCanarySenderChoices, installDgAnchorInteractionGuard, installDgCanaryPrototype, reconcileDgCanaryTopology } from "./fixtures/dgCanaryPrototype.ts";
import {activateNewRegistryDgConsumer,connectRegistryDgInput} from "../ui/src/regional/loraRegistryDgAdapter.ts";
import {reconcileRegistryFamily} from "../ui/src/regional/registryDgReconcile.ts";
import {prepareDetailerPlanV3,reconcileDetailerV3Now} from "../ui/src/regional/detailerV3Graph.ts";
import {reconcileLutV3Now} from "../ui/src/regional/lutV3Catalog.ts";

const PROVIDER="BV_RUNTIME_RESOURCE_PROVIDER";

test("copied LUT Loop uses its actual external plan owner, not the copied Registry transport",()=>{
 const f=hierarchyFixture();f.root.getNodeById=function(id){return this._nodes.find(node=>node.id===id)};
 const registryId=crypto.randomUUID(),registry=f.sender(f.root,3100,'LUT');registry.type='BV LUT Registry';registry.properties={};
 registry.widgets=[{name:'config_json',value:JSON.stringify({schema:'bv.lut_registry_config',version:1,collector_id:registryId,luts:[{id:'warm',lut_name:'Built-in: Warm Contrast'}]})}];
 const plan={id:3101,type:'BV Regional LUT Plan',graph:f.root,outputs:[{name:'lut_plan',type:'BV_LUT_PLAN',links:[]}],widgets:[{name:'config_json',value:JSON.stringify({version:1,jobs:[{lut_source:{collector_id:registryId,resource_id:'warm'}}]})}]};f.root._nodes.push(plan);
 const makeLoop=id=>{const node=f.receiver(f.root,id,'Loop');node.type='BV LUT Loop Start';node.properties={};node.widgets=[];node.inputs[0]={name:'plan',type:'*',link:id};node.addInput=function(name,type){this.inputs.push({name,type,link:null})};node.removeInput=function(index){this.inputs.splice(index,1)};plan.outputs[0].links.push(id);f.root.links.set(id,{id,type:'BV_LUT_PLAN',origin_id:plan.id,origin_slot:0,target_id:id,target_slot:0});activateNewRegistryDgConsumer(node);return node};
 const loop=makeLoop(3102);reconcileLutV3Now(loop);assert.equal(connectedDgSender(loop,'resource_provider_1'),registry);
 const originalConfig=plan.widgets[0].value;
 const copy=prepareDgClipboard({nodes:[{type:registry.type,properties:registry.properties,widgets_values:[registry.widgets[0].value]},{type:loop.type,properties:loop.properties}]});
 const copiedRegistry=f.sender(f.root,3103,'Copied LUT');copiedRegistry.type=registry.type;copiedRegistry.properties=copy.nodes[0].properties;copiedRegistry.widgets=[{name:'config_json',value:copy.nodes[0].widgets_values[0]}];
 const copiedLoop=makeLoop(3104);copiedLoop.properties=copy.nodes[1].properties;reconcileLutV3Now(copiedLoop);
 assert.equal(connectedDgSender(copiedLoop,'resource_provider_1'),registry);assert.notEqual(connectedDgSender(copiedLoop,'resource_provider_1'),copiedRegistry);
 assert.equal(plan.widgets[0].value,originalConfig);assert.notEqual(JSON.parse(copiedRegistry.widgets[0].value).collector_id,registryId);
});

test("LUT channel 40 and Detailer prepare preserve central labels and ordinary inputs",()=>{
  const f=hierarchyFixture();for(const graph of [f.root,f.subA,f.subDeep,f.subB])graph.getNodeById=function(id){return this._nodes.find(node=>node.id===id)};
  const references=Array.from({length:40},(_,index)=>{const id=crypto.randomUUID(),node=f.sender(index%2?f.root:f.subB,3000+index,'Registry');node.type=index%2?'BV LUT Registry':'BV Detector Registry';node.widgets=[{name:'config_json',value:JSON.stringify({collector_id:id})}];return{kind:index%2?'lut':'detector',id}});
  const plan=f.receiver(f.subDeep,3050,'LUT');plan.type='BV Regional LUT Plan';plan.properties={};plan.widgets=[];plan.addInput=function(name,type){this.inputs.push({name,type,link:null})};plan.removeInput=function(index){this.inputs.splice(index,1)};activateNewRegistryDgConsumer(plan);
  reconcileRegistryFamily(plan,'lut',references,i=>`resource_provider_${i+1}`,40);
  assert.ok(connectedDgSender(plan,'resource_provider_40'));assert.equal(plan.properties.bvRegistryDgSourceKinds.resource_provider_40,'lut');
  const detailer=f.receiver(f.subA,3051,'Detailer');detailer.type='BV Regional Detailer Plan';detailer.properties={};detailer.widgets=[{name:'config_json',value:JSON.stringify({version:1,jobs:[{detector_assignments:[{source:{collector_id:references[0].id,resource_id:'face'}}]}]})}];detailer.addInput=plan.addInput;detailer.removeInput=plan.removeInput;activateNewRegistryDgConsumer(detailer);
  reconcileDetailerV3Now(detailer);const slot=detailer.inputs.find(slot=>slot.name==='resource_provider'),before={label:slot.label,localized_name:slot.localized_name};
  prepareDetailerPlanV3(detailer,f.subA);reconcileDetailerV3Now(detailer);
  assert.deepEqual({label:slot.label,localized_name:slot.localized_name},before);assert.equal(slot.label,'DG');assert.ok(connectedDgSender(detailer,'resource_provider'));
});

test("composite Prompt routes three Registry families across deep and sibling graphs without claiming normal ports",()=>{
  const f=hierarchyFixture(),id=crypto.randomUUID();
  for(const graph of [f.root,f.subA,f.subDeep,f.subB])graph.getNodeById=function(id){return this._nodes.find(node=>node.id===id)};
  const sources=[['BV LoRA Registry',f.root],['BV LUT Registry',f.subDeep],['BV Detector Registry',f.subB]].map(([type,graph],index)=>{
    const node=f.sender(graph,2900+index,type);node.type=type;node.widgets=[{name:'config_json',value:JSON.stringify({collector_id:id,registry_id:id})}];return node;
  });
  const prompt=f.receiver(f.subA,2904,'Real Prompt');prompt.type='BV Regional Prompt';prompt.properties={};prompt.widgets=[];
  prompt.addInput=function(name,type){this.inputs.push({name,type,link:null})};prompt.removeInput=function(index){this.inputs.splice(index,1);for(const link of this.graph.links.values())if(link.target_id===this.id&&link.target_slot>index)link.target_slot--};
  prompt.disconnectInput=function(index){const slot=this.inputs[index];this.graph.links.delete(slot.link);slot.link=null};
  activateNewRegistryDgConsumer(prompt);prompt.addInput('resource_provider_1',PROVIDER);
  const normal=structuredClone(prompt.inputs[0]);
  assert.equal(connectRegistryDgInput(prompt,'resource_provider_1',sources[0]),true);
  const loraLink=prompt.inputs.find(slot=>slot.name==='resource_provider_1').link;
  assert.equal(reconcileRegistryFamily(prompt,'lut',[{kind:'lut',id},{kind:'detector',id}],i=>`lut_resource_provider_${i+1}`,40),true);
  assert.equal(reconcileRegistryFamily(prompt,'detailer',[{kind:'detector',id}],i=>`detailer_resource_provider_${i+1}`,20),true);
  assert.equal(connectedDgSender(prompt,'lut_resource_provider_1'),sources[1]);
  assert.equal(connectedDgSender(prompt,'lut_resource_provider_2'),sources[2]);
  assert.equal(connectedDgSender(prompt,'detailer_resource_provider_1'),sources[2]);
  const detectorLink=prompt.inputs.find(slot=>slot.name==='detailer_resource_provider_1').link;
  reconcileRegistryFamily(prompt,'lut',[],i=>`lut_resource_provider_${i+1}`,40);
  assert.equal(prompt.inputs.find(slot=>slot.name==='resource_provider_1').link,loraLink);
  assert.equal(prompt.inputs.find(slot=>slot.name==='detailer_resource_provider_1').link,detectorLink);
  assert.deepEqual(prompt.inputs[0],normal);
  assert.equal(connectedDgSender(prompt,'detailer_resource_provider_1'),sources[2]);
});

test("pilot clipboard remaps paired domain and transport identities without touching external or legacy references",()=>{
  const registryId=crypto.randomUUID(),resourceId=crypto.randomUUID(),externalId=crypto.randomUUID(),manualId=crypto.randomUUID();
  const registry={type:"BV LoRA Registry",properties:{bvDgSenderId:"transport",bvRegistryDgPilotSource:true},widgets_values:[JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:resourceId,name:"A",enabled:true,entries:[]}]})]};
  const entries=[registryId,externalId,manualId].map(id=>({id:crypto.randomUUID(),source:{kind:"external",collector_id:id,resource_id:resourceId},targets:[{scope:"global"}]}));
  const config={version:3,entries,steps:[{entries:[structuredClone(entries[0])]}]};
  const receiver={type:"BV Regional LoRA",properties:{bvRegistryDgPilot:true,bvLoraDgSelections:{resource_provider_1:"transport",resource_provider_2:"external"}},widgets_values:["merge",JSON.stringify(config)]};
  const original=structuredClone({nodes:[receiver],subgraphs:[{nodes:[registry]}]}),copied=prepareDgClipboard(original),newRegistry=JSON.parse(copied.subgraphs[0].nodes[0].widgets_values[0]),newConfig=JSON.parse(copied.nodes[0].widgets_values[1]);
  assert.notEqual(newRegistry.registry_id,registryId);assert.notEqual(newRegistry.stacks[0].id,resourceId);
  assert.equal(newConfig.entries[0].source.collector_id,newRegistry.registry_id);assert.equal(newConfig.entries[0].source.resource_id,newRegistry.stacks[0].id);
  assert.deepEqual(newConfig.entries.slice(1),entries.slice(1));assert.equal(newConfig.steps[0].entries[0].source.collector_id,newRegistry.registry_id);
  assert.equal(copied.nodes[0].properties.bvLoraDgSelections.resource_provider_1,copied.subgraphs[0].nodes[0].properties.bvDgSenderId);
  assert.equal(copied.nodes[0].properties.bvLoraDgSelections.resource_provider_2,"external");
  assert.deepEqual(original,{nodes:[receiver],subgraphs:[{nodes:[registry]}]});
  assert.deepEqual(prepareDgClipboard({nodes:[receiver]}).nodes[0],receiver);
  assert.notEqual(JSON.parse(prepareDgClipboard({nodes:[registry]}).nodes[0].widgets_values[0]).registry_id,registryId);
  const legacy=structuredClone(registry);delete legacy.properties.bvRegistryDgPilotSource;
  assert.equal(prepareDgClipboard({nodes:[legacy]}).nodes[0].widgets_values[0],registry.widgets_values[0]);
  const unrelated={...structuredClone(legacy),widgets_values:[JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:externalId,stacks:[]})]};delete unrelated.properties.bvDgSenderId;
  assert.equal(prepareDgClipboard({nodes:[registry,unrelated,receiver]}).nodes[1].widgets_values[0],unrelated.widgets_values[0]);
  assert.throws(()=>prepareDgClipboard({nodes:[registry,{...structuredClone(registry),properties:{bvDgSenderId:"different",bvRegistryDgPilotSource:true}}]}),/ambiguous copied domain/);
});

test("actual DG sender query rejects another receiver's stale link and a broken boundary hop",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,2500,"Source"),a=f.receiver(f.subDeep,2501,"A"),b=f.receiver(f.subDeep,2502,"B");
  const id=dgSenderChoices(a)[0].id;assert.equal(connectDgSender(a,id),true);assert.equal(connectDgSender(b,id),true);
  const original=a.inputs[1].link,other=b.inputs[1].link;a.inputs[1].link=other;
  assert.equal(connectedDgSender(a),null);assert.equal(connectedDgSender(b),source);a.inputs[1].link=original;
  const first=f.subDeep.links.get(original),before=first.target_slot;first.target_slot=0;
  assert.equal(connectedDgSender(a),null);first.target_slot=before;assert.equal(connectedDgSender(a),source);
});

test("delayed DG upgrade from an earlier remove/add epoch cannot run",()=>{
  const original=globalThis.setTimeout,pending=[];globalThis.setTimeout=fn=>{pending.push(fn);return 0};
  try{const node={};let value="initial";scheduleDgUpgrade(node,()=>{value="stale"});deactivateDgReceiver(node);activateDgReceiver(node);scheduleDgUpgrade(node,()=>{value="current"});pending[0]();assert.equal(value,"initial");pending[1]();assert.equal(value,"current");}
  finally{globalThis.setTimeout=original}
});

test("opt-in Registry pilot mixes deep and sibling Registries with an unchanged local Collector",()=>{
  const f=hierarchyFixture(),first=f.sender(f.subDeep,2400,"Registry Deep"),second=f.sender(f.subB,2401,"Registry Sibling"),manual=f.sender(f.subA,2402,"Manual");
  first.type=second.type="BV LoRA Registry";manual.type="BV LoRA Stack Collector";
  for(const graph of [f.root,f.subA,f.subDeep,f.subB])graph.getNodeById=function(id){return this._nodes.find(n=>n.id===id)};
  const identities=[crypto.randomUUID(),crypto.randomUUID()];
  [first,second].forEach((n,i)=>n.widgets=[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:identities[i],stacks:[]})}]);
  const consumer=f.receiver(f.subA,2403,"Mixed");consumer.type="BV Regional LoRA";consumer.properties={bvRegistryDgPilot:true};
  consumer.addInput=function(name,type){this.inputs.push({name,type,link:null})};
  consumer.removeInput=function(index){this.inputs.splice(index,1)};
  const nativeDisconnect=consumer.disconnectInput;consumer.disconnectInput=function(index){const id=this.inputs[index]?.link;nativeDisconnect.call(this,index);this.graph.links.delete(id)};
  const normal=structuredClone(consumer.inputs[0]);
  assert.deepEqual(localLoraCollectors(consumer),[manual,first,second]);
  assert.equal(connectLocalLoraCollectors(consumer,[first,manual,second]),true);
  assert.deepEqual(linkedLocalLoraCollectors(consumer).slice(0,3),[first,manual,second]);
  const slot=n=>consumer.inputs.find(s=>s.name==="resource_provider_"+n);
  const manualLink=slot(2).link,thirdLink=slot(3).link;
  assert.equal(consumer.onConnectInput(consumer.inputs.indexOf(slot(1))),false);
  assert.equal(consumer.onConnectInput(consumer.inputs.indexOf(slot(2))),true);
  assert.equal(connectLocalLoraCollectors(consumer,[second,manual,second]),true);
  assert.equal(slot(2).link,manualLink);assert.equal(slot(3).link,thirdLink);
  assert.equal(connectLocalLoraCollectors(consumer,[manual,manual,second]),true);
  assert.equal(consumer.onConnectInput(consumer.inputs.indexOf(slot(1))),true);
  assert.equal(slot(2).link,manualLink);assert.equal(slot(3).link,thirdLink);
  assert.equal(connectLocalLoraCollectors(consumer,[first,manual,second]),true);
  assert.equal(consumer.onConnectInput(consumer.inputs.indexOf(slot(1))),false);
  assert.equal(slot(2).link,manualLink);assert.equal(slot(3).link,thirdLink);
  assert.deepEqual([loraProviderIdentity(first),loraProviderIdentity(second)],identities);
  assert.deepEqual(consumer.inputs[0],normal);
  const saved=JSON.stringify(consumer.properties);
  assert.equal(reconcileDgTopology(consumer),true);assert.equal(JSON.stringify(consumer.properties),saved);
  const clone=prepareDgClipboard({nodes:[{type:first.type,properties:structuredClone(first.properties),widgets_values:[first.widgets[0].value]},
      {type:consumer.type,properties:structuredClone(consumer.properties),inputs:structuredClone(consumer.inputs)}]});
  assert.notEqual(clone.nodes[0].properties.bvDgSenderId,first.properties.bvDgSenderId);
  assert.equal(clone.nodes[1].properties.bvLoraDgSelections.resource_provider_1,clone.nodes[0].properties.bvDgSenderId);
  assert.equal(clone.nodes[1].properties.bvLoraDgSelections.resource_provider_3,second.properties.bvDgSenderId);
  assert.notEqual(JSON.parse(clone.nodes[0].widgets_values[0]).registry_id,identities[0],"pilot Registry copy receives its own domain identity");
  assert.equal(loraProviderIdentity(first),identities[0],"original Registry identity stays untouched");
  assert.equal(connectLocalLoraCollectors(consumer,[manual]),true);
  assert.deepEqual(consumer.properties.bvLoraDgSelections,{});assert.equal(consumer.onConnectInput(consumer.inputs.indexOf(slot(1))),true);
  assert.deepEqual(linkedLocalLoraCollectors(consumer).slice(0,1),[manual]);
  const unmarked=f.receiver(f.root,2404,"Legacy");unmarked.type="BV Regional LoRA";
  assert.deepEqual(localLoraCollectors(unmarked),[]);assert.equal(unmarked.properties?.bvRegistryDgPilot,undefined);
});

test("DG native calls bind concrete graph ownership and restore proxies even on exceptions",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subDeep,2300,"Deep"),sink=f.receiver(f.root,2301,"Root");
  const sourceOwner=source.graph,targetOwner=sink.graph,proxy={name:"proxy"};
  source.__bvConcreteGraph=sourceOwner;source.graph=proxy;sink.__bvConcreteGraph=targetOwner;sink.graph=proxy;
  const oldConnect=sourceOwner.addOutput;
  sourceOwner.addOutput=function(...args){
    const boundary=oldConnect.apply(this,args),connect=boundary.connect;
    boundary.connect=function(output,node){assert.equal(node.graph,sourceOwner);return connect.call(this,output,node)};
    return boundary;
  };
  const nativeDisconnect=sink.disconnectInput;sink.disconnectInput=function(index){assert.equal(this.graph,targetOwner);return nativeDisconnect.call(this,index)};
  const id=dgSenderChoices(sink).find(c=>c.label.includes("Deep")).id;
  assert.ok(dgSenderChoices(sink)[0].label.includes("Sub Deep"));
  assert.equal(connectDgSender(sink,id),true);assert.equal(source.graph,proxy);assert.equal(sink.graph,proxy);
  assert.equal(disconnectDgSender(sink),true);assert.equal(source.graph,proxy);assert.equal(sink.graph,proxy);
  const local=f.sender(f.root,2302,"Throws");local.__bvConcreteGraph=f.root;local.graph=proxy;
  local.connect=function(){assert.equal(this.graph,f.root);assert.equal(sink.graph,f.root);throw new Error("native failure")};
  const localId=dgSenderChoices(sink).find(c=>c.label.includes("Throws")).id;
  assert.throws(()=>connectDgSender(sink,localId),/native failure/);
  assert.equal(local.graph,proxy);assert.equal(sink.graph,proxy);
});

test("twenty receiver channels preserve independent routes across root, deep and sibling graphs",()=>{
  const adapter={id:"multi-contract",isSender:n=>n?.type==="MultiSource",isReceiver:n=>n?.type==="MultiSink",
    receiverChannels:n=>n.channels,canSelectSender:(r,s)=>s.type==="MultiSource",
    readSelection:(n,c)=>n.selections[c]??"",writeSelection:(n,id,c)=>{n.selections[c]=id},
    readSerializedSelection:(n,c)=>n.selections[c]??"",writeSerializedSelection:(n,id,c)=>{n.selections[c]=id}};
  const dispose=registerDgAdapter(adapter);
  try{
    const f=hierarchyFixture(),graphs=[f.root,f.subA,f.subDeep,f.subB];
    const sources=Array.from({length:20},(_,i)=>{const n=f.sender([f.root,f.subDeep,f.subB][i%3],2000+i,"Source "+i);n.type="MultiSource";return n});
    let receiver=f.receiver(f.subA,2100,"Twenty inputs");receiver.type="MultiSink";
    receiver.channels=Array.from({length:20},(_,i)=>({id:"binding-"+i,inputName:"resource_provider_"+(i+1)}));
    receiver.inputs=[receiver.inputs[0],...receiver.channels.map(c=>({name:c.inputName,type:PROVIDER,link:null}))];
    receiver.selections={};const normal=structuredClone(receiver.inputs[0]);
    dgSenderChoices(receiver,"binding-0");
    sources.forEach((source,i)=>receiver.selections["binding-"+i]=source.properties.bvDgSenderId);
    assert.equal(reconcileDgTopology(receiver),true);
    assert.equal(new Set(receiver.inputs.slice(1).map(s=>s.link)).size,20);
    const endpointSource=(node,index)=>{
      const seen=new Set();let graph=node.graph,target=node,slot=index;
      while(true){
        const link=graph.links.get(target.inputs[slot].link);assert.ok(link,"every endpoint must have an intact upstream chain");
        const key=graph.name+":"+link.id;assert.ok(!seen.has(key));seen.add(key);
        if(String(link.origin_id)===String(graph.inputNode?.id)){
          target=[f.hostA,f.hostDeep,f.hostB].find(h=>h.subgraph===graph);slot=link.origin_slot;graph=target.graph;continue;
        }
        let source=graph._nodes.find(n=>n.id===link.origin_id),output=link.origin_slot;
        while(source?.subgraph){
          const child=source.subgraph,inner=child.links.get(child.outputs[output].linkIds[0]);assert.ok(inner);
          source=child._nodes.find(n=>n.id===inner.origin_id);output=inner.origin_slot;
        }
        return source;
      }
    };
    sources.forEach((source,i)=>assert.equal(endpointSource(receiver,i+1),source));
    for(const i of [0,9,19]){
      const before=receiver.inputs.map(s=>s.link);
      receiver.selections["binding-"+i]=sources[(i+1)%20].properties.bvDgSenderId;
      assert.equal(reconcileDgTopology(receiver,"binding-"+i),true);
      assert.equal(endpointSource(receiver,i+1),sources[(i+1)%20]);
      receiver.inputs.forEach((slot,j)=>{if(j!==i+1)assert.equal(slot.link,before[j])});
    }
    // Two bindings of the same node share a source; clearing one must not remove the other.
    receiver.selections["binding-1"]=receiver.selections["binding-0"];
    assert.equal(reconcileDgTopology(receiver,"binding-1"),true);
    const shared=receiver.inputs[2].link;
    receiver.selections["binding-0"]="";assert.equal(reconcileDgTopology(receiver,"binding-0"),true);
    assert.equal(receiver.inputs[1].link,null);assert.equal(receiver.inputs[2].link,shared);assert.equal(endpointSource(receiver,2),sources[1]);
    receiver.selections["binding-0"]=sources[0].properties.bvDgSenderId;assert.equal(reconcileDgTopology(receiver),true);
    // Native reorder changes indices but the stable channel still addresses its named slot.
    const beforeReorder=[...receiver.inputs];receiver.inputs=[receiver.inputs[0],...receiver.inputs.slice(1).reverse()];
    for(const link of f.subA.links.values())if(link.target_id===receiver.id)link.target_slot=receiver.inputs.indexOf(beforeReorder[link.target_slot]);
    assert.equal(reconcileDgTopology(receiver),true);
    assert.equal(endpointSource(receiver,receiver.inputs.findIndex(s=>s.name==="resource_provider_1")),sources[0]);
    const snapshot=()=>JSON.stringify(graphs.map(g=>({links:[...g.links.values()],inputs:g.inputs?.map(s=>({name:s.name,type:s.type,links:s.linkIds})),outputs:g.outputs?.map(s=>({name:s.name,type:s.type,links:s.linkIds}))})));
    const stable=snapshot();for(let i=0;i<3;i++)assert.equal(reconcileDgTopology(receiver),true);assert.equal(snapshot(),stable);
    // Configure/reload replaces receiver and slot objects: no route-state WeakMap entry survives.
    const replacement={...receiver,inputs:structuredClone(receiver.inputs),properties:structuredClone(receiver.properties),selections:{...receiver.selections}};
    f.subA._nodes[f.subA._nodes.indexOf(receiver)]=replacement;receiver=replacement;
    assert.equal(reconcileDgTopology(receiver),true);assert.equal(snapshot(),stable);
    const serialized={type:receiver.type,channels:receiver.channels,selections:receiver.selections,properties:receiver.properties};
    const copied=prepareDgClipboard({nodes:[{type:sources[0].type,properties:sources[0].properties},serialized]});
    assert.notEqual(copied.nodes[0].properties.bvDgSenderId,sources[0].properties.bvDgSenderId);
    assert.equal(copied.nodes[1].selections["binding-0"],copied.nodes[0].properties.bvDgSenderId);
    assert.equal(copied.nodes[1].selections["binding-1"],receiver.selections["binding-1"]);
    assert.deepEqual(prepareDgClipboard({nodes:[serialized]}).nodes[0].selections,receiver.selections);
    const beforeInvalid=snapshot();
    assert.equal(connectDgSender(receiver,sources[0].properties.bvDgSenderId,"absent"),false);
    assert.equal(disconnectDgSender(receiver,""),false);assert.equal(snapshot(),beforeInvalid);
    receiver.channels.push({...receiver.channels[0]});assert.throws(()=>reconcileDgTopology(receiver),/unique/);receiver.channels.pop();
    const removed=receiver.channels.shift(),removedSlot=receiver.inputs.find(s=>s.name===removed.inputName);
    assert.equal(reconcileDgTopology(receiver),true);assert.equal(removedSlot.link,null);
    assert.deepEqual(receiver.inputs[0],normal);
    deactivateDgReceiver(receiver);assert.ok(receiver.inputs.slice(1).every(slot=>slot.link==null));
    assert.ok(graphs.every(g=>g.links.size===0),"removing the final consumer must leave no routed links");
  }finally{dispose()}
});

test("DG adapter registry rejects ambiguity and stale disposal preserves the new owner",()=>{
  const adapter={id:"registry-contract",isSender:n=>n?.type==="Registry source",isReceiver:()=>false,
    readSelection:()=>"",writeSelection:()=>{},readSerializedSelection:()=>"",writeSerializedSelection:()=>{}};
  const dispose=registerDgAdapter(adapter);
  registerDgAdapter(adapter);
  const f=hierarchyFixture(),source=f.sender(f.root,980,"Registry source");source.type="Registry source";
  const sink=f.receiver(f.root,981,"Sink");
  assert.equal(dgSenderChoices(sink).length,1);
  const removeOverlap=registerDgAdapter({...adapter,id:"overlap-contract"});
  try{assert.throws(()=>dgSenderChoices(sink),/multiple adapters/)}finally{removeOverlap()}
  dispose();
  const removeReplacement=registerDgAdapter({...adapter});
  try{dispose();assert.equal(dgSenderChoices(sink).length,1)}finally{removeReplacement()}
});

test("central DG adapter routes foreign nodes across deep and sibling boundaries without widget knowledge",()=>{
  const adapter={id:"foreign-contract",isSender:n=>n?.type==="Foreign source",isReceiver:n=>n?.type==="Foreign sink",
    readSelection:n=>n.selected??"",writeSelection:(n,id)=>{n.selected=id},
    readSerializedSelection:n=>n.selected??"",writeSerializedSelection:(n,id)=>{n.selected=id}};
  const dispose=registerDgAdapter(adapter);
  try{
    assert.throws(()=>registerDgAdapter({...adapter}),/already registered/);
    for(const route of ["root-deep","deep-root","deep-sibling"]){
      const f=hierarchyFixture(),origin=route==="root-deep"?f.root:f.subDeep;
      const destination=route==="deep-root"?f.root:route==="deep-sibling"?f.subB:f.subDeep;
      const sender=f.sender(origin,991,"Foreign source"),receiver=f.receiver(destination,992,"Foreign sink");
      sender.type="Foreign source";receiver.type="Foreign sink";
      sender.outputs[0].name="foreign-payload";receiver.inputs[1].name="foreign-payload";
      const normal=structuredClone(receiver.inputs[0]);
      const [choice]=dgSenderChoices(receiver);assert.ok(choice);
      receiver.selected=choice.id;
      assert.equal(reconcileDgTopology(receiver),true);
      const snapshot=()=>JSON.stringify([f.root,f.subA,f.subDeep,f.subB].map(g=>({
        inputs:g.inputs?.map(s=>({name:s.name,type:s.type,label:s.label,linkIds:s.linkIds})),
        outputs:g.outputs?.map(s=>({name:s.name,type:s.type,label:s.label,linkIds:s.linkIds})),
        links:[...g.links.values()]
      })));
      const before=snapshot();for(let i=0;i<3;i++)assert.equal(reconcileDgTopology(receiver),true);
      assert.equal(snapshot(),before);assert.deepEqual(receiver.inputs[0],normal);
      assert.equal(receiver.widgets,undefined);
      const source={nodes:[{type:sender.type,properties:structuredClone(sender.properties)},{type:receiver.type,selected:choice.id}]};
      const copied=prepareDgClipboard(source);
      assert.notEqual(copied.nodes[0].properties.bvDgSenderId,choice.id);
      assert.equal(copied.nodes[1].selected,copied.nodes[0].properties.bvDgSenderId);
      assert.equal(source.nodes[1].selected,choice.id);
      assert.equal(prepareDgClipboard({nodes:[source.nodes[1]]}).nodes[0].selected,choice.id);
      const canary=f.receiver(destination,993,"Canary sharing foreign sender");
      assert.equal(connectDgCanarySender(canary,choice.id),true);
      const canaryLink=canary.inputs[1].link;
      assert.equal(disconnectDgSender(receiver),true);
      assert.equal(canary.inputs[1].link,canaryLink);assert.ok(destination.links.has(canaryLink));
    }
    const ordinary={type:"BV Regional Collector",selected:"unchanged",inputs:[{type:PROVIDER,link:77}]};
    assert.equal(reconcileDgTopology(ordinary),false);assert.equal(ordinary.inputs[0].link,77);
  }finally{dispose()}
  const f=hierarchyFixture(),sender=f.sender(f.root,994,"No registered owner");sender.type="Foreign source";
  assert.deepEqual(dgSenderChoices(f.receiver(f.root,995,"Receiver")),[]);
});

test("each clipboard transaction remaps only copied sender references without mutating source",()=>{
  const sender={id:1,type:"BV Titlebar Port Canary Sender (THROW AWAY)",properties:{bvDgSenderId:"original"}};
  const receiver={id:2,type:"BV Titlebar Port Canary Receiver (THROW AWAY)",properties:{bvDgSelectedSenderStableId:"original",bvDgSelectedSenderNodeId:"1"},widgets_values:["original"]};
  const external={...receiver,id:3,properties:{bvDgSelectedSenderStableId:"external"},widgets_values:["external"]};
  const data={nodes:[receiver,external],subgraphs:[{nodes:[sender]}],links:[{type:"STRING",origin_id:1,target_id:2}]};
  const before=structuredClone(data),a=prepareDgClipboard(data),b=prepareDgClipboard(data);
  const aid=a.subgraphs[0].nodes[0].properties.bvDgSenderId;
  assert.notEqual(aid,"original");assert.notEqual(aid,b.subgraphs[0].nodes[0].properties.bvDgSenderId);
  assert.equal(a.nodes[0].widgets_values[0],aid);assert.equal(a.nodes[0].properties.bvDgSelectedSenderStableId,aid);
  assert.equal(a.nodes[0].properties.bvDgSelectedSenderNodeId,undefined);
  assert.deepEqual(a.nodes[1],external);assert.deepEqual(a.links,data.links);assert.deepEqual(data,before);
  const alone=prepareDgClipboard({nodes:[receiver]});assert.equal(alone.nodes[0].widgets_values[0],"original");
  assert.throws(()=>prepareDgClipboard({nodes:[sender,structuredClone(sender)]}),/ambiguous/i);
});

test("native UI clone remaps at deserialize while serialization and conversion preserve identity",()=>{
  function Sender(){this.properties={bvDgSenderId:"original"}}
  Sender.prototype.clone=function(){const copy=new Sender();copy.properties=structuredClone(this.properties);return copy};
  installDgCanaryPrototype(Sender,{name:"BV Titlebar Port Canary Sender (THROW AWAY)"});
  const source=new Sender(),copy=source.clone();
  assert.equal(copy.properties.bvDgSenderId,source.properties.bvDgSenderId);
  const canvas={_deserializeItems(data,options){assert.equal(this,canvas);assert.equal(options,"options");return data}};
  let preparations=0;
  const prepare=data=>{preparations++;return prepareDgClipboard(data)};
  installProjectedClipboard(canvas,prepare);installProjectedClipboard(canvas,prepare);
  const data={nodes:[{type:"BV Titlebar Port Canary Sender (THROW AWAY)",properties:copy.properties}]};
  assert.notEqual(canvas._deserializeItems(data,"options").nodes[0].properties.bvDgSenderId,"original");
  assert.equal(preparations,1);
  assert.equal(source.properties.bvDgSenderId,"original");
  const persisted=structuredClone(copy.properties);
  copy.onConfigure();assert.deepEqual(copy.properties,persisted);
  const graph={_nodes:[source],convertToSubgraph(){return {node:source.clone()}}};source.graph=graph;
  installDgAnchorInteractionGuard(source);
  assert.equal(graph.convertToSubgraph().node.properties.bvDgSenderId,"original");
  assert.equal(source.clone().properties.bvDgSenderId,"original");
});

test("clipboard preparation preserves ordinary data and handles named receiver widgets",()=>{
  const ordinary={nodes:[{id:1,type:"Plain",inputs:[{name:"a",link:1}],widgets_values:["unchanged"]}],links:[{id:1,type:"STRING"}],groups:[{title:"G"}],reroutes:[{id:2,pos:[5,8]}]};
  assert.deepEqual(prepareDgClipboard(ordinary),ordinary);
  const sender={id:1,type:"BV Titlebar Port Canary Sender (THROW AWAY)",properties:{bvDgSenderId:"old"}};
  const receiver={id:1,type:"BV Titlebar Port Canary Receiver (THROW AWAY)",widgets_values:{sender_id:"old"},widgets_values_named:{sender_id:"old"}};
  const external={...receiver,widgets_values:{sender_id:"external"},widgets_values_named:{sender_id:"external"}};
  const data={nodes:[{...sender,properties:{}}],subgraphs:[{nodes:[sender]},{nodes:[receiver,external]}]};
  const copy=prepareDgClipboard(data),id=copy.subgraphs[0].nodes[0].properties.bvDgSenderId;
  assert.ok(copy.nodes[0].properties.bvDgSenderId);assert.notEqual(id,copy.nodes[0].properties.bvDgSenderId);
  assert.equal(copy.subgraphs[1].nodes[0].widgets_values.sender_id,id);
  assert.equal(copy.subgraphs[1].nodes[0].widgets_values_named.sender_id,id);
  const namedOnly=prepareDgClipboard({nodes:[sender,{...receiver,widgets_values:undefined}]});
  assert.equal(namedOnly.nodes[1].widgets_values_named.sender_id,namedOnly.nodes[0].properties.bvDgSenderId);
  assert.deepEqual(copy.subgraphs[1].nodes[1],external);
  let nativeCalls=0;const canvas={_deserializeItems(){nativeCalls++}};installProjectedClipboard(canvas,prepareDgClipboard);
  assert.throws(()=>canvas._deserializeItems({nodes:[sender,structuredClone(sender)]}),/ambiguous/);assert.equal(nativeCalls,0);
});

test("native graph conversion permits guarded reconnects only during its synchronous transaction",()=>{
  const node={inputs:[{type:PROVIDER}],outputs:[{type:PROVIDER}]};
  const child={_nodes:[],convertToSubgraph(){assert.equal(node.onConnectOutput(0),true);return {subgraph:null}}};
  const result={subgraph:child};let calls=0;
  const root={_nodes:[node],convertToSubgraph(items){
    assert.equal(this,root);assert.equal(items,"selection");calls++;
    assert.equal(node.onConnectOutput(0),true,"native reconnect must not be vetoed");
    assert.equal(node.onConnectInput(0),true);
    return result;
  }};node.graph=root;
  installDgAnchorInteractionGuard(node);
  assert.equal(node.onConnectOutput(0),false);
  assert.equal(root.convertToSubgraph("selection"),result);
  child.convertToSubgraph();
  assert.equal(node.onConnectInput(0),false);
  installDgAnchorInteractionGuard(node);root.convertToSubgraph("selection");assert.equal(calls,2);
  const error=new Error("conversion failure");
  const failing={_nodes:[node],convertToSubgraph(){assert.equal(node.onConnectOutput(0),true);throw error}};
  node.graph=failing;installDgAnchorInteractionGuard(node);
  assert.throws(()=>failing.convertToSubgraph(),e=>e===error);
  assert.equal(node.onConnectOutput(0),false,"exception must restore the connection lock");
});

for(const method of ["convertToSubgraph","unpackSubgraph"]){
  test(`structural ${method} removal preserves DG until native reconnect`,()=>{
    const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),r=f.receiver(f.subDeep,9003,"Receiver");
    const before=()=>JSON.stringify([f.root,f.subA,f.subDeep].map(graph=>[...graph.links]));
    let snapshot;
    f.subDeep.convertToSubgraph=()=>null;
    f.subDeep[method]=()=>{deactivateDgReceiver(r);assert.equal(before(),snapshot);activateDgReceiver(r);throw new Error("native failure")};
    dgCanarySenderChoices(r);connectDgCanarySender(r,a.properties.bvDgSenderId);snapshot=before();
    assert.throws(()=>f.subDeep[method](),/native failure/);
    deactivateDgReceiver(r);assert.equal(f.root.links.size,0,"failed transaction must restore ordinary delete cleanup");
  });
}

test("deleted receiver boundary is reused without reload",()=>{
  const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),b=f.sender(f.root,9002,"B"),old=f.receiver(f.subA,9003,"Old");
  dgCanarySenderChoices(old);connectDgCanarySender(old,a.properties.bvDgSenderId);
  const boundary=f.subA.inputs[0];
  deactivateDgReceiver(old);f.subA._nodes.splice(f.subA._nodes.indexOf(old),1);
  const next=f.receiver(f.subA,9004,"New");
  assert.equal(connectDgCanarySender(next,b.properties.bvDgSenderId),true);
  assert.equal(connectedDgSender(next),b);
  assert.equal(f.subA.inputs.length,1);
  assert.equal(f.subA.inputs[0],boundary);
});

test("disconnected DG input is reused after metadata loss and sender change",()=>{
  const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),b=f.sender(f.root,9002,"B"),r=f.receiver(f.subA,9003,"Receiver");
  dgCanarySenderChoices(r);
  connectDgCanarySender(r,a.properties.bvDgSenderId);
  const boundary=f.subA.inputs[0],normal=r.inputs[0];
  disconnectDgCanarySender(r);
  for(const key of Object.keys(boundary))if(key.startsWith("__bv"))delete boundary[key];
  assert.equal(connectDgCanarySender(r,b.properties.bvDgSenderId),true);
  assert.equal(connectedDgSender(r),b);
  assert.equal(r.inputs[0],normal);
  assert.equal(f.subA.inputs.length,1,"must not accumulate an empty provider input before the active one");
});

for(const scenario of ["live-owner","foreign-id","deep","shared"]){
  test(`deleted receiver ownership protection: ${scenario}`,()=>{
    const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),b=f.sender(f.root,9002,"B"),graph=scenario==="deep"?f.subDeep:f.subA;
    const old=f.receiver(graph,9003,"Old");dgCanarySenderChoices(old);connectDgCanarySender(old,a.properties.bvDgSenderId);
    const boundary=graph.inputs[0];
    let survivor;
    if(scenario==="shared"){
      survivor=f.receiver(graph,9005,"Survivor");boundary.connect(survivor.inputs[1],survivor);
    }
    if(scenario==="live-owner")disconnectDgCanarySender(old);
    else {deactivateDgReceiver(old);graph._nodes.splice(graph._nodes.indexOf(old),1)}
    if(scenario==="foreign-id")f.subB._nodes.push({id:old.id,graph:f.subB,type:"unregistered"});
    const next=f.receiver(graph,9004,"New");assert.equal(connectDgCanarySender(next,b.properties.bvDgSenderId),true);
    assert.equal(connectedDgSender(next),b);
    assert.equal(graph.inputs.length,scenario==="deep"?1:2);
    if(scenario==="deep")assert.equal(f.subA.inputs.length,1);
    if(scenario==="shared")assert.equal(connectedDgSender(survivor),a);
    if(scenario==="live-owner"){
      assert.equal(connectDgCanarySender(old,a.properties.bvDgSenderId),true);
      assert.equal(connectedDgSender(old),a);assert.equal(connectedDgSender(next),b);
    }
  });
}

for(const fault of ["public-name","backlink","canonical-inner","canonical-parent","floating-slot","floating-graph","other-host","other-host-canonical","ownership","unknown-host-link","normal-after"]){
  test(`empty DG reclaim preserves protected boundary: ${fault}`,()=>{
    const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),b=f.sender(f.root,9002,"B"),r=f.receiver(f.subA,9003,"Receiver");
    dgCanarySenderChoices(r);connectDgCanarySender(r,a.properties.bvDgSenderId);
    const boundary=f.subA.inputs[0],normal=r.inputs[0];
    disconnectDgCanarySender(r);
    for(const key of Object.keys(boundary))if(key.startsWith("__bv"))delete boundary[key];
    if(fault==="public-name")boundary.name="public_provider";
    if(fault==="backlink")boundary.linkIds=[777];
    if(fault==="canonical-inner")f.subA.links.set(777,{id:777,origin_id:f.subA.inputNode.id,origin_slot:0,target_id:888,target_slot:0,type:PROVIDER});
    if(fault==="canonical-parent")f.root.links.set(777,{id:777,origin_id:888,origin_slot:0,target_id:f.hostA.id,target_slot:0,type:PROVIDER});
    if(fault==="floating-slot")boundary._floatingLinks=new Set([{id:777}]);
    if(fault==="floating-graph")f.root.floatingLinks=new Map([[777,{id:777}]]);
    if(fault==="other-host")f.root._nodes.unshift({id:999,graph:f.root,subgraph:f.subA,inputs:[{type:PROVIDER,link:777}],outputs:[]});
    if(fault==="other-host-canonical"){
      const second={id:999,graph:f.subB,subgraph:f.subA,inputs:[{type:PROVIDER,link:null}],outputs:[]};
      f.subB._nodes.push(second);
      const add=f.subA.addInput;
      f.subA.addInput=function(name,type){const result=add.call(this,name,type);second.inputs.push({name,type,link:null});return result};
      f.subB.links.set(777,{id:777,origin_id:888,origin_slot:0,target_id:999,target_slot:0,type:PROVIDER});
    }
    if(fault==="normal-after")f.subA.addInput("normal","STRING");
    if(fault==="ownership")boundary.__bvDgRouteKey="foreign-active-route";
    if(fault==="unknown-host-link")delete f.hostA.inputs[0].link;
    assert.equal(connectDgCanarySender(r,b.properties.bvDgSenderId),true);
    assert.equal(f.subA.inputs.length,fault==="normal-after"?3:2);
    if(fault==="normal-after")assert.equal(f.subA.inputs[1].name,"normal");
    if(fault==="other-host-canonical")assert.equal(f.subB.links.get(777).target_slot,0);
    assert.equal(f.subA.inputs[0],boundary);
    assert.equal(r.inputs[0],normal);
  });
}

test("DG reclaim preserves normal boundary links through repeated sender changes",()=>{
  const f=hierarchyFixture(),a=f.sender(f.root,9001,"A"),b=f.sender(f.root,9002,"B"),r=f.receiver(f.subA,9003,"Receiver");
  const ordinary=f.subA.addInput("samples","IMAGE"),hostSlot=f.hostA.inputs[0];
  ordinary.linkIds=[701];hostSlot.link=700;
  const outer={id:700,origin_id:800,origin_slot:0,target_id:f.hostA.id,target_slot:0,type:"IMAGE"};
  const inner={id:701,origin_id:f.subA.inputNode.id,origin_slot:0,target_id:r.id,target_slot:0,type:"IMAGE"};
  f.root.links.set(700,outer);f.subA.links.set(701,inner);r.inputs[0].link=701;
  dgCanarySenderChoices(r);connectDgCanarySender(r,a.properties.bvDgSenderId);
  const boundary=f.subA.inputs[1];
  for(const sender of [b,a,b,a]){
    disconnectDgCanarySender(r);
    for(const key of Object.keys(boundary))if(key.startsWith("__bv"))delete boundary[key];
    assert.equal(connectDgCanarySender(r,sender.properties.bvDgSenderId),true);
    assert.equal(connectedDgSender(r),sender);assert.equal(f.subA.inputs.length,2);
    assert.equal(f.subA.inputs[1],boundary);assert.equal(f.subA.inputs[0],ordinary);assert.equal(f.hostA.inputs[0],hostSlot);
    assert.equal(hostSlot.link,700);assert.deepEqual(ordinary.linkIds,[701]);assert.equal(r.inputs[0].link,701);
    assert.equal(f.root.links.get(700),outer);assert.equal(outer.target_slot,0);assert.equal(f.subA.links.get(701),inner);assert.equal(inner.origin_slot,0);
  }
});

test("topology rebuild reuses promoted input boundaries without transient metadata",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,1,"Root"),target=f.receiver(f.subDeep,2,"Deep");
  const id=dgCanarySenderChoices(target)[0].id;
  assert.equal(connectDgCanarySender(target,id),true);
  const outer=f.subA.inputs[0],inner=f.subDeep.inputs[0];
  // Native conversion copies canonical links but drops prototype-only fields.
  for(const key of Object.keys(outer))if(key.startsWith('__bv'))delete outer[key];
  f.hostA.id=101;
  for(const link of f.root.links.values())if(link.target_id===100)link.target_id=101;
  target.__bvDgRouteSignature="previous topology";
  assert.equal(connectDgCanarySender(target,id),true);
  assert.equal(f.subA.inputs.length,1,"rebuild must not orphan the promoted outer boundary");
  assert.equal(f.subA.inputs[0],outer);assert.equal(f.subDeep.inputs[0],inner);
  assert.equal(outer.linkIds.length,1);
});

test("switching sender does not redirect a native shared input boundary",()=>{
  const f=hierarchyFixture(),old=f.sender(f.root,1,"Old"),next=f.sender(f.root,2,"Next");
  const a=f.receiver(f.subA,3,"A"),b=f.receiver(f.subA,4,"B");
  const choices=dgCanarySenderChoices(a);
  connectDgCanarySender(a,choices.find(c=>c.id===old.properties.bvDgSenderId).id);
  const shared=f.subA.inputs[0],aLink=shared.linkIds[0],parentLink=f.hostA.inputs[0].link;
  shared.connect(b.inputs[1],b);shared.linkIds.unshift(aLink);
  const bLink=b.inputs[1].link;
  assert.equal(connectDgCanarySender(a,next.properties.bvDgSenderId),true);
  assert.equal(f.hostA.inputs[0].link,parentLink,"other receiver keeps original upstream");
  assert.equal(b.inputs[1].link,bLink);assert.ok(shared.linkIds.includes(bLink));
  assert.equal(f.subA.inputs.length,2,"switching receiver needs its own boundary");
});

test("nested clipboard route reuses its intact dangling input chain",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,1,"Root"),target=f.receiver(f.subDeep,2,"Copy");
  const id=dgCanarySenderChoices(target)[0].id;connectDgCanarySender(target,id);
  const outer=f.subA.inputs[0],inner=f.subDeep.inputs[0];
  const incoming=f.hostA.inputs[0].link;f.root.links.delete(incoming);source.outputs[0].links=[];f.hostA.inputs[0].link=null;
  // Clipboard remaps node IDs, preserves serialized boundary names, drops transient metadata.
  target.id=22;for(const link of f.subDeep.links.values())link.target_id=22;
  for(const object of [target,outer,inner])for(const key of Object.keys(object))if(key.startsWith('__bv'))delete object[key];
  assert.equal(connectDgCanarySender(target,id),true);
  assert.equal(f.subA.inputs.length,1,"paste must reuse the dangling intermediate boundary");
  assert.equal(f.subDeep.inputs.length,1);assert.equal(f.subA.inputs[0],outer);assert.equal(f.subDeep.inputs[0],inner);
  assert.equal(target.inputs[0].link,1002,"normal port untouched");
});

test("dangling capture rejects missing link objects and broken backlinks",()=>{
  for(const fault of ["missing-link","inner-backlink","outer-backlink"]){
    const f=hierarchyFixture(),source=f.sender(f.root,1,"Root"),target=f.receiver(f.subDeep,2,"Copy");
    const id=dgCanarySenderChoices(target)[0].id;connectDgCanarySender(target,id);
    const outer=f.subA.inputs[0],inner=f.subDeep.inputs[0],incoming=f.hostA.inputs[0].link;
    f.root.links.delete(incoming);source.outputs[0].links=[];f.hostA.inputs[0].link=fault==="missing-link"?incoming:null;
    if(fault==="inner-backlink")inner.linkIds=[];
    if(fault==="outer-backlink")outer.linkIds=[];
    target.id=22;for(const link of f.subDeep.links.values())link.target_id=22;
    for(const object of [target,outer,inner])for(const key of Object.keys(object))if(key.startsWith('__bv'))delete object[key];
    assert.equal(connectDgCanarySender(target,id),true);
    assert.equal(f.subA.inputs.length,2,`${fault}: invalid chain must not authorize capture`);
  }
});

test("deep sender shared by root and sibling reuses all output boundaries after reload",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subDeep,1,"Deep"),outside=f.receiver(f.root,2,"Root"),sibling=f.receiver(f.subB,3,"Sibling");
  const id=dgCanarySenderChoices(outside)[0].id;
  assert.equal(connectDgCanarySender(outside,id),true);assert.equal(connectDgCanarySender(sibling,id),true);
  const all=[f.root,f.subA,f.subDeep,f.subB];
  const before=all.map(g=>({inputs:g.inputs?.length,outputs:g.outputs?.length,links:JSON.stringify([...g.links])}));
  for(let cycle=0;cycle<3;cycle++){
    for(const g of all){for(const slot of [...(g.inputs??[]),...(g.outputs??[])])for(const key of Object.keys(slot))if(key.startsWith('__bv'))delete slot[key]}
    for(const node of [outside,sibling])for(const key of Object.keys(node))if(key.startsWith('__bv'))delete node[key];
    assert.equal(connectDgCanarySender(sibling,id),true);assert.equal(connectDgCanarySender(outside,id),true);
    assert.deepEqual(all.map(g=>({inputs:g.inputs?.length,outputs:g.outputs?.length,links:JSON.stringify([...g.links])})),before);
  }
});

test("receiver polling follows current widgets and disposes across remove/re-add", async()=>{
  const priorWindow=globalThis.window, timers=new Map();let timerId=0;
  globalThis.window={setTimeout(fn){timers.set(++timerId,fn);return timerId},clearTimeout(id){timers.delete(id)}};
  try{
    const f=hierarchyFixture(),sender=f.sender(f.root,1,"Sender"),target=f.receiver(f.root,2,"Receiver");
    target.widgets=[{name:"sender_id",value:""}];
    target.addWidget=function(type,name,value,callback,options){const w={type,name,value,callback,options};this.widgets.push(w);return w};
    const nodeType=function(){};let removed=0,added=0;
    nodeType.prototype.onRemoved=()=>removed++;nodeType.prototype.onAdded=()=>added++;
    installDgCanaryPrototype(nodeType,{name:target.type});Object.setPrototypeOf(target,nodeType.prototype);
    target.onNodeCreated();await Promise.resolve();
    const oldState=target.widgets[0],oldSelector=target.widgets[1];
    const choice=dgCanarySenderChoices(target)[0];
    const currentState={name:"sender_id",value:choice.id};target.widgets[0]=currentState;
    target.onConfigure();await Promise.resolve();
    const links=JSON.stringify([...f.root.links]),normal=target.inputs[0];
    const tick=()=>{const [id,fn]=timers.entries().next().value;timers.delete(id);fn()};
    tick();assert.equal(oldSelector.value,choice.label,"poll must read the current state, not its initial empty widget");
    assert.equal(oldState.value,"");assert.equal(currentState.value,choice.id);
    const currentSelector={...oldSelector,options:{...oldSelector.options}};target.widgets[1]=currentSelector;
    oldSelector.value="retired selector";
    for(let i=0;i<3;i++){target.onConfigure();await Promise.resolve()}
    assert.equal(timers.size,1,"configure must not duplicate polling");
    const options=currentSelector.options.values;tick();
    assert.equal(currentSelector.options.values,options,"unchanged options retain identity");
    assert.equal(oldSelector.value,"retired selector");
    sender.title="Renamed";tick();assert.match(currentSelector.value,/Renamed/);
    assert.equal(JSON.stringify([...f.root.links]),links);assert.equal(target.inputs[0],normal);
    target.widgets=[];tick();assert.equal(JSON.stringify([...f.root.links]),links,"missing widgets are not an explicit disconnect");
    target.widgets=[currentState,currentSelector];
    const stalePoll=timers.values().next().value;
    target.onConfigure();target.onRemoved();await Promise.resolve();
    assert.equal(f.root.links.size,0,"remove releases the default-channel transport");
    assert.equal(removed,1);assert.equal(timers.size,0,"remove cancels polling and queued configure must not restart it");
    target.onAdded();await Promise.resolve();assert.equal(added,1);assert.equal(timers.size,1);
    stalePoll();assert.equal(timers.size,1,"retired poll cannot restart after re-add");
    tick();assert.equal(currentState.value,choice.id);assert.equal(connectedDgSender(target),sender);assert.equal(f.root.links.size,1);
    target.onRemoved();assert.equal(timers.size,0);
  }finally{if(priorWindow===undefined)delete globalThis.window;else globalThis.window=priorWindow}
});

function fixture(){
  let nextLink=100;
  const normalHost={name:"samples",type:"IMAGE",link:31};
  const normalReceiver={name:"samples",type:"IMAGE",link:41};
  const receiverProvider={name:"resource_provider",type:PROVIDER,link:null};
  const senderA={id:1,type:"BV Titlebar Port Canary Sender (THROW AWAY)",title:"Root A",outputs:[{name:"alpha",type:"STRING",links:null},{name:"resource_provider",type:PROVIDER,links:null}]};
  const senderB={id:2,type:"BV Titlebar Port Canary Sender (THROW AWAY)",title:"Root B",outputs:[{name:"resource_provider",type:PROVIDER,links:null}]};
  const host={id:10,title:"Nested",inputs:[normalHost],outputs:[]};
  const root={_nodes:[senderA,senderB,host],links:new Map()};
  const ordinaryBoundary={id:"boundary-samples",name:"samples",type:"IMAGE",linkIds:[41]};
  const subgraph={rootGraph:root,inputs:[ordinaryBoundary],outputs:[],_nodes:[],links:new Map(),inputNode:{id:-10,slots:[ordinaryBoundary],arranged:0,arrange(){this.arranged++}},outputNode:{id:-20,slots:[],inputs:[]},addInput(name,type){
    const slot={id:`boundary-${this.inputs.length}`,name,type,linkIds:[],connect(input,node){
      const id=nextLink++;this.linkIds=[id];input.link=id;subgraph.links.set(id,{id,origin_id:-10,origin_slot:subgraph.inputs.indexOf(this),target_id:node.id,target_slot:node.inputs.indexOf(input),type});return{id};
    }};
    this.inputs.push(slot);this.inputNode.slots.push({slot,name,type,measurement:{minHeight:20,maxHeight:20,desiredHeight:20}});host.inputs.push({name,type,link:null});return slot;
  },addOutput(name,type){
    const slot={id:`output-${this.outputs.length}`,name,type,linkIds:[],connect(output,node){const id=nextLink++;this.linkIds=[id];output.links=[...(output.links??[]),id];subgraph.links.set(id,{id,origin_id:node.id,origin_slot:node.outputs.indexOf(output),target_id:subgraph.outputNode.id,target_slot:subgraph.outputs.indexOf(this),type});return{id}}};this.outputs.push(slot);this.outputNode.slots.push(slot);host.outputs.push({name,type,links:null});return slot;
  }};
  host.subgraph=subgraph;host.graph=root;
  const receiver={id:20,title:"Nested Receiver",graph:subgraph,inputs:[receiverProvider,normalReceiver],disconnectInput(index){const slot=this.inputs[index];if(slot.link!=null){subgraph.links.delete(slot.link);slot.link=null}}};
  subgraph._nodes.push(receiver);
  for(const sender of[senderA,senderB]){sender.graph=root;sender.connect=function(output,node,input){const id=nextLink++;this.outputs[output].links=[id];node.inputs[input].link=id;root.links.set(id,{id,origin_id:this.id,origin_slot:output,target_id:node.id,target_slot:input,type:PROVIDER});return{id}}}
  host.disconnectInput=function(index){const slot=this.inputs[index];if(slot.link!=null){root.links.delete(slot.link);slot.link=null}};
  host.connect=function(output,node,input){const id=nextLink++;this.outputs[output].links=[id];node.inputs[input].link=id;root.links.set(id,{id,origin_id:this.id,origin_slot:output,target_id:node.id,target_slot:input,type:PROVIDER});return{id}};
  return{root,subgraph,host,receiver,senderA,senderB,normalHost,normalReceiver};
}

function hierarchyFixture(){
  let nextLink=500;
  const root={name:"Root",_nodes:[],links:new Map()};
  const makeGraph=(name)=>({name,rootGraph:root,_nodes:[],inputs:[],outputs:[],links:new Map(),inputNode:{id:`${name}-in`,slots:[],outputs:[]},outputNode:{id:`${name}-out`,slots:[],inputs:[]}});
  const subA=makeGraph("Sub A"),subDeep=makeGraph("Sub Deep"),subB=makeGraph("Sub B");
  const hosts=new Map();
  const addHost=(parent,child,id,title)=>{const host={id,title,graph:parent,subgraph:child,inputs:[],outputs:[],disconnectInput(index){this.inputs[index].link=null}};hosts.set(child,host);parent._nodes.push(host);host.connect=function(output,node,input){const link=nextLink++;this.outputs[output].links=[...(this.outputs[output].links??[]),link];node.inputs[input].link=link;parent.links.set(link,{id:link,origin_id:id,origin_slot:output,target_id:node.id,target_slot:input,type:PROVIDER});return{id:link}};child.addInput=function(name,type){const boundary={name,type,linkIds:[],connect(input,node){const link=nextLink++;this.linkIds=[link];input.link=link;child.links.set(link,{id:link,origin_id:child.inputNode.id,origin_slot:child.inputs.indexOf(this),target_id:node.id,target_slot:node.inputs.indexOf(input),type});return{id:link}}};child.inputs.push(boundary);child.inputNode.slots.push(boundary);child.inputNode.outputs.push(boundary);host.inputs.push({name,type,link:null});return boundary};child.addOutput=function(name,type){const boundary={name,type,linkIds:[],connect(output,node){const link=nextLink++;this.linkIds=[link];output.links=[...(output.links??[]),link];child.links.set(link,{id:link,origin_id:node.id,origin_slot:node.outputs.indexOf(output),target_id:child.outputNode.id,target_slot:child.outputs.indexOf(this),type});return{id:link}}};child.outputs.push(boundary);child.outputNode.slots.push(boundary);host.outputs.push({name,type,links:null});return boundary};return host};
  const hostA=addHost(root,subA,100,"Sub A"),hostDeep=addHost(subA,subDeep,110,"Sub Deep"),hostB=addHost(root,subB,120,"Sub B");
  const sender=(graph,id,title)=>{const node={id,title,type:"BV Titlebar Port Canary Sender (THROW AWAY)",graph,outputs:[{name:"resource_provider",type:PROVIDER,links:null}]};node.connect=function(output,target,input){const link=nextLink++;this.outputs[output].links=[...(this.outputs[output].links??[]),link];target.inputs[input].link=link;graph.links.set(link,{id:link,origin_id:id,origin_slot:output,target_id:target.id,target_slot:input,type:PROVIDER});return{id:link}};graph._nodes.push(node);return node};
  const receiver=(graph,id,title)=>{const normal={name:"samples",type:"IMAGE",link:id+1000},provider={name:"resource_provider",type:PROVIDER,link:null};const node={id,title,type:"BV Titlebar Port Canary Receiver (THROW AWAY)",graph,inputs:[normal,provider],disconnectInput(index){this.inputs[index].link=null}};graph._nodes.push(node);return node};
  return{root,subA,subDeep,subB,hostA,hostDeep,hostB,sender,receiver};
}

test("nested same-name sender selection uses the full path and routes the chosen deep sender",async()=>{
  const f=hierarchyFixture();f.hostA.title=f.hostDeep.title=f.hostB.title="New Subgraph";
  const sources=[f.sender(f.root,1,"Same"),f.sender(f.subA,2,"Same"),f.sender(f.subDeep,3,"Same"),f.sender(f.subB,4,"Same"),f.sender(f.subB,5,"Same"),f.sender(f.root,6,"No DG sender")];
  const target=f.receiver(f.root,20,"Receiver"),normal=target.inputs[0];
  const nodeType=function(){};installDgCanaryPrototype(nodeType,{name:target.type});
  const state={name:"sender_id",value:""};target.widgets=[state];
  target.addWidget=function(type,name,value,callback,options){const widget={type,name,value,callback,options};this.widgets.push(widget);return widget};
  Object.setPrototypeOf(target,nodeType.prototype);target.onNodeCreated();await Promise.resolve();
  const choices=dgCanarySenderChoices(target),selector=target.widgets.find(w=>w.name==="dg_sender_selector");
  assert.equal(new Set(["No DG sender",...choices.map(c=>c.label)]).size,choices.length+1,"every menu entry must be distinguishable");
  const deep=choices.find(c=>c.id===sources[2].properties.bvDgSenderId);
  assert.equal(deep.label,"Same — Root / New Subgraph / New Subgraph");
  selector.callback(deep.label);assert.equal(state.value,deep.id);
  assert.equal([...f.subDeep.links.values()][0].origin_id,sources[2].id);
  assert.equal(f.subA.links.size,1);assert.equal(f.root.links.size,1);
  assert.equal(target.inputs[0],normal);assert.equal(normal.link,1020);
  const counts=[f.subDeep.outputs.length,f.subA.outputs.length,f.root.links.size];
  selector.callback(deep.label);assert.deepEqual([f.subDeep.outputs.length,f.subA.outputs.length,f.root.links.size],counts);
  f.hostA.title="Renamed A";sources[2].title="Renamed Sender";
  target.onConfigure();await Promise.resolve();
  assert.equal(state.value,deep.id);assert.equal(selector.value,"Renamed Sender — Root / Renamed A / New Subgraph");
});

test("switching one receiver preserves the shared output segment of another receiver",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subA,1,"Shared"),deep=f.sender(f.subDeep,2,"Deep");
  const first=f.receiver(f.root,10,"First"),second=f.receiver(f.root,11,"Second");
  const choices=dgCanarySenderChoices(first),id=choices.find(c=>c.id===source.properties.bvDgSenderId).id;
  assert.equal(connectDgCanarySender(first,id),true);assert.equal(connectDgCanarySender(second,id),true);
  const shared=[...f.subA.links.values()].find(link=>link.origin_id===source.id),firstRoot=f.root.links.get(first.inputs[1].link);
  // The other receiver has not rebuilt any transient route bookkeeping after reload.
  for(const key of Object.keys(first))if(key.startsWith("__bv"))delete first[key];
  assert.equal(connectDgCanarySender(second,deep.properties.bvDgSenderId),true);
  assert.deepEqual(f.subA.links.get(shared.id),shared,"switching must retain the shared inner edge");
  assert.deepEqual(f.root.links.get(first.inputs[1].link),firstRoot);
  assert.ok(source.outputs[0].links.includes(shared.id));
  assert.equal(first.inputs[0].link,1010);assert.equal(second.inputs[0].link,1011);
  disconnectDgCanarySender(second);assert.deepEqual(f.subA.links.get(shared.id),shared);
  assert.equal(f.subDeep.links.size,0);
  assert.equal(connectDgCanarySender(second,id),true);disconnectDgCanarySender(second);
  assert.deepEqual(f.subA.links.get(shared.id),shared);
  disconnectDgCanarySender(first);assert.equal(f.subA.links.size,0);assert.equal(f.root.links.size,0);
  assert.deepEqual(source.outputs[0].links,[]);for(const boundary of f.subA.outputs)assert.deepEqual(boundary.linkIds,[]);
});

test("nested input routes survive three losses of transient route metadata",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,1,"Root Sender"),target=f.receiver(f.subDeep,2,"Deep Receiver");
  const normalA=f.subA.addInput("samples","IMAGE"),normalDeep=f.subDeep.addInput("samples","IMAGE");
  f.hostA.inputs[0].link=null;normalA.linkIds=[9001];f.hostDeep.inputs[0].link=9001;
  normalDeep.linkIds=[9002];target.inputs[0].link=9002;
  f.subA.links.set(9001,{id:9001,origin_id:f.subA.inputNode.id,origin_slot:0,target_id:f.hostDeep.id,target_slot:0,type:"IMAGE"});
  f.subDeep.links.set(9002,{id:9002,origin_id:f.subDeep.inputNode.id,origin_slot:0,target_id:target.id,target_slot:0,type:"IMAGE"});
  assert.equal(connectDgCanarySender(target,"root:1"),true);
  const graphs=[f.root,f.subA,f.subDeep],counts=()=>graphs.map(g=>[g.inputs?.length??0,g.outputs?.length??0,g.links.size]);
  const baseline=counts(),normal=target.inputs[0].link,normalRecords=JSON.stringify([f.subA.links.get(9001),f.subDeep.links.get(9002)]),boundaries=[...f.subA.inputs,...f.subDeep.inputs];
  for(let cycle=0;cycle<3;cycle++){
    for(const g of graphs)for(const obj of [g,...g._nodes,...(g.inputs??[]),...(g.outputs??[])])for(const key of Object.keys(obj))if(key.startsWith("__bv"))delete obj[key];
    assert.equal(connectDgCanarySender(target,"root:1"),true);
    assert.deepEqual(counts(),baseline,`reload ${cycle+1}`);assert.equal(target.inputs[0].link,normal);
    assert.equal(JSON.stringify([f.subA.links.get(9001),f.subDeep.links.get(9002)]),normalRecords);
    assert.deepEqual([...f.subA.inputs,...f.subDeep.inputs],boundaries);
    [...f.subA.inputs,...f.subDeep.inputs].forEach((boundary,index)=>assert.equal(boundary,boundaries[index]));
    for(const g of graphs){assert.equal([...g.links.values()].filter(link=>link.type===PROVIDER).length,1);
      for(const link of g.links.values()){
        const destination=g._nodes.find(node=>node.id===link.target_id);assert.equal(destination.inputs[link.target_slot].link,link.id);
        const refs=link.origin_id===g.inputNode?.id?g.inputs[link.origin_slot].linkIds:g._nodes.find(node=>node.id===link.origin_id).outputs[link.origin_slot].links;
        assert.ok(refs.includes(link.id));
      }
      for(const [index,boundary] of (g.inputs??[]).entries())for(const id of boundary.linkIds??[]){const link=g.links.get(id);assert.ok(link);assert.equal(link.origin_id,g.inputNode.id);assert.equal(link.origin_slot,index)}
      for(const node of g._nodes)for(const [index,slot] of (node.outputs??[]).entries())for(const id of slot.links??[]){const link=g.links.get(id);assert.ok(link);assert.equal(link.origin_id,node.id);assert.equal(link.origin_slot,index)}
    }
  }
});

test("a nested receiver discovers root senders and selection creates only the DG boundary chain",()=>{
  const f=fixture();
  assert.deepEqual(dgCanarySenderChoices(f.receiver).map(choice=>choice.label),["Root A — Root","Root B — Root"]);
  const hostInputs=f.host.inputs,receiverInputs=f.receiver.inputs;
  assert.equal(connectDgCanarySender(f.receiver,dgCanarySenderChoices(f.receiver)[1].id),true);
  assert.equal(f.host.inputs,hostInputs);assert.equal(f.receiver.inputs,receiverInputs);
  assert.equal(f.host.inputs[0],f.normalHost);assert.equal(f.normalHost.link,31);
  assert.equal(f.receiver.inputs[1],f.normalReceiver);assert.equal(f.normalReceiver.link,41);
  assert.equal(f.subgraph.inputs.length,2);assert.equal(f.subgraph.inputs[1].type,PROVIDER);
  assert.deepEqual(f.subgraph.inputNode.slots[1].measurement,{minHeight:0,maxHeight:0,desiredHeight:0});assert.ok(f.subgraph.inputNode.arranged>0);
  assert.notEqual(f.host.inputs[1].link,null);assert.notEqual(f.receiver.inputs[0].link,null);
  assert.equal(f.root.links.get(f.host.inputs[1].link).origin_id,2);
  assert.equal(f.subgraph.links.get(f.receiver.inputs[0].link).origin_id,-10);
  const wrapper=f.subgraph.inputNode.slots[1];wrapper.measurement.minHeight=20;wrapper.measurement.maxHeight=20;wrapper.measurement.desiredHeight=20;delete wrapper.__bvDgAnchor;
  assert.equal(connectDgCanarySender(f.receiver,dgCanarySenderChoices(f.receiver)[1].id),true);
  assert.deepEqual(wrapper.measurement,{minHeight:0,maxHeight:0,desiredHeight:0});assert.equal(wrapper.__bvDgAnchor,true);
});

test("DG guard rejects native legacy and modern hit results",()=>{
  const provider={type:PROVIDER},normal={type:"IMAGE"};
  for(const method of ["getSlotInPosition","getInputOnPos","getOutputOnPos","getSlotOnPos"]){
    for(const wrap of [slot=>slot,slot=>({input:slot,slot:0,link_pos:[0,0]}),slot=>({output:slot,slot:0,link_pos:[0,0]})]){
      const dg=wrap(provider),ordinary=wrap(normal),node={[method](x){return x?ordinary:dg}};
      installDgAnchorInteractionGuard(node);
      assert.equal(node[method](0,0),undefined,method);
      assert.equal(node[method](1,0),ordinary,method);
    }
  }
});

test("native output pointer gate prevents drag and detach but preserves normal outputs",()=>{
  const provider={type:PROVIDER},ordinary={type:"IMAGE"};let native=0;
  const node={outputs:[provider,ordinary],getOutputPos:i=>[200,i?40:-15]},canvas={pointer:{},_processNodeClick(){native++}};
  installDgAnchorInteractionGuard(node);installProjectedPortCanvasInteraction(canvas);
  for(const modifiers of [{},{shiftKey:true},{ctrlKey:true,altKey:true}])canvas._processNodeClick({canvasX:200,canvasY:-15,...modifiers},false,node);
  assert.equal(native,0);
  canvas._processNodeClick({canvasX:200,canvasY:40},false,node);assert.equal(native,1);
  canvas._processNodeClick({canvasX:80,canvasY:40},false,node);assert.equal(native,2);
});

test("special IO pointer guard leaves ordinary and add slots interactive",()=>{
  let native=0;const slots=[{slot:{type:PROVIDER}},{slot:{type:"IMAGE"}},{slot:{type:"*"}}];
  slots.forEach((s,i)=>s.boundingRect={containsXy:x=>x===i});
  const node={allSlots:slots,onPointerDown(){native++}},pointer={};installDgAnchorInteractionGuard(node);
  node.onPointerDown({canvasX:0,canvasY:0},pointer,{});assert.equal(native,0);
  node.onPointerDown({canvasX:1,canvasY:0},pointer,{});node.onPointerDown({canvasX:2,canvasY:0},pointer,{});assert.equal(native,2);
  assert.equal(typeof pointer.onDragStart,"function","prevent native nullish fallback from dragging the IO node");
  slots[2].boundingRect={containsXy:x=>x===0};
  node.onPointerDown({canvasX:0,canvasY:0},pointer,{});assert.equal(native,3,"last native match is the add slot, not collapsed DG");
  slots[1].slot.pos=[100,100];
  node.onPointerDown({canvasX:100,canvasY:80},pointer,{});assert.equal(native,3,"painted anchor above the first normal port stays inert");
  node.onPointerDown({canvasX:100,canvasY:100},pointer,{});assert.equal(native,4,"normal port row is not covered by the painted anchor guard");
});

test("DG anchors reject pointer and manual connect interaction without affecting ordinary ports",()=>{
  const provider={name:"resource_provider",type:PROVIDER},ordinary={name:"samples",type:"IMAGE"};
  const node={inputs:[provider,ordinary],outputs:[provider,ordinary],getSlotInPosition(x){return x===0?provider:ordinary},onConnectInput(){return true},onConnectOutput(){return true}};
  installDgAnchorInteractionGuard(node);
  assert.equal(node.getSlotInPosition(0,0),undefined);
  assert.equal(node.getSlotInPosition(1,0),ordinary);
  assert.equal(node.onConnectInput(0,PROVIDER,{},0),false);
  assert.equal(node.onConnectInput(1,"IMAGE",{},0),true);
  assert.equal(node.onConnectOutput(0,PROVIDER,{},0),false);
  assert.equal(node.onConnectOutput(1,"IMAGE",{},0),true);
});

test("receiver lifecycle keeps samples at port one and its native selector connects a root sender",async()=>{
  const f=fixture(),nodeType=function(){};
  const nodeData={name:"BV Titlebar Port Canary Receiver (THROW AWAY)",input:{optional:{resource_provider:[PROVIDER,{forceInput:true}],samples:["IMAGE",{forceInput:true}]}}};
  assert.equal(installDgCanaryPrototype(nodeType,nodeData),true);
  assert.deepEqual(Object.keys(nodeData.input.optional),["samples"]);
  const state={name:"sender_id",value:""},widgets=[state],normal=f.normalReceiver;
  f.receiver.type=nodeData.name;f.receiver.inputs=[normal];f.receiver.widgets=widgets;
  f.receiver.addInput=function(name,type){const slot={name,type,link:null};this.inputs.push(slot);return slot};
  f.receiver.addWidget=function(type,name,value,callback,options){const item={type,name,value,callback,options};this.widgets.push(item);return item};
  Object.setPrototypeOf(f.receiver,nodeType.prototype);
  nodeType.prototype.onNodeCreated.call(f.receiver);await Promise.resolve();
  assert.equal(f.receiver.inputs[0],normal);assert.equal(f.receiver.inputs[0].name,"samples");
  assert.equal(f.receiver.inputs[1].type,PROVIDER);
  const selector=f.receiver.widgets.find(widget=>widget.name==="dg_sender_selector");
  assert.ok(selector);assert.deepEqual(selector.options.values,["No DG sender","Root A — Root","Root B — Root"]);
  selector.callback("Root B — Root");
  assert.equal(state.value,f.senderB.properties.bvDgSenderId);assert.notEqual(f.receiver.inputs[1].link,null);
  assert.equal(f.root.links.get(f.host.inputs[1].link).origin_id,2);
});

test("a root receiver discovers a sender inside a subgraph and connects through an output boundary",()=>{
  const f=fixture();
  const nestedSender={id:30,type:"BV Titlebar Port Canary Sender (THROW AWAY)",title:"Nested Sender",graph:f.subgraph,outputs:[{name:"resource_provider",type:PROVIDER,links:null}]};
  nestedSender.connect=function(output,node,input){const id=201;this.outputs[output].links=[id];node.inputs[input].link=id;f.subgraph.links.set(id,{id,origin_id:this.id,origin_slot:output,target_id:node.id,target_slot:input,type:PROVIDER});return{id}};
  f.subgraph._nodes.push(nestedSender);
  const rootReceiver={id:40,type:"BV Titlebar Port Canary Receiver (THROW AWAY)",title:"Root Receiver",graph:f.root,inputs:[{name:"samples",type:"IMAGE",link:51},{name:"resource_provider",type:PROVIDER,link:null}],disconnectInput(index){this.inputs[index].link=null}};
  f.root._nodes.push(rootReceiver);
  assert.deepEqual(dgCanarySenderChoices(rootReceiver).map(choice=>choice.label),["Root A — Root","Root B — Root","Nested Sender — Root / Nested"]);
  assert.equal(connectDgCanarySender(rootReceiver,dgCanarySenderChoices(rootReceiver).find(choice=>choice.label==="Nested Sender — Root / Nested").id),true);
  assert.equal(rootReceiver.inputs[0].link,51);
  assert.notEqual(rootReceiver.inputs[1].link,null);
});

test("same-titled senders in root and subgraph remain distinct choices",()=>{
  const f=fixture();f.senderA.title="Same";const nested={id:1,type:"BV Titlebar Port Canary Sender (THROW AWAY)",title:"Same",graph:f.subgraph,outputs:[{name:"resource_provider",type:PROVIDER,links:null}]};f.subgraph._nodes.push(nested);
  assert.deepEqual(dgCanarySenderChoices(f.receiver).filter(choice=>choice.label.startsWith("Same")).map(choice=>choice.label),["Same — Root","Same — Root / Nested"]);
});

test("output boundary uses native connect and preserves the existing ordinary output",()=>{
  const f=fixture(),ordinary={name:"IMAGE",type:"IMAGE",linkIds:[71]},hostOutput={name:"IMAGE",type:"IMAGE",links:[72]};
  f.subgraph.outputs.push(ordinary);f.host.outputs.push(hostOutput);
  f.subgraph.outputNode={id:-20,slots:[ordinary]};
  f.subgraph.addOutput=function(name,type){
    const boundary={name,type,linkIds:[],connect(slot,node){
      const id=301;this.linkIds=[id];slot.links=[id];
      f.subgraph.links.set(id,{id,origin_id:node.id,origin_slot:node.outputs.indexOf(slot),target_id:-20,target_slot:f.subgraph.outputs.indexOf(this),type});return{id};
    }};
    this.outputs.push(boundary);this.outputNode.slots.push(boundary);f.host.outputs.push({name,type,links:null});return boundary;
  };
  const sender={id:30,type:"BV Titlebar Port Canary Sender (THROW AWAY)",title:"Inner",graph:f.subgraph,outputs:[{type:PROVIDER,links:null}],connect(){throw new Error("virtual output boundary is not an LGraphNode")}};
  const receiver={id:40,graph:f.root,inputs:[{type:PROVIDER,link:null}]};
  f.subgraph._nodes.push(sender);f.root._nodes.push(receiver);
  assert.equal(connectDgCanarySender(receiver,dgCanarySenderChoices(receiver).find(item=>item.label==="Inner — Root / Nested").id),true);
  assert.deepEqual(f.subgraph.outputs[1].linkIds,[301]);assert.deepEqual(sender.outputs[0].links,[301]);
  assert.deepEqual(f.subgraph.links.get(301),{id:301,origin_id:30,origin_slot:0,target_id:-20,target_slot:1,type:PROVIDER});
  assert.equal(f.subgraph.outputs[0],ordinary);assert.deepEqual(ordinary.linkIds,[71]);assert.equal(f.host.outputs[0],hostOutput);assert.deepEqual(hostOutput.links,[72]);
  assert.notEqual(receiver.inputs[0].link,null);
  const boundary=f.subgraph.outputs[1];
  for(const key of Object.keys(boundary))if(key.startsWith("__bv"))delete boundary[key];
  delete receiver.__bvDgRouteSignature;
  assert.equal(connectDgCanarySender(receiver,dgCanarySenderChoices(receiver).find(item=>item.label==="Inner — Root / Nested").id),true);
  assert.equal(f.subgraph.outputs.length,2,"reload must reuse the serialized output boundary");
  const add=(type,name,linkIds,links)=>{const slot={type,name,linkIds};f.subgraph.outputs.push(slot);f.subgraph.outputNode.slots.push(slot);f.host.outputs.push({type,name,links});return slot};
  const duplicate=add(PROVIDER,boundary.name,[],null),normal=add("STRING",boundary.name,[],null),innerConnected=add(PROVIDER,boundary.name,[999],null),outerConnected=add(PROVIDER,boundary.name,[],[998]),otherRoute=add(PROVIDER,"other-route",[],null),unknown=add(PROVIDER,boundary.name,undefined,null);
  const removed=[];f.subgraph.removeOutput=function(slot){removed.push(slot);const index=this.outputs.indexOf(slot);this.outputs.splice(index,1);this.outputNode.slots.splice(index,1);f.host.outputs.splice(index,1)};
  delete receiver.__bvDgRouteSignature;
  assert.equal(connectDgCanarySender(receiver,dgCanarySenderChoices(receiver).find(item=>item.label==="Inner — Root / Nested").id),true);
  assert.deepEqual(removed,[duplicate]);
  for(const slot of [ordinary,boundary,normal,innerConnected,outerConnected,otherRoute,unknown])assert.ok(f.subgraph.outputs.includes(slot));
});

test("an existing DG boundary is moved behind ordinary subgraph inputs without changing their links",()=>{
  const f=fixture();
  const dg={id:"boundary-dg",name:"__bv_dg_receiver_20",type:PROVIDER,linkIds:[77],__bvDgReceiverId:"20",connect(input,node){const id=202;this.linkIds=[id];input.link=id;f.subgraph.links.set(id,{id,origin_id:-10,origin_slot:f.subgraph.inputs.indexOf(this),target_id:node.id,target_slot:node.inputs.indexOf(input),type:PROVIDER});return{id}}};
  f.subgraph.inputs=[dg,f.subgraph.inputs[0]];
  f.subgraph.inputNode.slots=[dg,f.subgraph.inputNode.slots[0]];
  f.host.inputs=[{name:dg.name,type:PROVIDER,link:78},f.normalHost];
  const ordinary=f.subgraph.inputs[1];
  assert.equal(connectDgCanarySender(f.receiver,"2"),true);
  assert.equal(f.subgraph.inputs[0],ordinary);
  assert.equal(f.host.inputs[0],f.normalHost);
  assert.equal(f.normalHost.link,31);
  assert.equal(f.subgraph.inputs.at(-1),dg);
});

test("nested input reorder updates the owning parent graph, not root ID collisions",()=>{
  const f=hierarchyFixture();f.sender(f.root,1,"Root Sender");const target=f.receiver(f.subDeep,2,"Deep Receiver");
  const dg=f.subDeep.addInput("__bv_dg_receiver_2",PROVIDER);dg.__bvDgReceiverId="2";
  const normal=f.subDeep.addInput("samples","IMAGE");f.hostDeep.inputs[1].link=900;
  f.subA.links.set(900,{id:900,origin_id:999,origin_slot:0,target_id:f.hostDeep.id,target_slot:1,type:"IMAGE"});
  const unrelated={id:901,origin_id:888,origin_slot:0,target_id:f.hostDeep.id,target_slot:1,type:"IMAGE"};f.root.links.set(901,unrelated);
  assert.equal(connectDgCanarySender(target,"root:1"),true);
  assert.equal(f.subA.links.get(900).target_slot,0);assert.equal(unrelated.target_slot,1);assert.equal(f.subDeep.inputs[0],normal);
});

test("DG routing crosses every boundary on root to subgraph to nested subgraph",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,1,"Root Sender"),target=f.receiver(f.subDeep,2,"Deep Receiver"),normal=target.inputs[0].link;
  assert.equal(connectDgCanarySender(target,"root:1"),true);assert.equal(target.inputs[0].link,normal);
  assert.equal(f.root.links.size,1);assert.equal(f.subA.links.size,1);assert.equal(f.subDeep.links.size,1);
  assert.notEqual(f.hostA.inputs.find(slot=>slot.type===PROVIDER)?.link,null);assert.notEqual(f.hostDeep.inputs.find(slot=>slot.type===PROVIDER)?.link,null);
});

test("DG routing crosses two output boundaries from nested subgraph to root",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subDeep,3,"Deep Sender"),target=f.receiver(f.root,4,"Root Receiver"),normal=target.inputs[0].link;
  const choice=dgCanarySenderChoices(target).find(item=>item.label==="Deep Sender — Root / Sub A / Sub Deep");assert.ok(choice);assert.equal(connectDgCanarySender(target,choice.id),true);assert.equal(target.inputs[0].link,normal);
  assert.equal(f.subDeep.links.size,1);assert.equal(f.subA.links.size,1);assert.equal(f.root.links.size,1);
  assert.ok(f.hostDeep.outputs.some(slot=>slot.type===PROVIDER));assert.ok(f.hostA.outputs.some(slot=>slot.type===PROVIDER));
});

test("DG routing goes subgraph to root LCA to sibling subgraph",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subA,5,"Left Sender"),target=f.receiver(f.subB,6,"Right Receiver"),normal=target.inputs[0].link;
  const choice=dgCanarySenderChoices(target).find(item=>item.label==="Left Sender — Root / Sub A");assert.ok(choice);assert.equal(connectDgCanarySender(target,choice.id),true);assert.equal(target.inputs[0].link,normal);
  assert.equal(f.subA.links.size,1);assert.equal(f.root.links.size,1);assert.equal(f.subB.links.size,1);
  assert.ok(f.hostA.outputs.some(slot=>slot.type===PROVIDER));assert.ok(f.hostB.inputs.some(slot=>slot.type===PROVIDER));
});

test("DG routing is rebuilt when an already selected sender is moved into a sibling subgraph",()=>{
  const f=hierarchyFixture(),source=f.sender(f.root,7,"Moving Sender"),target=f.receiver(f.subB,8,"Right Receiver"),normal=target.inputs[0].link;
  const choice=dgCanarySenderChoices(target).find(item=>item.label==="Moving Sender — Root");target.__bvDgSelectedSenderId=choice.id;
  assert.equal(connectDgCanarySender(target,choice.id),true);assert.equal(f.hostB.inputs.filter(slot=>slot.type===PROVIDER).length,1);
  f.root._nodes.splice(f.root._nodes.indexOf(source),1);source.properties={};f.subA._nodes.push(source);source.graph=f.subA;
  assert.equal(reconcileDgCanaryTopology(target),true);assert.equal(target.inputs[0].link,normal);
  assert.equal(f.hostA.outputs.filter(slot=>slot.type===PROVIDER).length,1);assert.equal(f.hostB.inputs.filter(slot=>slot.type===PROVIDER).length,1);
});

test("DG routing is rebuilt across nested graph changes without consuming ordinary port one",()=>{
  const f=hierarchyFixture(),source=f.sender(f.subDeep,9,"Deep Sender"),target=f.receiver(f.root,10,"Moving Receiver"),normal=target.inputs[0].link;
  const choice=dgCanarySenderChoices(target).find(item=>item.label==="Deep Sender — Root / Sub A / Sub Deep");target.__bvDgSelectedSenderId=choice.id;
  assert.equal(connectDgCanarySender(target,choice.id),true);
  f.root._nodes.splice(f.root._nodes.indexOf(target),1);f.subB._nodes.push(target);target.graph=f.subB;
  assert.equal(reconcileDgCanaryTopology(target),true);assert.equal(target.inputs[0].link,normal);
  assert.equal(target.inputs[0].type,"IMAGE");assert.equal(f.hostB.inputs[0].type,PROVIDER);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CANARY_RECEIVER,
  CANARY_SENDER,
  applyCanaryMode,
  captureCanaryBaseline,
  inspectCanaryNode,
  restoreCanaryNode,
  scheduleCanaryInspection,
  validateCanaryContract,
} from "../js/bv_titlebar_port_canary_core.js";

const PROVIDER="BV_RUNTIME_RESOURCE_PROVIDER";

function graphFixture(){
  const link={id:42,origin_id:101,origin_slot:2,target_id:202,target_slot:3,type:PROVIDER};
  const graph={_links:new Map([[42,link]]),dirty:0,setDirtyCanvas(){this.dirty++}};
  return{graph,link};
}

function connectionPosition(node,input,index,ignorePos=false){
  const slots=input?node.inputs:node.outputs,slot=slots[index];
  if(!ignorePos&&slot.pos)return[node.pos[0]+slot.pos[0],node.pos[1]+slot.pos[1]];
  const ordinal=slots.slice(0,index).filter(candidate=>!candidate.pos).length;
  return[node.pos[0]+(input?10:node.size[0]-10),node.pos[1]+(ordinal+0.7)*20];
}

function senderNode(graph,{provider=undefined,unifiedIgnorePos=false,legacyIgnorePos=false}={}){
  const outputs=[
    {name:"alpha",type:"BV_CANARY_ALPHA",links:[]},
    {name:"beta",type:"BV_CANARY_BETA",links:[]},
    provider??{name:"resource_provider",type:PROVIDER,links:[42]},
    {name:"gamma",type:"BV_CANARY_GAMMA",links:[]},
    {name:"delta",type:"BV_CANARY_DELTA",links:[]},
    {name:"epsilon",type:"BV_CANARY_EPSILON",links:[]},
  ];
  return fakeNode({id:101,graph,inputs:[],outputs,direction:"output",unifiedIgnorePos,legacyIgnorePos});
}

function receiverNode(graph,{provider=undefined,unifiedIgnorePos=false,legacyIgnorePos=false}={}){
  const inputs=[
    {name:"alpha",type:"BV_CANARY_ALPHA",link:null},
    {name:"beta",type:"BV_CANARY_BETA",link:null},
    {name:"gamma",type:"BV_CANARY_GAMMA",link:null},
    provider??{name:"resource_provider",type:PROVIDER,link:42},
    {name:"delta",type:"BV_CANARY_DELTA",link:null},
    {name:"epsilon",type:"BV_CANARY_EPSILON",link:null},
    {name:"presentation_mode",type:"COMBO",widget:{name:"presentation_mode"},link:null},
    {name:"canary_note",type:"STRING",widget:{name:"canary_note"},link:null},
  ];
  return fakeNode({id:202,graph,inputs,outputs:[{name:"canary_result",type:"STRING",links:[]}],direction:"input",unifiedIgnorePos,legacyIgnorePos});
}

function fakeNode({id,graph,inputs,outputs,direction,unifiedIgnorePos,legacyIgnorePos}){
  const widgets=[{name:"presentation_mode",value:"Native",y:140,last_y:160},{name:"canary_note",value:"baseline",y:164,last_y:184}];
  return{
    id,graph,inputs,outputs,widgets,pos:[100,200],size:[260,210],properties:{stable:true},dirty:0,
    getSlotPosition(index,input){return connectionPosition(this,input,index,unifiedIgnorePos)},
    getConnectionPos(input,index){return connectionPosition(this,input,index,legacyIgnorePos)},
    setDirtyCanvas(){this.dirty++},
    computeSize(){return[260,210]},
    serialize(){return JSON.parse(JSON.stringify({id:this.id,inputs:this.inputs,outputs:this.outputs,properties:this.properties}))},
  };
}

function refs(node){return{inputs:node.inputs,outputs:node.outputs,widgets:node.widgets,inputSlots:[...node.inputs],outputSlots:[...node.outputs],widgetObjects:[...node.widgets],properties:node.properties}}
function assertRefs(node,before){assert.equal(node.inputs,before.inputs);assert.equal(node.outputs,before.outputs);assert.equal(node.widgets,before.widgets);assert.equal(node.properties,before.properties);before.inputSlots.forEach((slot,index)=>assert.equal(node.inputs[index],slot));before.outputSlots.forEach((slot,index)=>assert.equal(node.outputs[index],slot));before.widgetObjects.forEach((widget,index)=>assert.equal(node.widgets[index],widget))}

test("exact contracts place sender provider at output 2 and receiver provider at input 3",()=>{
  const{graph}=graphFixture(),sender=senderNode(graph),receiver=receiverNode(graph);
  assert.deepEqual(validateCanaryContract(sender,CANARY_SENDER).contract,{direction:"output",count:6,providerIndex:2,providerName:"resource_provider"});
  assert.deepEqual(validateCanaryContract(receiver,CANARY_RECEIVER).contract,{direction:"input",count:6,providerIndex:3,providerName:"resource_provider"});
  assert.equal(validateCanaryContract(sender,"BV LUT Registry").status,"IGNORED");
});

test("receiver contract counts connectable ports and retains widget-backed input entries",()=>{
  const{graph}=graphFixture(),receiver=receiverNode(graph),before=refs(receiver),validated=validateCanaryContract(receiver,CANARY_RECEIVER);
  assert.equal(receiver.inputs.length,8);
  assert.equal(validated.ok,true);
  assert.deepEqual(validated.slots.map(slot=>slot.name),["alpha","beta","gamma","resource_provider","delta","epsilon"]);
  assert.deepEqual(validated.slotIndexes,[0,1,2,3,4,5]);
  assert.equal(validated.providerArrayIndex,3);
  assert.equal(captureCanaryBaseline(receiver,CANARY_RECEIVER).ok,true);
  assert.equal(applyCanaryMode(receiver,CANARY_RECEIVER,"A - Title midline").ok,true);
  assertRefs(receiver,before);
  assert.deepEqual(receiver.inputs.slice(6).map(slot=>slot.widget?.name),["presentation_mode","canary_note"]);
  assert.deepEqual(inspectCanaryNode(receiver,CANARY_RECEIVER).measuredSlots.map(slot=>slot.index),[0,1,2,3,4,5]);
});

test("receiver contract fails closed when widgets shift graph indexes or an extra port appears",()=>{
  const{graph}=graphFixture(),shifted=receiverNode(graph),extra=receiverNode(graph);
  shifted.inputs.splice(2,0,{name:"early_widget",type:"STRING",widget:{name:"early_widget"},link:null});
  extra.inputs.splice(6,0,{name:"zeta",type:"BV_CANARY_ZETA",link:null});
  assert.match(validateCanaryContract(shifted,CANARY_RECEIVER).reason,/graph index mismatch/);
  assert.match(validateCanaryContract(extra,CANARY_RECEIVER).reason,/exactly 6 connectable slots/);
  assert.equal(shifted.inputs.some(slot=>Object.hasOwn(slot,"pos")),false);
  assert.equal(extra.inputs.some(slot=>Object.hasOwn(slot,"pos")),false);
});

test("linked middle slots survive repeated Native A B C cycles while body ordinals compact",()=>{
  const{graph}=graphFixture(),sender=senderNode(graph),receiver=receiverNode(graph),senderRefs=refs(sender),receiverRefs=refs(receiver),senderBefore=JSON.stringify(sender.serialize()),receiverBefore=JSON.stringify(receiver.serialize()),senderSize=[...sender.size],receiverSize=[...receiver.size],senderWidgetMetrics=sender.widgets.map(widget=>[widget.y,widget.last_y]),receiverWidgetMetrics=receiver.widgets.map(widget=>[widget.y,widget.last_y]);
  assert.equal(captureCanaryBaseline(sender,CANARY_SENDER).ok,true);assert.equal(captureCanaryBaseline(receiver,CANARY_RECEIVER).ok,true);
  for(let cycle=0;cycle<3;cycle++)for(const mode of["A - Title midline","B - Body seam","C - Top rail","Native"]){
    const sendResult=applyCanaryMode(sender,CANARY_SENDER,mode),receiveResult=applyCanaryMode(receiver,CANARY_RECEIVER,mode);
    assert.equal(sendResult.ok,true,`${cycle}/${mode}/sender`);assert.equal(receiveResult.ok,true,`${cycle}/${mode}/receiver`);
    const send=inspectCanaryNode(sender,CANARY_SENDER),receive=inspectCanaryNode(receiver,CANARY_RECEIVER);
    assert.equal(send.comparison.ok,true);assert.equal(receive.comparison.ok,true);
    assert.deepEqual(send.links,[{id:42,origin_id:101,origin_slot:2,target_id:202,target_slot:3,type:PROVIDER}]);
    assert.deepEqual(receive.links,send.links);assert.equal(send.serialization.providerHasOwnPos,false);assert.equal(receive.serialization.providerHasOwnPos,false);
    assertRefs(sender,senderRefs);assertRefs(receiver,receiverRefs);assert.equal(JSON.stringify(sender.serialize()),senderBefore);assert.equal(JSON.stringify(receiver.serialize()),receiverBefore);assert.deepEqual(sender.size,senderSize);assert.deepEqual(receiver.size,receiverSize);assert.deepEqual(sender.widgets.map(widget=>[widget.y,widget.last_y]),senderWidgetMetrics);assert.deepEqual(receiver.widgets.map(widget=>[widget.y,widget.last_y]),receiverWidgetMetrics);
    if(mode==="Native"){
      assert.equal(Object.hasOwn(sender.outputs[2],"pos"),false);assert.equal(Object.hasOwn(receiver.inputs[3],"pos"),false);
      assert.deepEqual(send.measuredSlots.map(slot=>slot.y),[214,234,254,274,294,314]);
      assert.deepEqual(receive.measuredSlots.map(slot=>slot.y),[214,234,254,274,294,314]);
    }else{
      assert.equal(Object.getOwnPropertyDescriptor(sender.outputs[2],"pos").enumerable,false);assert.equal(Object.getOwnPropertyDescriptor(receiver.inputs[3],"pos").enumerable,false);
      assert.deepEqual(send.measuredSlots.filter(slot=>slot.index!==2).map(slot=>slot.y),[214,234,254,274,294]);
      assert.deepEqual(receive.measuredSlots.filter(slot=>slot.index!==3).map(slot=>slot.y),[214,234,254,274,294]);
    }
  }
});

test("unlinked providers retain null and empty-array forms",()=>{
  const{graph}=graphFixture(),sender=senderNode(graph),receiver=receiverNode(graph);sender.outputs[2].links=[];receiver.inputs[3].link=null;graph._links.clear();
  captureCanaryBaseline(sender,CANARY_SENDER);captureCanaryBaseline(receiver,CANARY_RECEIVER);
  for(const mode of["A - Title midline","Native"]){applyCanaryMode(sender,CANARY_SENDER,mode);applyCanaryMode(receiver,CANARY_RECEIVER,mode);assert.deepEqual(inspectCanaryNode(sender,CANARY_SENDER).links,[]);assert.deepEqual(inspectCanaryNode(receiver,CANARY_RECEIVER).links,[]);assert.deepEqual(sender.outputs[2].links,[]);assert.equal(receiver.inputs[3].link,null)}
});

test("contract mismatches fail closed without touching slot positions",()=>{
  const{graph}=graphFixture(),wrongCount=senderNode(graph),wrongName=receiverNode(graph);wrongCount.outputs.pop();wrongName.inputs[3].name="wrong";
  assert.equal(applyCanaryMode(wrongCount,CANARY_SENDER,"A - Title midline").status,"BLOCKED");assert.equal(applyCanaryMode(wrongName,CANARY_RECEIVER,"A - Title midline").status,"BLOCKED");
  assert.equal(wrongCount.outputs.some(slot=>Object.hasOwn(slot,"pos")),false);assert.equal(wrongName.inputs.some(slot=>Object.hasOwn(slot,"pos")),false);
});

test("contract mismatch after projection restores the old slot and clears state",()=>{
  const{graph}=graphFixture(),node=senderNode(graph),provider=node.outputs[2];captureCanaryBaseline(node,CANARY_SENDER);assert.equal(applyCanaryMode(node,CANARY_SENDER,"A - Title midline").ok,true);assert.equal(Object.hasOwn(provider,"pos"),true);node.outputs=node.outputs.slice(0,5);const result=applyCanaryMode(node,CANARY_SENDER,"B - Body seam");assert.equal(result.status,"BLOCKED");assert.equal(Object.hasOwn(provider,"pos"),false);assert.equal(restoreCanaryNode(node),false);assert.equal(node.outputs.some(slot=>Object.hasOwn(slot,"pos")),false);
});

test("Native restores absent own and inherited pos states exactly",()=>{
  const{graph}=graphFixture();
  const ownProvider={name:"resource_provider",type:PROVIDER,links:[]};Object.defineProperty(ownProvider,"pos",{value:null,writable:false,configurable:true,enumerable:true});
  const own=senderNode(graph,{provider:ownProvider}),ownBefore=Object.getOwnPropertyDescriptor(ownProvider,"pos");captureCanaryBaseline(own,CANARY_SENDER);applyCanaryMode(own,CANARY_SENDER,"A - Title midline");applyCanaryMode(own,CANARY_SENDER,"Native");assert.deepEqual(Object.getOwnPropertyDescriptor(ownProvider,"pos"),ownBefore);
  const inheritedValue=[7,8],inheritedProvider=Object.assign(Object.create({pos:inheritedValue}),{name:"resource_provider",type:PROVIDER,link:null}),inherited=receiverNode(graph,{provider:inheritedProvider});captureCanaryBaseline(inherited,CANARY_RECEIVER);applyCanaryMode(inherited,CANARY_RECEIVER,"B - Body seam");applyCanaryMode(inherited,CANARY_RECEIVER,"Native");assert.equal(Object.hasOwn(inheritedProvider,"pos"),false);assert.equal(inheritedProvider.pos,inheritedValue);
  restoreCanaryNode(own);restoreCanaryNode(inherited);
});

test("surface that ignores slot pos fails closed and restores Native",()=>{
  const{graph}=graphFixture(),node=senderNode(graph,{unifiedIgnorePos:true,legacyIgnorePos:false});captureCanaryBaseline(node,CANARY_SENDER);const result=applyCanaryMode(node,CANARY_SENDER,"A - Title midline");assert.equal(result.ok,false);assert.equal(result.status,"UNSUPPORTED_SURFACE");assert.equal(Object.hasOwn(node.outputs[2],"pos"),false);assert.deepEqual(result.expected,[360,185]);assert.deepEqual(result.legacyActual,result.expected);assert.notDeepEqual(result.actual,result.expected);
});

test("explicit Nodes 2 mode fails before any pos mutation",()=>{
  const{graph}=graphFixture(),node=senderNode(graph);captureCanaryBaseline(node,CANARY_SENDER);const result=applyCanaryMode(node,CANARY_SENDER,"A - Title midline",{nodes2Active:true});assert.equal(result.ok,false);assert.equal(result.status,"UNSUPPORTED_SURFACE");assert.match(result.reason,/Nodes 2\.0/);assert.equal(Object.hasOwn(node.outputs[2],"pos"),false);assert.equal(inspectCanaryNode(node,CANARY_SENDER).mode,"Native");
});

test("non-configurable provider pos fails closed without replacement",()=>{
  const{graph}=graphFixture(),provider={name:"resource_provider",type:PROVIDER,links:[]};Object.defineProperty(provider,"pos",{value:[9,10],writable:false,configurable:false,enumerable:true});const node=senderNode(graph,{provider}),before=Object.getOwnPropertyDescriptor(provider,"pos");captureCanaryBaseline(node,CANARY_SENDER);const result=applyCanaryMode(node,CANARY_SENDER,"A - Title midline");assert.equal(result.status,"BLOCKED");assert.deepEqual(Object.getOwnPropertyDescriptor(provider,"pos"),before);
});

test("post-frame inspection publishes native layout metrics and drops stale revisions",()=>{
  const{graph}=graphFixture(),node=senderNode(graph),frames=[],published=[];captureCanaryBaseline(node,CANARY_SENDER);applyCanaryMode(node,CANARY_SENDER,"A - Title midline");const schedule=callback=>frames.push(callback);scheduleCanaryInspection(node,CANARY_SENDER,report=>published.push(["stale",report]),schedule);node.widgets[0].y=90;node.size[1]=170;scheduleCanaryInspection(node,CANARY_SENDER,report=>published.push(["latest",report]),schedule);while(frames.length)frames.shift()();assert.equal(published.length,1);assert.equal(published[0][0],"latest");assert.equal(published[0][1].widgetMetrics[0].y,90);assert.deepEqual(published[0][1].nodeSize,[260,170]);
});

test("adapter is exact-name only and contains no structural graph mutation",()=>{
  const source=readFileSync(new URL("../js/bv_titlebar_port_canary.js",import.meta.url),"utf8"),core=readFileSync(new URL("../js/bv_titlebar_port_canary_core.js",import.meta.url),"utf8");
  assert.match(source,/NAMES\.has\(nodeData\?\.name\)/);assert.match(source,/THROW AWAY - DO NOT MERGE OR RELEASE/);assert.match(source,/mode\.serialize = false/);assert.match(source,/if \(!node\[INSTALLED\]\)/);assert.match(source,/globalThis\.LiteGraph\?\.vueNodesMode === true/);
  for(const forbidden of["addInput(","addOutput(","removeInput(","removeOutput(","connect(","disconnectInput(","disconnectOutput(",".splice(",".sort(","onSerialize","graphToPrompt","slot.hidden","slot.label","setSize("]){assert.equal(source.includes(forbidden),false,`adapter forbidden: ${forbidden}`);assert.equal(core.includes(forbidden),false,`core forbidden: ${forbidden}`)}
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { hasNodePresentationPolicy, REGIONAL_LORA_CONSUMER_NODE_TYPES, resolveNodePresentation } from "../ui/src/regional/nodePresentation.ts";
import { applyClassicNodePresentation, applyClassicSubgraphLayout, removeNodePresentation } from "../ui/src/regional/classicNodePresentation.ts";
import { setLegacyDebugVisible } from "../ui/src/regional/legacyPorts.ts";
import { scheduleCompactLoraConsumerNode } from "../ui/src/regional/loraV3Graph.ts";
import { markProjectedProvider, setProjectedSlotLabel, scheduleProjectedPortLayout } from "../ui/src/regional/portProjection.ts";
import { configureNodes2NodePresentation, installNodes2NodePresentation, projectNodes2NodePresentation, removeNodes2NodePresentation } from "../ui/src/regional/nodes2NodePresentation.ts";
import { installLutNodePresentation } from "../ui/src/regional/lutNodePresentation.ts";
import { installNodePresentationLifecycle } from "../ui/src/regional/nodePresentationLifecycle.ts";
import { lutLibrary } from "../ui/src/regional/lutLibrary.ts";
import { installProjectedPortInteraction } from "../ui/src/regional/projectedPortInteraction.ts";
import { configurePresentationSizeLifecycle, installPresentationSizeLifecycle, isPresentationUserResizing, presentationSize, removePresentationSizeLifecycle, setAutomaticPresentationSize } from "../ui/src/regional/presentationSize.ts";

const indexSource=readFileSync(new URL("../ui/src/index.tsx",import.meta.url),"utf8");

test("explicit provider labels stay stable across Classic refresh and DG reconciliation",()=>{
  for(const direction of ['input','output'])for(const legacyDebug of [false,true]){
    const provider={name:'resource_provider',type:'BV_RUNTIME_RESOURCE_PROVIDER',link:null,links:[]};
    const normal={name:'alpha',type:'STRING',label:'Normal label',localized_name:'Normal localized',link:null,links:[]};
    const node={id:990,size:[320,120],properties:{},inputs:direction==='input'?[normal,provider]:[],outputs:direction==='output'?[normal,provider]:[],widgets:[],computeSize(){return[320,120]},setSize(size){this.size=[...size]}};
    const kind=direction==='input'?'BV Titlebar Port Canary Receiver (THROW AWAY)':'BV Titlebar Port Canary Sender (THROW AWAY)';
    try{
      markProjectedProvider(provider);setProjectedSlotLabel(provider,'DG');
      applyClassicNodePresentation(node,kind,{legacyDebug});
      const captured=JSON.stringify([node.inputs,node.outputs]);
      for(let i=0;i<4;i++){
        markProjectedProvider(provider);
        assert.equal(JSON.stringify([node.inputs,node.outputs]),captured,'mark alone must not briefly clear the label');
        setProjectedSlotLabel(provider,'DG');
        assert.equal(JSON.stringify([node.inputs,node.outputs]),captured,'poll must not create a serialized label-only history change');
        applyClassicNodePresentation(node,kind,{legacyDebug});
        assert.equal(JSON.stringify([node.inputs,node.outputs]),captured,'Classic must preserve explicit presentation label');
      }
      assert.equal(provider.name,'resource_provider');
      assert.equal(provider.label,'DG');assert.equal(provider.localized_name,'DG');
      assert.equal(normal.label,'Normal label');assert.equal(normal.localized_name,'Normal localized');
      const replacement={name:'resource_provider',type:'BV_RUNTIME_RESOURCE_PROVIDER',label:'previous native label'};
      markProjectedProvider(replacement);
      assert.equal(replacement.label,'','override belongs to the slot object, not its name or index');
      setProjectedSlotLabel(replacement,'DG');markProjectedProvider(replacement);
      assert.equal(replacement.label,'DG','marking also respects explicit labels');
      setProjectedSlotLabel(replacement,'');markProjectedProvider(replacement);
      assert.equal(replacement.label,'','explicit empty override remains supported');
    }finally{removeNodePresentation(node)}
  }
});

test("canary registration retains the shared presentation lifecycle before its early return",()=>{
  const branch=indexSource.slice(indexSource.indexOf('if(installDgCanaryPrototype(nodeType,nodeData))'),indexSource.indexOf('if(nodeData.name==="BV Inspect Any")'));
  const install=branch.indexOf('installNodePresentationLifecycle(nodeType,nodeData)');
  assert.ok(install>=0&&install<branch.indexOf('return;'));
});

test("DG subgraph hosts explicitly enroll in the shared Vue presentation lifecycle",()=>{
  const source=readFileSync(new URL('../ui/src/regional/dgRouting.ts',import.meta.url),'utf8');
  assert.match(source,/if\(node\?\.subgraph\)installNodes2NodePresentation\(node,String\(node.type/);
});

test("Nodes 2.0 captures only opted-in DG row pointer actions and releases reused rows",()=>{
  for(const direction of ['input','output'])for(const legacyDebug of [false,true]){
    const row=nodes2Row('DG'),listeners=new Map();
    row.addEventListener=(name,fn,capture)=>{assert.equal(capture,true);listeners.set(name,fn)};
    row.removeEventListener=(name,fn)=>{if(listeners.get(name)===fn)listeners.delete(name)};
    const dispatch=()=>{let blocked=false;listeners.get('pointerdown')?.({preventDefault(){blocked=true},stopImmediatePropagation(){}});return blocked};
    const provider={name:'resource_provider',type:'BV_RUNTIME_RESOURCE_PROVIDER',link:17,links:[17]};
    const node={id:440,inputs:direction==='input'?[provider]:[],outputs:direction==='output'?[provider]:[],widgets:[]};
    const element={dataset:{},querySelectorAll:s=>s===`.lg-slot--${direction}`?[row]:[]};
    const doc={querySelector:()=>element},kind='BV Titlebar Port Canary Receiver (THROW AWAY)';
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    assert.equal(dispatch(),false,'unregistered provider remains native');
    installProjectedPortInteraction(node,s=>s?.type==='BV_RUNTIME_RESOURCE_PROVIDER');
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    assert.equal(dispatch(),true,'DG cannot reach native Vue pointer handler');
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    assert.equal(listeners.size,4,'repeated presentation does not stack handlers');
    node[direction==='input'?'inputs':'outputs'][0]={name:'normal',type:'STRING'};
    assert.equal(dispatch(),false,'event resolves current slot, not stale captured provider');
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    assert.equal(listeners.size,0,'row reuse releases DG capture');
    const field=direction==='input'?'inputs':'outputs';
    node[field]=[{name:'widget',type:'STRING'},provider];
    row.querySelector=()=>({dataset:{slotKey:`440-${direction==='input'?'in':'out'}-1`}});
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    assert.equal(dispatch(),true,'filtered row uses canonical data-slot-key');
    const unguarded={...node,id:441};
    projectNodes2NodePresentation(unguarded,kind,doc,{legacyDebug});
    assert.equal(listeners.size,0,'DOM reuse for unguarded node releases capture');
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    installProjectedPortInteraction(unguarded,s=>s?.type==='BV_RUNTIME_RESOURCE_PROVIDER');
    projectNodes2NodePresentation(unguarded,kind,doc,{legacyDebug});
    removeNodes2NodePresentation(node);
    assert.equal(dispatch(),true,'old owner cleanup cannot release rebound row');
    removeNodes2NodePresentation(unguarded);
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    removeNodes2NodePresentation(node);
    assert.equal(listeners.size,0,'explicit removal releases handlers');
    projectNodes2NodePresentation(node,kind,doc,{legacyDebug});
    projectNodes2NodePresentation(node,kind,{querySelector:()=>null},{legacyDebug});
    assert.equal(listeners.size,0,'unmounted renderer releases handlers');
  }
});
const lutV3CatalogSource=readFileSync(new URL("../ui/src/regional/lutV3Catalog.ts",import.meta.url),"utf8");

const regionalPromptInventory = {
  ports: [
    { direction: "output", name: "regional", connected: false },
    { direction: "output", name: "lora_bindings", connected: false },
    { direction: "input", name: "resource_provider_1", connected: false },
    { direction: "input", name: "canvas_image", type: "IMAGE", connected: true },
  ],
  widgets: [
    { name: "regional_json" },
    { name: "lora_bindings_json" },
    { name: "lora_v3_config_json" },
    { name: "detailer_v3_config_json" },
    { name: "lut_v3_config_json" },
  ],
};

const regionalLoraInventory = {
  ports: [
    { direction: "input", name: "regional", connected: false },
    { direction: "output", name: "regional", connected: false },
    { direction: "input", name: "resource_provider_1", connected: false },
  ],
  widgets: [{ name: "operation" }, { name: "config_json" }],
};

const smartPipeMergeInventory = {
  ports: [
    { direction: "input", name: "pipe_001", connected: false },
    { direction: "input", name: "pipe_002", connected: false },
    { direction: "input", name: "bv_add_pipe_source", connected: false },
    { direction: "output", name: "pipe", connected: false },
  ],
  widgets: [{ name: "bv_smart_pipe_merge_json" }, { name: "Configure Merge" }],
};

const controlCenterInventory={
  ports:[],
  widgets:[{name:"bv_control_config_json"},{name:"configure_control_center"},{name:"bv_control_conflict_status"}],
};

test("throw-away titlebar canaries use the central provider presentation contract",()=>{
  const inventory={
    ports:[
      {direction:"input",name:"alpha",type:"BV_RUNTIME_RESOURCE_PROVIDER",connected:true},
      {direction:"output",name:"beta",type:"BV_RUNTIME_RESOURCE_PROVIDER",connected:true},
    ],
    widgets:[],
  };
  for(const nodeType of["BV Titlebar Port Canary Sender (THROW AWAY)","BV Titlebar Port Canary Receiver (THROW AWAY)"]){
    assert.equal(hasNodePresentationPolicy(nodeType),true);
    for(const surface of["classic","ghost","nodes2"]){
      for(const legacyDebug of[false,true]){
        const plan=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug});
        assert.ok(plan.ports.every(({role,visible})=>role==="provider"&&!visible));
      }
    }
  }
});

test("Control Center shares one technical-state and action contract on every surface",()=>{
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Control Center",controlCenterInventory,{surface,legacyDebug:false});
    assert.deepEqual(plan.widgets.map(({name,role,visible})=>[name,role,visible]),[
      ["bv_control_config_json","internalState",false],
      ["configure_control_center","nativeAction",surface!=="ghost"],
      ["bv_control_conflict_status","public",true],
    ]);
    assert.deepEqual(plan.actions,["Configure Control Center"]);
  }
});

test("Classic measurement excludes hidden technical widgets instead of retaining their layout history",()=>{
  const sizes=[];
  const node={size:[320,220],properties:{},inputs:[],outputs:[],widgets:[
    {name:"bv_control_config_json",hidden:false,computeSize:()=>[0,80],y:70},
    {name:"configure_control_center",type:"button",computeSize:()=>[0,20]},
    {name:"bv_control_conflict_status",type:"custom",computeSize:()=>[0,24]},
  ],computeSize(){return[280,40+this.widgets.reduce((height,widget)=>height+Number(widget.computeSize?.()[1]??20),0)]},setSize(size){sizes.push([...size]);this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV Control Center",{minWidth:320,compactWidgetOnly:true});
  assert.deepEqual(node.size,[320,104]);
  assert.equal(sizes.length,1);
  assert.equal(node.widgets[0].hidden,true);
  assert.equal(node.widgets[0].y,0);
  assert.equal(node.widgets[0].last_y,0);
  assert.equal(node.widgets_start_y,20);
});

test("Classic subgraph layout excludes promoted widget inputs and preserves manual width",()=>{
  const widgetInput={name:"Header"},realInput={name:"image"},proxy={name:"Header",computeSize:()=>[0,34]};
  const node={size:[420,300],inputs:[widgetInput,realInput],outputs:[],widgets:[proxy],getWidgetFromSlot(input){return input===widgetInput?proxy:null},computeSize(){return[240,10+this.inputs.length*20+this.widgets.reduce((sum,widget)=>sum+widget.computeSize()[1],0)]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  assert.deepEqual(applyClassicSubgraphLayout(node),[420,64]);
  assert.equal(node.widgets_start_y,8);
});

const nativeConditioningInventory={
  ports:[
    {direction:"input",name:"regional",connected:false},
    {direction:"input",name:"clip",connected:false},
    {direction:"input",name:"lora_registry",connected:false},
    {direction:"input",name:"lora_bindings",connected:false},
    {direction:"output",name:"positive",connected:false},
    {direction:"output",name:"negative",connected:false},
  ],
  widgets:[
    {name:"region_strength_multiplier"},
    {name:"native_composition"},
    {name:"hybrid_blend_ratio"},
  ],
};

const detailerPlanInventory={
  ports:[
    {direction:"input",name:"regional_prompt",connected:false},
    {direction:"input",name:"detector_registry",connected:false},
    {direction:"input",name:"resource_provider",connected:false},
    {direction:"input",name:"resource_provider_1",connected:true},
    {direction:"output",name:"detailer_plan",connected:false},
    {direction:"output",name:"job_count",connected:false},
    {direction:"output",name:"plan_summary",connected:false},
  ],
  widgets:[{name:"config_json"},{name:"configure_detailer_plan"}],
};

const hundredPipeInventory=(internal=false)=>({
  ports:[
    {direction:"input",name:"pipe",connected:false},
    ...Array.from({length:100},(_,index)=>({direction:"input",name:`v_${String(index+1).padStart(3,"0")}`,connected:false})),
    {direction:"output",name:"pipe",connected:false},
    ...Array.from({length:100},(_,index)=>({direction:"output",name:`out_${String(index+1).padStart(3,"0")}`,connected:false})),
  ],
  widgets:internal?[{name:"bv_smart_pipe_schema_json"},{name:"bv_smart_pipe_route_json"},{name:"Pipe predecessor"},{name:"Configure Smart Pipe"}]:[],
});

test("Smart Pipe and deprecated Pipe share one hundred-slot Ghost reserve contract",()=>{
  for(const[nodeType,internal]of[["BV Smart Pipe",true],["BV Pipe",false]]){
    const inventory=hundredPipeInventory(internal);
    const ghost=resolveNodePresentation(nodeType,inventory,{surface:"ghost",legacyDebug:false});
    assert.equal(ghost.ports.filter(({role})=>role==="dynamicReserve").length,200);
    assert.ok(ghost.ports.filter(({role})=>role==="dynamicReserve").every(({visible})=>!visible));
    assert.deepEqual(ghost.ports.filter(({role})=>role==="public").map(({name,visible})=>[name,visible]),[["pipe",true],["pipe",true]]);
    for(const surface of["classic","nodes2"]){
      const placed=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug:false});
      assert.ok(placed.ports.every(({visible})=>visible));
    }
  }
  const smartGhost=resolveNodePresentation("BV Smart Pipe",hundredPipeInventory(true),{surface:"ghost",legacyDebug:false});
  assert.deepEqual(smartGhost.widgets.map(({name,role,visible})=>[name,role,visible]),[
    ["bv_smart_pipe_schema_json","internalState",false],["bv_smart_pipe_route_json","internalState",false],
    ["Pipe predecessor","public",true],["Configure Smart Pipe","public",true],
  ]);
  assert.deepEqual(smartGhost.actions,["Configure Smart Pipe"]);
});

test("all Regional LoRA consumers share one legacy-input contract on every surface",()=>{
  assert.equal(REGIONAL_LORA_CONSUMER_NODE_TYPES.length,6);
  for(const nodeType of REGIONAL_LORA_CONSUMER_NODE_TYPES){
   assert.equal(hasNodePresentationPolicy(nodeType),true,nodeType);
   for(const surface of["classic","ghost","nodes2"]){
    const normal=resolveNodePresentation(nodeType,nativeConditioningInventory,{surface,legacyDebug:false});
    const debug=resolveNodePresentation(nodeType,nativeConditioningInventory,{surface,legacyDebug:true});
    assert.deepEqual(normal.ports.map(({name,role,visible})=>[name,role,visible]),[
      ["regional","public",true],["clip","public",true],
      ["lora_registry","legacy",false],["lora_bindings","legacy",false],
      ["positive","public",true],["negative","public",true],
    ]);
    assert.equal(debug.ports.find(({name})=>name==="lora_registry")?.visible,true);
    assert.equal(debug.ports.find(({name})=>name==="lora_bindings")?.visible,true);
    assert.ok(normal.widgets.every(({role,visible})=>role==="public"&&visible));
    assert.ok(debug.widgets.every(({role,visible})=>role==="public"&&visible));
   }
  }
});

test("Regional Detailer Plan separates legacy, provider, internal state and public UI on every surface",()=>{
  for(const surface of["classic","ghost","nodes2"]){
    const normal=resolveNodePresentation("BV Regional Detailer Plan",detailerPlanInventory,{surface,legacyDebug:false});
    const debug=resolveNodePresentation("BV Regional Detailer Plan",detailerPlanInventory,{surface,legacyDebug:true});
    assert.deepEqual(normal.ports.map(({name,role,visible})=>[name,role,visible]),[
      ["regional_prompt","public",true],["detector_registry","legacy",false],
      ["resource_provider","provider",false],["resource_provider_1","provider",false],
      ["detailer_plan","public",true],["job_count","public",true],["plan_summary","public",true],
    ]);
    assert.equal(debug.ports.find(({name})=>name==="detector_registry")?.visible,true);
    assert.ok(debug.ports.filter(({role})=>role==="provider").every(({visible})=>!visible));
    assert.deepEqual(normal.widgets.map(({name,role,visible})=>[name,role,visible]),[
      ["config_json","internalState",false],["configure_detailer_plan","public",true],
    ]);
    assert.deepEqual(debug.widgets,normal.widgets);
  }
});

test("LUT Plan and Loop Start hide all forty provider ports independently of debug mode",()=>{
  const providers=Array.from({length:40},(_,index)=>({direction:"input",name:`resource_provider_${index+1}`,connected:index===0}));
  const fixtures=[
    ["BV Regional LUT Plan",{ports:[{direction:"input",name:"regional_prompt",connected:false},...providers,{direction:"output",name:"lut_plan",connected:false},{direction:"output",name:"job_count",connected:false},{direction:"output",name:"plan_summary",connected:false}],widgets:[{name:"config_json"},{name:"configure_lut_plan"}]}],
    ["BV LUT Loop Start",{ports:[{direction:"input",name:"plan",connected:false},{direction:"input",name:"initial_image",connected:false},...providers,{direction:"output",name:"flow",connected:false},{direction:"output",name:"loop_state",connected:false}],widgets:[]}],
  ];
  for(const[nodeType,inventory]of fixtures)for(const surface of["classic","ghost","nodes2"]){
    const normal=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug:false});
    const debug=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug:true});
    assert.equal(normal.ports.filter(({role})=>role==="provider").length,40);
    assert.ok(normal.ports.filter(({role})=>role==="provider").every(({visible})=>!visible));
    assert.deepEqual(debug,normal);
    assert.ok(normal.ports.filter(({role})=>role==="public").every(({visible})=>visible));
  }
});

test("LUT Registry and manual LoRA chain apply direction-aware provider presentation on every surface",()=>{
  const fixtures=[
    ["BV LUT Registry",{ports:[{direction:"output",name:"lut_count",connected:false},{direction:"output",name:"registry_summary",connected:false},{direction:"output",name:"resource_provider",connected:true}],widgets:[{name:"config_json"},{name:"configure_lut_registry"}]}],
    ["BV LoRA Stack Collector",{ports:[{direction:"input",name:"resource_provider",connected:false},{direction:"output",name:"resource_provider",connected:true}],widgets:[{name:"collector_id"}]}],
  ];
  for(const[nodeType,inventory]of fixtures)for(const surface of["classic","ghost","nodes2"]){
    const normal=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug:false});
    const debug=resolveNodePresentation(nodeType,inventory,{surface,legacyDebug:true});
    assert.deepEqual(debug,normal);
    assert.ok(normal.ports.filter(({role})=>role==="provider").every(({visible})=>!visible));
    assert.ok(normal.ports.filter(({role})=>role==="public").every(({visible})=>visible));
    assert.ok(normal.widgets.filter(({role})=>role==="internalState").every(({visible})=>!visible));
  }
});

test("Classic first native action reserves exactly one host slot row",()=>{
  const previousLiteGraph=globalThis.LiteGraph;
  globalThis.LiteGraph={NODE_SLOT_HEIGHT:24};
  const action={name:"configure_control_center",type:"button",computeSize:()=>[0,20]};
  const node={size:[320,120],properties:{},inputs:[],outputs:[],widgets:[
    {name:"bv_control_config_json",computeSize:()=>[0,80]},action,
    {name:"bv_control_conflict_status",computeSize:()=>[0,24]},
  ],computeSize(){return[320,80]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  try{
    applyClassicNodePresentation(node,"BV Control Center",{minWidth:320,compactWidgetOnly:true});
    assert.equal(node.widgets_start_y,24);
  }finally{removeNodePresentation(node);globalThis.LiteGraph=previousLiteGraph}
});

test("Classic first native action replaces a host-generated widget start and restores it on removal",()=>{
  const action={name:"configure_control_center",type:"button",computeSize:()=>[0,20]};
  const node={size:[320,260],widgets_start_y:240,properties:{},inputs:[],outputs:[],widgets:[
    {name:"bv_control_config_json",computeSize:()=>[0,80]},action,
    {name:"bv_control_conflict_status",computeSize:()=>[0,24]},
  ],computeSize(){return[320,260]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV Control Center",{minWidth:320,compactWidgetOnly:true});
  assert.equal(node.widgets_start_y,20);
  removeNodePresentation(node);
  assert.equal(node.widgets_start_y,240);
});

test("port-only nodes do not retain a widget start after technical providers are projected",()=>{
  const providers=Array.from({length:40},(_,index)=>({name:`resource_provider_${index+1}`,type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null}));
  const inputs=[{name:"plan",type:"*",link:null},{name:"initial_image",type:"IMAGE",link:null},...providers];
  const outputs=[{name:"flow",type:"FLOW_CONTROL",links:null},{name:"loop_state",type:"BV_LUT_LOOP_STATE",links:null}];
  const beforeInputs=[...inputs],beforeOutputs=[...outputs];
  const node={size:[260,80],properties:{},inputs,outputs,widgets:[],computeSize(){return[260,80]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  try{
    applyClassicNodePresentation(node,"BV LUT Loop Start",{legacyDebug:false});
    assert.equal(node.widgets_start_y,undefined);
    assert.deepEqual(node.inputs,beforeInputs);
    assert.deepEqual(node.outputs,beforeOutputs);
  }finally{removeNodePresentation(node)}
});

test("Classic provider policy binds reusable titlebar anchors without serializing geometry",()=>{
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[17]},outputs=[{name:"lut_count",type:"INT",links:null},{name:"registry_summary",type:"STRING",links:null},provider],widgets=[{name:"config_json",computeSize:()=>[0,20]},{name:"configure_lut_registry",computeSize:()=>[0,20]}];
  const node={size:[320,180],properties:{},inputs:[],outputs,widgets,computeSize(){return[280,40+Math.max(this.inputs.filter(slot=>!slot.hidden).length,this.outputs.filter(slot=>!slot.hidden).length)*20+this.widgets.filter(widget=>!widget.hidden).length*20]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:true});
  assert.deepEqual(provider.pos,[node.size[0],-15]);assert.equal(Object.getOwnPropertyDescriptor(provider,"pos")?.enumerable,false);assert.equal(JSON.stringify(provider).includes('"pos"'),false);assert.equal(outputs[2],provider);assert.equal(node.widgets_start_y,46);
  applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:false});assert.equal(Object.hasOwn(provider,"pos"),false);assert.equal(node.widgets_start_y,46);
});

test("Classic sender layout excludes hidden provider outputs without changing canonical slots",()=>{
  const fixtures=[
    {type:"BV LUT Registry",inputs:[],outputs:["lut_count","registry_summary","resource_provider"],provider:2,widgets:["config_json","configure_lut_registry"],start:46},
    {type:"BV LUT Registry",inputs:[],outputs:["lut_count","resource_provider","registry_summary"],provider:1,widgets:["config_json","configure_lut_registry"],start:46},
    {type:"BV Detector Registry",inputs:[],outputs:["detector_count","registry_summary","resource_provider"],provider:2,widgets:["config_json","configure_detector_registry"],start:46},
    {type:"BV LoRA Registry",inputs:[],outputs:["resource_provider","lora_count","registry_summary"],provider:0,widgets:["config_json","open_lora_registry"],start:46},
    {type:"BV LoRA Stack Collector",inputs:["resource_provider"],outputs:["resource_provider"],provider:0,widgets:["collector_id"],start:undefined},
  ];
  for(const fixture of fixtures){
    const inputs=fixture.inputs.map(name=>({name,type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null}));
    const outputs=fixture.outputs.map((name,index)=>({name,type:index===fixture.provider?"BV_RUNTIME_RESOURCE_PROVIDER":"STRING",links:index===fixture.provider?[17]:null}));
    const widgets=fixture.widgets.map(name=>({name,computeSize:()=>[0,20]}));
    const beforeInputs=[...inputs],beforeOutputs=[...outputs],beforeInputLinks=inputs.map(slot=>slot.link),beforeOutputLinks=outputs.map(slot=>slot.links?[...slot.links]:slot.links),provider=outputs[fixture.provider];
    const node={size:[320,180],properties:{},inputs,outputs,widgets,computeSize(){return[280,120]},serialize(){return{inputs:this.inputs.map(({name,type,link})=>({name,type,link})),outputs:this.outputs.map(({name,type,links})=>({name,type,links:links?[...links]:links}))}},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
    const serialized=JSON.stringify(node.serialize());
    try{
      applyClassicNodePresentation(node,fixture.type,{legacyDebug:false});
      assert.equal(node.widgets_start_y,fixture.start,fixture.type);
      assert.ok(inputs.every((slot,index)=>slot===beforeInputs[index]),fixture.type);assert.ok(outputs.every((slot,index)=>slot===beforeOutputs[index]),fixture.type);assert.equal(outputs[fixture.provider],provider,fixture.type);
      assert.equal(Object.hasOwn(provider,"pos"),false,fixture.type);assert.equal(JSON.stringify(provider).includes('"pos"'),false,fixture.type);
      assert.equal(JSON.stringify(node.serialize()),serialized,`${fixture.type} normal serialization`);
      applyClassicNodePresentation(node,fixture.type,{legacyDebug:true});
      assert.equal(node.widgets_start_y,fixture.start,`${fixture.type} debug widget start`);assert.deepEqual(provider.pos,[node.size[0],-15],`${fixture.type} debug provider anchor`);
      assert.equal(Object.hasOwn(inputs[0]??{},"pos"),false,`${fixture.type} public input remains in body`);
      assert.deepEqual(inputs.map(slot=>slot.link),beforeInputLinks,`${fixture.type} debug input links`);assert.deepEqual(outputs.map(slot=>slot.links?[...slot.links]:slot.links),beforeOutputLinks,`${fixture.type} debug output links`);
      assert.equal(JSON.stringify(node.serialize()),serialized,`${fixture.type} debug serialization`);
      applyClassicNodePresentation(node,fixture.type,{legacyDebug:false});
      assert.equal(node.widgets_start_y,fixture.start,`${fixture.type} restored widget start`);assert.equal(Object.hasOwn(provider,"pos"),false,`${fixture.type} restored provider anchor`);
      assert.equal(JSON.stringify(node.serialize()),serialized,`${fixture.type} restored serialization`);
    }finally{removeNodePresentation(node)}
    assert.equal(Object.hasOwn(node,"widgets_start_y"),false,`${fixture.type} cleanup`);
  }
});

test("Classic sender layout preserves an existing special widget start",()=>{
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[17]},node={size:[320,180],properties:{},widgets_start_y:77,inputs:[],outputs:[{name:"registry_summary",type:"STRING",links:null},provider],widgets:[{name:"config_json",computeSize:()=>[0,20]},{name:"configure_lut_registry",computeSize:()=>[0,20]}],computeSize(){return[280,120]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  try{applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:false});assert.equal(node.widgets_start_y,77)}finally{removeNodePresentation(node)}
  assert.equal(node.widgets_start_y,77);
});

test("Classic fresh sender owns LiteGraph's undefined widget start across a debug roundtrip",()=>{
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[17]};
  const node={size:[320,180],properties:{},widgets_start_y:undefined,inputs:[],outputs:[{name:"lut_count",type:"INT",links:null},{name:"registry_summary",type:"STRING",links:null},provider],widgets:[{name:"config_json",computeSize:()=>[0,20]},{name:"configure_lut_registry",computeSize:()=>[0,20]}],computeSize(){return[280,120]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:null};
  const graph={_nodes:[node],setDirtyCanvas(){}};node.graph=graph;
  const hostWidgetStart=()=>node.widgets_start_y??((node.outputs.filter(slot=>!slot.pos).length+.2)*20+2);
  setLegacyDebugVisible(true);
  try{
    applyClassicNodePresentation(node,"BV LUT Registry");
    assert.equal(hostWidgetStart(),46,"debug titlebar projection masks the native undefined field");
    setLegacyDebugVisible(false,graph);
    assert.equal(hostWidgetStart(),46,"normal mode must not restore the hidden provider row");
  }finally{setLegacyDebugVisible(false);removeNodePresentation(node)}
  assert.equal(Object.hasOwn(node,"widgets_start_y"),true);assert.equal(node.widgets_start_y,undefined);
});

test("Nodes 2 transition suspends Classic anchors and central removal prevents re-entry",()=>{
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[17]},node={id:44,size:[320,180],properties:{},inputs:[],outputs:[{name:"lut_count",type:"INT",links:null},{name:"registry_summary",type:"STRING",links:null},provider],widgets:[{name:"config_json",computeSize:()=>[0,20]},{name:"configure_lut_registry",computeSize:()=>[0,20]}],computeSize(){return[280,120]},setSize(size){this.size=[...size];this.onResize?.(size)},setDirtyCanvas(){},graph:{setDirtyCanvas(){}},onRemoved(){this.nativeRemoved=(this.nativeRemoved??0)+1}};
  applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:true});assert.deepEqual(provider.pos,[node.size[0],-15]);
  const element={dataset:{},querySelectorAll(){return[]}};assert.equal(projectNodes2NodePresentation(node,"BV LUT Registry",{querySelector:()=>element},{legacyDebug:true}),true);assert.equal(node.__bvNodes2PresentationActive,true);assert.equal(Object.hasOwn(provider,"pos"),false);
  node.size=[360,180];node.onResize?.();assert.equal(Object.hasOwn(provider,"pos"),false);
  node.__bvNodes2PresentationActive=false;applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:true});assert.deepEqual(provider.pos,[node.size[0],-15]);node.onRemoved();assert.equal(node.nativeRemoved,1);assert.equal(Object.hasOwn(provider,"pos"),false);node.onResize?.();assert.equal(Object.hasOwn(provider,"pos"),false);
});

test("Named LoRA Stack keeps both V2 and manually wired V3 chain ports public",()=>{
  const inventory={ports:[{direction:"input",name:"lora_stack",connected:false},{direction:"input",name:"registry",connected:false},{direction:"output",name:"registry",connected:false},{direction:"input",name:"resource_provider",connected:false},{direction:"output",name:"resource_provider",connected:false}],widgets:[{name:"name"},{name:"stack_id"}]};
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Named LoRA Stack",inventory,{surface,legacyDebug:false});
    assert.ok(plan.ports.every(({role,visible})=>role==="public"&&visible));
    assert.deepEqual(plan.widgets.map(({name,role,visible})=>[name,role,visible]),[["name","public",true],["stack_id","internalState",false]]);
  }
});

test("LoRA Registry exposes active-count diagnostics, one semantic action and internal config state",()=>{
  const inventory={ports:[{direction:"output",name:"resource_provider",connected:false},{direction:"output",name:"lora_count",connected:false},{direction:"output",name:"registry_summary",connected:false}],widgets:[{name:"config_json"},{name:"open_lora_registry"},{name:"lora_registry_widget"}]};
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV LoRA Registry",inventory,{surface,legacyDebug:false});
    assert.deepEqual(plan.actions,["Open LoRA Registry"]);
    assert.deepEqual(plan.ports.map(port=>[port.name,port.visible]),[["resource_provider",false],["lora_count",true],["registry_summary",true]]);
    assert.deepEqual(plan.widgets.map(widget=>[widget.name,widget.visible]),[["config_json",false],["open_lora_registry",surface!=="ghost"],["lora_registry_widget",true]]);
  }
});

test("the manual Collector keeps its provider input connectable and hides only its final output",()=>{
  const inventory={ports:[{direction:"input",name:"resource_provider",connected:false},{direction:"output",name:"resource_provider",connected:false}],widgets:[{name:"collector_id"}]};
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV LoRA Stack Collector",inventory,{surface,legacyDebug:false});
    assert.deepEqual(plan.ports.map(port=>[port.direction,port.role,port.visible]),[["input","public",true],["output","provider",false]]);
  }
});

test("provider types are centrally projected unless a manual-chain policy keeps them public",()=>{
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",connected:true};
  for(const nodeType of["BV Regional Prompt","BV Regional LoRA","BV Regional LUT Plan"]){
    for(const surface of["classic","nodes2"]){
      const plan=resolveNodePresentation(nodeType,{ports:[{direction:"input",...provider}],widgets:[]},{surface,legacyDebug:true});
      assert.deepEqual(plan.ports.map(port=>[port.role,port.visible]),[["provider",false]],`${nodeType} ${surface}`);
    }
  }
  for(const nodeType of["BV Named LoRA Stack","BV LoRA Stack Collector"]){
    const plan=resolveNodePresentation(nodeType,{ports:[{direction:"input",...provider}],widgets:[]},{surface:"nodes2",legacyDebug:true});
    assert.deepEqual(plan.ports.map(port=>[port.role,port.visible]),[["public",true]],`${nodeType} manual input`);
  }
});

test("Detector Registry hides external reserves only in Ghost and always hides provider state",()=>{
  const inventory={
    ports:[
      ...Array.from({length:10},(_,index)=>({direction:"input",name:`external_detector_${index+1}`,connected:index===0})),
      {direction:"output",name:"detector_count",connected:false},{direction:"output",name:"registry_summary",connected:false},{direction:"output",name:"resource_provider",connected:true},
    ],
    widgets:[{name:"config_json"},{name:"configure_detector_registry"}],
  };
  for(const legacyDebug of[false,true]){
    const ghost=resolveNodePresentation("BV Detector Registry",inventory,{surface:"ghost",legacyDebug});
    assert.ok(ghost.ports.filter(({role})=>role==="dynamicReserve").every(({visible})=>!visible));
    assert.equal(ghost.ports.find(({role})=>role==="provider")?.visible,false);
    assert.equal(ghost.widgets.find(({role})=>role==="internalState")?.visible,false);
    for(const surface of["classic","nodes2"]){
      const placed=resolveNodePresentation("BV Detector Registry",inventory,{surface,legacyDebug});
      assert.ok(placed.ports.filter(({role})=>role==="dynamicReserve").every(({visible})=>visible));
      assert.equal(placed.ports.find(({role})=>role==="provider")?.visible,false);
    }
  }
});

test("Regional Native Conditioning Classic reserves both legacy rows without resizing",()=>{
  const sizes=[];
  const node={size:[300,260],properties:{},inputs:nativeConditioningInventory.ports.filter(port=>port.direction==="input").map(port=>({name:port.name,link:null})),outputs:nativeConditioningInventory.ports.filter(port=>port.direction==="output").map(port=>({name:port.name,links:null})),widgets:nativeConditioningInventory.widgets.map(({name})=>({name,computeSize:()=>[0,20]})),computeSize(){return[280,180]},setSize(size){sizes.push([...size]);this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV Regional Native Conditioning",{legacyDebug:false});
  assert.deepEqual(node.size,[300,180]);
  assert.equal(sizes.length,1);
  for(const name of["lora_registry","lora_bindings"]){const port=node.inputs.find(item=>item.name===name);assert.equal(port.hidden,false);assert.equal(port.__bvM0VisualHidden,true)}
  applyClassicNodePresentation(node,"BV Regional Native Conditioning",{legacyDebug:true});
  for(const name of["lora_registry","lora_bindings"])assert.equal(node.inputs.find(item=>item.name===name).__bvM0VisualHidden,false);
  applyClassicNodePresentation(node,"BV Regional Native Conditioning",{legacyDebug:false});
  assert.deepEqual(node.size,[300,180]);
  assert.equal(sizes.length,1);
});

test("Smart Pipe Merge presentation separates Ghost reserves from placed wiring",()=>{
  for(const legacyDebug of[false,true]){
    const ghost=resolveNodePresentation("BV Smart Pipe Merge",smartPipeMergeInventory,{surface:"ghost",legacyDebug});
    assert.deepEqual(ghost.ports.map(({name,role,visible})=>[name,role,visible]),[
      ["pipe_001","dynamicReserve",false],
      ["pipe_002","dynamicReserve",false],
      ["bv_add_pipe_source","public",true],
      ["pipe","public",true],
    ]);
    assert.deepEqual(ghost.widgets.map(({name,role,visible})=>[name,role,visible]),[
      ["bv_smart_pipe_merge_json","internalState",false],
      ["Configure Merge","public",true],
    ]);
    assert.deepEqual(ghost.actions,["Configure Pipe Merge"]);

    for(const surface of["classic","nodes2"]){
      const placed=resolveNodePresentation("BV Smart Pipe Merge",smartPipeMergeInventory,{surface,legacyDebug});
      assert.ok(placed.ports.every(({visible})=>visible));
      assert.equal(placed.widgets[0].visible,false);
      assert.equal(placed.widgets[1].visible,true);
    }
  }
});

test("Regional LoRA presentation keeps only public wiring visible on every Classic debug state", () => {
  for (const legacyDebug of [false, true]) {
    const plan = resolveNodePresentation("BV Regional LoRA", regionalLoraInventory, {
      surface: "classic",
      legacyDebug,
    });
    assert.deepEqual(plan.ports.map(({ name, role, visible }) => [name, role, visible]), [
      ["regional", "public", true],
      ["regional", "public", true],
      ["resource_provider_1", "provider", false],
    ]);
    assert.deepEqual(plan.widgets.map(({ name, role, visible }) => [name, role, visible]), [
      ["operation", "internalState", false],
      ["config_json", "internalState", false],
    ]);
    assert.deepEqual(plan.actions, ["Open LoRA Editor"]);
  }
});

test("Regional Prompt presentation distinguishes legacy ports from internal and provider state", () => {
  const normal = resolveNodePresentation("BV Regional Prompt", regionalPromptInventory, {
    surface: "classic",
    legacyDebug: false,
  });
  assert.deepEqual(normal.ports.map(({ name, role, visible }) => [name, role, visible]), [
    ["regional", "public", true],
    ["lora_bindings", "legacy", false],
    ["resource_provider_1", "provider", false],
    ["canvas_image", "public", true],
  ]);
  assert.deepEqual(normal.widgets.map(({ name, role, visible }) => [name, role, visible]), [
    ["regional_json", "internalState", false],
    ["lora_bindings_json", "internalState", false],
    ["lora_v3_config_json", "internalState", false],
    ["detailer_v3_config_json", "internalState", false],
    ["lut_v3_config_json", "internalState", false],
  ]);
  assert.deepEqual(normal.actions, ["Open Regional Editor", "Quick Edit Prompts"]);

  const debug = resolveNodePresentation("BV Regional Prompt", regionalPromptInventory, {
    surface: "classic",
    legacyDebug: true,
  });
  assert.equal(debug.ports.find(({ name }) => name === "lora_bindings")?.visible, true);
  assert.equal(debug.ports.find(({ name }) => name === "resource_provider_1")?.visible, false);
  assert.equal(debug.ports.find(({ name }) => name === "canvas_image")?.visible, true);
  assert.ok(debug.widgets.every(({ visible }) => !visible));

  const connectedLegacy = resolveNodePresentation("BV Regional Prompt", {
    ...regionalPromptInventory,
    ports: [{ direction: "output", name: "lora_bindings", connected: true }],
  }, { surface: "classic", legacyDebug: false });
  assert.equal(connectedLegacy.ports[0].visible, true);
});

test("connected legacy ports remain visible without enabling global debug",()=>{
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Regional Native Conditioning",{
      ...nativeConditioningInventory,
      ports:nativeConditioningInventory.ports.map(port=>port.name==="lora_bindings"?{...port,connected:true}:port),
    },{surface,legacyDebug:false});
    assert.equal(plan.ports.find(({name})=>name==="lora_registry")?.visible,false);
    assert.equal(plan.ports.find(({name})=>name==="lora_bindings")?.visible,true);
  }
});

test("Regional Prompt Ghost uses the same role matrix without exposing technical state",()=>{
  const ghost=resolveNodePresentation("BV Regional Prompt",{
    ...regionalPromptInventory,
    ports:[...regionalPromptInventory.ports,{direction:"input",name:"regional_json",connected:false}],
  },{surface:"ghost",legacyDebug:true});
  assert.equal(ghost.ports.find(({name})=>name==="lora_bindings")?.visible,true);
  assert.equal(ghost.ports.find(({name})=>name==="resource_provider_1")?.visible,false);
  assert.equal(ghost.ports.find(({name})=>name==="canvas_image")?.visible,true);
  assert.deepEqual(ghost.ports.find(({name})=>name==="regional_json"),{
    direction:"input",name:"regional_json",connected:false,role:"internalState",visible:false,
  });
  assert.ok(ghost.widgets.every(({visible})=>!visible));
});

test("Regional Prompt canvas image stays public across Classic Ghost and Nodes 2",()=>{
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Regional Prompt",regionalPromptInventory,{surface,legacyDebug:false});
    assert.deepEqual(plan.ports.find(({name})=>name==="canvas_image"),{
      direction:"input",name:"canvas_image",type:"IMAGE",connected:true,role:"public",visible:true,
    });
  }
});

function regionalPromptNode(){
  const sizes=[];
  const node={
    size:[300,260],
    properties:{},
    inputs:[
      {name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null},
      {name:"canvas_image",type:"IMAGE",link:81},
    ],
    outputs:[{name:"regional",type:"BV_REGIONAL",links:null},{name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",links:null}],
    widgets:[
      ...["regional_json","lora_bindings_json","lora_v3_config_json","detailer_v3_config_json","lut_v3_config_json"].map(name=>({name,computeSize:()=>[0,20]})),
      {name:"open_regional_editor",type:"button",computeSize:()=>[0,20]},
      {name:"quick_edit_regional_prompts",type:"button",computeSize:()=>[0,20]},
    ],
    computeSize(){
      const ports=Math.max(this.inputs.filter(port=>!port.hidden).length,this.outputs.filter(port=>!port.hidden).length);
      const widgets=this.widgets.reduce((height,widget)=>height+Math.max(0,Number(widget.computeSize?.()[1]??20)),0);
      return[280,40+ports*20+widgets];
    },
    setSize(size){sizes.push([...size]);this.size=[...size]},
    setDirtyCanvas(){},
    graph:{setDirtyCanvas(){}},
  };
  return{node,sizes};
}

test("Regional Prompt Classic reconciliation is reversible and publishes one final height",()=>{
  const{node,sizes}=regionalPromptNode();
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  assert.equal(node.outputs.find(port=>port.name==="lora_bindings").hidden,false);
  assert.equal(node.outputs.find(port=>port.name==="lora_bindings").__bvM0VisualHidden,true);
  assert.equal(node.inputs[0].hidden,true);
  assert.equal(node.inputs[1].hidden,false);
  assert.equal(node.inputs[1].link,81);
  assert.ok(node.widgets.slice(0,5).every(widget=>widget.hidden));

  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:true});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  assert.equal(node.outputs.find(port=>port.name==="lora_bindings").hidden,false);
  assert.equal(node.inputs[0].hidden,true);
  assert.equal(node.inputs[1].hidden,false);
  assert.equal(node.inputs[1].link,81);

  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.equal(sizes.length,1);
  assert.equal(node.properties.bvPresentationUserHeight,undefined);
});

test("Regional Prompt publishes a semantic Nodes 2 height even when host computeSize is stale",()=>{
  const node={size:[420,330],inputs:[],outputs:[{name:"regional",links:null},{name:"lora_bindings",links:null}],widgets:[
    ...["regional_json","lora_bindings_json","lora_v3_config_json","detailer_v3_config_json","lut_v3_config_json"].map(name=>({name,computeSize:()=>[0,80]})),
    {name:"open_regional_editor",computeSize:()=>[0,20]},{name:"quick_edit_regional_prompts",computeSize:()=>[0,20]},
  ],computeSize(){return[420,330]},setSize(size){this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.equal(node.__bvPresentationAutoHeight,120);
  assert.ok(node.widgets.slice(0,5).every(widget=>widget.options.hidden===true));
});

test("Regional LoRA Classic reconciliation keeps one stable height across debug toggles",()=>{
  const sizes=[];
  const node={
    size:[300,220],
    inputs:[
      {name:"regional",link:null},
      {name:"resource_provider_1",link:null},
    ],
    outputs:[{name:"regional",links:null}],
    widgets:[
      {name:"operation",computeSize:()=>[0,20]},
      {name:"config_json",computeSize:()=>[0,60]},
      {name:"open_lora_editor",type:"button",computeSize:()=>[0,20]},
    ],
    computeSize(){
      const ports=Math.max(this.inputs.filter(port=>!port.hidden).length,this.outputs.filter(port=>!port.hidden).length);
      const widgets=this.widgets.reduce((height,widget)=>height+Math.max(0,Number(widget.computeSize?.()[1]??20)),0);
      return[280,40+ports*20+widgets];
    },
    setSize(size){sizes.push([...size]);this.size=[...size]},
    setDirtyCanvas(){},
    graph:{setDirtyCanvas(){}},
  };
  applyClassicNodePresentation(node,"BV Regional LoRA",{legacyDebug:false});
  assert.deepEqual(node.size,[300,80]);
  assert.equal(sizes.length,1);
  assert.deepEqual(node.inputs.map(port=>port.hidden),[false,true]);
  assert.ok(node.widgets.slice(0,2).every(widget=>widget.hidden));

  applyClassicNodePresentation(node,"BV Regional LoRA",{legacyDebug:true});
  applyClassicNodePresentation(node,"BV Regional LoRA",{legacyDebug:false});
  assert.deepEqual(node.size,[300,80]);
  assert.equal(sizes.length,1);
});

test("Smart Pipe Merge Classic uses one measured height and hides its real JSON widget",()=>{
  const sizes=[];
  const node={
    size:[300,180],
    inputs:[{name:"pipe_007",link:3},{name:"bv_add_pipe_source",link:null}],
    outputs:[{name:"pipe",links:null}],
    widgets:[
      {name:"bv_smart_pipe_merge_json",type:"text",computeSize:()=>[0,60]},
      {name:"Configure Merge",type:"button",computeSize:()=>[0,20]},
    ],
    computeSize(){
      const ports=Math.max(this.inputs.filter(port=>!port.hidden).length,this.outputs.filter(port=>!port.hidden).length);
      const widgets=this.widgets.reduce((height,widget)=>height+Math.max(0,Number(widget.computeSize?.()[1]??20)),0);
      return[280,40+ports*20+widgets];
    },
    setSize(size){sizes.push([...size]);this.size=[...size]},
    setDirtyCanvas(){},graph:{setDirtyCanvas(){}},
  };
  applyClassicNodePresentation(node,"BV Smart Pipe Merge",{legacyDebug:false});
  assert.deepEqual(node.size,[300,100]);
  assert.equal(node.widgets[0].hidden,true);
  assert.equal(node.widgets[0].computeSize()[1],0);
  assert.equal(node.widgets[1].hidden,false);
  assert.equal(node.__bvPresentationHasLegacy,false);
  applyClassicNodePresentation(node,"BV Smart Pipe Merge",{legacyDebug:true});
  assert.deepEqual(node.size,[300,100]);
  assert.equal(sizes.length,1);
});

test("Classic presentation re-exposes public widgets hidden by the Nodes 2 renderer",()=>{
  const node={
    size:[260,90],inputs:[{name:"pipe",link:null}],outputs:[{name:"pipe",links:null}],
    widgets:[{name:"Pipe predecessor",type:"combo",hidden:true,options:{hidden:true},computeSize:()=>[0,20]}],
    computeSize(){return[260,90]},setSize(size){this.size=size},setDirtyCanvas(){},graph:{setDirtyCanvas(){}},
  };
  applyClassicNodePresentation(node,"BV Smart Pipe");
  assert.equal(node.widgets[0].hidden,false);
  assert.equal(node.widgets[0].options.hidden,false);
});

test("legacy debug changes reconcile an installed presentation exactly once",()=>{
  let reconciliations=0;
  let legacyHiddenWrites=0;
  const legacy={name:"lora_bindings",__bvLegacyPort:true,links:null,_hidden:true};
  Object.defineProperty(legacy,"hidden",{get(){return this._hidden},set(value){legacyHiddenWrites++;this._hidden=value}});
  const node={outputs:[legacy],__bvApplyPresentation(){reconciliations++}};
  const graph={_nodes:[node],setDirtyCanvas(){}};
  setLegacyDebugVisible(true,graph);
  assert.equal(reconciliations,1);
  assert.equal(legacyHiddenWrites,0);
  setLegacyDebugVisible(false,graph);
  assert.equal(reconciliations,2);
  assert.equal(legacyHiddenWrites,0);
});

test("legacy debug does not reproject a managed node without legacy presentation roles",()=>{
  let reconciliations=0,anchorRefreshes=0;
  const node={
    __bvPresentationHasLegacy:false,
    __bvApplyPresentation(){reconciliations++},
    __bvRefreshProviderAnchors(){anchorRefreshes++},
    outputs:[{name:"regional",links:null}],
  };
  const graph={_nodes:[node],setDirtyCanvas(){}};
  setLegacyDebugVisible(true,graph);
  setLegacyDebugVisible(false,graph);
  assert.equal(reconciliations,0);
  assert.equal(anchorRefreshes,2);
});

function nodes2Row(text=""){
  const properties=new Map(),priorities=new Map();
  const style={display:"",visibility:"",
    setProperty(name,value,priority=""){properties.set(name,String(value));priorities.set(name,String(priority))},
    getPropertyValue(name){return properties.get(name)??""},
    getPropertyPriority(name){return priorities.get(name)??""},
    removeProperty(name){const value=properties.get(name)??"";properties.delete(name);priorities.delete(name);return value},
  };
  return{hidden:false,style,textContent:text,closest(){return null}};
}

function nodes2IndexedRow(text,slotKey){
  const row=nodes2Row(text),slot={dataset:{slotKey},getAttribute(name){return name==="data-slot-key"?slotKey:null}};
  row.querySelector=selector=>selector==="[data-slot-key]"?slot:null;
  return row;
}

test("Nodes 2.0 removes internal rows and applies the same legacy visibility without stale space",()=>{
  const sizes=[];
  const widgetRows=[...[
    "regional_json","lora_bindings_json","lora_v3_config_json","detailer_v3_config_json","lut_v3_config_json",
  ].map(nodes2Row),nodes2Row("Open Regional Editor"),nodes2Row("Quick Edit Prompts")];
  const outputRows=[nodes2Row("regional"),nodes2Row("lora_bindings")];
  const element={
    dataset:{},
    querySelectorAll(selector){
      if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return widgetRows;
      if(selector===".lg-slot--input")return[];
      if(selector===".lg-slot--output")return outputRows;
      return[];
    },
  };
  const documentLike={querySelector:()=>element};
  const node={id:1,size:[420,330],__bvPresentationAutoHeight:120,inputs:[],outputs:[{name:"regional"},{name:"lora_bindings"}],widgets:[
    ...["regional_json","lora_bindings_json","lora_v3_config_json","detailer_v3_config_json","lut_v3_config_json"].map(name=>({name})),
    {name:"open_regional_editor"},{name:"quick_edit_regional_prompts"},
  ],computeSize(){return[280,120]},setSize(size){sizes.push([...size]);this.size=[...size]}};

  assert.equal(projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false}),true);
  assert.deepEqual(widgetRows.map(row=>row.style.display),["none","none","none","none","none","",""]);
  assert.deepEqual(outputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["","hidden"]]);
  assert.deepEqual(sizes,[[420,120]]);

  assert.equal(projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:true}),true);
  assert.deepEqual(widgetRows.map(row=>row.style.display),["none","none","none","none","none","",""]);
  assert.deepEqual(outputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["",""]]);

  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  assert.deepEqual(outputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["","hidden"]]);
  assert.deepEqual(sizes,[[420,120]]);
});

test("Nodes 2.0 projects provider anchors independently of their canonical slot order",()=>{
  const positions=["first","middle","last"];
  for(const direction of["input","output"]){
    for(const position of positions){
      const provider=direction==="input"
        ?{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:17}
        :{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[17]};
      const publicSlots=direction==="input"
        ?[{name:"regional_prompt",type:"BV_REGIONAL",link:null},{name:"mask",type:"MASK",link:null}]
        :[{name:"lut_count",type:"INT",links:null},{name:"registry_summary",type:"STRING",links:null}];
      const providerIndex=position==="first"?0:position==="middle"?1:2;
      const slots=[...publicSlots];slots.splice(providerIndex,0,provider);
      const inputRows=direction==="input"?slots.map(slot=>nodes2Row(slot.name)):[];
      const outputRows=direction==="output"?slots.map(slot=>nodes2Row(slot.name)):[];
      const element={dataset:{},querySelectorAll(selector){
        if(selector===".lg-slot--input")return inputRows;
        if(selector===".lg-slot--output")return outputRows;
        return[];
      }};
      const node={id:`${direction}-${position}`,inputs:direction==="input"?slots:[],outputs:direction==="output"?slots:[],widgets:[]};
      const nodeType=direction==="input"?"BV Regional LUT Plan":"BV LUT Registry";
      const beforeSlots=[...slots],beforeJson=JSON.stringify({inputs:node.inputs,outputs:node.outputs,widgets:node.widgets});

      projectNodes2NodePresentation(node,nodeType,{querySelector:()=>element},{legacyDebug:true});
      const rows=direction==="input"?inputRows:outputRows,anchor=rows[providerIndex];
      assert.equal(anchor.dataset.bvPresentationProviderAnchor,direction,`${direction} ${position} anchor direction`);
      assert.equal(anchor.dataset.bvPresentationProviderVisible,"true",`${direction} ${position} debug visibility`);
      assert.equal(anchor.hidden,false,`${direction} ${position} remains measurable`);
      assert.equal(anchor.style.display,"",`${direction} ${position} does not reserve a body row`);
      assert.deepEqual(rows.filter((_,index)=>index!==providerIndex).map(row=>row.style.display),["",""],`${direction} ${position} public rows`);

      projectNodes2NodePresentation(node,nodeType,{querySelector:()=>element},{legacyDebug:false});
      assert.equal(anchor.dataset.bvPresentationProviderVisible,"false",`${direction} ${position} normal visibility`);
      assert.equal(anchor.hidden,false,`${direction} ${position} keeps a stable measured anchor`);
      assert.equal(anchor.style.display,"",`${direction} ${position} remains outside body flow`);
      assert.equal(JSON.stringify({inputs:node.inputs,outputs:node.outputs,widgets:node.widgets}),beforeJson,`${direction} ${position} graph serialization`);
      assert.deepEqual(slots,beforeSlots,`${direction} ${position} canonical slot order`);
    }
  }
});

test("Nodes 2.0 maps filtered DOM rows back to canonical input indexes",()=>{
  const fixtures=[
    {
      type:"BV Regional Prompt",id:"prompt-with-widget-inputs",
      inputs:[
        {name:"regions",widget:{}},{name:"background_prompt",widget:{}},{name:"negative_prompt",widget:{}},
        {name:"width",widget:{}},{name:"height",widget:{}},{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:17},
      ],
      rows:[nodes2IndexedRow("resource_provider","prompt-with-widget-inputs-in-5")],providerRow:0,
    },
    {
      type:"BV Regional LUT Plan",id:"lut-plan-filtered-inputs",
      inputs:[
        {name:"regional_prompt",type:"BV_REGIONAL",link:null},{name:"config",widget:{}},{name:"strength",widget:{}},
        {name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:17},
      ],
      rows:[nodes2IndexedRow("regional_prompt","lut-plan-filtered-inputs-in-0"),nodes2IndexedRow("resource_provider_1","lut-plan-filtered-inputs-in-3")],providerRow:1,
    },
  ];
  for(const fixture of fixtures){
    const element={dataset:{},querySelectorAll(selector){return selector===".lg-slot--input"?fixture.rows:[]}};
    const node={id:fixture.id,inputs:fixture.inputs,outputs:[],widgets:[]};
    projectNodes2NodePresentation(node,fixture.type,{querySelector:()=>element},{legacyDebug:true});
    const provider=fixture.rows[fixture.providerRow];
    assert.equal(provider.dataset.bvPresentationProviderAnchor,"input",`${fixture.type} canonical provider row`);
    assert.equal(provider.dataset.bvPresentationProviderVisible,"true",`${fixture.type} provider debug visibility`);
    assert.equal(fixture.rows[0].style.display,"",`${fixture.type} first rendered row remains mounted`);
  }
});

test("Nodes 2.0 never overwrites an active or later manual user height",()=>{
  const sizes=[];
  let resizing=true;
  configureNodes2NodePresentation({isUserResizing:()=>resizing});
  const hiddenRow=nodes2Row("regional_json"),buttonRow=nodes2Row("Open Regional Editor");
  const element={dataset:{},querySelectorAll(selector){if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return[hiddenRow,buttonRow];return[]}};
  const node={id:99,size:[420,260],__bvPresentationAutoHeight:100,inputs:[],outputs:[],widgets:[{name:"regional_json"},{name:"open_regional_editor"}],setSize(size){sizes.push([...size]);this.size=[...size]}};
  projectNodes2NodePresentation(node,"BV Regional Prompt",{querySelector:()=>element},{legacyDebug:false});
  assert.deepEqual(sizes,[]);
  resizing=false;
  hiddenRow.hidden=false;hiddenRow.style.display="";
  projectNodes2NodePresentation(node,"BV Regional Prompt",{querySelector:()=>element},{legacyDebug:false});
  assert.deepEqual(sizes,[]);
  assert.deepEqual(node.size,[420,260]);
  configureNodes2NodePresentation({});
});

test("Classic legacy refresh cannot overwrite a mounted Nodes 2 manual height",()=>{
  const{node,sizes}=regionalPromptNode();
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  node.__bvNodes2PresentationActive=true;
  node.size=[420,260];
  sizes.length=0;
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:true});
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.deepEqual(sizes,[]);
  assert.deepEqual(node.size,[420,260]);
});

test("a proven Classic user height survives debug and a Classic Nodes 2 Classic roundtrip",()=>{
  let resizing=false;
  configureNodes2NodePresentation({isUserResizing:()=>resizing});
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:null};
  const node={
    id:131,size:[320,220],properties:{},inputs:[{name:"regional_prompt",link:null}],outputs:[
      {name:"lut_plan",links:null},{name:"job_count",links:null},{name:"plan_summary",links:null},provider,
    ],widgets:[{name:"config_json",computeSize:()=>[0,20]},{name:"connect_regional_prompt",computeSize:()=>[0,20]}],
    computeSize(){return[300,120]},setSize(size){this.size=[...size];this.onResize?.(size)},setDirtyCanvas(){},graph:{setDirtyCanvas(){}},
  };
  try{
    applyClassicNodePresentation(node,"BV Regional LUT Plan",{legacyDebug:false});
    assert.deepEqual(node.size,[320,120]);
    resizing=true;node.setSize([360,260]);resizing=false;
    assert.equal(node.properties.bvPresentationUserHeight,260);
    applyClassicNodePresentation(node,"BV Regional LUT Plan",{legacyDebug:true});
    applyClassicNodePresentation(node,"BV Regional LUT Plan",{legacyDebug:false});
    assert.deepEqual(node.size,[360,260]);
    const element={dataset:{},querySelectorAll(){return[]}};
    projectNodes2NodePresentation(node,"BV Regional LUT Plan",{querySelector:()=>element},{legacyDebug:false});
    node.__bvNodes2PresentationActive=false;
    node.__bvApplyPresentation();
    assert.deepEqual(node.size,[360,260]);
    assert.deepEqual(JSON.parse(JSON.stringify(node.properties)),{bvPresentationSizeVersion:1,bvPresentationUserHeight:260});
  }finally{configureNodes2NodePresentation({})}
});

test("automatic presentation sizes and unmarked oversize nodes do not create a user height",()=>{
  const node={id:132,size:[320,520],properties:{},inputs:[],outputs:[],widgets:[],computeSize(){return[300,100]},setSize(size){this.size=[...size];this.onResize?.(size)},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:false});
  assert.deepEqual(node.size,[320,100]);
  assert.equal(node.properties.bvPresentationUserHeight,undefined);
  assert.equal(node.properties.bvPresentationSizeVersion,undefined);
});

test("a proven Nodes 2 user height is reused by Classic without freezing width",()=>{
  let resizing=false;
  configureNodes2NodePresentation({isUserResizing:()=>resizing});
  const node={id:133,size:[320,180],properties:{},inputs:[],outputs:[],widgets:[],computeSize(){return[300,100]},setSize(size){this.size=[...size];this.onResize?.(size)},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  const element={dataset:{},querySelectorAll(){return[]}};
  try{
    applyClassicNodePresentation(node,"BV LUT Registry",{legacyDebug:false});
    projectNodes2NodePresentation(node,"BV LUT Registry",{querySelector:()=>element},{legacyDebug:false});
    resizing=true;node.setSize([410,280]);resizing=false;
    assert.equal(node.properties.bvPresentationUserHeight,280);
    node.__bvNodes2PresentationActive=false;node.__bvApplyPresentation();
    assert.deepEqual(node.size,[410,280]);
    node.size[0]=460;node.__bvApplyPresentation();
    assert.deepEqual(node.size,[460,280]);
  }finally{configureNodes2NodePresentation({})}
});

test("the central size tracker is idempotent, guarded and exactly removable",()=>{
  let resizing=true,nativeCalls=0;
  configurePresentationSizeLifecycle({isUserResizing:()=>resizing});
  const node={size:[300,120],properties:{},onResize(){nativeCalls++},setSize(size){this.size=[...size];this.onResize?.(size)}};
  try{
    const nativeSetSize=node.setSize;
    assert.equal(installPresentationSizeLifecycle(node),true);const wrapper=node.setSize;
    assert.notEqual(wrapper,nativeSetSize);
    assert.equal(installPresentationSizeLifecycle(node),false);assert.equal(node.setSize,wrapper);
    node.setSize([330,240]);assert.equal(nativeCalls,1);assert.equal(node.properties.bvPresentationUserHeight,240);
    resizing=false;setAutomaticPresentationSize(node,[360,100]);
    assert.equal(nativeCalls,2);assert.equal(node.properties.bvPresentationUserHeight,240);assert.deepEqual(node.size,[360,100]);
    assert.equal(removePresentationSizeLifecycle(node),true);assert.equal(removePresentationSizeLifecycle(node),false);
    resizing=true;node.setSize([390,310]);assert.equal(nativeCalls,3);assert.equal(node.properties.bvPresentationUserHeight,240);
    assert.equal(installPresentationSizeLifecycle(node),true);node.setSize([420,280]);
    assert.equal(nativeCalls,4);assert.equal(node.properties.bvPresentationUserHeight,280);
  }finally{configurePresentationSizeLifecycle({});removePresentationSizeLifecycle(node)}
});

test("a later foreign resize wrapper remains installed while a removed tracker becomes inert",()=>{
  let resizing=true,nativeCalls=0,foreignCalls=0;
  configurePresentationSizeLifecycle({isUserResizing:()=>resizing});
  const node={size:[300,120],properties:{},onResize(){nativeCalls++},setSize(size){this.size=[...size];this.onResize?.(size)}};
  try{
    installPresentationSizeLifecycle(node);const tracked=node.setSize;
    node.setSize=function(){foreignCalls++;return tracked.apply(this,arguments)};
    assert.equal(removePresentationSizeLifecycle(node),true);
    node.setSize([320,210]);assert.equal(node.properties.bvPresentationUserHeight,undefined);
    assert.deepEqual([nativeCalls,foreignCalls],[1,1]);
    installPresentationSizeLifecycle(node);node.setSize([340,230]);
    assert.equal(node.properties.bvPresentationUserHeight,230);assert.deepEqual([nativeCalls,foreignCalls],[2,2]);
  }finally{configurePresentationSizeLifecycle({});removePresentationSizeLifecycle(node)}
});

test("the central size tracker restores an inherited native setSize exactly",()=>{
  const prototype={setSize(size){this.size=[...size]}};
  const node=Object.assign(Object.create(prototype),{size:[300,120],properties:{}});
  assert.equal(Object.hasOwn(node,"setSize"),false);
  assert.equal(installPresentationSizeLifecycle(node),true);
  assert.equal(Object.hasOwn(node,"setSize"),true);
  assert.equal(removePresentationSizeLifecycle(node),true);
  assert.equal(Object.hasOwn(node,"setSize"),false);
  assert.equal(node.setSize,prototype.setSize);
});

test("the central size tracker repairs a late host setSize replacement",()=>{
  let resizing=true;
  configurePresentationSizeLifecycle({isUserResizing:()=>resizing});
  const nativeSetSize=function(size){this.size=[...size]};
  const node={size:[300,120],properties:{},setSize:nativeSetSize};
  try{
    installPresentationSizeLifecycle(node);
    node.setSize=nativeSetSize;
    assert.equal(installPresentationSizeLifecycle(node),true);
    assert.notEqual(node.setSize,nativeSetSize);
    node.setSize([360,240]);
    assert.equal(node.properties.bvPresentationUserHeight,240);
    removePresentationSizeLifecycle(node);
    assert.equal(node.setSize,nativeSetSize);
  }finally{resizing=false;configurePresentationSizeLifecycle({});removePresentationSizeLifecycle(node)}
});

test("the central size tracker records only a host-declared graph resize transaction",()=>{
  let resizing=false,afterChanges=0;
  const graph={afterChange(){afterChanges++}};
  const active={size:[320,240],properties:{},graph,setSize(size){this.size=[...size]}},inactive={size:[320,280],properties:{},graph,setSize(size){this.size=[...size]}};
  try{
    configurePresentationSizeLifecycle({isUserResizing:node=>resizing&&node===active});
    installPresentationSizeLifecycle(active);installPresentationSizeLifecycle(inactive);
    presentationSize(active,[320,100]);presentationSize(inactive,[320,100]);
    resizing=true;graph.afterChange(active);resizing=false;
    assert.equal(afterChanges,1);
    assert.equal(active.properties.bvPresentationUserHeight,240);
    assert.equal(inactive.properties.bvPresentationUserHeight,undefined);
    removePresentationSizeLifecycle(active);removePresentationSizeLifecycle(inactive);
    assert.equal(Object.hasOwn(graph,"afterChange"),true);
    graph.afterChange(active);assert.equal(afterChanges,2);
  }finally{
    configurePresentationSizeLifecycle({});
    removePresentationSizeLifecycle(active);removePresentationSizeLifecycle(inactive);
  }
});

test("serialization and host drift never infer user height outside an active resize transaction",()=>{
  let resizing=false,afterChanges=0;
  const prototype={serialize(){return{properties:{...this.properties}}}};
  const graph={afterChange(){afterChanges++}};
  const node=Object.assign(Object.create(prototype),{size:[320,120],properties:{},graph,setSize(size){this.size=[...size]}});
  try{
    configurePresentationSizeLifecycle({isUserResizing:()=>resizing});presentationSize(node,[320,120]);installPresentationSizeLifecycle(node);
    assert.equal(node.serialize().properties.bvPresentationUserHeight,undefined);
    node.setSize([320,260]);
    graph.afterChange(node);
    assert.equal(node.serialize().properties.bvPresentationUserHeight,undefined);
    resizing=true;node.setSize([320,240]);resizing=false;
    const serialized=node.serialize();assert.equal(serialized.properties.bvPresentationSizeVersion,1);assert.equal(serialized.properties.bvPresentationUserHeight,240);assert.equal(afterChanges,1);
  }finally{configurePresentationSizeLifecycle({});removePresentationSizeLifecycle(node)}
  assert.equal(Object.hasOwn(node,"serialize"),false);
  assert.equal(node.serialize,prototype.serialize);
});

test("a throwing host resize probe fails closed without creating user height state",()=>{
  const node={size:[320,120],properties:{},setSize(size){this.size=[...size]}};
  configurePresentationSizeLifecycle({isUserResizing(){throw new Error("host probe unavailable")}});
  try{
    installPresentationSizeLifecycle(node);
    assert.equal(isPresentationUserResizing(node),false);
    assert.doesNotThrow(()=>node.setSize([320,180]));
    assert.doesNotThrow(()=>setAutomaticPresentationSize(node,[320,140]));
    assert.equal(node.properties.bvPresentationSizeVersion,undefined);
    assert.equal(node.properties.bvPresentationUserHeight,undefined);
  }finally{removePresentationSizeLifecycle(node);configurePresentationSizeLifecycle({})}
});

test("removal drops reconciliation proof before a later reinstallation",()=>{
  const node={size:[320,120],properties:{},setSize(size){this.size=[...size]},serialize(){return{properties:{...this.properties}}}};
  presentationSize(node,[320,120]);installPresentationSizeLifecycle(node);removePresentationSizeLifecycle(node);
  node.size=[320,260];installPresentationSizeLifecycle(node);
  try{assert.equal(node.serialize().properties.bvPresentationUserHeight,undefined)}finally{removePresentationSizeLifecycle(node)}
});

test("Nodes 2.0 commits a new semantic height when only public rows were mounted",()=>{
  const sizes=[];
  const buttonRow=nodes2Row("Open Regional Editor");
  const element={dataset:{},querySelectorAll(selector){if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return[buttonRow];return[]}};
  const node={id:100,size:[420,330],__bvPresentationAutoHeight:100,inputs:[],outputs:[],widgets:[{name:"open_regional_editor"}],setSize(size){sizes.push([...size]);this.size=[...size]}};
  const documentLike={querySelector:()=>element};
  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  assert.deepEqual(sizes,[[420,100]]);
  node.__bvPresentationAutoHeight=140;
  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  assert.deepEqual(sizes,[[420,100],[420,140]]);
});

test("Nodes 2.0 reapplies an unchanged semantic height after host layout drift",()=>{
  const sizes=[];
  const element={dataset:{},querySelectorAll(){return[]}};
  const node={id:101,size:[320,220],__bvPresentationAutoHeight:80,inputs:[],outputs:[],widgets:[],setSize(size){sizes.push([...size]);this.size=[...size]}};
  const documentLike={querySelector:()=>element};
  projectNodes2NodePresentation(node,"BV LUT Loop Start",documentLike,{legacyDebug:false});
  assert.deepEqual(sizes,[[320,80]]);
  node.size=[320,110];
  projectNodes2NodePresentation(node,"BV LUT Loop Start",documentLike,{legacyDebug:false});
  assert.deepEqual(sizes,[[320,80],[320,80]]);
});

test("Nodes 2.0 settles a late host layout drift after installation",async()=>{
  const sizes=[];
  const element={dataset:{},querySelectorAll(){return[]}};
  const node={id:102,size:[320,220],__bvPresentationAutoHeight:80,inputs:[],outputs:[],widgets:[],graph:{},setSize(size){sizes.push([...size]);this.size=[...size]}};
  try{
    installNodes2NodePresentation(node,"BV LUT Loop Start",{querySelector:()=>element});
    node.size=[320,110];
    await new Promise(resolve=>setTimeout(resolve,175));
    assert.deepEqual(node.size,[320,80]);
    assert.deepEqual(sizes,[[320,80],[320,80]]);
  }finally{removeNodes2NodePresentation(node)}
});

test("Nodes 2.0 derives port-only height from mounted row geometry instead of the Classic slot constant",()=>{
  const sizes=[];
  const inputRows=[nodes2Row("plan"),nodes2Row("initial_image")],outputRows=[nodes2Row("flow"),nodes2Row("loop_state")];
  for(const row of[...inputRows,...outputRows])row.offsetHeight=20;
  const style=nodes2Row().style;style.setProperty("--node-height","110px");
  const element={dataset:{},style,querySelectorAll(selector){if(selector===".lg-slot--input")return inputRows;if(selector===".lg-slot--output")return outputRows;return[]}};
  const node={id:103,size:[320,110],__bvPresentationAutoHeight:110,inputs:[{name:"plan"},{name:"initial_image"}],outputs:[{name:"flow"},{name:"loop_state"}],widgets:[{name:"initial_value0"}],setSize(size){sizes.push([...size]);this.size=[...size]}};
  projectNodes2NodePresentation(node,"BV LUT Loop Start",{querySelector:()=>element},{legacyDebug:false});
  assert.deepEqual(node.size,[320,76]);
  assert.deepEqual(sizes,[[320,76]]);
  assert.equal(style.getPropertyValue("--node-height"),"76px");
});

test("Nodes 2.0 restores the exact host height style when presentation is removed",()=>{
  const inputRows=[nodes2Row("plan"),nodes2Row("initial_image")],outputRows=[nodes2Row("flow"),nodes2Row("loop_state")];
  for(const row of[...inputRows,...outputRows])row.offsetHeight=20;
  const style=nodes2Row().style;style.setProperty("--node-height","110px","important");
  const element={dataset:{},style,querySelectorAll(selector){if(selector===".lg-slot--input")return inputRows;if(selector===".lg-slot--output")return outputRows;return[]}};
  const node={id:104,size:[320,110],__bvPresentationAutoHeight:110,inputs:[{name:"plan"},{name:"initial_image"}],outputs:[{name:"flow"},{name:"loop_state"}],widgets:[],graph:{},setSize(size){this.size=[...size]}};
  installNodes2NodePresentation(node,"BV LUT Loop Start",{querySelector:()=>element});
  assert.equal(style.getPropertyValue("--node-height"),"76px");
  removeNodes2NodePresentation(node);
  assert.equal(style.getPropertyValue("--node-height"),"110px");
  assert.equal(style.getPropertyPriority("--node-height"),"important");
});

test("Nodes 2.0 keeps connected legacy source and target sockets visible without debug",()=>{
  const sourceRows=[nodes2Row("regional"),nodes2Row("lora_bindings")];
  const targetRows=[nodes2Row("regional"),nodes2Row("clip"),nodes2Row("lora_registry"),nodes2Row("lora_bindings")];
  const sourceElement={dataset:{},querySelectorAll(selector){if(selector===".lg-slot--output")return sourceRows;if(selector===".lg-slot--input")return[];return[]}};
  const targetElement={dataset:{},querySelectorAll(selector){if(selector===".lg-slot--input")return targetRows;if(selector===".lg-slot--output")return[nodes2Row("positive"),nodes2Row("negative")];return[]}};
  const documentLike={querySelector(selector){return selector.includes('"41"')?sourceElement:targetElement}};
  const source={id:41,inputs:[],outputs:[{name:"regional",links:null},{name:"lora_bindings",links:[9]}],widgets:[]};
  const target={id:42,inputs:[{name:"regional",link:null},{name:"clip",link:null},{name:"lora_registry",link:null},{name:"lora_bindings",link:9}],outputs:[{name:"positive",links:null},{name:"negative",links:null}],widgets:[]};
  projectNodes2NodePresentation(source,"BV Regional Prompt",documentLike,{legacyDebug:false});
  projectNodes2NodePresentation(target,"BV Regional Native Conditioning",documentLike,{legacyDebug:false});
  assert.equal(sourceRows[1].style.visibility,"");
  assert.equal(targetRows[2].style.visibility,"hidden");
  assert.equal(targetRows[3].style.visibility,"");
});

test("Nodes 2.0 connected legacy sockets project and exactly restore the canonical link color",()=>{
  const type="BV_LORA_BINDINGS",variable=`--color-datatype-${type}`;
  const sourceRow=nodes2Row("lora_bindings"),targetRow=nodes2Row("lora_bindings");
  sourceRow.style.setProperty(variable,"#112233","important");
  const link={id:9,type,color:"#c0ffee",origin_id:51,origin_slot:0,target_id:52,target_slot:0};
  const graph={getLink(id){return id===9?link:null},links:new Map([[9,link]])};
  const source={id:51,graph,inputs:[],outputs:[{name:"lora_bindings",type,links:[9]}],widgets:[]};
  const target={id:52,graph,inputs:[{name:"lora_bindings",type,link:9}],outputs:[],widgets:[]};
  const sourceElement={dataset:{},querySelectorAll(selector){return selector===".lg-slot--output"?[sourceRow]:[]}};
  const targetElement={dataset:{},querySelectorAll(selector){return selector===".lg-slot--input"?[targetRow]:[]}};
  const documentLike={querySelector(selector){return selector.includes('"51"')?sourceElement:targetElement}};

  projectNodes2NodePresentation(source,"BV Regional Prompt",documentLike,{legacyDebug:false});
  projectNodes2NodePresentation(target,"BV Regional Native Conditioning",documentLike,{legacyDebug:false});
  for(const row of[sourceRow,targetRow]){
    assert.equal(row.dataset.bvPresentationLegacyConnected,"true");
    assert.equal(row.style.getPropertyValue(variable),"#c0ffee");
    assert.equal(row.style.getPropertyPriority(variable),"");
  }

  source.outputs[0].links=null;target.inputs[0].link=null;
  projectNodes2NodePresentation(source,"BV Regional Prompt",documentLike,{legacyDebug:false});
  projectNodes2NodePresentation(target,"BV Regional Native Conditioning",documentLike,{legacyDebug:false});
  assert.equal(sourceRow.dataset.bvPresentationLegacyConnected,undefined);
  assert.equal(sourceRow.style.getPropertyValue(variable),"#112233");
  assert.equal(sourceRow.style.getPropertyPriority(variable),"important");
  assert.equal(targetRow.dataset.bvPresentationLegacyConnected,undefined);
  assert.equal(targetRow.style.getPropertyValue(variable),"");
});

test("Nodes 2.0 legacy color resolves the native palette from object-backed links and cleans up on removal",()=>{
  const type="BV_LORA_BINDINGS",variable=`--color-datatype-${type}`,previousCanvas=globalThis.LGraphCanvas;
  globalThis.LGraphCanvas={link_type_colors:{[type]:"#abc123"}};
  const row=nodes2Row("lora_bindings"),link={id:4,type,target_id:61,target_slot:0};
  const graph={links:{4:link}},node={id:61,graph,inputs:[{name:"lora_bindings",type,link:4}],outputs:[],widgets:[]};
  const element={dataset:{},querySelectorAll(selector){return selector===".lg-slot--input"?[row]:[]}};
  try{
    projectNodes2NodePresentation(node,"BV Regional Native Conditioning",{querySelector:()=>element},{legacyDebug:false});
    assert.equal(row.style.getPropertyValue(variable),"#abc123");
    assert.equal(row.dataset.bvPresentationLegacyConnected,"true");
    removeNodes2NodePresentation(node);
    assert.equal(row.style.getPropertyValue(variable),"");
    assert.equal(row.dataset.bvPresentationLegacyConnected,undefined);
  }finally{
    if(previousCanvas===undefined)delete globalThis.LGraphCanvas;else globalThis.LGraphCanvas=previousCanvas;
  }
});

test("Regional LoRA Nodes 2.0 removes internal rows and titlebar-projects providers in debug mode",()=>{
  const inputRows=[nodes2Row("regional"),nodes2Row("resource_provider_1")];
  const outputRows=[nodes2Row("regional")];
  const widgetRows=[nodes2Row("operation"),nodes2Row("config_json"),nodes2Row("Open LoRA Editor")];
  const element={
    dataset:{},
    querySelectorAll(selector){
      if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return widgetRows;
      if(selector===".lg-slot--input")return inputRows;
      if(selector===".lg-slot--output")return outputRows;
      return[];
    },
  };
  const documentLike={querySelector:()=>element};
  const node={id:2,inputs:[{name:"regional"},{name:"resource_provider_1"}],outputs:[{name:"regional"}],widgets:[
    {name:"operation"},{name:"config_json"},{name:"open_lora_editor"},
  ]};

  for(const legacyDebug of[false,true,false]){
    assert.equal(projectNodes2NodePresentation(node,"BV Regional LoRA",documentLike,{legacyDebug}),true);
    assert.deepEqual(inputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["",""]]);
    assert.equal(inputRows[1].dataset.bvPresentationProviderAnchor,"input");
    assert.equal(inputRows[1].dataset.bvPresentationProviderVisible,String(legacyDebug));
    assert.deepEqual(outputRows.map(row=>[row.style.display,row.style.visibility]),[["",""]]);
    assert.deepEqual(widgetRows.map(row=>[row.style.display,row.style.visibility]),[["none",""],["none",""],["",""]]);
  }

  const lateProvider=nodes2Row("resource_provider_2");
  inputRows.push(lateProvider);
  node.inputs.push({name:"resource_provider_2"});
  projectNodes2NodePresentation(node,"BV Regional LoRA",documentLike,{legacyDebug:false});
  assert.equal(lateProvider.style.display,"");
  assert.equal(lateProvider.dataset.bvPresentationProviderAnchor,"input");
  assert.equal(lateProvider.dataset.bvPresentationProviderVisible,"false");
});

test("Smart Pipe Merge Nodes 2.0 removes JSON space and retains materialized pipe rows",()=>{
  const inputRows=[nodes2Row("pipe_007"),nodes2Row("+ Add Pipe Source")];
  const outputRows=[nodes2Row("pipe")];
  const widgetRows=[nodes2Row("bv_smart_pipe_merge_json"),nodes2Row("Configure Pipe Merge")];
  const element={dataset:{},querySelectorAll(selector){
    if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return widgetRows;
    if(selector===".lg-slot--input")return inputRows;
    if(selector===".lg-slot--output")return outputRows;
    return[];
  }};
  const documentLike={querySelector:()=>element};
  const node={id:3,inputs:[{name:"pipe_007"},{name:"bv_add_pipe_source"}],outputs:[{name:"pipe"}],widgets:[{name:"bv_smart_pipe_merge_json"},{name:"Configure Merge"}]};
  for(const legacyDebug of[false,true,false]){
    assert.equal(projectNodes2NodePresentation(node,"BV Smart Pipe Merge",documentLike,{legacyDebug}),true);
    assert.deepEqual(inputRows.map(row=>row.style.display),["",""]);
    assert.deepEqual(outputRows.map(row=>row.style.display),[""]);
    assert.deepEqual(widgetRows.map(row=>row.style.display),["none",""]);
  }
});

test("Smart Pipe Nodes 2.0 keeps public widgets when hidden JSON rows are absent from the DOM",()=>{
  const inputRows=[nodes2Row("pipe"),nodes2Row("＋ Add Slot")],outputRows=[nodes2Row("pipe")];
  const widgetRows=[nodes2Row("Pipe predecessor Start new pipe"),nodes2Row("Configure Smart Pipe")];
  const element={dataset:{},querySelectorAll(selector){
    if(selector==='.lg-slot--input')return inputRows;
    if(selector==='.lg-slot--output')return outputRows;
    if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return widgetRows;
    return[];
  }};
  const node={id:77,inputs:[{name:"pipe",link:null},{name:"bv_add_slot",link:null}],outputs:[{name:"pipe",links:null}],widgets:[
    {name:"bv_smart_pipe_schema_json"},{name:"bv_smart_pipe_route_json"},
    {name:"Pipe predecessor",label:"Pipe predecessor"},{name:"Configure",label:"Configure Smart Pipe"},
  ]};
  assert.equal(projectNodes2NodePresentation(node,"BV Smart Pipe",{querySelector:()=>element},{legacyDebug:false}),true);
  assert.deepEqual(widgetRows.map(row=>[row.hidden,row.style.display]),[[false,""],[false,""]]);
});

test("Regional Detailer Plan Nodes 2.0 titlebar-projects providers and preserves its legacy row geometry",()=>{
  const inputRows=[nodes2Row("regional_prompt"),nodes2Row("detector_registry"),nodes2Row("resource_provider"),nodes2Row("resource_provider_1")];
  const outputRows=[nodes2Row("detailer_plan"),nodes2Row("job_count"),nodes2Row("plan_summary")];
  const widgetRows=[nodes2Row("config_json"),nodes2Row("Connect a BV Regional Prompt")];
  const element={dataset:{},querySelectorAll(selector){
    if(selector===".lg-slot--input")return inputRows;
    if(selector===".lg-slot--output")return outputRows;
    if(selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]')return widgetRows;
    return[];
  }};
  const node={id:78,inputs:detailerPlanInventory.ports.filter(port=>port.direction==="input").map(port=>({name:port.name,link:port.connected?7:null})),outputs:detailerPlanInventory.ports.filter(port=>port.direction==="output").map(port=>({name:port.name,links:null})),widgets:detailerPlanInventory.widgets};
  projectNodes2NodePresentation(node,"BV Regional Detailer Plan",{querySelector:()=>element},{legacyDebug:false});
  assert.deepEqual(inputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["","hidden"],["",""],["",""]]);
  assert.deepEqual(inputRows.slice(2).map(row=>[row.dataset.bvPresentationProviderAnchor,row.dataset.bvPresentationProviderVisible]),[["input","false"],["input","false"]]);
  assert.deepEqual(outputRows.map(row=>row.style.display),["","",""]);
  assert.deepEqual(widgetRows.map(row=>row.style.display),["none",""]);
  projectNodes2NodePresentation(node,"BV Regional Detailer Plan",{querySelector:()=>element},{legacyDebug:true});
  assert.equal(inputRows[1].style.visibility,"");
  assert.deepEqual(inputRows.slice(2).map(row=>[row.style.display,row.dataset.bvPresentationProviderVisible]),[["","true"],["","true"]]);
});

test("Nodes 2.0 distinguishes a visible selector from hidden state sharing the same label",()=>{
  const widgetRows=[nodes2Row("scope"),nodes2Row("region")];
  const element={dataset:{},querySelectorAll(selector){return selector==='[data-testid="node-widgets"] > [data-testid="node-widget"]'?widgetRows:[]}};
  const node={id:79,inputs:[],outputs:[],widgets:[
    {name:"scope",label:"scope"},{name:"region",label:"region"},{name:"region_selector",label:"region"},
  ]};
  projectNodes2NodePresentation(node,"BV Regional Select",{querySelector:()=>element},{legacyDebug:false});
  assert.deepEqual(widgetRows.map(row=>row.style.display),["",""]);
});

test("Regional Detailer Plan Classic publishes one stable final height across debug toggles",()=>{
  const sizes=[];
  const node={size:[300,260],properties:{},inputs:detailerPlanInventory.ports.filter(port=>port.direction==="input").map(port=>({name:port.name,link:null})),outputs:detailerPlanInventory.ports.filter(port=>port.direction==="output").map(port=>({name:port.name,links:null})),widgets:[{name:"config_json",computeSize:()=>[0,60]},{name:"configure_detailer_plan",type:"button",computeSize:()=>[0,20]}],computeSize(){const ports=Math.max(this.inputs.filter(port=>!port.hidden).length,this.outputs.filter(port=>!port.hidden).length);const widgets=this.widgets.reduce((height,widget)=>height+Math.max(0,Number(widget.computeSize?.()[1]??20)),0);return[280,40+ports*20+widgets]},setSize(size){sizes.push([...size]);this.size=[...size]},setDirtyCanvas(){},graph:{setDirtyCanvas(){}}};
  applyClassicNodePresentation(node,"BV Regional Detailer Plan",{legacyDebug:false});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  applyClassicNodePresentation(node,"BV Regional Detailer Plan",{legacyDebug:true});
  applyClassicNodePresentation(node,"BV Regional Detailer Plan",{legacyDebug:false});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
});

test("Nodes 2.0 presentation releases its node-owned callback on removal",()=>{
  const node={id:9,graph:{}};
  const documentLike={querySelector:()=>null};
  installNodes2NodePresentation(node,"BV Regional Prompt",documentLike);
  assert.equal(typeof node.__bvApplyNodes2Presentation,"function");
  removeNodes2NodePresentation(node);
  assert.equal(node.__bvApplyNodes2Presentation,undefined);
});

test("LUT node lifecycle and widget manipulation is owned by the central presentation installer",()=>{
  assert.match(indexSource,/import \{ installLutNodePresentation \} from "\.\/regional\/lutNodePresentation"/);
  assert.match(indexSource,/if\(installLutNodePresentation\(nodeType,nodeData,/);
  const legacyLutBlock=indexSource.slice(indexSource.indexOf('if(nodeData.name==="BV LUT Registry")'),indexSource.indexOf('if(["BV Control Center"'));
  assert.equal(legacyLutBlock,"","index.tsx must not retain LUT-specific lifecycle or widget manipulation blocks");
  assert.doesNotMatch(lutV3CatalogSource,/const hide=|hide\(item\)/,"the LUT domain catalog must not own widget presentation");
  assert.doesNotMatch(lutV3CatalogSource,/\.hidden\s*=/,"the LUT domain catalog must not mutate port visibility directly");
  assert.match(lutV3CatalogSource,/markProjectedProvider\(output\)/,"provider output presentation must use the central projection helper");
});

const lutPresentationDeps=(overrides={})=>({
  api:{},graphOwner:node=>node.graph,scopedNodeKey:node=>String(node.id),workflowNodesOfType:()=>[],windowMenuVisible:()=>true,
  switchView:()=>{},sourceDocument:()=>null,detectorCollectors:()=>[],openRegistry:async()=>{},openPlan:()=>{},openDownload:()=>{},...overrides,
});

test("central LUT installer owns exactly the four LUT lifecycle node types",()=>{
  for(const name of ["BV LUT Registry","BV LUT Loader","BV LUT Loop Start","BV Regional LUT Plan"]){
    class NodeType{}
    assert.equal(installLutNodePresentation(NodeType,{name},lutPresentationDeps()),true,name);
  }
  class ForeignNode{}
  assert.equal(installLutNodePresentation(ForeignNode,{name:"BV Regional Prompt"},lutPresentationDeps()),false);
});

test("central LUT loader preserves lifecycle semantics and guards repeated preparation",async()=>{
  let createdCalls=0,removedCalls=0,downloadCallback,callbackValues=[],dirtyCalls=0;
  class LoaderNode{}
  LoaderNode.prototype.onNodeCreated=function(value){createdCalls++;assert.equal(this.marker,"loader");return `created:${value}`};
  LoaderNode.prototype.onConfigure=function(){return "configured"};
  LoaderNode.prototype.onRemoved=function(value){removedCalls++;return `removed:${value}`};
  installLutNodePresentation(LoaderNode,{name:"BV LUT Loader"},lutPresentationDeps({openDownload:callback=>{downloadCallback=callback}}));
  const combo={name:"lut_name",value:"Built-in: Identity",options:{values:["Built-in: Identity","downloaded\\Existing.cube","Download more LUTs…"]},callback(value){callbackValues.push(value)}};
  let secondDirtyCalls=0;
  const secondCombo={name:"lut_name",value:"Built-in: Identity",options:{values:["Built-in: Identity","Download more LUTs…"]},callback(){}};
  const node=new LoaderNode();Object.assign(node,{marker:"loader",widgets:[combo],graph:{setDirtyCanvas(){dirtyCalls++}}});
  const secondNode=new LoaderNode();Object.assign(secondNode,{marker:"loader",widgets:[secondCombo],graph:{setDirtyCanvas(){secondDirtyCalls++}}});
  assert.equal(node.onNodeCreated("x"),"created:x");
  assert.equal(secondNode.onNodeCreated("y"),"created:y");
  await new Promise(resolve=>queueMicrotask(resolve));
  assert.ok(combo.options.values.includes("downloaded/Existing.cube"));
  assert.ok(!combo.options.values.includes("downloaded\\Existing.cube"));
  const wrapped=combo.callback;
  combo.value="Built-in: Warm Contrast";combo.callback("Built-in: Warm Contrast");
  combo.value="Download more LUTs…";
  combo.callback("Download more LUTs…");
  assert.equal(combo.value,"Built-in: Warm Contrast");
  lutLibrary.publish("downloaded/External.cube");
  assert.ok(combo.options.values.includes("downloaded/External.cube"));
  assert.ok(secondCombo.options.values.includes("downloaded/External.cube"));
  assert.equal(combo.value,"Built-in: Warm Contrast","external installs must not change selection");
  assert.equal(secondCombo.value,"Built-in: Identity","external installs must not change another loader selection");
  lutLibrary.publish("downloaded/Test.cube");
  downloadCallback("downloaded/Test.cube");
  assert.ok(combo.options.values.includes("downloaded/Test.cube"));
  assert.equal(combo.value,"downloaded/Test.cube");
  assert.deepEqual(callbackValues,["Built-in: Warm Contrast","downloaded/Test.cube"]);
  downloadCallback("downloaded/Test.cube");
  assert.equal(combo.options.values.filter(value=>value==="downloaded/Test.cube").length,1,"slash variants must not create duplicate entries");
  assert.deepEqual(callbackValues,["Built-in: Warm Contrast","downloaded/Test.cube","downloaded/Test.cube"]);
  assert.equal(node.onConfigure(),"configured");
  await new Promise(resolve=>queueMicrotask(resolve));
  assert.equal(combo.callback,wrapped,"configure must not wrap the callback twice");
  assert.equal(createdCalls,2);
  assert.equal(node.onRemoved("x"),"removed:x");assert.equal(removedCalls,1);
  secondNode.onConfigure();secondNode.onConfigure();await new Promise(resolve=>queueMicrotask(resolve));
  const secondDirtyBeforePublish=secondDirtyCalls;
  lutLibrary.publish("downloaded/AfterRemoval.cube");
  assert.ok(!combo.options.values.includes("downloaded/AfterRemoval.cube"),"removed loaders must unsubscribe");
  assert.ok(secondCombo.options.values.includes("downloaded/AfterRemoval.cube"),"remaining loaders stay subscribed");
  assert.equal(secondDirtyCalls,secondDirtyBeforePublish+1,"repeated configure must not duplicate the subscription");
  secondNode.onRemoved("y");
  assert.ok(dirtyCalls>=2);
});

test("central LUT registry normalizes once, reuses its action, and exposes save and navigation",async()=>{
  const previousWindow=globalThis.window,previousCustomEvent=globalThis.CustomEvent;
  globalThis.window={dispatchEvent(){}};globalThis.CustomEvent=class{constructor(type,init){this.type=type;this.detail=init?.detail}};
  try{
    let registryArgs,dirtyCalls=0,hiddenCallbacks=0,switched=0;
    class RegistryNode{}
    RegistryNode.prototype.onNodeCreated=function(){return "registry-created"};
    const targetAction={callback(){}};const target={id:2,title:"Target",widgets:[{name:"configure_lut_registry",...targetAction}]};
    installLutNodePresentation(RegistryNode,{name:"BV LUT Registry"},lutPresentationDeps({workflowNodesOfType:()=>[target],openRegistry:async(...args)=>{registryArgs=args},switchView:()=>{switched++}}));
    const hidden={name:"config_json",value:JSON.stringify({schema:"old",version:0,collector_id:"11111111-1111-4111-8111-111111111111",luts:[{id:"a",lut_name:"One"}]}),callback(){hiddenCallbacks++}};
    const node=new RegistryNode();Object.assign(node,{id:1,comfyClass:"BV LUT Registry",widgets:[hidden],outputs:[],graph:{nodes:[],setDirtyCanvas(){dirtyCalls++}},addOutput(name,type){this.outputs.push({name,type})},addWidget(_type,name,_value,callback){const widget={name,callback};this.widgets.push(widget);return widget}});node.graph.nodes=[node,target];
    assert.equal(node.onNodeCreated(),"registry-created");await new Promise(resolve=>queueMicrotask(resolve));
    const action=node.widgets.find(item=>item.name==="configure_lut_registry");
    assert.equal(hidden.hidden,true);assert.match(hidden.value,/"schema":"bv\.lut_registry_config"/);assert.equal(hiddenCallbacks,1);assert.equal(action.label,"Configure LUT Registry · 1 LUT");assert.equal(action.serialize,false);
    node.onConfigure?.();await new Promise(resolve=>queueMicrotask(resolve));assert.equal(node.widgets.filter(item=>item.name==="configure_lut_registry").length,1);
    action.callback();await new Promise(resolve=>queueMicrotask(resolve));
    const save=registryArgs[2],navigate=registryArgs[5];save(JSON.stringify({schema:"bv.lut_registry_config",version:1,collector_id:"11111111-1111-4111-8111-111111111111",luts:[]}));
    assert.match(action.label,/0 LUTs/);navigate("2",false);assert.equal(switched,1);assert.ok(dirtyCalls>=2);
  }finally{globalThis.window=previousWindow;globalThis.CustomEvent=previousCustomEvent}
});

test("central LUT loop chains all lifecycle paths and preserves returns",async()=>{
  class LoopNode{}
  LoopNode.prototype.onNodeCreated=function(value){this.calls=(this.calls??0)+1;return `created:${value}`};
  LoopNode.prototype.onConfigure=function(){this.calls++;return "configured"};
  LoopNode.prototype.onConnectionsChange=function(){this.calls++;return "changed"};
  installLutNodePresentation(LoopNode,{name:"BV LUT Loop Start"},lutPresentationDeps());
  const node=new LoopNode();Object.assign(node,{comfyClass:"BV LUT Loop Start",widgets:[],inputs:[],outputs:[],graph:{nodes:[]}});node.graph.nodes=[node];
  assert.equal(node.onNodeCreated("x"),"created:x");assert.equal(node.onConfigure(),"configured");assert.equal(node.onConnectionsChange(),"changed");await new Promise(resolve=>queueMicrotask(resolve));
  assert.equal(node.calls,3);assert.equal(node.__bvPresentationManaged,true);
});

test("central definition presentation lifecycle composes callbacks and installs only once",async()=>{
  class PolicyNode{}
  PolicyNode.prototype.onNodeCreated=function(value){this.calls.push(["created",value]);return `created:${value}`};
  PolicyNode.prototype.onConfigure=function(value){this.calls.push(["configured",value]);return `configured:${value}`};
  PolicyNode.prototype.onConnectionsChange=function(value){this.calls.push(["connections",value]);return `connections:${value}`};
  PolicyNode.prototype.onRemoved=function(value){this.calls.push(["removed",value]);return `removed:${value}`};
  assert.equal(installNodePresentationLifecycle(PolicyNode,{name:"BV LUT Loop End"}),true);
  const installed={created:PolicyNode.prototype.onNodeCreated,configured:PolicyNode.prototype.onConfigure,connections:PolicyNode.prototype.onConnectionsChange,removed:PolicyNode.prototype.onRemoved};
  assert.equal(installNodePresentationLifecycle(PolicyNode,{name:"BV LUT Loop End"}),true);
  assert.deepEqual([PolicyNode.prototype.onNodeCreated,PolicyNode.prototype.onConfigure,PolicyNode.prototype.onConnectionsChange,PolicyNode.prototype.onRemoved],[installed.created,installed.configured,installed.connections,installed.removed]);
  const node=new PolicyNode();Object.assign(node,{calls:[],size:[320,108],properties:{},inputs:[{name:"flow",type:"*",link:null},{name:"processed_image",type:"IMAGE",link:null}],outputs:[{name:"final_image",type:"IMAGE",links:null}],widgets:[],graph:{setDirtyCanvas(){},afterChange(){}},computeSize(){return[320,108]},setSize(size){this.size=[...size]}});
  assert.equal(node.onNodeCreated("a"),"created:a");assert.equal(node.onConfigure("b"),"configured:b");assert.equal(node.onConnectionsChange("c"),"connections:c");await new Promise(resolve=>queueMicrotask(resolve));
  assert.deepEqual(node.calls,[["created","a"],["configured","b"],["connections","c"]]);assert.equal(node.__bvPresentationManaged,true);
  assert.equal(node.onRemoved("d"),"removed:d");assert.deepEqual(node.calls.at(-1),["removed","d"]);
});

test("fresh Nodes 2 LUT and Detailer loop definitions share one port-only height contract",async()=>{
  const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  class Observer{observe(){}disconnect(){}}
  const roots=new Map(),styleElement={id:"",textContent:""};
  const documentLike={
    querySelector(selector){const match=String(selector).match(/data-node-id="([^"]+)"/);return match?roots.get(match[1])??null:null},
    getElementById(){return null},createElement(){return styleElement},head:{append(){}},body:{},
  };
  globalThis.document=documentLike;globalThis.MutationObserver=Observer;
  globalThis.requestAnimationFrame=callback=>{queueMicrotask(callback);return 1};globalThis.cancelAnimationFrame=()=>{};
  const root=(id,inputs,outputs)=>{
    const inputRows=inputs.map((name,index)=>nodes2IndexedRow(name,`${id}-in-${index}`));
    const outputRows=outputs.map((name,index)=>nodes2IndexedRow(name,`${id}-out-${index}`));
    for(const row of[...inputRows,...outputRows])row.offsetHeight=20;
    const style=nodes2Row().style;style.setProperty("--node-height",id==="1"?"110px":"108px");
    return{dataset:{},style,querySelectorAll(selector){if(selector===".lg-slot--input")return inputRows;if(selector===".lg-slot--output")return outputRows;return[]}};
  };
  const makeType=className=>class{
    constructor(id,nativeHeight,inputs,outputs){this.id=id;this.comfyClass=className;this.size=[320,nativeHeight];this.properties={};this.widgets=[];this.calls=[];this.inputs=inputs.map(({name,type})=>({name,type,link:{id:`${id}:${name}`}}));this.outputs=outputs.map(({name,type})=>({name,type,links:[{id:`${id}:${name}`}]}));}
    computeSize(){return[320,40+Math.max(this.inputs.filter(slot=>!slot.hidden).length,this.outputs.filter(slot=>!slot.hidden).length)*20]}
    setSize(size){this.size=[...size]}
    onNodeCreated(){this.calls.push("created");return `${this.comfyClass}:created`}
    onConfigure(){this.calls.push("configured");return `${this.comfyClass}:configured`}
  };
  const families=[
    {name:"LUT",startName:"BV LUT Loop Start",endName:"BV LUT Loop End",startInputs:[{name:"plan",type:"*"},{name:"initial_image",type:"IMAGE"}],startOutputs:[{name:"flow",type:"FLOW_CONTROL"},{name:"loop_state",type:"BV_LUT_LOOP_STATE"}],endInputs:[{name:"flow",type:"FLOW_CONTROL"},{name:"processed_image",type:"IMAGE"}],endOutputs:[{name:"final_image",type:"IMAGE"}],installFeature:true},
    {name:"Detailer",startName:"BV Detailer Loop Start",endName:"BV Detailer Loop End",startInputs:[{name:"detailer_plan",type:"BV_DETAILER_PLAN"},{name:"initial_image",type:"IMAGE"}],startOutputs:[{name:"flow",type:"FLOW_CONTROL"},{name:"loop_state",type:"BV_DETAILER_LOOP_STATE"}],endInputs:[{name:"flow",type:"FLOW_CONTROL"},{name:"processed_image",type:"IMAGE"}],endOutputs:[{name:"final_image",type:"IMAGE"}],installFeature:false},
  ];
  const pairs=[];let id=1;
  for(const family of families){
    const StartType=makeType(family.startName),EndType=makeType(family.endName);
    installNodePresentationLifecycle(StartType,{name:family.startName});installNodePresentationLifecycle(EndType,{name:family.endName});
    if(family.installFeature){installLutNodePresentation(StartType,{name:family.startName},lutPresentationDeps());installLutNodePresentation(EndType,{name:family.endName},lutPresentationDeps())}
    const startId=String(id++),endId=String(id++),start=new StartType(startId,110,family.startInputs,family.startOutputs),end=new EndType(endId,108,family.endInputs,family.endOutputs);
    const graph={nodes:[start,end],_nodes:[start,end],setDirtyCanvas(){},afterChange(){}};start.graph=graph;end.graph=graph;
    pairs.push({family,start,end,startId,endId,startInputRefs:[...start.inputs],startOutputLinks:start.outputs.map(slot=>slot.links),endInputRefs:[...end.inputs],endOutputLinks:end.outputs.map(slot=>slot.links)});
  }
  try{
    for(const{family,start,end}of pairs){assert.equal(start.onNodeCreated(),`${family.startName}:created`);assert.equal(end.onNodeCreated(),`${family.endName}:created`);assert.equal(start.onConfigure(),`${family.startName}:configured`);assert.equal(end.onConfigure(),`${family.endName}:configured`)}
    await new Promise(resolve=>queueMicrotask(resolve));
    for(const{family,start,end}of pairs){assert.equal(start.size[1],80,`${family.name} Classic start height`);assert.equal(end.size[1],80,`${family.name} Classic end height`)}
    for(const{family,startId,endId}of pairs){roots.set(startId,root(startId,family.startInputs.map(slot=>slot.name),family.startOutputs.map(slot=>slot.name)));roots.set(endId,root(endId,family.endInputs.map(slot=>slot.name),family.endOutputs.map(slot=>slot.name)))}
    await new Promise(resolve=>setTimeout(resolve,175));
    for(const{family,start,end,startId,endId,startInputRefs,startOutputLinks,endInputRefs,endOutputLinks}of pairs){
      assert.equal(start.size[1],end.size[1],`${family.name} pair diverged: start=${start.size[1]}, end=${end.size[1]}`);assert.equal(start.size[1],76);
      assert.equal(roots.get(startId).style.getPropertyValue("--node-height"),roots.get(endId).style.getPropertyValue("--node-height"));assert.equal(roots.get(startId).style.getPropertyValue("--node-height"),"76px");
      assert.deepEqual(start.calls,["created","configured"]);assert.deepEqual(end.calls,["created","configured"]);
      assert.deepEqual(start.inputs.slice(0,startInputRefs.length),startInputRefs);assert.deepEqual(end.inputs,endInputRefs);
      start.outputs.forEach((slot,index)=>assert.equal(slot.links,startOutputLinks[index]));end.outputs.forEach((slot,index)=>assert.equal(slot.links,endOutputLinks[index]));
      assert.deepEqual(start.inputs.slice(0,family.startInputs.length).map(slot=>[slot.name,slot.type]),family.startInputs.map(slot=>[slot.name,slot.type]));assert.deepEqual(end.inputs.map(slot=>[slot.name,slot.type]),family.endInputs.map(slot=>[slot.name,slot.type]));
    }
  }finally{
    for(const{start,end}of pairs){removeNodePresentation(start);removeNodePresentation(end)}
    for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
});

test("Nodes 2 port-only geometry handles late rows, collapse and root replacement without a loop",()=>{
  const previous={ResizeObserver:globalThis.ResizeObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  const frames=[],observers=[];let disconnected=0,writes=0;
  class Observer{constructor(callback){this.callback=callback;this.targets=new Set();observers.push(this)}observe(target){this.targets.add(target)}unobserve(target){this.targets.delete(target)}disconnect(){disconnected++;this.targets.clear()}}
  globalThis.ResizeObserver=Observer;globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};globalThis.cancelAnimationFrame=()=>{};
  const inputs=[nodes2IndexedRow("flow","late-in-0"),nodes2IndexedRow("processed_image","late-in-1")],outputs=[nodes2IndexedRow("final_image","late-out-0")];
  for(const row of[...inputs,...outputs])row.offsetHeight=0;
  const makeRoot=(inputRows=inputs,outputRows=outputs)=>({dataset:{},style:nodes2Row().style,querySelectorAll(selector){if(selector===".lg-slot--input")return inputRows;if(selector===".lg-slot--output")return outputRows;return[]}});
  let currentRoot=makeRoot();
  const documentLike={querySelector:()=>currentRoot},node={id:"late",size:[320,108],properties:{},inputs:[{name:"flow",type:"*",link:null},{name:"processed_image",type:"IMAGE",link:null}],outputs:[{name:"final_image",type:"IMAGE",links:null}],widgets:[],graph:{afterChange(){}},setSize(size){writes++;this.size=[...size]}};
  try{
    installNodes2NodePresentation(node,"BV LUT Loop End",documentLike);assert.equal(observers.length,1);assert.equal(writes,0);
    for(const row of[...inputs,...outputs])row.offsetHeight=20;
    observers[0].callback();assert.equal(frames.length,1);frames.shift()();assert.deepEqual(node.size,[320,76]);assert.equal(writes,1);
    observers[0].callback();assert.equal(frames.length,1);frames.shift()();assert.equal(writes,1);
    for(const row of[...inputs,...outputs])row.offsetHeight=0;
    observers[0].callback();frames.shift()();assert.deepEqual(node.size,[320,76]);assert.equal(node.properties.bvPresentationUserHeight,undefined);assert.equal(writes,1);
    for(const row of[...inputs,...outputs])row.offsetHeight=20;
    observers[0].callback();frames.shift()();assert.deepEqual(node.size,[320,76]);assert.equal(writes,1);
    const replacementInputs=[nodes2IndexedRow("flow","replacement-in-0"),nodes2IndexedRow("processed_image","replacement-in-1")],replacementOutputs=[nodes2IndexedRow("final_image","replacement-out-0")];for(const row of[...replacementInputs,...replacementOutputs])row.offsetHeight=20;
    currentRoot=makeRoot(replacementInputs,replacementOutputs);node.__bvApplyNodes2Presentation();assert.equal(observers.length,2);assert.equal(disconnected,1);assert.equal(currentRoot.style.getPropertyValue("--node-height"),"76px");assert.equal(writes,1);
    removeNodes2NodePresentation(node);assert.equal(disconnected,2);
  }finally{removeNodes2NodePresentation(node);for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value}
});

test("central LUT plan handles disconnected, connected, save and navigation states idempotently",async()=>{
  let document=null,planOptions,switched=0,dirtyCalls=0;
  class PlanNode{}
  PlanNode.prototype.onNodeCreated=function(){return "plan-created"};
  const targetAction={callback(){}};const target={id:9,title:"Other Plan",widgets:[{name:"configure_lut_plan",...targetAction}]};
  installLutNodePresentation(PlanNode,{name:"BV Regional LUT Plan"},lutPresentationDeps({sourceDocument:()=>document,workflowNodesOfType:()=>[target],openPlan:options=>{planOptions=options},switchView:()=>{switched++}}));
  const hidden={name:"config_json",value:'{"version":1,"jobs":[]}',callback(){}};
  const node=new PlanNode();Object.assign(node,{id:3,comfyClass:"BV Regional LUT Plan",widgets:[hidden],inputs:[],outputs:[],graph:{nodes:[],setDirtyCanvas(){dirtyCalls++}},addWidget(_type,name,_value,callback){const widget={name,callback};this.widgets.push(widget);return widget}});node.graph.nodes=[node,target];
  assert.equal(node.onNodeCreated(),"plan-created");await new Promise(resolve=>queueMicrotask(resolve));
  const action=node.widgets.find(item=>item.name==="configure_lut_plan");assert.equal(action.label,"Connect a BV Regional Prompt");assert.equal(action.disabled,true);
  document={regions:[{id:"r1",name:"Region 1",enabled:true}]};node.onConfigure?.();await new Promise(resolve=>queueMicrotask(resolve));
  assert.equal(node.widgets.filter(item=>item.name==="configure_lut_plan").length,1);assert.equal(action.label,"Configure LUT Plan · 0 Jobs");assert.equal(action.disabled,false);
  action.callback();assert.equal(planOptions.nodeId,"3");planOptions.save('{"version":1,"jobs":[]}');planOptions.onNavigate("9",true);assert.equal(switched,1);assert.ok(dirtyCalls>=2);
});

test("Nodes 2.0 projection is idempotent after its final visibility state",()=>{
  let hidden=false,writes=0;
  const row=nodes2Row("regional");
  Object.defineProperty(row,"hidden",{get:()=>hidden,set:value=>{hidden=Boolean(value);writes++},configurable:true});
  const element={dataset:{},querySelectorAll(selector){
    if(selector===".lg-slot--output")return[row];
    return[];
  }};
  const node={id:10,inputs:[],outputs:[{name:"regional",links:null}],widgets:[]};
  const documentLike={querySelector:()=>element};
  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  const settledWrites=writes;
  projectNodes2NodePresentation(node,"BV Regional Prompt",documentLike,{legacyDebug:false});
  assert.equal(writes,settledWrites);
});

test("Nodes 2.0 observer disconnects when its last managed node is removed",()=>{
  const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  let disconnected=0;
  class Observer{observe(){}disconnect(){disconnected++}}
  const documentLike={querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{append(){}},body:{}};
  globalThis.document=documentLike;
  globalThis.MutationObserver=Observer;
  globalThis.requestAnimationFrame=()=>1;
  globalThis.cancelAnimationFrame=()=>{};
  try{
    const node={id:11};
    installNodes2NodePresentation(node,"BV Regional Prompt",documentLike);
    removeNodes2NodePresentation(node);
    assert.equal(disconnected,1);
  }finally{
    for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
});

test("Nodes 2.0 observer reapplies Classic presentation when the DOM renderer disappears",()=>{
  const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  let observerCallback,frameCallback,classic=0;
  class Observer{constructor(callback){observerCallback=callback}observe(){}disconnect(){}}
  const documentLike={querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{append(){}},body:{}};
  globalThis.document=documentLike;
  globalThis.MutationObserver=Observer;
  globalThis.requestAnimationFrame=callback=>{frameCallback=callback;return 1};
  globalThis.cancelAnimationFrame=()=>{};
  try{
    const node={id:12,graph:{},__bvApplyPresentation(){classic++}};
    installNodes2NodePresentation(node,"BV Regional Detailer Plan",documentLike);
    observerCallback();frameCallback();
    assert.equal(classic,1);
    observerCallback();frameCallback();
    assert.equal(classic,1);
    removeNodes2NodePresentation(node);
  }finally{
    for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value;
  }
});

test("Nodes 2.0 observer releases graphless managed nodes",()=>{
  const previous={document:globalThis.document,MutationObserver:globalThis.MutationObserver,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
  let observerCallback,frameCallback,disconnected=0;
  class Observer{constructor(callback){observerCallback=callback}observe(){}disconnect(){disconnected++}}
  const documentLike={querySelector:()=>null,getElementById:()=>null,createElement:()=>({}),head:{append(){}},body:{}};
  globalThis.document=documentLike;globalThis.MutationObserver=Observer;
  globalThis.requestAnimationFrame=callback=>{frameCallback=callback;return 1};globalThis.cancelAnimationFrame=()=>{};
  try{
    const node={id:13,graph:{}};
    installNodes2NodePresentation(node,"BV Detector Registry",documentLike);
    node.graph=null;observerCallback();frameCallback();
    assert.equal(node.__bvApplyNodes2Presentation,undefined);
    assert.equal(disconnected,1);
  }finally{for(const[key,value]of Object.entries(previous))value===undefined?delete globalThis[key]:globalThis[key]=value}
});

test("managed Regional Prompt never receives a delayed projected-port resize",async()=>{
  let writes=0;
  const node={__bvPresentationManaged:true,setSize(){writes++}};
  scheduleCompactLoraConsumerNode(node);
  await new Promise(resolve=>setTimeout(resolve,175));
  assert.equal(writes,0);
});

test("removing presentation cancels pending projected-port layout callbacks",async()=>{
  let writes=0;
  const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null};markProjectedProvider(provider);
  const node={size:[280,160],properties:{},inputs:[provider],outputs:[],widgets:[],computeSize(){return[280,100]},setSize(size){writes++;this.size=[...size]}};
  scheduleProjectedPortLayout(node);
  removeNodePresentation(node);
  await new Promise(resolve=>setTimeout(resolve,175));
  assert.equal(writes,0);
  assert.equal(node.__bvProjectedPortLayoutScheduled,undefined);
  assert.equal(node.__bvRefreshProviderAnchors,undefined);
  assert.equal(Object.hasOwn(provider,"pos"),false);
});

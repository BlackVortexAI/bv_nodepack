import assert from "node:assert/strict";
import test from "node:test";

import { hasNodePresentationPolicy, REGIONAL_LORA_CONSUMER_NODE_TYPES, resolveNodePresentation } from "../ui/src/regional/nodePresentation.ts";
import { applyClassicNodePresentation, applyClassicSubgraphLayout } from "../ui/src/regional/classicNodePresentation.ts";
import { setLegacyDebugVisible } from "../ui/src/regional/legacyPorts.ts";
import { scheduleCompactLoraConsumerNode } from "../ui/src/regional/loraV3Graph.ts";
import { configureNodes2NodePresentation, installNodes2NodePresentation, projectNodes2NodePresentation, removeNodes2NodePresentation } from "../ui/src/regional/nodes2NodePresentation.ts";

const regionalPromptInventory = {
  ports: [
    { direction: "output", name: "regional", connected: false },
    { direction: "output", name: "lora_bindings", connected: false },
    { direction: "input", name: "resource_provider_1", connected: false },
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
    { direction: "input", name: "resource_provider", connected: false },
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

test("Control Center shares one technical-state and action contract on every surface",()=>{
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Control Center",controlCenterInventory,{surface,legacyDebug:false});
    assert.deepEqual(plan.widgets.map(({name,role,visible})=>[name,role,visible]),[
      ["bv_control_config_json","internalState",false],
      ["configure_control_center","public",true],
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
  applyClassicNodePresentation(node,"BV Control Center",{minWidth:320,compactWidgetOnly:true,widgetStartY:34});
  assert.deepEqual(node.size,[320,84]);
  assert.equal(sizes.length,1);
  assert.equal(node.widgets[0].hidden,true);
  assert.equal(node.widgets[0].y,0);
  assert.equal(node.widgets[0].last_y,0);
  assert.equal(node.widgets_start_y,34);
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

test("LUT Registry and LoRA Collector hide provider outputs and internal configuration on every surface",()=>{
  const fixtures=[
    ["BV LUT Registry",{ports:[{direction:"output",name:"lut_count",connected:false},{direction:"output",name:"registry_summary",connected:false},{direction:"output",name:"resource_provider",connected:true}],widgets:[{name:"config_json"},{name:"configure_lut_registry"}]}],
    ["BV LoRA Stack Collector",{ports:[{direction:"input",name:"lora_registry",connected:false},{direction:"output",name:"resource_provider",connected:true}],widgets:[{name:"collector_id"}]}],
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

test("Named LoRA Stack hides only its generated identity on every surface",()=>{
  const inventory={ports:[{direction:"input",name:"lora_stack",connected:false},{direction:"input",name:"registry",connected:false},{direction:"output",name:"registry",connected:false}],widgets:[{name:"name"},{name:"stack_id"}]};
  for(const surface of["classic","ghost","nodes2"]){
    const plan=resolveNodePresentation("BV Named LoRA Stack",inventory,{surface,legacyDebug:false});
    assert.ok(plan.ports.every(({role,visible})=>role==="public"&&visible));
    assert.deepEqual(plan.widgets.map(({name,role,visible})=>[name,role,visible]),[["name","public",true],["stack_id","internalState",false]]);
  }
});

test("Detector Registry hides external reserves only in Ghost and always hides provider state",()=>{
  const inventory={
    ports:[
      ...Array.from({length:10},(_,index)=>({direction:"input",name:`external_detector_${index+1}`,connected:index===0})),
      {direction:"output",name:"detector_registry",connected:false},{direction:"output",name:"detector_count",connected:false},{direction:"output",name:"registry_summary",connected:false},{direction:"output",name:"resource_provider",connected:true},
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
      ["resource_provider", "provider", false],
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
  assert.deepEqual(ghost.ports.find(({name})=>name==="regional_json"),{
    direction:"input",name:"regional_json",connected:false,role:"internalState",visible:false,
  });
  assert.ok(ghost.widgets.every(({visible})=>!visible));
});

function regionalPromptNode(){
  const sizes=[];
  const node={
    size:[300,260],
    properties:{},
    inputs:[{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null}],
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
  assert.ok(node.widgets.slice(0,5).every(widget=>widget.hidden));

  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:true});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  assert.equal(node.outputs.find(port=>port.name==="lora_bindings").hidden,false);
  assert.equal(node.inputs[0].hidden,true);

  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.deepEqual(node.size,[300,120]);
  assert.equal(sizes.length,1);
  applyClassicNodePresentation(node,"BV Regional Prompt",{legacyDebug:false});
  assert.equal(sizes.length,1);
  assert.equal(node.properties.bvProjectedUserHeight,undefined);
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
      {name:"resource_provider",link:null},
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
  assert.deepEqual(node.inputs.map(port=>port.hidden),[false,true,true]);
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
  let reconciliations=0;
  const node={
    __bvPresentationHasLegacy:false,
    __bvApplyPresentation(){reconciliations++},
    outputs:[{name:"regional",links:null}],
  };
  const graph={_nodes:[node],setDirtyCanvas(){}};
  setLegacyDebugVisible(true,graph);
  setLegacyDebugVisible(false,graph);
  assert.equal(reconciliations,0);
});

function nodes2Row(text=""){
  return{hidden:false,style:{display:"",visibility:""},textContent:text,closest(){return null}};
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

test("Regional LoRA Nodes 2.0 removes internal and provider rows without changing in debug mode",()=>{
  const inputRows=[nodes2Row("regional"),nodes2Row("resource_provider"),nodes2Row("resource_provider_1")];
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
  const node={id:2,inputs:[{name:"regional"},{name:"resource_provider"},{name:"resource_provider_1"}],outputs:[{name:"regional"}],widgets:[
    {name:"operation"},{name:"config_json"},{name:"open_lora_editor"},
  ]};

  for(const legacyDebug of[false,true,false]){
    assert.equal(projectNodes2NodePresentation(node,"BV Regional LoRA",documentLike,{legacyDebug}),true);
    assert.deepEqual(inputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["none",""],["none",""]]);
    assert.deepEqual(outputRows.map(row=>[row.style.display,row.style.visibility]),[["",""]]);
    assert.deepEqual(widgetRows.map(row=>[row.style.display,row.style.visibility]),[["none",""],["none",""],["",""]]);
  }

  const lateProvider=nodes2Row("resource_provider_2");
  inputRows.push(lateProvider);
  node.inputs.push({name:"resource_provider_2"});
  projectNodes2NodePresentation(node,"BV Regional LoRA",documentLike,{legacyDebug:false});
  assert.equal(lateProvider.style.display,"none");
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

test("Regional Detailer Plan Nodes 2.0 hides providers and JSON while preserving its legacy row geometry",()=>{
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
  assert.deepEqual(inputRows.map(row=>[row.style.display,row.style.visibility]),[["",""],["","hidden"],["none",""],["none",""]]);
  assert.deepEqual(outputRows.map(row=>row.style.display),["","",""]);
  assert.deepEqual(widgetRows.map(row=>row.style.display),["none",""]);
  projectNodes2NodePresentation(node,"BV Regional Detailer Plan",{querySelector:()=>element},{legacyDebug:true});
  assert.equal(inputRows[1].style.visibility,"");
  assert.deepEqual(inputRows.slice(2).map(row=>row.style.display),["none","none"]);
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

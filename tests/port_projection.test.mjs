import assert from"node:assert/strict";
import test from"node:test";
import{compactProjectedPortLayout,configureProjectedPortLayout,installProjectedPortLayout,installProjectedProviderAnchors,installRegionalPromptCreationLayout,markProjectedProvider,reconcileDeferredPublicInputs,refreshProjectedProviderAnchors,removeProjectedProviderAnchors,retainNeededProjectedInputs,scheduleProjectedPortLayout,setProjectedSlotLabel,suppressInitialProjectedProviderDefinitions}from"../ui/src/regional/portProjection.ts";
import{setLegacyDebugVisible}from"../ui/src/regional/legacyPorts.ts";

const provider=(name,link=null)=>({name,type:"BV_RUNTIME_RESOURCE_PROVIDER",link});
test("projected native port follows collapse and expand without a resize event",()=>{
 const slot=provider("resource_provider"),normal={name:"alpha",type:"STRING"},node={size:[400,180],flags:{collapsed:false},_collapsed_width:120,outputs:[slot,normal]};
 markProjectedProvider(slot);refreshProjectedProviderAnchors(node,true);
 assert.deepEqual(slot.pos,[400,-15]);node.flags.collapsed=true;
 assert.deepEqual(slot.pos,[120,-15]);node._collapsed_width=150;
 assert.deepEqual(slot.pos,[150,-15]);node.flags.collapsed=false;
 assert.deepEqual(slot.pos,[400,-15]);assert.equal(Object.hasOwn(normal,"pos"),false);
 removeProjectedProviderAnchors(node);assert.equal(Object.hasOwn(slot,"pos"),false);
});
test("DG display name survives serialization without changing internal identity",()=>{
  for(const side of ["inputs","outputs"]){const slot=provider("__bv_dg_"+"route_".repeat(40)),name=slot.name;markProjectedProvider(slot);setProjectedSlotLabel(slot,"DG");
    const restored=JSON.parse(JSON.stringify({[side]:[slot]}))[side][0];assert.equal(restored.name,name);assert.equal(restored.label||restored.localized_name||restored.name,"DG");assert.equal(restored.hidden,true);
  }
});
test("hidden DG names do not set minimum width on either side while public constraints survive",()=>{
  for(const side of ["inputs","outputs"]){
    const dg=provider("__bv_dg_route_"+"identity_".repeat(30));markProjectedProvider(dg);
    const normal={name:"alpha",type:"STRING",links:[71]},node={size:[900,100],properties:{},inputs:[],outputs:[],titleWidth:180,widgetWidth:200,
      computeSize(){return[Math.max(220,this.titleWidth,this.widgetWidth,...[...this.inputs,...this.outputs].map(slot=>40+String(slot.label||slot.name).length*8)),100]},setSize(size){this.size=size}};
    node[side]=[normal,dg];installProjectedPortLayout(node);
    assert.equal(node.computeSize()[0],220);
    compactProjectedPortLayout(node);assert.equal(node.size[0],900,"retain chosen width");
    node.setSize([240,100]);compactProjectedPortLayout(node);assert.equal(node.size[0],240,"allow manual shrink");
    normal.name="public_label_".repeat(30);assert.equal(node.computeSize()[0],40+normal.name.length*8);
    normal.name="alpha";node.titleWidth=400;assert.equal(node.computeSize()[0],400);
    node.widgetWidth=500;assert.equal(node.computeSize()[0],500);
    assert.equal(node[side][0],normal);assert.equal(node[side][1],dg);assert.deepEqual(normal.links,[71]);
    assert.equal(dg.name,"__bv_dg_route_"+"identity_".repeat(30));
  }
});
function fixture(){const observed=[],node={size:[320,520],properties:{},inputs:Array.from({length:20},(_,index)=>provider(`resource_provider_${index+1}`)),outputs:[{name:"regional",type:"BV_REGIONAL"},{name:"legacy",type:"LEGACY",hidden:true,__bvLegacyPort:true}],widgets:[{}],computeSize(){observed.push({inputs:this.inputs.length,outputs:this.outputs.length});return[300,80+Math.max(this.inputs.length,this.outputs.length)*20]},setSize(size){this.size=size;this.onResize?.(size)}};return{node,observed}}

test("projected layout computes normal spacing without hidden providers or hidden legacy ports",()=>{const{node,observed}=fixture();node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);assert.deepEqual(observed.at(-1),{inputs:0,outputs:1});assert.deepEqual(node.size,[320,100]);assert.equal(node.inputs.length,20)});

test("projected layout publishes only the final size instead of a transient minimum height",()=>{const{node}=fixture();node.inputs.forEach(markProjectedProvider);const sizes=[],setSize=node.setSize;node.setSize=function(size){sizes.push([...size]);setSize.call(this,size)};compactProjectedPortLayout(node);assert.deepEqual(sizes,[[320,100]])});

test("measurement does not mutate a LiteGraph-style shared size accessor",()=>{const backing=[320,520],node={properties:{},inputs:Array.from({length:20},(_,index)=>provider(`resource_provider_${index+1}`)),outputs:[{name:"regional"}],widgets:[{}],get size(){return backing},set size(value){backing.splice(0,2,...value)},computeSize(){return[300,80+Math.max(this.inputs.length,this.outputs.length)*20]},setSize(size){this.size=size}};node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);assert.deepEqual(backing,[320,100])});

test("classic widget arrangement padding is included in the single final size",()=>{const{node}=fixture();node.inputs.forEach(markProjectedProvider);node.__bvProjectedArrangementPadding=12;const sizes=[],setSize=node.setSize;node.setSize=function(size){sizes.push([...size]);setSize.call(this,size)};compactProjectedPortLayout(node);assert.deepEqual(sizes,[[320,112]])});

test("only a real canvas drag persists manual node height",()=>{let dragging=false;configureProjectedPortLayout({isUserResizing:()=>dragging});const{node}=fixture();node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);node.setSize([360,520]);compactProjectedPortLayout(node);assert.deepEqual(node.size,[360,100]);dragging=true;node.setSize([360,260]);dragging=false;compactProjectedPortLayout(node);assert.deepEqual(node.size,[360,260]);assert.equal(node.properties.bvPresentationUserHeight,260);assert.equal(node.properties.bvPresentationSizeVersion,1);configureProjectedPortLayout({})});

test("a resize gesture on another node does not persist an automatic height",()=>{let resizingNode;configureProjectedPortLayout({isUserResizing:node=>resizingNode===node});const{node}=fixture();node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);resizingNode={id:"other"};node.setSize([360,260]);resizingNode=undefined;assert.equal(node.properties.bvPresentationUserHeight,undefined);compactProjectedPortLayout(node);assert.deepEqual(node.size,[360,100]);configureProjectedPortLayout({})});

test("explicit versioned projected user heights migrate once into the central contract",()=>{const{node}=fixture();node.properties={bvProjectedLayoutVersion:1,bvProjectedUserHeight:520};node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);assert.deepEqual(node.size,[320,520]);assert.equal(node.properties.bvProjectedUserHeight,undefined);assert.equal(node.properties.bvProjectedLayoutVersion,undefined);assert.equal(node.properties.bvPresentationUserHeight,520);assert.equal(node.properties.bvPresentationSizeVersion,1)});

test("unversioned or invalid projected heights are discarded instead of becoming user state",()=>{for(const properties of[{bvProjectedUserHeight:520},{bvProjectedLayoutVersion:1,bvProjectedUserHeight:-1},{bvProjectedLayoutVersion:1,bvProjectedUserHeight:"520"}]){const{node}=fixture();node.properties={...properties};node.inputs.forEach(markProjectedProvider);compactProjectedPortLayout(node);assert.deepEqual(node.size,[320,100]);assert.equal(node.properties.bvProjectedUserHeight,undefined);assert.equal(node.properties.bvProjectedLayoutVersion,undefined);assert.equal(node.properties.bvPresentationUserHeight,undefined)}});

test("scheduled layout waits until the current UI construction turn is complete",async()=>{const{node}=fixture();node.inputs.forEach(markProjectedProvider);let calls=0;const setSize=node.setSize;node.setSize=function(size){calls++;setSize.call(this,size)};scheduleProjectedPortLayout(node);assert.equal(calls,0);node.widgets.push({name:"final_button"});await new Promise(resolve=>setTimeout(resolve,10));assert.ok(calls>0)});

test("scheduled layout defers every size write until an active user resize ends",async()=>{let resizing=true;configureProjectedPortLayout({isUserResizing:()=>resizing});const{node}=fixture();node.inputs.forEach(markProjectedProvider);let calls=0;const setSize=node.setSize;node.setSize=function(size){calls++;setSize.call(this,size)};scheduleProjectedPortLayout(node);await new Promise(resolve=>setTimeout(resolve,175));assert.equal(calls,0);resizing=false;await new Promise(resolve=>setTimeout(resolve,175));assert.ok(calls>0);configureProjectedPortLayout({})});

test("debug mode projects all wireless providers onto the titlebar without a body row",()=>{const{node,observed}=fixture();node.inputs.forEach(markProjectedProvider);setLegacyDebugVisible(true);try{compactProjectedPortLayout(node);assert.deepEqual(observed.at(-1),{inputs:0,outputs:1});assert.equal(node.inputs.length,20);assert.ok(node.inputs.every(slot=>Object.getOwnPropertyDescriptor(slot,"pos")?.enumerable===false));assert.ok(node.inputs.every(slot=>JSON.stringify(slot).includes("pos")===false))}finally{setLegacyDebugVisible(false);refreshProjectedProviderAnchors(node)}});

test("central titlebar anchors preserve first middle and last graph slots on both directions",()=>{
  for(const direction of["input","output"])for(const providerIndex of[0,1,2]){
    const slots=[{name:"before",type:"A",link:null},{name:"middle",type:"B",link:null},{name:"after",type:"C",link:null}],slot={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:71,links:[71]};slots[providerIndex]=slot;markProjectedProvider(slot);
    const node={size:[280,160],inputs:direction==="input"?slots:[],outputs:direction==="output"?slots:[]},array=direction==="input"?node.inputs:node.outputs,refs=[...array],before=JSON.stringify(node);
    const report=refreshProjectedProviderAnchors(node,true),descriptor=Object.getOwnPropertyDescriptor(slot,"pos");
    assert.deepEqual(report,{enabled:true,projected:1,blocked:0});assert.deepEqual(slot.pos,[direction==="input"?0:280,-15]);assert.equal(descriptor.enumerable,false);assert.equal(JSON.stringify(node),before);assert.equal(array[providerIndex],slot);refs.forEach((value,index)=>assert.equal(array[index],value));
    assert.deepEqual(refreshProjectedProviderAnchors(node,false),{enabled:false,projected:0,blocked:0});assert.equal(Object.hasOwn(slot,"pos"),false);
  }
});

test("installed titlebar anchors track resize, share fan-in geometry and restore exact position state",()=>{
  const inherited=[4,5],prototype={pos:inherited},first=Object.assign(Object.create(prototype),provider("resource_provider_1",7)),second=provider("resource_provider_2",8),output={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[7,8]};
  const node={size:[260,180],inputs:[{name:"image",type:"IMAGE",link:null},first,second],outputs:[output],onResize(){this.resized=(this.resized??0)+1}};[first,second,output].forEach(markProjectedProvider);
  setLegacyDebugVisible(true);try{
    assert.deepEqual(installProjectedProviderAnchors(node),{enabled:true,projected:3,blocked:0});assert.deepEqual(first.pos,[0,-15]);assert.deepEqual(second.pos,[0,-15]);assert.deepEqual(output.pos,[260,-15]);
    node.size[0]=340;node.onResize();assert.equal(node.resized,1);assert.deepEqual(output.pos,[340,-15]);
  }finally{setLegacyDebugVisible(false);removeProjectedProviderAnchors(node)}
  assert.equal(Object.hasOwn(first,"pos"),false);assert.equal(first.pos,inherited);assert.equal(Object.hasOwn(second,"pos"),false);assert.equal(Object.hasOwn(output,"pos"),false);
});

test("removing titlebar anchors survives later projected-layout resizes without wrapper stacking",()=>{
  const slot=provider("resource_provider",7),node={size:[260,180],properties:{},inputs:[slot],outputs:[],computeSize(){return[260,100]},onResize(){this.nativeResizes=(this.nativeResizes??0)+1},setSize(size){this.size=size;this.onResize?.(size)}};markProjectedProvider(slot);
  setLegacyDebugVisible(true);try{
    installProjectedProviderAnchors(node,true);installProjectedPortLayout(node);assert.deepEqual(slot.pos,[0,-15]);
    assert.equal(removeProjectedProviderAnchors(node),true);assert.equal(Object.hasOwn(slot,"pos"),false);
    node.size=[300,180];node.onResize();assert.equal(node.nativeResizes,1);assert.equal(Object.hasOwn(slot,"pos"),false);
    installProjectedProviderAnchors(node,true);const wrapper=node.onResize;installProjectedProviderAnchors(node,true);assert.equal(node.onResize,wrapper);
    removeProjectedProviderAnchors(node);node.onResize();assert.equal(node.nativeResizes,2);assert.equal(Object.hasOwn(slot,"pos"),false);
  }finally{setLegacyDebugVisible(false);removeProjectedProviderAnchors(node)}
});

test("titlebar projection excludes widget inputs and blocks non-configurable provider positions",()=>{
  const widgetProvider={name:"resource_provider_widget",type:"BV_RUNTIME_RESOURCE_PROVIDER",widget:{name:"resource_provider_widget"}},widgetOutput={name:"resource_provider_output",type:"BV_RUNTIME_RESOURCE_PROVIDER",widget:{name:"output_metadata"}},blocked=provider("resource_provider",7);Object.defineProperty(blocked,"pos",{value:[9,10],configurable:false,enumerable:true});markProjectedProvider(widgetProvider);markProjectedProvider(widgetOutput);markProjectedProvider(blocked);
  const node={size:[220,100],inputs:[widgetProvider,blocked],outputs:[widgetOutput]},before=Object.getOwnPropertyDescriptor(blocked,"pos"),report=refreshProjectedProviderAnchors(node,true);
  assert.deepEqual(report,{enabled:true,projected:1,blocked:1});assert.equal(Object.hasOwn(widgetProvider,"pos"),false);assert.deepEqual(widgetOutput.pos,[220,-15]);assert.deepEqual(Object.getOwnPropertyDescriptor(blocked,"pos"),before);
});

test("global debug toggles project and restore anchors through the central graph refresh",()=>{
  const slot=provider("resource_provider",31),graph={_nodes:[],setDirtyCanvas(){this.dirty=(this.dirty??0)+1}},node={size:[240,120],inputs:[slot],outputs:[],graph,setDirtyCanvas(){this.dirty=(this.dirty??0)+1}};graph._nodes=[node];markProjectedProvider(slot);
  setLegacyDebugVisible(false);installProjectedProviderAnchors(node,false);
  try{setLegacyDebugVisible(true,node.graph);assert.deepEqual(slot.pos,[0,-15]);setLegacyDebugVisible(false,node.graph);assert.equal(Object.hasOwn(slot,"pos"),false);assert.ok(node.dirty>0);assert.ok(node.graph.dirty>0)}finally{setLegacyDebugVisible(false);removeProjectedProviderAnchors(node)}
});

test("dynamic provider replacement restores old geometry and serializes stable slot links",()=>{
  const first=provider("resource_provider_1",41),second=provider("resource_provider_2",42),node={size:[260,120],inputs:[{name:"alpha",type:"STRING",link:11},first,{name:"omega",type:"STRING",link:12}],outputs:[]};markProjectedProvider(first);
  refreshProjectedProviderAnchors(node,true);const persisted=JSON.parse(JSON.stringify(node));assert.deepEqual(persisted.inputs.map(slot=>slot.link),[11,41,12]);assert.ok(persisted.inputs.every(slot=>!("pos"in slot)));
  node.inputs[1]=second;markProjectedProvider(second);refreshProjectedProviderAnchors(node,true);assert.equal(Object.hasOwn(first,"pos"),false);assert.deepEqual(second.pos,[0,-15]);assert.deepEqual(node.inputs.map(slot=>slot.link),[11,42,12]);
  removeProjectedProviderAnchors(node);assert.equal(Object.hasOwn(second,"pos"),false);
});

test("projected input retention removes only unused ports and preserves linked legacy state",()=>{const node={inputs:[provider("wanted"),provider("stale"),provider("linked",7),{name:"legacy",type:"LEGACY",link:null,__bvLegacyPort:true}],removeInput(index){this.inputs.splice(index,1)}};retainNeededProjectedInputs(node,["wanted"],slot=>slot.type==="BV_RUNTIME_RESOURCE_PROVIDER");assert.deepEqual(node.inputs.map(item=>item.name),["wanted","linked","legacy"]);assert.equal(node.inputs[0].__bvM0ResourceSlot,true)});

test("slot labels update classic and Nodes 2.0 names together",()=>{const slot={name:"plan"};setProjectedSlotLabel(slot,"regional or LUT plan");assert.equal(slot.label,"regional or LUT plan");assert.equal(slot.localized_name,"regional or LUT plan")});

test("classic node creation omits projected providers before its first canvas frame",()=>{const nodeData={input:{optional:{regional_json:["STRING",{}],resource_provider_1:["BV_RUNTIME_RESOURCE_PROVIDER",{forceInput:true}],detailer_resource_provider_1:["BV_RUNTIME_RESOURCE_PROVIDER",{forceInput:true}],unrelated:["IMAGE",{forceInput:true}]}}};assert.deepEqual(suppressInitialProjectedProviderDefinitions(nodeData),["resource_provider_1","detailer_resource_provider_1"]);assert.deepEqual(Object.keys(nodeData.input.optional),["regional_json","unrelated"])});

test("deferred public input is appended after provider reconciliation without rebuilding linked slots",()=>{
  const nodeData={input:{optional:{resource_provider_1:["BV_RUNTIME_RESOURCE_PROVIDER",{forceInput:true}],canvas_image:["IMAGE",{}]}}};
  assert.deepEqual(suppressInitialProjectedProviderDefinitions(nodeData,["canvas_image"]),["resource_provider_1","canvas_image"]);
  const linked=provider("resource_provider_1",72),node={inputs:[linked],addInput(name,type,options){const slot={name,type,options,link:null};this.inputs.push(slot);return slot}};
  const [canvas]=reconcileDeferredPublicInputs(node,nodeData);assert.equal(node.inputs[0],linked);assert.equal(node.inputs[0].link,72);assert.equal(node.inputs[1],canvas);assert.equal(canvas.name,"canvas_image");assert.equal(canvas.type,"IMAGE");
  assert.equal(reconcileDeferredPublicInputs(node,nodeData)[0],canvas);assert.equal(node.inputs.length,2);
});

test("Regional Prompt configure compatibility preserves every provider slot and saved target index",()=>{
  const names=["resource_provider",...Array.from({length:20},(_,index)=>`resource_provider_${index+1}`),...Array.from({length:10},(_,index)=>`detailer_resource_provider_${index+1}`),...Array.from({length:20},(_,index)=>`lut_resource_provider_${index+1}`)];
  const optional=Object.fromEntries([...names.map(name=>[name,["BV_RUNTIME_RESOURCE_PROVIDER",{forceInput:true}]]),["canvas_image",["IMAGE",{}]]]),nodeData={input:{optional}};
  suppressInitialProjectedProviderDefinitions(nodeData,["canvas_image"]);
  const inputs=names.map((name,index)=>({name,type:"BV_RUNTIME_RESOURCE_PROVIDER",link:9000+index})),refs=[...inputs],links=inputs.map(slot=>slot.link),saved=inputs.map((slot,target_slot)=>({target_slot,link:slot.link}));
  const node={inputs,addInput(name,type,options){const slot={name,type,options,link:null};this.inputs.push(slot);return slot}};
  reconcileDeferredPublicInputs(node,nodeData);reconcileDeferredPublicInputs(node,nodeData);
  refs.forEach((slot,index)=>{assert.equal(node.inputs[index],slot);assert.equal(node.inputs[index].link,links[index]);assert.deepEqual(saved[index],{target_slot:index,link:slot.link})});
  assert.equal(node.inputs.length,refs.length+1);assert.equal(node.inputs.at(-1).name,"canvas_image");assert.equal(node.inputs.at(-1).link,null);
});

test("classic Regional Prompt preview measures the final two-button shell before upgrade",()=>{function Node(){}Node.prototype.computeSize=function(){return[220,40+(this.widgets?.length??0)*20+Math.max(this.inputs?.length??0,this.outputs?.length??0)*20]};installRegionalPromptCreationLayout(Node);const node=new Node();node.inputs=[provider("resource_provider_1")];node.outputs=[{name:"regional"},{name:"lora_bindings"}];node.widgets=Array.from({length:5},()=>({type:"text"}));assert.deepEqual(node.computeSize(),[220,100]);node.__bvRegionalPromptUiReady=true;assert.deepEqual(node.computeSize(),[220,180])});

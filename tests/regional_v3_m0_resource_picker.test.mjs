import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "../ui/node_modules/react/index.js";
import { renderToStaticMarkup } from "../ui/node_modules/react-dom/server.node.js";
import { ResourcePicker } from "../ui/src/ui/components/ResourcePicker.tsx";
import { M0ResourcePickerPanel } from "../ui/src/regional/M0ResourcePickerPanel.tsx";
import { sanitizeM0MultiSelections, sanitizeM0SingleSelection } from "../ui/src/regional/m0Selections.ts";
import { compactM0HiddenProviderSlots, ensureM0CollectorOutput, ensureM0ConsumerInput, ensureM0MultiConsumerInputs } from "../ui/src/regional/m0GraphContract.ts";
import { installM0CanvasVisibility, markM0NodeElement, projectedProviderLink } from "../ui/src/regional/m0VisualProjection.ts";
import { resolveM0LocalLinkedCollector } from "../ui/src/regional/m0LocalGraph.ts";
import { setLegacyDebugVisible } from "../ui/src/regional/legacyPorts.ts";

const collectors=[{id:"collector-1",label:"Collector One",resources:[{id:"resource-1",label:"Alpha"}]}];

test("Subgraph conversion preserves bindings while native links are temporarily unavailable",()=>{
  const original=[{binding_id:"binding-1",collector_id:"collector-1",resource_id:"resource-1"}];let disconnected=0;
  const node={widgets:[{name:"resource_bindings",value:JSON.stringify(original)}],inputs:[{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",link:7}],graph:{_nodes:[],links:new Map()},disconnectInput(){disconnected++}};
  sanitizeM0MultiSelections(node);
  assert.deepEqual(JSON.parse(node.widgets[0].value),original);assert.equal(node.inputs[0].link,7);assert.equal(disconnected,0);
});

test("Subgraph conversion preserves a single unresolved selection and pending link",()=>{
  const node={widgets:[{name:"collector_id",value:"collector-1"},{name:"resource_id",value:"resource-1"}],inputs:[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",link:7}],graph:{_nodes:[],links:new Map()},disconnectInput(){throw new Error("pending native link was disconnected")}};
  sanitizeM0SingleSelection(node);
  assert.deepEqual(node.widgets.map(item=>item.value),["collector-1","resource-1"]);assert.equal(node.inputs[0].link,7);
});

test("a catalog match without a real link stays visibly unresolved",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:false,onSelection(){}}));
  assert.match(html,/is-unresolved/);
  assert.doesNotMatch(html,/Unresolved resource selection/);
  assert.doesNotMatch(html,/Collector One \/ Alpha/);
});

test("a linked id selection renders one closed BV resource dropdown",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,onSelection(){}}));
  assert.match(html,/>Alpha</);assert.doesNotMatch(html,/>Collector One</);assert.doesNotMatch(html,/Collector One \/ Alpha/);
});

test("Nodes 2.0 graph slots are repaired idempotently before linking",()=>{
  const collector={outputs:[],addOutput(name,type){this.outputs.push({name,type,links:null})}};
  const consumer={inputs:[],addInput(name,type){this.inputs.push({name,type,link:null})}};
  assert.equal(ensureM0CollectorOutput(collector),0);
  assert.equal(ensureM0ConsumerInput(consumer),0);
  assert.equal(ensureM0CollectorOutput(collector),0);
  assert.equal(ensureM0ConsumerInput(consumer),0);
  assert.deepEqual(collector.outputs,[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",links:null}]);
  assert.deepEqual(consumer.inputs,[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",link:null}]);
});

test("multi fan-in keeps twenty independently named native graph inputs",()=>{
  const consumer={inputs:[],addInput(name,type){this.inputs.push({name,type,link:null})}};
  assert.equal(ensureM0MultiConsumerInputs(consumer).length,20);
  assert.equal(ensureM0MultiConsumerInputs(consumer).length,20);
  assert.equal(consumer.inputs.length,20);
  assert.equal(consumer.inputs[0].name,"resource_provider_1");
  assert.equal(consumer.inputs[19].name,"resource_provider_20");
  assert.ok(consumer.inputs.every(input=>input.type==="BV_RUNTIME_RESOURCE_PROVIDER_M0"));
});

test("an exposed subgraph input cannot resolve an external collector",()=>{
  const collector={id:1,__bvM0ResourceProvider:true,widgets:[{name:"collector_id",value:"c1"}]};
  const root={id:"root",_nodes:[],links:new Map(),subgraphs:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const subgraph={id:"sub",rootGraph:root,_nodes:[],links:new Map(),outputs:[],getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const host={id:2,graph:root,subgraph,inputs:[{link:10}],isSubgraphNode(){return true}};
  const consumer={id:3,graph:subgraph,inputs:[{name:"resource_provider",link:11}]};
  root._nodes.push(collector,host);root.subgraphs.set(subgraph.id,subgraph);subgraph._nodes.push(consumer);
  root.links.set(10,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  subgraph.links.set(11,{origin_id:-10,origin_slot:0,target_id:3,target_slot:0});
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider"),null);
});

test("an exposed subgraph output cannot expose an internal collector to a parent consumer",()=>{
  const root={id:"root",_nodes:[],links:new Map(),subgraphs:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const subgraph={id:"sub",rootGraph:root,_nodes:[],links:new Map(),outputs:[{linkIds:[21]}],getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const collector={id:4,graph:subgraph,__bvM0ResourceProvider:true,widgets:[{name:"collector_id",value:"c1"}]};
  const host={id:2,graph:root,subgraph,outputs:[{links:[20]}],isSubgraphNode(){return true}};
  const consumer={id:3,graph:root,inputs:[{name:"resource_provider",link:20}]};
  root._nodes.push(host,consumer);root.subgraphs.set(subgraph.id,subgraph);subgraph._nodes.push(collector);
  root.links.set(20,{origin_id:2,origin_slot:0,target_id:3,target_slot:0});
  subgraph.links.set(21,{origin_id:4,origin_slot:0,target_id:-20,target_slot:0});
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider"),null);
});

test("a direct same-graph link resolves its local collector",()=>{
  const graph={_nodes:[],links:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const collector={id:1,graph,__bvM0ResourceProvider:true},consumer={id:2,graph,inputs:[{name:"resource_provider",link:1}]};graph._nodes.push(collector,consumer);
  graph.links.set(1,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider"),collector);
});
test("M0 multi fan-in removes hidden provider rows from the persisted node height",()=>{
  let applied;const consumer={size:[300,520],computeSize:()=>[300,520],setSize:size=>{applied=size}};
  compactM0HiddenProviderSlots(consumer,20);assert.deepEqual(applied,[300,120]);
});

test("the shared resource picker uses BV popover selects and treats empty as neutral",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"",resourceId:"",resolved:false,onSelection(){}}));
  assert.doesNotMatch(html,/No resource selected|Unresolved resource selection|bv-resource-picker-summary|<select\b/);
  assert.match(html,/aria-haspopup="listbox"/);
});

test("renderer slot migration resolves only through a real local link and the persisted collector id",()=>{
  const graph={_nodes:[],_links:new Map(),links:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const first={id:1,graph,__bvM0ResourceProvider:true},second={id:2,graph,__bvM0ResourceProvider:true};
  const consumer={id:3,graph,inputs:[{name:"resource_provider_1",link:null}]};graph._nodes.push(first,second,consumer);
  graph.links.set(9,{origin_id:2,target_id:3,target_slot:7});
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider_1",source=>source===second),second);
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider_1",source=>source===first),null);
});

test("renderer migration resolves a typed provider before its UI upgrade marker is restored",()=>{
  const graph={_nodes:[],_links:new Map([[1,{origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:"BV_RUNTIME_RESOURCE_PROVIDER_M0"}]]),getNodeById(id){return this._nodes.find(node=>node.id===id)}};
  const collector={id:1,graph,outputs:[{type:"BV_RUNTIME_RESOURCE_PROVIDER_M0"}]};
  const consumer={id:2,graph,inputs:[{name:"resource_provider",link:1}]};
  graph._nodes.push(collector,consumer);
  assert.equal(resolveM0LocalLinkedCollector(consumer,"resource_provider"),collector);
});

test("the shared picker panel exposes a non-serialized debug control",()=>{
  const html=renderToStaticMarkup(React.createElement(M0ResourcePickerPanel,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,debugVisible:false,onSelection(){},onDebug(){}}));
  assert.match(html,/Hidden link debug/);
  assert.match(html,/role="switch"/);
  assert.doesNotMatch(html,/>Collector One</);assert.match(html,/>Alpha</);
});

test("Nodes 2.0 hides every persisted id widget without leaving click overlays",()=>{
  const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
  for(const name of ["collector_id","resource_id","resource_a_id","resource_b_id"]){
    assert.match(styles,new RegExp(`input\\[aria-label="${name}"\\]`));
  }
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/host\.style\.position="relative"/);
  assert.match(source,/host\.style\.zIndex="1"/);
  assert.match(styles,/node-type="BV M0 Fake Resource Collector"/);
  assert.match(styles,/node-type="BV M0 Fake Resource Consumer"/);
  assert.match(source,/addEventListener\("executed",listener\)/);
});

test("a stale Nodes 2.0 marker retry cannot overwrite the current debug state",()=>{
  const queued=[],classes=new Map(),element={
    classList:{add(name){classes.set(name,true)},toggle(name,value){classes.set(name,Boolean(value))}},
    querySelectorAll(){return[]},
  };
  const previousDocument=globalThis.document,previousCss=globalThis.CSS,previousTimeout=globalThis.setTimeout;
  globalThis.document={querySelector(){return element}};
  globalThis.CSS={escape:String};
  globalThis.setTimeout=callback=>{queued.push(callback);return queued.length};
  const node={id:7,inputs:[]};
  try{
    markM0NodeElement(node,"collector",false);
    markM0NodeElement(node,"collector",true);
    assert.equal(classes.get("bv-m0-debug"),true);
    queued[0]();
    assert.equal(classes.get("bv-m0-debug"),true);
  }finally{
    globalThis.document=previousDocument;globalThis.CSS=previousCss;globalThis.setTimeout=previousTimeout;
  }
});

test("Nodes 2.0 provider ports are hidden by their stable type, including subgraph proxies",()=>{
  const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
  assert.match(styles,/\.lg-slot:has\(circle\[fill\*="BV_RUNTIME_RESOURCE_PROVIDER_M0"\],\[style\*="BV_RUNTIME_RESOURCE_PROVIDER_M0"\]\)\{display:none!important\}/);
  assert.doesNotMatch(styles,/\.bv-m0-debug-active \.lg-slot/);
  assert.doesNotMatch(styles,/content:"(?:collectors|resources)"/);
});

test("the spike uses ordinary graph links without prompt hooks or name fallback",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  const traversal=readFileSync(new URL("../ui/src/regional/m0LocalGraph.ts",import.meta.url),"utf8");
  const selections=readFileSync(new URL("../ui/src/regional/m0Selections.ts",import.meta.url),"utf8");
  assert.match(source,/source\.connect\(output,node,input\)/);
  assert.match(traversal,/source\?\.graph===node\.graph/);
  assert.doesNotMatch(source,/graphToPrompt|queuePrompt|api\.queuePrompt/);
  assert.doesNotMatch(source,/find\([^\n]*(?:title|type).*collectorId/);
  assert.match(source,/input\.hidden=true/);
  assert.doesNotMatch(source,/MutationObserver/);
  assert.doesNotMatch(source,/allM0WorkflowGraphs|planM0CollectorConnection/);
  assert.match(source,/sanitizeM0SingleSelection/);
  assert.doesNotMatch(selections,/disconnectInput|collector_id=""|resource_id=""/);
  assert.match(source,/draw\(\);setDebug\(node,Boolean\(node\.properties\?\.bvM0DebugVisible\),false\)/);
  assert.match(source,/getMinHeight:\(\)=>/);
  assert.match(source,/host\.parentElement\?\.style\.position==="fixed"/);
  assert.match(source,/translateY\(-\$\{slots\*20\}px\)/);
  assert.match(source,/\[0,50,150,300\]\.forEach/);
});

test("a converted subgraph host projects its real root segment only in global debug mode",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",__bvM0ResourceSlot:true};
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",__bvM0ResourceSlot:true};
  const collector={id:1,__bvM0ResourceProvider:true,outputs:[output]};
  const subgraphHost={id:2,inputs:[input]};
  const nodes=new Map([[1,collector],[2,subgraphHost]]),seen={links:0,dash:null};
  const graph={_nodes:[collector,subgraphHost],links:new Map([[7,{id:7,origin_id:1,origin_slot:0,target_id:2,target_slot:0}]]),getNodeById(id){return nodes.get(id)}};
  const canvas={graph,renderLink(){seen.links++},drawNode(){}};
  installM0CanvasVisibility(canvas);
  const ctx={save(){},restore(){},setLineDash(value){seen.dash=value},lineDashOffset:0};
  setLegacyDebugVisible(false,graph);
  canvas.renderLink(ctx,null,null,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(seen.links,0);
  setLegacyDebugVisible(true,graph);
  canvas.renderLink(ctx,null,null,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(seen.links,1);assert.deepEqual(seen.dash,[7,5]);
  setLegacyDebugVisible(false,graph);
});

test("subgraph special input and output links classify by canonical slot index",()=>{
  const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER_M0"},ordinary={type:"IMAGE"};
  const consumer={id:4,inputs:[{type:provider.type}],outputs:[]};
  const collector={id:5,inputs:[],outputs:[{type:provider.type}]};
  const nodes=new Map([[4,consumer],[5,collector]]);
  const graph={inputNode:{id:-10,slots:[provider,ordinary]},outputNode:{id:-20,slots:[provider]},inputs:[provider,ordinary],outputs:[provider],getNodeById(id){return nodes.get(id)}};
  assert.equal(projectedProviderLink(graph,{origin_id:-10,origin_slot:0,target_id:4,target_slot:0}),true);
  assert.equal(projectedProviderLink(graph,{origin_id:-10,origin_slot:1,target_id:4,target_slot:0}),false);
  assert.equal(projectedProviderLink(graph,{origin_id:5,origin_slot:0,target_id:-20,target_slot:0}),true);
});

test("subgraph special I/O debug projection preserves graph truth",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER_M0"};
  const input={type:provider.type,link:11},output={type:provider.type,links:[12]};
  const consumer={id:4,inputs:[input],outputs:[]},collector={id:5,inputs:[],outputs:[output]};
  const nodes=new Map([[4,consumer],[5,collector]]),links=new Map([[11,{id:11,origin_id:-10,origin_slot:0,target_id:4,target_slot:0}],[12,{id:12,origin_id:5,origin_slot:0,target_id:-20,target_slot:0}]]);
  const graph={_nodes:[consumer,collector],links,inputNode:{id:-10,slots:[provider]},outputNode:{id:-20,slots:[provider]},inputs:[provider],outputs:[provider],getNodeById(id){return nodes.get(id)}};
  const seen=[],canvas={graph,renderLink(_ctx,_a,_b,link){seen.push(link.id)},drawNode(){}};
  const ctx={save(){},restore(){},setLineDash(){},lineDashOffset:0};
  installM0CanvasVisibility(canvas);setLegacyDebugVisible(false,graph);
  for(const link of links.values())canvas.renderLink(ctx,null,null,link);
  assert.deepEqual(seen,[]);
  setLegacyDebugVisible(true,graph);
  for(const link of links.values())canvas.renderLink(ctx,null,null,link);
  assert.deepEqual(seen,[11,12]);
  assert.equal(input.link,11);assert.deepEqual(output.links,[12]);assert.deepEqual([...links.keys()],[11,12]);
  setLegacyDebugVisible(false,graph);
});

test("debug provider segments use titlebar and inner subgraph-boundary anchors",()=>{
  setLegacyDebugVisible(true);
  try{
    const ctx={save(){},restore(){},setLineDash(){},lineDashOffset:0};
    const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER"};
    const sender={id:1,pos:[80,260],size:[280,80],outputs:[provider]};
    const ordinaryInputs=Array.from({length:10},(_,index)=>({name:`input_${index}`,type:"IMAGE",link:index+10}));
    const hostInputs=[provider,...ordinaryInputs],hostOutputs=[provider];
    const host={id:5,pos:[500,260],size:[240,80],inputs:hostInputs,outputs:hostOutputs};
    const receiver={id:4,pos:[900,260],size:[280,80],inputs:[provider]};
    const rootNodes=new Map([[1,sender],[5,host],[4,receiver]]),rootSeen=[];
    const rootCanvas={graph:{getNodeById(id){return rootNodes.get(id)}},drawNode(){},drawFrontCanvas(){},renderLink(_ctx,from,to){rootSeen.push([from,to])}};
    installM0CanvasVisibility(rootCanvas);
    rootCanvas.renderLink(ctx,[999,999],[888,888],{origin_id:1,origin_slot:0,target_id:5,target_slot:0},false,0);
    rootCanvas.renderLink(ctx,[999,999],[888,888],{origin_id:5,origin_slot:0,target_id:4,target_slot:0},false,0);
    assert.deepEqual(rootSeen,[[[360,245],[500,245]],[[740,245],[900,245]]]);
    assert.equal(host.inputs,hostInputs);assert.equal(host.outputs,hostOutputs);assert.deepEqual(host.inputs.slice(1),ordinaryInputs);
    ordinaryInputs.forEach((slot,index)=>{assert.equal(host.inputs[index+1],slot);assert.equal(slot.link,index+10)});

    const innerReceiver={id:3,pos:[260,80],size:[280,80],inputs:[provider]};
    const innerSender={id:2,pos:[420,300],size:[280,80],outputs:[provider]};
    const inputNode={id:-10,size:[48,68],slots:[provider]};
    const outputNode={id:-20,size:[48,68],slots:[provider]};
    const innerNodes=new Map([[3,innerReceiver],[2,innerSender]]),innerSeen=[];
    const innerCanvas={graph:{inputNode,outputNode,inputs:[provider],outputs:[provider],getNodeById(id){return innerNodes.get(id)}},drawNode(){},drawFrontCanvas(){},renderLink(_ctx,from,to){innerSeen.push([from,to])}};
    installM0CanvasVisibility(innerCanvas);
    innerCanvas.renderLink(ctx,[116,148],[888,888],{origin_id:-10,origin_slot:0,target_id:3,target_slot:0},false,0);
    innerCanvas.renderLink(ctx,[999,999],[832,368],{origin_id:2,origin_slot:0,target_id:-20,target_slot:0},false,0);
    assert.deepEqual(innerSeen,[[[116,128],[260,65]],[[700,285],[832,348]]]);
  }finally{setLegacyDebugVisible(false)}
});

test("subgraph DG anchors are exactly one port above the first ordinary boundary port",()=>{
  setLegacyDebugVisible(true);
  try{
    const ctx={save(){},restore(){},setLineDash(){}};
    const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER",__bvDgAnchor:true,__bvM0PortHidden:true},ordinary={type:"IMAGE"},receiver={id:3,pos:[300,100],size:[200,80],inputs:[provider]};
    const inputNode={id:-10,slots:[{name:"samples",type:"IMAGE",pos:[140,200]},{name:"technical",type:"*",pos:[140,220]}]};
    const nodes=new Map([[-99,inputNode],[3,receiver]]),seen=[];
    const canvas={graph:{inputNode,inputs:[ordinary,provider],getNodeById(id){return nodes.get(id)}},drawNode(){},drawFrontCanvas(){},renderLink(_ctx,from,to){seen.push([from,to])}};
    installM0CanvasVisibility(canvas);canvas.renderLink(ctx,[140,220],[300,120],{origin_id:-99,origin_slot:1,target_id:3,target_slot:0},false,0);
    assert.deepEqual(seen[0][0],[140,180]);
  }finally{setLegacyDebugVisible(false)}
});

test("output DG anchor stays above ordinary port one on a native special output node",()=>{
  setLegacyDebugVisible(true);
  try{
    const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER"},ordinary={name:"IMAGE",type:"IMAGE",pos:[800,200]},technical={...provider,pos:[800,220],measurement:{minHeight:20,maxHeight:20,desiredHeight:20}},add={name:"new",pos:[800,240]};
    const slots=[ordinary,technical],outputNode={id:-20,get slots(){return slots},get allSlots(){return [...slots,add]},arrange(){add.pos[1]=ordinary.pos[1]+20+technical.measurement.desiredHeight}};
    const sender={id:1,pos:[100,100],size:[200,80],outputs:[provider]},seen={};
    const canvas={graph:{outputNode,outputs:[ordinary,provider],getNodeById(id){return id===1?sender:outputNode}},drawNode(){},drawFrontCanvas(){seen.slots=outputNode.allSlots.map(slot=>slot.name)},renderLink(_ctx,from,to){seen.to=to}};
    installM0CanvasVisibility(canvas);canvas.drawFrontCanvas();canvas.renderLink({save(){},restore(){},setLineDash(){}},[300,85],[800,220],{origin_id:1,origin_slot:0,target_id:-20,target_slot:1});
    assert.deepEqual(seen.to,[800,180]);assert.deepEqual(seen.slots,["IMAGE","new"]);
    assert.equal(add.pos[1],220);assert.equal(technical.measurement.desiredHeight,0);assert.equal(outputNode.slots,slots);
  }finally{setLegacyDebugVisible(false)}
});

test("subgraph host input projection keeps ordinary port one while DG stays on the titlebar",()=>{
  setLegacyDebugVisible(true);
  try{
    const ctx={save(){},restore(){},setLineDash(){}};
    const provider={type:"BV_RUNTIME_RESOURCE_PROVIDER"},ordinary={name:"samples",type:"IMAGE",link:42};
    const child={inputs:[provider,ordinary],outputs:[]};
    const hostInputs=[{type:provider.type,link:11},ordinary],host={id:5,pos:[500,260],size:[240,80],inputs:hostInputs,outputs:[],subgraph:child};
    const sender={id:1,pos:[80,260],size:[280,80],outputs:[provider]},nodes=new Map([[1,sender],[5,host]]),seen={};
    const canvas={graph:{getNodeById(id){return nodes.get(id)}},drawFrontCanvas(){},drawNode(node){seen.visibleInputs=node.inputs.map(slot=>slot.name??"")},renderLink(_ctx,from,to){seen.link=[from,to]}};
    installM0CanvasVisibility(canvas);
    canvas.drawNode(host,ctx);
    canvas.renderLink(ctx,[360,245],[500,280],{origin_id:1,origin_slot:0,target_id:5,target_slot:0},false,0);
    assert.deepEqual(seen.visibleInputs,["samples"]);
    assert.deepEqual(seen.link,[[360,245],[500,245]]);
    assert.equal(host.inputs,hostInputs);assert.equal(host.inputs[1],ordinary);assert.equal(ordinary.link,42);
  }finally{setLegacyDebugVisible(false)}
});

test("the canvas projection hides links without replacing canonical Nodes 2.0 graph arrays",()=>{
  const input={name:"resource_provider",link:7,__bvM0VisualHidden:true};
  const output={name:"resource_provider",links:[7],__bvM0VisualHidden:true};
  const collector={id:1,inputs:[],outputs:[output]};
  const node={id:2,inputs:[input],outputs:[]};
  const seen={};
  const previousDocument=globalThis.document,previousCss=globalThis.CSS;
  globalThis.document={querySelector(){return {className:"lg-node"}}};
  globalThis.CSS={escape:String};
  const nodes=new Map([[1,collector],[2,node]]);
  const canvas={graph:{getNodeById(id){return nodes.get(id)}},renderLink(){seen.link=true},drawNode(candidate){seen.inputs=candidate.inputs.length}};
  try {
    installM0CanvasVisibility(canvas);
    canvas.renderLink({},[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
    canvas.drawNode(node,{});
  } finally {
    globalThis.document=previousDocument;globalThis.CSS=previousCss;
  }
  assert.deepEqual(seen,{inputs:1});
  assert.equal(input.link,7);
  assert.deepEqual(node.inputs,[input]);
  assert.deepEqual(collector.outputs,[output]);
});

test("the canvas projection marks legacy ports hidden without replacing graph arrays",()=>{
  const input={link:7,__bvM0VisualHidden:true},output={links:[7],__bvM0VisualHidden:true};
  const node={id:2,inputs:[input],outputs:[output]},seen={};
  const canvas={graph:{getNodeById(){return node}},renderLink(){},drawNode(candidate){seen.inputs=candidate.inputs.length;seen.outputs=candidate.outputs.length}};
  installM0CanvasVisibility(canvas);canvas.drawNode(node,{});
  assert.deepEqual(seen,{inputs:1,outputs:1});
  assert.equal(input.hidden,undefined);assert.equal(output.hidden,undefined);
  assert.deepEqual(node.inputs,[input]);assert.deepEqual(node.outputs,[output]);
});

test("classic canvas suppresses provider presentation without replacing canonical graph arrays",()=>{
  const draws=[];
  const slotPrototype={draw(){draws.push("provider")},drawCollapsed(){draws.push("provider-collapsed")}};
  const input=Object.assign(Object.create(slotPrototype),{name:"resource_provider",label:"Resource",localized_name:"Resource",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",link:7});
  const output=Object.assign(Object.create(slotPrototype),{name:"resource_provider",label:"Resource",localized_name:"Resource",type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",links:[7]});
  const ordinary={type:"IMAGE",draw(){draws.push("ordinary")}};
  const collector={id:1,inputs:[],outputs:[output]},consumer={id:2,__bvM0ResourceConsumer:true,inputs:[input],outputs:[],properties:{bvM0DebugVisible:true}},seen={};
  const nodes=new Map([[1,collector],[2,consumer]]),ctx={save(){},restore(){},setLineDash(){}};
  collector.outputs.push(ordinary);
  const collectorOutputs=collector.outputs,consumerInputs=consumer.inputs;
  const canvas={graph:{_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}},renderLink(){seen.link=true},drawNode(node){seen[node.id]=[node.outputs===collectorOutputs||node.inputs===consumerInputs,node.inputs.length,node.outputs.length,...[...node.inputs,...node.outputs].filter(slot=>slot.type==="BV_RUNTIME_RESOURCE_PROVIDER_M0").map(slot=>[slot.name,slot.label,slot.localized_name])];for(const slot of [...node.inputs,...node.outputs]){slot.draw?.();slot.drawCollapsed?.()}}};
  installM0CanvasVisibility(canvas);
  canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  canvas.drawNode(collector,ctx);canvas.drawNode(consumer,ctx);
  assert.deepEqual(seen,{1:[true,0,2,["","",""]],2:[true,1,0,["","",""]],link:true});
  assert.deepEqual(draws,["ordinary"]);
  assert.equal(collector.outputs,collectorOutputs);assert.equal(consumer.inputs,consumerInputs);
  assert.equal(output.name,"resource_provider");assert.equal(input.label,"Resource");
  assert.equal(Object.hasOwn(output,"draw"),false);assert.equal(Object.hasOwn(input,"draw"),false);
  assert.equal(output.draw,slotPrototype.draw);assert.equal(input.drawCollapsed,slotPrototype.drawCollapsed);
  assert.deepEqual(collector.outputs,[output,ordinary]);assert.deepEqual(consumer.inputs,[input]);
});

test("virtual subgraph I/O provider slots are portless for one draw and restore exactly",()=>{
  const draws=[];
  const prototype={draw(){draws.push("slot")},drawCollapsed(){draws.push("collapsed")}};
  const provider=Object.assign(Object.create(prototype),{name:"resource_provider",label:"Provider",localized_name:"Provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",linkIds:[11]});
  const ordinary={name:"image",type:"IMAGE",draw(){draws.push("ordinary")}};
  const slots=[provider,ordinary],virtualNode={id:-10,get slots(){return slots},get allSlots(){return [...slots,{name:"new"}]}};
  const seen={};
  const canvas={graph:{inputNode:virtualNode},renderLink(){},drawFrontCanvas(){seen.frontSlots=virtualNode.allSlots.map(slot=>slot.name)},drawNode(node){seen.same=node.slots===slots;seen.visibleSlots=node.slots.map(slot=>slot.name);seen.visibleAll=node.allSlots.map(slot=>slot.name);seen.provider=[provider.name,provider.label,provider.localized_name,provider.hidden];for(const slot of node.slots)slot.draw?.()}};
  installM0CanvasVisibility(canvas);
  canvas.drawFrontCanvas();
  assert.deepEqual(seen.frontSlots,["image","new"]);assert.equal(virtualNode.slots,slots);
  canvas.drawNode(virtualNode,{});
  assert.equal(seen.same,false);assert.deepEqual(seen.visibleSlots,["image"]);assert.deepEqual(seen.visibleAll,["image","new"]);assert.deepEqual(draws,["ordinary"]);
  assert.deepEqual(seen.provider,["","","",true]);
  assert.equal(virtualNode.slots,slots);assert.deepEqual(virtualNode.allSlots.map(slot=>slot.name),["resource_provider","image","new"]);assert.equal(provider.name,"resource_provider");assert.equal(provider.label,"Provider");assert.equal(provider.hidden,undefined);
  assert.equal(Object.hasOwn(provider,"draw"),false);assert.equal(provider.draw,prototype.draw);assert.deepEqual(provider.linkIds,[11]);
});

test("multiple DG-only boundary channels share one anchor above Add during nested and throwing draws",()=>{
  for(const output of [false,true]){
    const providers=[0,1,2].map(index=>({name:"dg"+index,type:"BV_RUNTIME_RESOURCE_PROVIDER",pos:[100,200+index*20]})),add={name:"new",pos:[100,260]};
    const virtual={id:output?-20:-10,emptySlot:add,get slots(){return providers},get allSlots(){return [...providers,add]}},node={id:1,inputs:providers,outputs:providers,pos:[400,300],size:[200,80]};
    const graph={inputs:output?[]:providers,outputs:output?providers:[],inputNode:output?undefined:virtual,outputNode:output?virtual:undefined,getNodeById(id){return id===1?node:virtual}};
    const ctx={save(){},restore(){},setLineDash(){}},seen=[];let nested=false,throws=false;
    const link=index=>output?{origin_id:1,origin_slot:index,target_id:-20,target_slot:index}:{origin_id:-10,origin_slot:index,target_id:1,target_slot:index};
    const canvas={graph,drawNode(){},renderLink(_ctx,a,b){seen.push(output?b:a)},drawFrontCanvas(){
      for(let i=0;i<3;i++)this.renderLink(ctx,[100,200+i*20],[100,200+i*20],link(i));
      if(!nested){nested=true;this.drawFrontCanvas();nested=false}if(throws)throw new Error("draw failure");
    }};
    setLegacyDebugVisible(true,graph);installM0CanvasVisibility(canvas);
    try{canvas.drawFrontCanvas();assert.ok(seen.length>=6);assert.ok(seen.every(pos=>pos[0]===100&&pos[1]===240));
      throws=true;assert.throws(()=>canvas.drawFrontCanvas(),/draw failure/);assert.equal(virtual.slots,providers);
      add.pos=[150,360];seen.length=0;canvas.renderLink(ctx,[0,0],[0,0],link(2));assert.deepEqual(seen,[[150,340]],"no draw-local snapshot may leak into the next frame");
    }finally{setLegacyDebugVisible(false)}
  }
});

test("virtual input filtering follows graph definitions when Comfy boundary slots are unmarked",()=>{
  const measurement={minHeight:20,maxHeight:20,desiredHeight:20},sample={name:"samples",type:"IMAGE",pos:[100,200]},technical={name:"technical",type:"*",pos:[100,220],measurement},add={name:"new",pos:[100,240]};
  const slots=[sample,technical],arrangements=[],virtualNode={id:-10,emptySlot:add,size:[50,60],get slots(){return slots},get allSlots(){return [...slots,add]},arrange(){arrangements.push([measurement.minHeight,measurement.maxHeight,measurement.desiredHeight])}};
  const seen={};
  const canvas={graph:{inputNode:virtualNode,inputs:[{name:"samples",type:"IMAGE"},{name:"__bv_dg",type:"BV_RUNTIME_RESOURCE_PROVIDER",__bvM0PortHidden:true}]},renderLink(){},drawFrontCanvas(){seen.front=virtualNode.allSlots.map(slot=>slot.name)},drawNode(node){seen.node=node.slots.map(slot=>slot.name);seen.all=node.allSlots.map(slot=>slot.name)}};
  installM0CanvasVisibility(canvas);canvas.drawFrontCanvas();canvas.drawNode(virtualNode,{});
  assert.deepEqual(seen,{front:["samples","new"],node:["samples"],all:["samples","new"]});
  assert.deepEqual(arrangements,[[0,0,0],[0,0,0]]);
  assert.equal(virtualNode.slots,slots);assert.deepEqual(virtualNode.allSlots,[sample,technical,add]);
  assert.deepEqual([sample.pos,technical.pos,add.pos],[[100,200],[100,220],[100,240]]);
  assert.deepEqual(measurement,{minHeight:0,maxHeight:0,desiredHeight:0});
});

test("debug rendering gives native M0 links a dashed animated projection",()=>{
  const input={link:7,__bvM0ResourceSlot:true},output={links:[7],__bvM0ResourceSlot:true};
  const collector={id:1,outputs:[output]},consumer={id:2,__bvM0ResourceConsumer:true,inputs:[input],properties:{bvM0DebugVisible:true}},seen={};
  const ctx={lineDashOffset:0,save(){seen.saved=true},restore(){seen.restored=true},setLineDash(value){seen.dash=value}};
  const nodes=new Map([[1,collector],[2,consumer]]);
  const canvas={graph:{_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}},__bvExportTimeSeconds:0,renderLink(...args){(seen.offsets??=[]).push(args[0].lineDashOffset);seen.flow=args[5]},drawNode(){}};
  installM0CanvasVisibility(canvas);
  canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0},false,null,null,0,0);
  canvas.__bvExportTimeSeconds=0.045;
  canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0},false,null,null,0,0);
  assert.deepEqual(seen.dash,[7,5]);
  assert.equal(seen.offsets.length,2);assert.equal(Math.abs(seen.offsets[0]),0);assert.equal(seen.offsets[1],-1);
  assert.equal(typeof seen.flow,"number");
  assert.equal(seen.saved,true);assert.equal(seen.restored,true);
  assert.equal(input.link,7);
});

test("rendering a visible debug provider link advances real background link frames without interaction",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const previousFrame=globalThis.requestAnimationFrame,previousDocument=globalThis.document,frames=[];
  globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
  globalThis.document={documentElement:{classList:{toggle(){}}}};
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER"},output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER"};
  const collector={id:1,outputs:[output]},consumer={id:2,inputs:[input]},nodes=new Map([[1,collector],[2,consumer]]);
  const graph={_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)},setDirtyCanvas(){}};
  const seenOffsets=[];
  const canvas={graph,dirty:[],__bvExportTimeSeconds:0,setDirty(foreground,background){this.dirty.push([foreground,background]);if(background){this.__bvExportTimeSeconds+=0.045;this.renderLink(ctx,[0,0],[1,1],link)}},setDirtyCanvas(){throw new Error("setDirtyCanvas fallback must not run when setDirty exists")},renderLink(context){seenOffsets.push(context.lineDashOffset)},drawNode(){}};
  const ctx={lineDashOffset:0,save(){},restore(){},setLineDash(){}};
  const link={origin_id:1,origin_slot:0,target_id:2,target_slot:0};
  try{
    setLegacyDebugVisible(true,graph);
    installM0CanvasVisibility(canvas);
    assert.equal(frames.length,0,"the persisted debug state starts before a canvas is available");
    canvas.renderLink(ctx,[0,0],[1,1],link);
    assert.equal(frames.length,1,"the first visible provider render must start the animation loop");
    for(let index=0;index<4;index++){frames.shift()();assert.equal(frames.length,1)}
    assert.deepEqual(canvas.dirty,Array.from({length:4},()=>[false,true]));
    assert.deepEqual(seenOffsets,[0,-1,-2,-3,-4]);
    setLegacyDebugVisible(false,graph);frames.shift()();
    assert.equal(frames.length,0);assert.equal(canvas.__bvM0DebugAnimation,false);
    setLegacyDebugVisible(true,graph);canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
    assert.equal(frames.length,1,"a fully stopped canvas must restart exactly one loop");
  }finally{
    setLegacyDebugVisible(false,graph);
    frames.shift()?.();
    globalThis.requestAnimationFrame=previousFrame;globalThis.document=previousDocument;
  }
});

test("debug animation stops after the last provider edge is removed and restarts once on reconnect",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const previousFrame=globalThis.requestAnimationFrame,previousDocument=globalThis.document,frames=[];
  globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
  globalThis.document={documentElement:{classList:{toggle(){}}}};
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER"},output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER"};
  const collector={id:1,outputs:[output]},consumer={id:2,inputs:[input]},nodes=new Map([[1,collector],[2,consumer]]);
  const graph={_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}};
  const dirty=[];
  const canvas={graph,setDirty(foreground,background){dirty.push([foreground,background])},renderLink(){},drawNode(){}};
  const ctx={lineDashOffset:0,save(){},restore(){},setLineDash(){}};
  const link={origin_id:1,origin_slot:0,target_id:2,target_slot:0};
  try{
    setLegacyDebugVisible(true,graph);installM0CanvasVisibility(canvas);canvas.renderLink(ctx,[0,0],[1,1],link);
    assert.equal(frames.length,1);
    frames.shift()();assert.deepEqual(dirty,[[false,true]]);assert.equal(frames.length,1);
    input.link=null;output.links=[];
    frames.shift()();
    assert.deepEqual(dirty,[[false,true]],"removing the last edge must not invalidate another background frame");
    assert.equal(frames.length,0);assert.equal(canvas.__bvM0DebugAnimation,false);
    input.link=8;output.links=[8];canvas.renderLink(ctx,[0,0],[1,1],{...link,id:8});
    assert.equal(frames.length,1,"reconnecting must restart exactly one loop");
    canvas.renderLink(ctx,[0,0],[1,1],{...link,id:8});
    assert.equal(frames.length,1,"rendering the same reconnected edge must not duplicate the loop");
  }finally{
    setLegacyDebugVisible(false,graph);frames.shift()?.();
    globalThis.requestAnimationFrame=previousFrame;globalThis.document=previousDocument;
  }
});

test("debug animation uses the background fallback and stops when its graph changes",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const previousFrame=globalThis.requestAnimationFrame,previousDocument=globalThis.document,frames=[];
  globalThis.requestAnimationFrame=callback=>{frames.push(callback);return frames.length};
  globalThis.document={documentElement:{classList:{toggle(){}}}};
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER"},output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER"};
  const collector={id:1,outputs:[output]},consumer={id:2,inputs:[input]},nodes=new Map([[1,collector],[2,consumer]]);
  const graph={_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}},dirty=[];
  const canvas={graph,setDirtyCanvas(foreground,background){dirty.push([foreground,background])},renderLink(){},drawNode(){}};
  const ctx={lineDashOffset:0,save(){},restore(){},setLineDash(){}};
  try{
    setLegacyDebugVisible(true,graph);installM0CanvasVisibility(canvas);
    canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
    frames.shift()();assert.deepEqual(dirty,[[false,true]]);assert.equal(frames.length,1);
    canvas.graph={_nodes:[],getNodeById(){}};frames.shift()();
    assert.equal(frames.length,0);assert.equal(canvas.__bvM0DebugAnimation,false);
  }finally{setLegacyDebugVisible(false,graph);globalThis.requestAnimationFrame=previousFrame;globalThis.document=previousDocument}
});

test("workflow debug reveals native V3 provider links with the debug projection",async()=>{
  const {setLegacyDebugVisible}=await import("../ui/src/regional/legacyPorts.ts");
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER"},output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER"};
  const collector={id:1,outputs:[output]},consumer={id:2,inputs:[input]},seen={};
  const ctx={lineDashOffset:0,save(){},restore(){},setLineDash(value){seen.dash=value}};
  const nodes=new Map([[1,collector],[2,consumer]]),graph={_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}};
  const canvas={graph,renderLink(){seen.link=true},drawNode(){}};
  installM0CanvasVisibility(canvas);
  setLegacyDebugVisible(false,graph);canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(seen.link,undefined);
  setLegacyDebugVisible(true,graph);canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(seen.link,true);assert.deepEqual(seen.dash,[7,5]);
  setLegacyDebugVisible(false,graph);
});

test("DG host fan-in follows every move even when the first provider has no rendered edge",()=>{
  setLegacyDebugVisible(true);
  try{
    const provider=()=>({type:"BV_RUNTIME_RESOURCE_PROVIDER",__bvM0ResourceSlot:true});
    const ordinary={name:"samples",type:"IMAGE",link:20};
    const host={id:2,pos:[400,200],size:[240,80],inputs:[provider(),provider(),ordinary],outputs:[provider()],subgraph:{}};
    const sender={id:1,pos:[0,100],size:[200,80],outputs:[provider()]},receiver={id:3,pos:[900,100],size:[200,80],inputs:[provider()]};
    const nodes=new Map([[1,sender],[2,host],[3,receiver]]),seen=[];
    const canvas={graph:{getNodeById(id){return nodes.get(id)}},drawNode(){},renderLink(_ctx,a,b){seen.push([a,b])}};
    const ctx={save(){},restore(){},setLineDash(){}};installM0CanvasVisibility(canvas);
    const incoming={origin_id:1,origin_slot:0,target_id:2,target_slot:1},outgoing={origin_id:2,origin_slot:0,target_id:3,target_slot:0};
    for(const [x,y,width] of [[400,200,240],[620,350,240],[280,150,320]]){
      host.pos[0]=x;host.pos[1]=y;host.size[0]=width;
      // Each drag frame renders the connected second provider only. No edge ever refreshes slot 0.
      canvas.renderLink(ctx,[200,85],[400,185],incoming);
      canvas.renderLink(ctx,[640,185],[900,85],outgoing);
      assert.deepEqual(seen.at(-2)[1],[x,y-15]);assert.deepEqual(seen.at(-1)[0],[x+width,y-15]);
      canvas.renderLink(ctx,[200,85],[999,999],{...incoming,target_slot:0});
      assert.deepEqual(seen.at(-1)[1],[x,y-15],"anchor-first and anchor-last share the current point");
      canvas.renderLink(ctx,[10,20],[30,40],{...incoming,target_slot:2});
      assert.deepEqual(seen.at(-1),[[10,20],[30,40]],"ordinary link geometry is not projected");
      assert.equal(host.inputs[2],ordinary);assert.equal(ordinary.link,20);
    }
  }finally{setLegacyDebugVisible(false)}
});

test("multi debug projects every native edge onto one visual fan-in anchor",()=>{
  const outputs=[{links:[1],__bvM0ResourceSlot:true},{links:[2],__bvM0ResourceSlot:true}];
  const target={id:3,__bvM0ResourceConsumer:true,__bvM0FanInAnchorSlot:0,properties:{bvM0DebugVisible:true},inputs:[{link:1,__bvM0ResourceSlot:true},{link:2,__bvM0ResourceSlot:true}],getConnectionPos(input,slot){assert.equal(input,true);assert.equal(slot,0);return[9,11]}};
  const nodes=new Map([[1,{id:1,outputs:[outputs[0]]}],[2,{id:2,outputs:[outputs[1]]}],[3,target]]),ends=[];
  const ctx={lineDashOffset:0,save(){},restore(){},setLineDash(){}};
  const canvas={graph:{_nodes:[...nodes.values()],getNodeById(id){return nodes.get(id)}},renderLink(ctx,a,b){ends.push(b)},drawNode(){}};
  installM0CanvasVisibility(canvas);
  canvas.renderLink(ctx,[0,0],[3,4],{origin_id:1,origin_slot:0,target_id:3,target_slot:0},false,null,null,0,0);
  canvas.renderLink(ctx,[0,0],[5,6],{origin_id:2,origin_slot:0,target_id:3,target_slot:1},false,null,null,0,0);
  assert.deepEqual(ends,[[3,4],[3,4]]);
  assert.equal(target.inputs[0].link,1);assert.equal(target.inputs[1].link,2);
});

test("copy remapping is based on stable ids and the copied real link",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/crypto\.randomUUID\(\)/);
  assert.match(source,/source\?\.__bvM0IdRemap/);
  assert.match(source,/remap\.collector\[String\(cid\.value\)\]/);
  assert.match(source,/remap\.resources\[String\(rid\.value\)\]/);
  assert.match(source,/function applyMultiLinkedRemaps/);
  assert.match(source,/linkedCollectorAt\(node,index\)\?\.__bvM0IdRemap/);
  assert.match(source,/function repairMultiBindingIds/);
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "../ui/node_modules/react/index.js";
import { renderToStaticMarkup } from "../ui/node_modules/react-dom/server.node.js";
import { ResourcePicker } from "../ui/src/ui/components/ResourcePicker.tsx";
import { M0ResourcePickerPanel } from "../ui/src/regional/M0ResourcePickerPanel.tsx";
import { ensureM0CollectorOutput, ensureM0ConsumerInput, ensureM0MultiConsumerInputs } from "../ui/src/regional/m0GraphContract.ts";
import { installM0CanvasVisibility, markM0NodeElement } from "../ui/src/regional/m0VisualProjection.ts";
import { resolveM0LocalLinkedCollector } from "../ui/src/regional/m0LocalGraph.ts";

const collectors=[{id:"collector-1",label:"Collector One",resources:[{id:"resource-1",label:"Alpha"}]}];

test("a catalog match without a real link stays visibly unresolved",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:false,onCollector(){},onResource(){}}));
  assert.match(html,/is-unresolved/);
  assert.doesNotMatch(html,/Unresolved resource selection/);
  assert.doesNotMatch(html,/Collector One \/ Alpha/);
});

test("a linked id selection renders both closed BV dropdown values without a duplicate summary",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,onCollector(){},onResource(){}}));
  assert.match(html,/>Collector One</);assert.match(html,/>Alpha</);assert.doesNotMatch(html,/Collector One \/ Alpha/);
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

test("the shared resource picker uses BV popover selects and treats empty as neutral",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"",resourceId:"",resolved:false,onCollector(){},onResource(){}}));
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
  const html=renderToStaticMarkup(React.createElement(M0ResourcePickerPanel,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,debugVisible:false,onCollector(){},onResource(){},onDebug(){}}));
  assert.match(html,/Hidden link debug/);
  assert.match(html,/role="switch"/);
  assert.match(html,/>Collector One</);assert.match(html,/>Alpha</);
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
  assert.match(source,/source\.connect\(output,node,input\)/);
  assert.match(traversal,/source\?\.graph===node\.graph/);
  assert.doesNotMatch(source,/graphToPrompt|queuePrompt|api\.queuePrompt/);
  assert.doesNotMatch(source,/find\([^\n]*(?:title|type).*collectorId/);
  assert.match(source,/input\.hidden=true/);
  assert.doesNotMatch(source,/MutationObserver/);
  assert.doesNotMatch(source,/allM0WorkflowGraphs|planM0CollectorConnection/);
  assert.match(source,/sanitizeSingleSelection/);
  assert.match(source,/draw\(\);setDebug\(node,Boolean\(node\.properties\?\.bvM0DebugVisible\),false\)/);
  assert.match(source,/getMinHeight:\(\)=>/);
  assert.match(source,/host\.parentElement\?\.style\.position==="fixed"/);
  assert.match(source,/translateY\(-\$\{slots\*20\}px\)/);
  assert.match(source,/\[0,50,150,300\]\.forEach/);
});

test("a converted subgraph host cannot keep root resource links in debug presentation",()=>{
  const output={links:[7],type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",__bvM0ResourceSlot:true};
  const input={link:7,type:"BV_RUNTIME_RESOURCE_PROVIDER_M0",__bvM0ResourceSlot:true};
  const collector={id:1,__bvM0ResourceProvider:true,outputs:[output]};
  const subgraphHost={id:2,properties:{bvM0DebugVisible:true},inputs:[input]};
  const nodes=new Map([[1,collector],[2,subgraphHost]]),seen={link:false};
  const canvas={graph:{_nodes:[collector,subgraphHost],getNodeById(id){return nodes.get(id)}},renderLink(){seen.link=true},drawNode(){}};
  installM0CanvasVisibility(canvas);
  const ctx={save(){},restore(){},setLineDash(){},lineDashOffset:0};
  canvas.renderLink(ctx,null,null,{origin_id:1,origin_slot:0,target_id:2,target_slot:0});
  assert.equal(seen.link,false);
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

test("debug rendering gives native M0 links a dashed animated projection",()=>{
  const input={link:7,__bvM0ResourceSlot:true},output={links:[7],__bvM0ResourceSlot:true};
  const collector={id:1,outputs:[output]},consumer={id:2,__bvM0ResourceConsumer:true,inputs:[input],properties:{bvM0DebugVisible:true}},seen={};
  const ctx={lineDashOffset:0,save(){seen.saved=true},restore(){seen.restored=true},setLineDash(value){seen.dash=value}};
  const nodes=new Map([[1,collector],[2,consumer]]);
  const canvas={graph:{_nodes:[collector,consumer],getNodeById(id){return nodes.get(id)}},renderLink(...args){seen.flow=args[5]},drawNode(){}};
  installM0CanvasVisibility(canvas);
  canvas.renderLink(ctx,[0,0],[1,1],{origin_id:1,origin_slot:0,target_id:2,target_slot:0},false,null,null,0,0);
  assert.deepEqual(seen.dash,[7,5]);
  assert.equal(typeof seen.flow,"number");
  assert.equal(seen.saved,true);assert.equal(seen.restored,true);
  assert.equal(input.link,7);
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

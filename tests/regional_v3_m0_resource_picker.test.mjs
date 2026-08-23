import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "../ui/node_modules/react/index.js";
import { renderToStaticMarkup } from "../ui/node_modules/react-dom/server.node.js";
import { ResourcePicker } from "../ui/src/ui/components/ResourcePicker.tsx";
import { M0ResourcePickerPanel } from "../ui/src/regional/M0ResourcePickerPanel.tsx";
import { ensureM0CollectorOutput, ensureM0ConsumerInput } from "../ui/src/regional/m0GraphContract.ts";
import { installM0CanvasVisibility } from "../ui/src/regional/m0VisualProjection.ts";

const collectors=[{id:"collector-1",label:"Collector One",resources:[{id:"resource-1",label:"Alpha"}]}];

test("a catalog match without a real link stays visibly unresolved",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:false,onCollector(){},onResource(){}}));
  assert.match(html,/is-unresolved/);
  assert.match(html,/Unresolved resource selection/);
  assert.doesNotMatch(html,/Collector One \/ Alpha/);
});

test("a linked id selection renders the closed Collector / Resource summary",()=>{
  const html=renderToStaticMarkup(React.createElement(ResourcePicker,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,onCollector(){},onResource(){}}));
  assert.match(html,/Collector One \/ Alpha/);
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

test("the shared picker panel exposes a non-serialized debug control",()=>{
  const html=renderToStaticMarkup(React.createElement(M0ResourcePickerPanel,{collectors,collectorId:"collector-1",resourceId:"resource-1",resolved:true,debugVisible:false,onCollector(){},onResource(){},onDebug(){}}));
  assert.match(html,/Hidden link debug/);
  assert.match(html,/role="switch"/);
  assert.match(html,/Collector One \/ Alpha/);
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

test("the spike uses ordinary graph links without prompt hooks or name fallback",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/source\.connect\(output,node,input\)/);
  assert.match(source,/link\.target_id/);
  assert.doesNotMatch(source,/graphToPrompt|queuePrompt|api\.queuePrompt/);
  assert.doesNotMatch(source,/find\([^\n]*(?:title|type).*collectorId/);
  assert.doesNotMatch(source,/input\.(?:hidden|bvHidden)\s*=/);
  assert.doesNotMatch(source,/MutationObserver/);
  assert.match(source,/draw\(\);setDebug\(node,Boolean\(node\.properties\?\.bvM0DebugVisible\),false\)/);
});

test("the canvas projection hides links without mutating canonical Nodes 2.0 graph arrays",()=>{
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

test("the canvas projection still hides legacy ports only during drawing",()=>{
  const input={link:7,__bvM0VisualHidden:true},output={links:[7],__bvM0VisualHidden:true};
  const node={id:2,inputs:[input],outputs:[output]},seen={};
  const canvas={graph:{getNodeById(){return node}},renderLink(){},drawNode(candidate){seen.inputs=candidate.inputs.length;seen.outputs=candidate.outputs.length}};
  installM0CanvasVisibility(canvas);canvas.drawNode(node,{});
  assert.deepEqual(seen,{inputs:0,outputs:0});
  assert.deepEqual(node.inputs,[input]);assert.deepEqual(node.outputs,[output]);
});

test("copy remapping is based on stable ids and the copied real link",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/crypto\.randomUUID\(\)/);
  assert.match(source,/source\?\.__bvM0IdRemap/);
  assert.match(source,/remap\.collector\[String\(cid\.value\)\]/);
  assert.match(source,/remap\.resources\[String\(rid\.value\)\]/);
});

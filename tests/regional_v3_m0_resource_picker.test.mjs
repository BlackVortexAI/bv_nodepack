import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "../ui/node_modules/react/index.js";
import { renderToStaticMarkup } from "../ui/node_modules/react-dom/server.node.js";
import { ResourcePicker } from "../ui/src/ui/components/ResourcePicker.tsx";

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

test("the spike uses ordinary graph links without prompt hooks or name fallback",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/source\.connect\(output,node,input\)/);
  assert.match(source,/link\.target_id/);
  assert.doesNotMatch(source,/graphToPrompt|queuePrompt|api\.queuePrompt/);
  assert.doesNotMatch(source,/find\([^\n]*(?:title|type).*collectorId/);
  assert.doesNotMatch(source,/MutationObserver|document\.querySelector/);
});

test("copy remapping is based on stable ids and the copied real link",()=>{
  const source=readFileSync(new URL("../ui/src/regional/m0ResourceSpike.tsx",import.meta.url),"utf8");
  assert.match(source,/crypto\.randomUUID\(\)/);
  assert.match(source,/source\?\.__bvM0IdRemap/);
  assert.match(source,/remap\.collector\[String\(cid\.value\)\]/);
  assert.match(source,/remap\.resources\[String\(rid\.value\)\]/);
});

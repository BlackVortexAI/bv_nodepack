import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "../ui/node_modules/react/index.js";
import {renderToStaticMarkup} from "../ui/node_modules/react-dom/server.node.js";
import {LoraV3ResourcePickerPanel} from "../ui/src/regional/LoraV3ResourcePickerPanel.tsx";
import {emptyLoraV3Config,parseLoraV3Config,serializeLoraV3Config} from "../ui/src/regional/loraV3Config.ts";

const collectors=[{id:"collector",label:"Styles",resources:[{id:"skin",label:"Skin"}]}];
test("the production picker renders Collector / Resource from persisted ids",()=>{
 const config={version:1,collector_id:"collector",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]};
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:true,onCollector(){},onResource(){},onAddExternal(){}}));
 assert.match(html,/Styles \/ Skin/);assert.match(html,/External LoRA Stack 1/);
});
test("an unresolved production selection remains explicit",()=>{
 const config={version:1,collector_id:"missing",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]};
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:false,onCollector(){},onResource(){},onAddExternal(){}}));
 assert.match(html,/Unresolved resource selection/);
});
test("config serialization is named and deterministic outside positional visual widgets",()=>{
 const value=emptyLoraV3Config();assert.deepEqual(parseLoraV3Config(serializeLoraV3Config(value)),value);
});
test("external entries cannot be created without a live collector resource",()=>{
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors:[],config:emptyLoraV3Config(),resolved:false,onCollector(){},onResource(){},onAddExternal(){}}));
 assert.match(html,/disabled=""/);
});
test("production LoRA presentation keeps ComfyUI links authoritative",()=>{
 const source=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
 assert.match(source,/serialize:false/);assert.match(source,/connectLoraConsumerTree/);assert.match(source,/__bvLoraCollectorIdRemap/);assert.match(source,/__bvLoraResourceIdRemap/);
 assert.match(source,/Open LoRA Editor/);assert.doesNotMatch(source,/addDOMWidget|ReactDOM/);
 assert.doesNotMatch(source,/graphToPrompt|queuePrompt|MutationObserver/);
});

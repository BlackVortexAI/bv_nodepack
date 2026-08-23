import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import React from "../ui/node_modules/react/index.js";
import {renderToStaticMarkup} from "../ui/node_modules/react-dom/server.node.js";
import {LoraV3ResourcePickerPanel,OptionalLoraV3ScopePicker,withoutLoraV3Target} from "../ui/src/regional/LoraV3ResourcePickerPanel.tsx";
import {emptyLoraV3Config,parseLoraV3Config,serializeLoraV3Config} from "../ui/src/regional/loraV3Config.ts";

const collectors=[{id:"collector",label:"Styles",resources:[{id:"skin",label:"Skin"}]}];
const editorSource=readFileSync(new URL("../ui/src/regional/LoraV3EditorWindow.tsx",import.meta.url),"utf8");
const pickerSource=readFileSync(new URL("../ui/src/regional/LoraV3ResourcePickerPanel.tsx",import.meta.url),"utf8");
const regionalEditorSource=readFileSync(new URL("../ui/src/regional/RegionalEditor.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
test("the production picker renders Collector / Resource from persisted ids",()=>{
 const config={version:1,collector_id:"collector",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]};
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:true,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onCollector(){},onResource(){},onAddExternal(){}}));
 assert.match(html,/Global/);assert.match(html,/LoRA Stack 1/);assert.doesNotMatch(html,/Styles \/ Skin/);
});
test("an unresolved production selection remains explicit",()=>{
 const config={version:1,collector_id:"missing",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]};
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:false,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onCollector(){},onResource(){},onAddExternal(){},onRemove(){}}));
 assert.match(html,/is-unresolved/);assert.doesNotMatch(html,/Unresolved resource selection/);
});
test("config serialization is named and deterministic outside positional visual widgets",()=>{
 const value=emptyLoraV3Config();assert.deepEqual(parseLoraV3Config(serializeLoraV3Config(value)),value);
});
test("external entries cannot be created without a live collector resource",()=>{
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors:[],config:emptyLoraV3Config(),resolved:false,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onCollector(){},onResource(){},onAddExternal(){},onRemove(){}}));
 assert.match(html,/disabled=""/);
});
test("the advanced LoRA editor groups multiple stacks below every assignment target",()=>{
 const config={version:1,collector_id:"collector",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"},{scope:"region",document_id:"doc",region_id:"left"}]}]};
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:true,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}},{value:"region:doc:left",label:"Left",target:{scope:"region",document_id:"doc",region_id:"left"}}],onCollector(){},onResource(){},onAddExternal(){}}));
 assert.match(html,/Global/);assert.match(html,/Left/);assert.match(html,/Add LoRA stack/);assert.doesNotMatch(html,/Assignment targets/);
});
test("Regional Prompt easy mode starts with a BV toggle and hides an unassigned picker",()=>{
 const html=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config:emptyLoraV3Config(),target:{scope:"global"},resolved:false,onCollector(){},onResource(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(html,/role="switch"/);assert.match(html,/LoRA disabled/);assert.doesNotMatch(html,/No resource selected|Collector/);
});
test("Regional Prompt easy mode renders every stack assigned to its scope",()=>{
 const config={version:1,collector_id:"collector",entries:[{id:"first",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]},{id:"second",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]};
 const html=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config,target:{scope:"global"},resolved:true,onCollector(){},onResource(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(html,/LoRA enabled/);assert.match(html,/LoRA Stack 1/);assert.match(html,/LoRA Stack 2/);assert.match(html,/Add LoRA stack/);
 assert.match(html,/aria-label="Remove LoRA Stack 1"/);assert.doesNotMatch(html,/>Remove</);
});
test("Regional Prompt easy mode changes scope immediately when the selected region changes",()=>{
 assert.doesNotMatch(pickerSource,/\[enabled,setEnabled\]=useState/);
 assert.match(regionalEditorSource,/OptionalLoraV3ScopePicker key=\{selectedRegion\.id\}/);
 const config={version:1,collector_id:"collector",entries:[{id:"left-entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"region",document_id:"doc",region_id:"left"}]}]};
 const right=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config,target:{scope:"region",document_id:"doc",region_id:"right"},resolved:true,onCollector(){},onResource(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(right,/LoRA disabled/);assert.doesNotMatch(right,/LoRA Stack 1/);
});
test("Regional Prompt keeps the LoRA toggle above the stack card without overlap",()=>{
 assert.match(styles,/\.bv-lora-v3-enable-row\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.doesNotMatch(styles,/\.bv-lora-v3-enable-row>\.bv-control-field\{[^}]*padding-top/);
});
test("adding an advanced LoRA stack commits through the graph-linking helper",()=>{
 assert.match(editorSource,/commitLoraV3Config\(node,next\)/);
 assert.doesNotMatch(editorSource,/writeNodeLoraV3Config\(node,next\)/);
});
test("the LoRA editor exposes ordered repeatable scope operations and participates in window visibility",()=>{
 assert.match(editorSource,/Add step/);assert.match(editorSource,/<SortableList/);assert.match(editorSource,/onReorder=/);
 assert.match(editorSource,/label="Target"/);assert.match(editorSource,/label="Operation"/);assert.match(editorSource,/crypto\.randomUUID\(\)/);
 assert.match(editorSource,/menuVisible=\{menuVisible\}/);assert.match(editorSource,/onMenuVisible=\{visible=>setWindowMenuVisible/);
});
test("removing one scope preserves shared assignments and the input config",()=>{
 const original={version:1,collector_id:"collector",entries:[{id:"shared",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"},{scope:"region",document_id:"doc",region_id:"left"}]}]};
 const next=withoutLoraV3Target(original,{scope:"global"},"shared");
 assert.deepEqual(next.entries[0].targets,[{scope:"region",document_id:"doc",region_id:"left"}]);assert.equal(original.entries[0].targets.length,2);
});
test("production LoRA presentation keeps ComfyUI links authoritative",()=>{
 const source=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
 assert.match(source,/serialize:false/);assert.match(source,/connectLoraConsumerTree/);assert.match(source,/__bvLoraCollectorIdRemap/);assert.match(source,/__bvLoraResourceIdRemap/);
 assert.match(source,/Open LoRA Editor/);assert.doesNotMatch(source,/addDOMWidget|ReactDOM/);
 assert.doesNotMatch(source,/graphToPrompt|queuePrompt|MutationObserver/);
});

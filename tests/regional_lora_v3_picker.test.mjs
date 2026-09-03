import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {register} from "node:module";
import React from "../ui/node_modules/react/index.js";
import {renderToStaticMarkup} from "../ui/node_modules/react-dom/server.node.js";
import {LoraV3ResourcePickerPanel,OptionalLoraV3ScopePicker,withoutLoraV3Target} from "../ui/src/regional/LoraV3ResourcePickerPanel.tsx";
import {emptyLoraV3Config,parseLoraV3Config,serializeLoraV3Config,updateLoraV3EntryCollector} from "../ui/src/regional/loraV3Config.ts";
import {resourcePickerOptions} from "../ui/src/ui/components/ResourcePicker.tsx";

const collectors=[{id:"collector",label:"Styles",resources:[{id:"skin",label:"Skin"}]}];
const editorSource=readFileSync(new URL("../ui/src/regional/LoraV3EditorWindow.tsx",import.meta.url),"utf8");
const pickerSource=readFileSync(new URL("../ui/src/regional/LoraV3ResourcePickerPanel.tsx",import.meta.url),"utf8");
const regionalEditorSource=readFileSync(new URL("../ui/src/regional/RegionalEditor.tsx",import.meta.url),"utf8");
const quickEditorSource=readFileSync(new URL("../ui/src/regional/QuickPromptEditor.tsx",import.meta.url),"utf8");
const dockSource=readFileSync(new URL("../ui/src/ui/dock.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const loraUiSource=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
const registryUiSource=readFileSync(new URL("../ui/src/regional/loraRegistryUi.tsx",import.meta.url),"utf8");

test("dynamic registry providers use the same identity and resource adapters as linked collectors",()=>{
 assert.match(loraUiSource,/id:loraProviderIdentity\(collector\)/);
 assert.match(loraUiSource,/resources:loraProviderResources\(collector\)/);
 assert.match(loraUiSource,/linkedLocalLoraCollectors\(node\)\.map\(loraProviderIdentity\)/);
 assert.match(registryUiSource,/__bvLoraCollectorIdRemap/);assert.match(registryUiSource,/__bvLoraResourceIdRemap/);
 assert.match(loraUiSource,/installLoraV3Ui\(nodeType:any,nodeData:any,graphOwner:/);
 assert.match(loraUiSource,/bindLoraV3Graph\(this,graphOwner\(this\)\)/);
});
test("same-named LoRA resources include their collector node ids",()=>{
 const options=resourcePickerOptions([
  {id:"collector-a",nodeId:"10",label:"BV LoRA Stack Collector",resources:[{id:"stack-a",label:"LoRA Stack"}]},
  {id:"collector-b",nodeId:"20",label:"BV LoRA Stack Collector",resources:[{id:"stack-b",label:"LoRA Stack"}]},
 ]);
 assert.deepEqual(options.map(item=>item.label),["LoRA Stack · BV LoRA Stack Collector · #10","LoRA Stack · BV LoRA Stack Collector · #20"]);
});
test("the production picker renders one resource choice from persisted ids",()=>{
 const config=parseLoraV3Config({version:1,collector_id:"collector",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]});
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:true,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onSelection(){},onAddExternal(){}}));
 assert.match(html,/Global/);assert.match(html,/LoRA Stack 1/);assert.match(html,/>Skin</);assert.doesNotMatch(html,/>Styles</);
});
test("an unresolved production selection remains explicit",()=>{
 const config=parseLoraV3Config({version:1,collector_id:"missing",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]});
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:false,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onSelection(){},onAddExternal(){},onRemove(){}}));
 assert.match(html,/is-unresolved/);assert.doesNotMatch(html,/Unresolved resource selection/);
});
test("config serialization is named and deterministic outside positional visual widgets",()=>{
 const value=emptyLoraV3Config();assert.deepEqual(parseLoraV3Config(serializeLoraV3Config(value)),value);
});
test("legacy single-collector config migrates every external entry losslessly",()=>{
 const legacy={version:1,collector_id:"collector-a",entries:[{id:"left",source:{kind:"external",resource_id:"a"},targets:[{scope:"region",document_id:"doc",region_id:"left"}]},{id:"native",source:{kind:"native",lora_name:"n",model_strength:1,clip_strength:1},targets:[{scope:"global"}]}]};
 const migrated=parseLoraV3Config(legacy);assert.equal(migrated.version,3);assert.equal(migrated.entries[0].source.collector_id,"collector-a");assert.equal(migrated.entries[0].id,"left");assert.deepEqual(migrated.entries[1],legacy.entries[1]);
});
test("unknown future config versions fail closed without mutating the persisted value",()=>{
 const future={version:99,entries:[{id:"future",source:{kind:"future"},targets:[]}],future_field:{keep:true}},before=JSON.stringify(future);
 assert.throws(()=>parseLoraV3Config(future),/Invalid BV Regional LoRA v3 configuration/);assert.equal(JSON.stringify(future),before);
});
test("changing region two collector leaves region one collector and resource unchanged",()=>{
 const config=parseLoraV3Config({version:3,entries:[{id:"left",source:{kind:"external",collector_id:"collector-a",resource_id:"resource-a"},targets:[{scope:"region",document_id:"doc",region_id:"left"}]},{id:"right",source:{kind:"external",collector_id:"collector-b",resource_id:"resource-b"},targets:[{scope:"region",document_id:"doc",region_id:"right"}]}],steps:[]});
 const next=updateLoraV3EntryCollector(config,"right","collector-c","resource-c");assert.deepEqual(next.entries[0],config.entries[0]);assert.deepEqual(next.entries[1].source,{kind:"external",collector_id:"collector-c",resource_id:"resource-c"});
});
test("external entries cannot be created without a live collector resource",()=>{
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors:[],config:emptyLoraV3Config(),resolved:false,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}}],onSelection(){},onAddExternal(){},onRemove(){}}));
 assert.match(html,/disabled=""/);
});
test("the advanced LoRA editor groups multiple stacks below every assignment target",()=>{
 const config=parseLoraV3Config({version:1,collector_id:"collector",entries:[{id:"entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"},{scope:"region",document_id:"doc",region_id:"left"}]}]});
 const html=renderToStaticMarkup(React.createElement(LoraV3ResourcePickerPanel,{collectors,config,resolved:true,targetOptions:[{value:"global",label:"Global",target:{scope:"global"}},{value:"region:doc:left",label:"Left",target:{scope:"region",document_id:"doc",region_id:"left"}}],onSelection(){},onAddExternal(){}}));
 assert.match(html,/Global/);assert.match(html,/Left/);assert.match(html,/Add LoRA stack/);assert.doesNotMatch(html,/Assignment targets/);
});
test("Regional Prompt easy mode starts with a BV toggle and hides an unassigned picker",()=>{
 const html=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config:emptyLoraV3Config(),target:{scope:"global"},resolved:false,onSelection(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(html,/role="switch"/);assert.match(html,/LoRA disabled/);assert.doesNotMatch(html,/No resource selected|Collector/);
});
test("Regional Prompt toggle commits a bound Registry stack and its provider link",async()=>{
 class TestCustomEvent extends Event{constructor(type,init){super(type);this.detail=init?.detail}}
 globalThis.window=new EventTarget();globalThis.CustomEvent=TestCustomEvent;
 register(new URL("./fixtures/comfy_source_loader.mjs",import.meta.url));
 const {installLoraV3Ui,loraV3Catalog,loraV3EntryResolved}=await import("../ui/src/regional/loraV3Ui.tsx");
 const {connectLocalLoraCollectors,linkedLocalLoraCollectors}=await import("../ui/src/regional/loraV3Graph.ts");
 const {installLoraRegistryUi}=await import("../ui/src/regional/loraRegistryUi.tsx");
 const {configureReactNodeWidgetHost}=await import("../ui/src/regional/reactNodeWidgetHost.tsx");
 const {hasRegionalLoraV3,quickLoraV3Target,regionalLoraScopeViewProps}=await import("../ui/src/regional/regionalLoraScopeActions.ts");
 const {loadQuickLoraState}=await import("../ui/src/regional/QuickPromptEditor.tsx");
 const {collectScopedNodes}=await import("../ui/src/ui/windowRegistry.ts");
 const graph=()=>({_nodes:[],links:new Map(),lastLinkId:90,getNodeById(id){return this._nodes.find(node=>node.id===id)}}),root=graph(),subgraph=graph();
 const registryId="11111111-1111-4111-8111-111111111111",stackId="22222222-2222-4222-8222-222222222222";
 const native={connect(output,target,input){if(this.graph!==target.graph)return null;const id=++this.graph.lastLinkId,link={origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input};this.graph.links.set(id,link);(this.outputs[output].links??=[]).push(id);target.inputs[input].link=id;return id},disconnectInput(input){const id=this.inputs[input]?.link,link=this.graph.links.get(id);if(!link)return false;const source=this.graph.getNodeById(link.origin_id);source.outputs[link.origin_slot].links=source.outputs[link.origin_slot].links.filter(value=>value!==id);this.graph.links.delete(id);this.inputs[input].link=null;return true}};
 class RegistryType{}class PromptType{}
 const registry=Object.assign(new RegistryType(),native,{id:1,type:"BV LoRA Registry",graph:root,inputs:[],outputs:[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[]}],widgets:[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:stackId,name:"Portrait",enabled:true,entries:[]}]})}]});
 let callbackValue="",callbackCount=0,dirty=0;const configWidget={name:"lora_v3_config_json",value:serializeLoraV3Config(emptyLoraV3Config()),callback(value){callbackValue=value;callbackCount++}},legacyWidget={name:"lora_bindings_json",value:'{"legacy":"preserve"}'};
 const quickDocument={document_id:"quick-doc",regions:[{id:"kept"}]},validLegacy=JSON.stringify({schema:"bv.regional.lora_bindings",version:1,document_id:"quick-doc",global_stack_id:"stack",regions:{kept:"stack"}});
 const quickFixture=(legacy,v3=true)=>{let callbacks=0,dirtyCalls=0;const sidecar=legacy===undefined?null:{name:"lora_bindings_json",value:legacy,callback(){callbacks++}},node={widgets:[...(sidecar?[sidecar]:[]),...(v3?[{name:"lora_v3_config_json",value:""}]:[])],graph:{setDirtyCanvas(){dirtyCalls++}}};return{node,sidecar,counters:()=>({callbacks,dirtyCalls})}};
 for(const legacy of [undefined,validLegacy,"{malformed"]){const fixture=quickFixture(legacy);const before=fixture.sidecar?.value,result=loadQuickLoraState(fixture.node,quickDocument);assert.equal(result.usesV3,true);assert.equal(result.bindings.document_id,"quick-doc");assert.equal(fixture.sidecar?.value,before);assert.deepEqual(fixture.counters(),{callbacks:0,dirtyCalls:0})}
 const legacyOnly=quickFixture(JSON.stringify({schema:"bv.regional.lora_bindings",version:1,document_id:"quick-doc",global_stack_id:null,regions:{removed:"stack"}}),false),legacyResult=loadQuickLoraState(legacyOnly.node,quickDocument);assert.equal(legacyResult.usesV3,false);assert.deepEqual(legacyResult.bindings.regions,{});assert.deepEqual(legacyOnly.counters(),{callbacks:1,dirtyCalls:1});
 const prompt=Object.assign(new PromptType(),native,{id:2,type:"BV Regional Prompt",graph:root,inputs:[],outputs:[],widgets:[configWidget,legacyWidget],addInput(name,type){this.inputs.push({name,type,link:null})},removeInput(index){this.inputs.splice(index,1)},setDirtyCanvas(){dirty++}});
 const rootRegistry=Object.assign({},native,{id:3,type:"BV LoRA Registry",graph:root,inputs:[],outputs:[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[]}],widgets:[{name:"config_json",value:JSON.stringify({schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[{id:stackId,name:"Wrong root stack",enabled:true,entries:[]}]})}]});
 const container={id:10,type:"Subgraph",title:"Regional",graph:root,subgraph};root._nodes=[container];subgraph._nodes=[registry,prompt];
 const owner=node=>collectScopedNodes(root,candidate=>candidate===node)[0]?.graph??node.graph??null;
 root._nodes.unshift(rootRegistry);configureReactNodeWidgetHost({schedule:()=>{}});
 installLoraRegistryUi(RegistryType,{name:"BV LoRA Registry"},{apiURL:()=>"data:application/json,%7B%22schema%22%3A%22bv.lora_catalog%22%2C%22version%22%3A1%2C%22items%22%3A%5B%5D%7D"},owner);
 installLoraV3Ui(PromptType,{name:"BV Regional Prompt"},owner);
 const timers=[],originalSetTimeout=globalThis.setTimeout;globalThis.setTimeout=(callback)=>{timers.push(callback);return timers.length};
 const flush=()=>{let count=0;while(timers.length){if(++count>100)throw new Error("scheduler did not settle");timers.shift()();}};
 try{registry.onNodeCreated();prompt.onNodeCreated();prompt.onConfigure({properties:{}});await Promise.resolve();flush();}finally{globalThis.setTimeout=originalSetTimeout;}
 assert.equal(registry.__bvConcreteGraph,subgraph);assert.equal(prompt.__bvConcreteGraph,subgraph);assert.equal(registry.graph,root);assert.equal(prompt.graph,root);
 const availableBefore=loraV3Catalog(prompt);assert.deepEqual(availableBefore.map(item=>[item.id,item.resources[0].id,item.resources[0].label]),[[registryId,stackId,"Portrait"]]);
 assert.equal(root.links.size,0);assert.equal(subgraph.links.size,0);
 assert.equal(hasRegionalLoraV3(prompt),true);assert.equal(hasRegionalLoraV3({widgets:[legacyWidget]}),false);
 assert.deepEqual(quickLoraV3Target("doc","global"),{scope:"global"});assert.deepEqual(quickLoraV3Target("doc","background"),{scope:"global"});assert.deepEqual(quickLoraV3Target("doc","left"),{scope:"region",document_id:"doc",region_id:"left"});
 let next=emptyLoraV3Config();const actions=regionalLoraScopeViewProps(prompt,next,value=>{next=value});
 globalThis.setTimeout=(callback)=>{timers.push(callback);return timers.length};
 try{actions.onAdd({scope:"global"});flush();}finally{globalThis.setTimeout=originalSetTimeout;}
 assert.equal(next.entries.length,1);assert.deepEqual(next.entries[0].source,{kind:"external",collector_id:registryId,resource_id:stackId});
 assert.deepEqual(parseLoraV3Config(configWidget.value),next);assert.equal(callbackValue,configWidget.value);assert.equal(callbackCount,1);assert.ok(dirty>0);
 assert.equal(legacyWidget.value,'{"legacy":"preserve"}');
 assert.equal(prompt.inputs.length,1);assert.equal(prompt.inputs[0].name,"resource_provider_1");const linkId=prompt.inputs[0].link,link=subgraph.links.get(linkId);assert.ok(link);assert.equal(link.origin_id,registry.id);assert.equal(link.origin_slot,0);assert.equal(link.target_id,prompt.id);assert.equal(link.target_slot,0);assert.deepEqual(registry.outputs[0].links,[linkId]);assert.equal(root.links.size,0);assert.deepEqual(linkedLocalLoraCollectors(prompt).slice(0,1),[registry]);assert.equal(loraV3EntryResolved(prompt,next,next.entries[0]),true);
 assert.equal(connectLocalLoraCollectors(prompt,[registry]),true);assert.equal(subgraph.links.size,1);assert.equal(prompt.inputs[0].link,linkId);assert.equal(callbackCount,1);assert.equal(rootRegistry.outputs[0].links.length,0);
 const available=loraV3Catalog(prompt),scope=regionalLoraScopeViewProps(prompt,next,value=>{next=value}),html=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{...scope,target:quickLoraV3Target("doc","global")}));
 assert.match(html,/LoRA enabled/);assert.match(html,/>Portrait</);
});
test("Regional Prompt easy mode renders every stack assigned to its scope",()=>{
 const config=parseLoraV3Config({version:1,collector_id:"collector",entries:[{id:"first",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]},{id:"second",source:{kind:"external",resource_id:"skin"},targets:[{scope:"global"}]}]});
 const html=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config,target:{scope:"global"},resolved:true,onSelection(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(html,/LoRA enabled/);assert.match(html,/LoRA Stack 1/);assert.match(html,/LoRA Stack 2/);assert.match(html,/Add LoRA stack/);
 assert.match(html,/aria-label="Remove LoRA Stack 1"/);assert.doesNotMatch(html,/>Remove</);
});
test("Regional Prompt easy mode changes scope immediately when the selected region changes",()=>{
 assert.match(regionalEditorSource,/regionalLoraScopeViewProps\(node,loraV3Config,setLoraV3Config\)/);
 assert.doesNotMatch(pickerSource,/\[enabled,setEnabled\]=useState/);
 assert.match(regionalEditorSource,/OptionalLoraV3ScopePicker key=\{selectedRegion\.id\}/);
 const config=parseLoraV3Config({version:1,collector_id:"collector",entries:[{id:"left-entry",source:{kind:"external",resource_id:"skin"},targets:[{scope:"region",document_id:"doc",region_id:"left"}]}]});
 const right=renderToStaticMarkup(React.createElement(OptionalLoraV3ScopePicker,{collectors,config,target:{scope:"region",document_id:"doc",region_id:"right"},resolved:true,onSelection(){},onAdd(){},onRemove(){},onClear(){}}));
 assert.match(right,/LoRA disabled/);assert.doesNotMatch(right,/LoRA Stack 1/);
});
test("dock panels resolve their latest content after FlexLayout has mounted the tab",()=>{
 assert.match(dockSource,/createContext<ReadonlyMap<string,ReactNode>>/);
 assert.match(dockSource,/function LiveDockPanel/);
 assert.match(dockSource,/factory=\{\(node:TabNode\)=><LiveDockPanel/);
 assert.doesNotMatch(dockSource,/factory=\{\(node:TabNode\)=>content\.get/);
});
test("Regional Prompt keeps the LoRA toggle above the stack card without overlap",()=>{
 assert.match(styles,/\.bv-lora-v3-enable-row\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.doesNotMatch(styles,/\.bv-lora-v3-enable-row>\.bv-control-field\{[^}]*padding-top/);
});
test("adding an advanced LoRA stack commits through the graph-linking helper",()=>{
 assert.match(editorSource,/commitLoraV3Config\(node,next\)/);
 assert.doesNotMatch(editorSource,/writeNodeLoraV3Config\(node,next\)/);
});
test("LoRA config edits defer and coalesce native graph reconciliation",()=>{
 const source=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
 assert.match(source,/writeNodeLoraV3Config\(node,next\);scheduleConfiguredLoraWriterTree\(node,next\)/);
 assert.match(source,/__bvLoraReconcileScheduled/);assert.match(source,/scheduleDgUpgrade\(node,run\)/);
});
test("a temporarily missing collector cannot crash Regional Prompt reactivation",()=>{
 const source=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
 assert.match(source,/const widget=\(node:any,name:string\)=>node\?\.widgets\?\.find/);
 assert.match(source,/linkedLocalLoraCollectors\(node\).*linkedIds\.has\(id\)/s);
});
test("collector reconciliation refreshes unresolved state in both LoRA editors",()=>{
 const source=readFileSync(new URL("../ui/src/regional/loraV3Ui.tsx",import.meta.url),"utf8");
 assert.match(source,/reconcileConfiguredLoraWriterTree\(node,pending\);notifyLoraV3InventoryChanged\(node\)/);
 assert.match(source,/linkedLoraCollectorIds\(node\)\.has\(entry\.source\.collector_id\)/);
 assert.match(editorSource,/addEventListener\(LORA_V3_INVENTORY_CHANGED_EVENT,refresh\)/);
 assert.match(regionalEditorSource,/addEventListener\(LORA_V3_INVENTORY_CHANGED_EVENT,refresh\)/);
 assert.match(source,/if\(transformer\|\|collector\)notifyLoraV3InventoryChanged\(this\)/);
});
test("Quick Prompt Editor uses the canonical V3 LoRA scope instead of the legacy sidecar",()=>{
 assert.match(quickEditorSource,/hasRegionalLoraV3\(node\)/);
 assert.match(quickEditorSource,/readNodeLoraV3Config\(node\)/);
 assert.match(quickEditorSource,/LORA_V3_INVENTORY_CHANGED_EVENT/);
 assert.match(quickEditorSource,/OptionalLoraV3ScopePicker/);
 assert.match(quickEditorSource,/regionalLoraScopeViewProps\(node,loraV3Config,setLoraV3Config\)/);
 assert.match(quickEditorSource,/quickLoraV3Target\(documentValue\.document_id,target\)/);
 assert.match(quickEditorSource,/export function loadQuickLoraState/);
 assert.match(quickEditorSource,/if\(usesV3\)return\{usesV3,bindings:emptyLoraBindings\(document\.document_id\)\};/);
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
 assert.match(source,/serialize:false/);assert.match(source,/reconcileConfiguredLoraWriterCollectors/);assert.match(source,/reconcileDownstreamLoraWriters/);assert.match(source,/__bvLoraCollectorIdRemap/);assert.match(source,/__bvLoraResourceIdRemap/);
 assert.match(source,/Open LoRA Editor/);assert.doesNotMatch(source,/addDOMWidget|ReactDOM/);
 assert.doesNotMatch(source,/graphToPrompt|queuePrompt|MutationObserver/);
});

import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const view=readFileSync(new URL("../ui/src/regional/LoraRegistryView.tsx",import.meta.url),"utf8");
const nodeView=readFileSync(new URL("../ui/src/regional/LoraRegistryNodeView.tsx",import.meta.url),"utf8");
const library=readFileSync(new URL("../ui/src/regional/LoraCatalogLibraryWindow.tsx",import.meta.url),"utf8");
const dialog=readFileSync(new URL("../ui/src/regional/loraRegistryDialog.ts",import.meta.url),"utf8");
const registryUi=readFileSync(new URL("../ui/src/regional/loraRegistryUi.tsx",import.meta.url),"utf8");
const indexSource=readFileSync(new URL("../ui/src/index.tsx",import.meta.url),"utf8");
const showcase=readFileSync(new URL("../ui/src/showcase.tsx",import.meta.url),"utf8");
const forms=readFileSync(new URL("../ui/src/ui/components/forms.tsx",import.meta.url),"utf8");
const data=readFileSync(new URL("../ui/src/ui/components/data.tsx",import.meta.url),"utf8");
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const hoverPreview=data.slice(data.indexOf("export function HoverPreview"),data.indexOf("export function IncrementalResourceList"));

test("LoRA registry dialog mounts before catalog IO can finish",()=>{
  assert.match(dialog,/export function openLoraRegistryDialog/);
  assert.doesNotMatch(dialog,/export async function openLoraRegistryDialog/);
  const body=dialog.slice(dialog.indexOf("export function openLoraRegistryDialog"));
  assert.doesNotMatch(body,/await fetch/);
  assert.match(body,/mountBvView/);
});

test("search result media uses the bounded shared BVUI slot",()=>{
  assert.match(forms,/className="bv-search-result-media"/);
  assert.match(library,/loading="lazy"/);assert.match(library,/decoding="async"/);
  assert.match(styles,/\.bv-search-result-media\{[^}]*inline-size:[^;}]+;[^}]*block-size:[^;}]+;[^}]*overflow:hidden/);
  assert.match(styles,/\.bv-search-result-media img\{[^}]*width:100%;[^}]*height:100%;[^}]*object-fit:(?:cover|contain)/);
});

test("inline LoRA widget is a compact bounded row layout instead of a full form",()=>{
  assert.match(data,/export function CompactResourceList/);assert.match(data,/export function CompactResourceGroup/);assert.match(data,/export function CompactResourceRow/);
  assert.match(nodeView,/<CompactResourceList/);assert.match(nodeView,/<CompactResourceGroup/);assert.match(nodeView,/<CompactResourceRow/);
  assert.match(styles,/\.bv-compact-resource-row\{[^}]*grid-template-columns:[^}]+/);
  assert.match(styles,/\.bv-compact-resource-control\{width:36px;min-width:36px\}/);
  assert.match(styles,/\.bv-compact-resource-row\{[^}]*grid-template-columns:[^}]+;grid-template-rows:1fr/);
  assert.doesNotMatch(styles,/\.bv-compact-resource-row>\.bv-compact-resource-values\{[^}]*grid-row:2/);
  assert.match(styles,/\.bv-compact-resource-title\{[^}]*text-overflow:ellipsis/);
  assert.doesNotMatch(styles,/\.bv-lora-node-(?:toggle|strength|entry|stack)/);
});

test("LoRA library delegates bounded incremental rendering to shared BVUI",()=>{
  assert.doesNotMatch(library,/MAX_LORA_SEARCH_RESULTS/);
  assert.match(data,/export function IncrementalResourceList/);
  assert.match(library,/<IncrementalResourceList/);
  assert.match(library,/loading="lazy"/);assert.match(library,/decoding="async"/);
  assert.match(styles,/\.bv-incremental-resource-list/);
  assert.match(styles,/\.bv-resource-grid/);
});

test("LoRA node uses one primary Strength and no feature-local sizing or native widgets",()=>{
  assert.match(nodeView,/NumberScrubber/);
  assert.match(nodeView,/CompactSquareSwitch/);
  assert.match(nodeView,/CompactSortableRows/);
  assert.match(data,/setPointerCapture/);assert.match(data,/rows=useRef\(new Map/);assert.match(data,/onPointerCancel/);
  assert.doesNotMatch(nodeView,/label="M"/);assert.doesNotMatch(nodeView,/label="C"/);
  assert.doesNotMatch(nodeView,/addWidget|addDOMWidget|ResizeObserver|maxHeight|overflowY/);
});

test("LoRA surfaces compose shared timed status, multi facets, loading and delayed previews",()=>{
  assert.match(library,/TimedStatusSlot/);
  assert.match(library,/value:filters\.baseModel/);
  assert.match(forms,/export function CompactMultiSelect/);
  assert.match(data,/loading\?:boolean/);
  assert.match(library,/loading=\{loading\}/);
  assert.match(nodeView,/HoverPreview/);
  assert.match(view,/HoverPreview/);
  assert.match(data,/data-bv-sort-id=\{item\.id\}/);
  assert.match(forms,/disabled=\{option\.disabled\}/);
  assert.match(forms,/onScrubEnd\?\.\(\);if\(!gesture\.moved\)/);
  assert.match(forms,/useEffect\(\(\)=>\(\)=>\{const gesture=drag\.current/);
  assert.match(forms,/onPointerCancel=\{cancel\}/);
  assert.match(forms,/onLostPointerCapture=\{\(\)=>\{if\(drag\.current\)cancel\(\)\}\}/);
  assert.match(nodeView,/createScrubSnapshotSession/);assert.match(view,/createScrubSnapshotSession/);
  assert.doesNotMatch(library,/title="LoRA library"/);
});

test("advanced strength popover and hover preview are centrally themed and bounded",()=>{
  assert.match(styles,/\.bv-compact-strength-popover\{[^}]*background:var\(--bv-ui-surface/);
  assert.match(styles,/\.bv-hover-preview\{[^}]*position:fixed/);
  assert.match(styles,/\.bv-hover-preview img\{[^}]*max-width:var\(--bv-hover-preview-max-width/);
  assert.doesNotMatch(styles,/\.bv-hover-preview img\{[^}]*object-fit:cover/);
  assert.match(hoverPreview,/fitHoverPreviewSize/);assert.match(hoverPreview,/onLoad=/);
  assert.match(hoverPreview,/loading="eager"/);assert.doesNotMatch(hoverPreview,/loading="lazy"/);
  assert.match(styles,/\.bv-timed-status-slot\{[^}]*min-height/);
});

test("inline LoRA widgets never start catalog IO",()=>{
  assert.doesNotMatch(nodeView,/\bfetch\s*\(|apiURL\s*\(|loraCatalogClient\.load\(/);
  assert.match(nodeView,/useSyncExternalStore/);
  assert.match(nodeView,/loraCatalogClient\.subscribe/);
  assert.match(nodeView,/loraCatalogClient\.getSnapshot/);
  assert.doesNotMatch(nodeView,/loraCatalogClient\.peek\(\)/);
  assert.match(registryUi,/bootstrapLoraCatalog\(api\)/);
  assert.match(registryUi,/storeLoraRegistryInventory\(node,hidden,value/);
  assert.match(registryUi,/bindLoraV3Graph\(node,graphOwner\(node\)\)/);
  assert.match(indexSource,/installLoraRegistryUi\(nodeType,nodeData,comfyApi,detailerGraphOwner\)/);
  assert.doesNotMatch(registryUi,/await\s+bootstrapLoraCatalog/);
  assert.match(showcase,/LoraNodeProductionPreview[^]*useEffect\(\(\)=>bootstrapLoraCatalog\(\{apiURL:\(\)=>loraPreviewCatalogUrl\}\),\[\]\)/);
  assert.match(showcase,/data:application\/json;charset=utf-8/);
});

test("an open Regional Prompt discovers a newly stored Registry stack and persists its ordinal provider link",async()=>{
  class TestCustomEvent extends Event{constructor(type,init){super(type);this.detail=init?.detail}}
  const bus=new EventTarget();globalThis.window=bus;globalThis.CustomEvent=TestCustomEvent;
  const {storeLoraRegistryInventory}=await import("../ui/src/regional/loraV3Inventory.ts");
  const {connectLocalLoraCollectors,localLoraCollectors,loraProviderIdentity,loraProviderResources}=await import("../ui/src/regional/loraV3Graph.ts");
  const {parseLoraV3Config,serializeLoraV3Config}=await import("../ui/src/regional/loraV3Config.ts");
  const registryId="11111111-1111-4111-8111-111111111111",stackId="22222222-2222-4222-8222-222222222222",emptyRegistry={schema:"bv.lora_registry_config",version:1,registry_id:registryId,stacks:[]};
  const graph={_nodes:[],links:new Map(),getNodeById(id){return this._nodes.find(node=>node.id===id)},setDirtyCanvas(){}};
  const registryWidget={name:"config_json",value:JSON.stringify(emptyRegistry),callback(){}};
  const registry={id:1,type:"BV LoRA Registry",graph,widgets:[registryWidget],inputs:[],outputs:[{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:null}],connect(output,target,input){const id=91;graph.links.set(id,{origin_id:this.id,origin_slot:output,target_id:target.id,target_slot:input});this.outputs[output].links=[id];target.inputs[input].link=id}};
  const promptConfig={name:"lora_v3_config_json",value:serializeLoraV3Config({version:3,entries:[],steps:[]}),callback(){}};
  const prompt={id:2,type:"BV Regional Prompt",graph,widgets:[promptConfig],inputs:[],outputs:[],addInput(name,type){this.inputs.push({name,type,link:null})},removeInput(index){this.inputs.splice(index,1)},disconnectInput(index){this.inputs[index].link=null},setDirtyCanvas(){}};graph._nodes=[registry,prompt];
  const inventory=()=>localLoraCollectors(prompt).map(node=>({id:loraProviderIdentity(node),resources:loraProviderResources(node)})).filter(item=>item.resources.length>0);
  let events=0,visible=[],refreshes=0;bus.addEventListener("bv-regional-lora-inventory-changed",()=>{events++;visible=inventory()});assert.equal(inventory().length,0);
  storeLoraRegistryInventory(registry,registryWidget,JSON.stringify({...emptyRegistry,stacks:[{id:stackId,name:"Portrait",enabled:true,entries:[]}]}),()=>refreshes++);
  assert.equal(events,1);assert.equal(refreshes,1);assert.deepEqual(visible.map(item=>[item.id,item.resources[0].id]),[[registryId,stackId]]);
  promptConfig.value=serializeLoraV3Config({version:3,entries:[{id:"33333333-3333-4333-8333-333333333333",source:{kind:"external",collector_id:registryId,resource_id:stackId},targets:[{scope:"global"}]}],steps:[]});
  assert.equal(connectLocalLoraCollectors(prompt,[registry]),true);
  const stored=parseLoraV3Config(promptConfig.value);assert.equal(stored.entries[0].source.collector_id,registryId);assert.equal(stored.entries[0].source.resource_id,stackId);
  assert.equal(prompt.inputs[0].name,"resource_provider_1");assert.ok(prompt.inputs[0].link!=null);
});

test("Named LoRA stack lifecycle and widget edits invalidate the shared V3 inventory",async()=>{
  class TestCustomEvent extends Event{constructor(type,init){super(type);this.detail=init?.detail}}
  const bus=new EventTarget();globalThis.window=bus;globalThis.CustomEvent=TestCustomEvent;
  const {installNamedLoraInventorySource}=await import("../ui/src/regional/loraV3Inventory.ts");
  const calls={created:0,configured:0,changed:0,removed:0,widget:0,prepared:0};
  class NodeType{}
  NodeType.prototype.onNodeCreated=function(){calls.created++};
  NodeType.prototype.onConfigure=function(){calls.configured++};
  NodeType.prototype.onConnectionsChange=function(){calls.changed++};
  NodeType.prototype.onRemoved=function(){calls.removed++};
  installNamedLoraInventorySource(NodeType,()=>calls.prepared++);
  const name={name:"name",value:"Stack",callback(){calls.widget++}},stackId={name:"stack_id",value:crypto.randomUUID(),callback(){calls.widget++}};
  const node=new NodeType();node.widgets=[name,stackId];
  let events=0;bus.addEventListener("bv-regional-lora-inventory-changed",()=>events++);
  node.onNodeCreated();await Promise.resolve();assert.deepEqual(calls,{created:1,configured:0,changed:0,removed:0,widget:0,prepared:1});assert.equal(events,1);
  events=0;name.callback("Renamed");assert.equal(calls.widget,1);assert.equal(events,1);
  events=0;node.onConnectionsChange();await Promise.resolve();assert.equal(calls.changed,1);assert.equal(events,1);
  events=0;node.onConfigure();await Promise.resolve();assert.equal(calls.configured,1);assert.equal(calls.prepared,2);assert.equal(events,1);
  events=0;node.onRemoved();await Promise.resolve();assert.equal(calls.removed,1);assert.equal(events,1);
});

test("LoRA Registry lifecycle preserves native callbacks and invalidates shared inventory",async()=>{
  class TestCustomEvent extends Event{constructor(type,init){super(type);this.detail=init?.detail}}
  const bus=new EventTarget();globalThis.window=bus;globalThis.CustomEvent=TestCustomEvent;
  const {installLoraRegistryInventorySource}=await import("../ui/src/regional/loraV3Inventory.ts");
  const calls={created:0,configured:0,removed:0,prepared:0};class NodeType{}
  NodeType.prototype.onNodeCreated=function(){calls.created++};NodeType.prototype.onConfigure=function(){calls.configured++};NodeType.prototype.onRemoved=function(){calls.removed++};
  installLoraRegistryInventorySource(NodeType,()=>calls.prepared++);installLoraRegistryInventorySource(NodeType,()=>{throw new Error("must install once")});
  const node=new NodeType();let events=0;bus.addEventListener("bv-regional-lora-inventory-changed",()=>events++);
  node.onNodeCreated();await Promise.resolve();assert.deepEqual(calls,{created:1,configured:0,removed:0,prepared:1});assert.equal(events,1);
  events=0;node.onConfigure();await Promise.resolve();assert.deepEqual(calls,{created:1,configured:1,removed:0,prepared:2});assert.equal(events,1);
  events=0;node.onRemoved();await Promise.resolve();assert.deepEqual(calls,{created:1,configured:1,removed:1,prepared:2});assert.equal(events,1);
});

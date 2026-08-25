import test from "node:test";
import assert from "node:assert/strict";
import { applyRegionalPrimitiveDraft, migrateRegionalNode, migrationReportMessage, parseRegionalEditorDraft, persistRegionalEditorDraft, regionalEditorDraft } from "../ui/src/regional/milestoneE.ts";
import { layoutPanelIds, missingLayoutPanels } from "../ui/src/ui/layoutProfiles.ts";
import { clearSessionLayoutDraft, getSessionLayoutRevision, setSessionLayoutDraft, subscribeSessionLayoutDraft } from "../ui/src/ui/layoutProfiles.ts";
import { canvasLegacyDragType, clearLegacyPortSticky, installLegacyPorts, legacyPortShouldShow, refreshLegacyDragPorts, refreshLegacyPorts, setLegacyPortsVisible } from "../ui/src/regional/legacyPorts.ts";

const document = {schema:"bv.regional",version:2,document_id:"doc",title:"Original",canvas:{width:1024,height:1024},prompts:{global:{positive_source:"",negative_source:""},background:{positive_source:"",negative_source:""}},negative_mode:"auto",overlap:{mode:"joint"},regions:[]};

test("Regional drafts preserve invalid raw values while canonical execution uses explicit fallbacks",()=>{
  const result=applyRegionalPrimitiveDraft(document,{title:"", "canvas.width":"oops", "canvas.height":"2048"});
  assert.equal(result.canonical.title,"Original");assert.equal(result.canonical.canvas.width,1024);assert.equal(result.canonical.canvas.height,2048);
  assert.deepEqual(result.draft.raw,{title:"", "canvas.width":"oops", "canvas.height":"2048"});assert.deepEqual(result.draft.issues.map(item=>item.field),["title","canvas.width"]);
});

test("Regional drafts use named node properties instead of positional widgets",()=>{
  let changed=0;const node={properties:{},graph:{change(){changed++},setDirtyCanvas(){changed++}}},draft={schema:"bv.regional.editor-draft",version:1,raw:{title:""},issues:[]};
  persistRegionalEditorDraft(node,draft);assert.deepEqual(regionalEditorDraft(node),draft);assert.equal(changed,2);
  persistRegionalEditorDraft(node,null);assert.equal(regionalEditorDraft(node),null);
  assert.equal(parseRegionalEditorDraft({schema:"wrong",version:1,raw:{}}),null);
});

test("node-local migration validates every candidate before atomically replacing widgets",()=>{
  const legacy={...document,version:1,regions:[{id:"r",name:"R",parent_region_id:null,enabled:true,strength:1,priority:0,prompts:{positive_source:"",negative_source:""},mask:{feather:.01},geometry:[],authoring:{visible:true,locked:false,color:"#fff"}}]};
  let changes=0;const widget={name:"regional_json",value:JSON.stringify(legacy)},node={id:7,title:"Prompt",widgets:[widget],graph:{change(){changes++},setDirtyCanvas(){}}};
  const result=migrateRegionalNode(node);assert.equal(result.migrated,true);assert.deepEqual(result.assumedDefaults,["region usage = generation"]);assert.equal(JSON.parse(widget.value).regions[0].usage,"generation");assert.equal(changes,1);
  const broken={id:8,widgets:[{name:"regional_json",value:JSON.stringify(legacy)},{name:"lora_v3_config_json",value:"{"}]};
  const failed=migrateRegionalNode(broken);assert.ok(failed.error);assert.equal(JSON.parse(broken.widgets[0].value).version,1);
});

test("migration summaries aggregate success, failure and assumed defaults",()=>{
  assert.deepEqual(migrationReportMessage([{nodeId:"1",nodeTitle:"A",migrated:true,assumedDefaults:["x"]},{nodeId:"2",nodeTitle:"B",migrated:false,assumedDefaults:[],error:"bad"}]),{title:"Regional migration needs attention",message:"1 migrated, 1 failed · Defaults: x.",tone:"warning"});
});

test("generic config_json migrates only on the Regional LoRA node",()=>{
  const detailer={id:9,type:"BV Regional Detailer Plan",widgets:[{name:"config_json",value:JSON.stringify({version:1,jobs:[]})}]};
  const ignored=migrateRegionalNode(detailer);assert.equal(ignored.migrated,false);assert.equal(ignored.error,undefined);
  const lora={id:10,type:"BV Regional LoRA",widgets:[{name:"config_json",value:JSON.stringify({version:1,entries:[]})}]};
  const migrated=migrateRegionalNode(lora);assert.equal(migrated.migrated,true);assert.equal(migrated.error,undefined);assert.equal(JSON.parse(lora.widgets[0].value).version,3);
});

test("old layouts remain unchanged and report newly registered namespaced panels",()=>{
  const saved={layout:{type:"row",children:[{type:"tabset",children:[{type:"tab",id:"bv.regional.canvas",component:"canvas"}]}]},borders:[]};
  assert.deepEqual([...layoutPanelIds(saved)],["bv.regional.canvas"]);
  assert.deepEqual(missingLayoutPanels(saved,["bv.regional.canvas","bv.regional.capabilities"]),["bv.regional.capabilities"]);
  assert.equal(saved.layout.children.length,1);
});

test("layout-profile controls react when the dock writes a session draft silently",()=>{
  const key="regional-editor:test",revisions=[];
  const unsubscribe=subscribeSessionLayoutDraft(key,()=>revisions.push(getSessionLayoutRevision(key)));
  try{
    setSessionLayoutDraft(key,{layout:{type:"row",children:[]},borders:[]},"adjusted",undefined,false);
    assert.deepEqual(revisions,[1]);assert.equal(getSessionLayoutRevision(key),1);
  }finally{unsubscribe();clearSessionLayoutDraft(key)}
});

test("Legacy ports hide by default, reveal for compatible drag, and occupied links always win",()=>{
  const node={outputs:[{name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",links:null}]};
  installLegacyPorts(node,[{direction:"output",name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",guidance:"Use BV Regional context"}]);
  assert.equal(node.outputs[0].hidden,true);assert.equal(legacyPortShouldShow(node.outputs[0],"output","BV_REGIONAL_LORA_BINDINGS"),true);
  node.outputs[0].links=[4];refreshLegacyPorts(node);assert.equal(node.outputs[0].hidden,false);
  node.outputs[0].links=[];refreshLegacyPorts(node);assert.equal(node.outputs[0].hidden,false);
  clearLegacyPortSticky(node);assert.equal(node.outputs[0].hidden,true);
  setLegacyPortsVisible(true);refreshLegacyPorts(node);assert.equal(node.outputs[0].hidden,false);setLegacyPortsVisible(false);
});

test("Nodes 2.0 link drags reveal compatible Legacy port labels before drop",()=>{
  const node={outputs:[{name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",links:null}]};
  const canvas={graph:{_nodes:[node]},linkConnector:{renderLinks:[{fromSlot:{type:"BV_REGIONAL_LORA_BINDINGS"}}]}};
  installLegacyPorts(node,[{direction:"output",name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",guidance:"Use BV Regional context"}]);
  assert.equal(node.outputs[0].hidden,true);
  assert.equal(canvasLegacyDragType(canvas),"BV_REGIONAL_LORA_BINDINGS");
  refreshLegacyDragPorts(canvas);
  assert.equal(node.outputs[0].hidden,false);
  canvas.linkConnector.renderLinks=[];refreshLegacyDragPorts(canvas);
  assert.equal(node.outputs[0].hidden,true);
});

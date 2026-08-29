import assert from "node:assert/strict";
import test from "node:test";

import {
  applyNodePreviewProjection,
  nodePreviewPolicy,
  previewRowName,
  previewTargetsForMutationRoot,
  syncPreviewDetailSections,
} from "../ui/src/regional/nodePreviewProjection.ts";
import { setLegacyDebugVisible } from "../ui/src/regional/legacyPorts.ts";

test("Regional Prompt declares its ghost-only action widgets outside the backend schema", () => {
  assert.deepEqual(nodePreviewPolicy("BV Regional Prompt"), {
    actions: ["Open Regional Editor", "Quick Edit Prompts"],
  });
});

test("technical and dynamic nodes declare shared ghost projections",()=>{
  assert.deepEqual(nodePreviewPolicy("BV Seed")?.actions,["🎲 Randomize Each Time","🎲 New Fixed Random","♻️ (Use Last Queued Seed)"]);
  assert.deepEqual(nodePreviewPolicy("BV Smart Pipe"),{actions:["Configure Smart Pipe"]});
  assert.deepEqual(nodePreviewPolicy("BV Pipe"),{actions:[]});
  assert.deepEqual(nodePreviewPolicy("BV Regional LoRA"),{actions:["Open LoRA Editor"]});
  assert.deepEqual(nodePreviewPolicy("BV Regional Native Conditioning"),{actions:[]});
  assert.equal(nodePreviewPolicy("BV Regional Debug"),undefined);
  assert.deepEqual(nodePreviewPolicy("BV LoRA Registry"),{actions:["Open LoRA Registry"]});
});

test("preview projection appends native-looking button rows only to the Vue preview body", () => {
  const appended = [];
  let widgetsMounted = false;
  const widgetRows = [
    "regional_json",
    "lora_bindings_json",
    "lora_v3_config_json",
    "detailer_v3_config_json",
    "lut_v3_config_json",
    "unrelated_widget",
  ].map((textContent) => ({ textContent, hidden: false, style: { display: "" } }));
  const body = {
    querySelector: () => null,
    querySelectorAll: (selector) => selector === '[data-testid="node-widget"]' && widgetsMounted ? widgetRows : [],
    append: (node) => appended.push(node),
  };
  const preview = {
    dataset: { nodeId: "preview-BV Regional Prompt" },
    querySelector: (selector) => selector === '[data-testid="node-body-preview-BV Regional Prompt"]' ? body : null,
  };
  const documentLike = {
    createElement(tagName) {
      return {
        tagName,
        className: "",
        dataset: {},
        attributes: {},
        children: [],
        append(...children) { this.children.push(...children); },
        setAttribute(name, value) { this.attributes[name] = value; },
        textContent: "",
      };
    },
  };

  assert.equal(applyNodePreviewProjection(preview, documentLike), true);
  assert.equal(appended.length, 1);
  assert.equal(appended[0].dataset.bvPreviewActions, "BV Regional Prompt");
  assert.deepEqual(appended[0].children.map((row) => row.children[1].children[0].textContent), [
    "Open Regional Editor",
    "Quick Edit Prompts",
  ]);
  assert.equal(preview.dataset.bvPreviewProjected, "BV Regional Prompt");
  widgetsMounted = true;
  assert.equal(applyNodePreviewProjection(preview, documentLike), true);
  assert.equal(appended.length, 1);
  assert.deepEqual(widgetRows.map((row) => row.hidden), [true, true, true, true, true, false]);
  assert.deepEqual(widgetRows.map((row) => row.style.display), ["none", "none", "none", "none", "none", ""]);
});

function previewFixture(nodeType,bodyRows,detailRows=[]){
  const body={querySelectorAll(selector){
    if(selector==='[data-testid="node-widget"]')return bodyRows;
    if(selector==='.lg-slot--input, .lg-slot--output')return bodyRows.filter(row=>row.classList?.contains?.("lg-slot--input")||row.classList?.contains?.("lg-slot--output"));
    return[];
  },append(){}};
  return {dataset:{nodeId:`preview-${nodeType}`,bvPreviewProjected:nodeType},querySelector:selector=>selector===`[data-testid="node-body-preview-${nodeType}"]`?body:null,querySelectorAll:selector=>selector==='[data-bv-preview-port]'?detailRows:[]};
}

test("Smart Pipe reserve ports stay hidden in the debug Ghost",()=>{
  const row={textContent:"v_001",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}};
  setLegacyDebugVisible(true);
  try{assert.equal(applyNodePreviewProjection(previewFixture("BV Smart Pipe",[row],[row]),{createElement(){throw new Error("no projected rows expected")}}),true);assert.equal(row.hidden,true);assert.equal(row.style.display,"none")}
  finally{setLegacyDebugVisible(false)}
});

test("normal preview hides legacy inputs and outputs in body and lower details",()=>{
  const rows=["pipe","v_001","pipe","out_001"].map((textContent,index)=>({textContent,hidden:false,style:{display:""},dataset:{bvPreviewPort:index<2?"input":"output"}}));
  const preview=previewFixture("BV Smart Pipe",[],rows);
  assert.equal(applyNodePreviewProjection(preview,{createElement(){throw new Error("no projected rows expected")}}),true);
  assert.deepEqual(rows.map(row=>row.hidden),[false,true,false,true]);
});

test("a legacy-only Pipe Ghost keeps its public pipe input and output instead of reserve fallbacks",()=>{
  const rows=[
    {textContent:"pipe",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"v_001",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"pipe",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
    {textContent:"out_001",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
  ];
  assert.equal(applyNodePreviewProjection(previewFixture("BV Pipe",rows,rows),{createElement(){throw new Error("no projected rows expected")}}),true);
  assert.deepEqual(rows.map(row=>row.hidden),[false,true,false,true]);
});

test("Regional Prompt ghost projects body and detail rows through semantic presentation roles",()=>{
  const rows=[
    {textContent:"regional",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
    {textContent:"lora_bindings",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
    {textContent:"regional_json STRING",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"resource_provider_1 BV_RUNTIME_RESOURCE_PROVIDER",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
  ];
  const preview=previewFixture("BV Regional Prompt",[],rows);
  assert.equal(applyNodePreviewProjection(preview,{createElement(){throw new Error("no projected rows expected")}}),true);
  assert.deepEqual(rows.map(row=>row.hidden),[false,true,true,true]);
  setLegacyDebugVisible(true);
  try{
    assert.equal(applyNodePreviewProjection(preview,{createElement(){throw new Error("no projected rows expected")}}),true);
    assert.deepEqual(rows.map(row=>row.hidden),[false,false,true,true]);
  }finally{setLegacyDebugVisible(false)}
});

test("Regional LoRA ghost hides internal and provider rows in body and lower details",()=>{
  const bodyRows=[
    {textContent:"regional BV_REGIONAL",hidden:false,style:{display:""},classList:{contains:name=>name==="lg-slot--input"}},
    {textContent:"regional BV_REGIONAL",hidden:false,style:{display:""},classList:{contains:name=>name==="lg-slot--output"}},
    {textContent:"operation COMBO",hidden:false,style:{display:""}},
    {textContent:"config_json STRING",hidden:false,style:{display:""}},
    {textContent:"resource_provider_1 BV_RUNTIME_RESOURCE_PROVIDER",hidden:false,style:{display:""},classList:{contains:name=>name==="lg-slot--input"}},
  ];
  const detailRows=[
    {textContent:"regional BV_REGIONAL",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"regional BV_REGIONAL",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
    {textContent:"operation COMBO",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"config_json STRING",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"resource_provider_1 BV_RUNTIME_RESOURCE_PROVIDER",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
  ];
  const preview=previewFixture("BV Regional LoRA",bodyRows,detailRows);
  for(const legacyDebug of [false,true]){
    setLegacyDebugVisible(legacyDebug);
    assert.equal(applyNodePreviewProjection(preview,{createElement(){return{className:"",dataset:{},append(){},setAttribute(){},textContent:""}}}),true);
    assert.deepEqual(bodyRows.map(row=>row.hidden),[false,false,true,true,true]);
    assert.deepEqual(detailRows.map(row=>row.hidden),[false,false,true,true,true]);
  }
  setLegacyDebugVisible(false);
});

test("Smart Pipe Merge ghost hides every reserve and its real JSON row in body and details",()=>{
  const slot=(textContent,direction)=>({textContent,hidden:false,style:{display:""},classList:{contains:name=>name===`lg-slot--${direction}`}});
  const bodyRows=[
    slot("pipe_001 BV_SMART_PIPE","input"),
    slot("pipe_016 BV_SMART_PIPE","input"),
    slot("pipe BV_SMART_PIPE","output"),
    {textContent:"bv_smart_pipe_merge_json STRING",hidden:false,style:{display:""}},
  ];
  const detailRows=[
    {textContent:"pipe_001 BV_SMART_PIPE",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"pipe_016 BV_SMART_PIPE",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"bv_smart_pipe_merge_json STRING",hidden:false,style:{display:""},dataset:{bvPreviewPort:"input"}},
    {textContent:"pipe BV_SMART_PIPE",hidden:false,style:{display:""},dataset:{bvPreviewPort:"output"}},
  ];
  const preview=previewFixture("BV Smart Pipe Merge",bodyRows,detailRows);
  for(const legacyDebug of[false,true]){
    setLegacyDebugVisible(legacyDebug);
    assert.equal(applyNodePreviewProjection(preview,{createElement(){return{className:"",dataset:{},append(){},setAttribute(){},textContent:""}}}),true);
    assert.deepEqual(bodyRows.map(row=>row.hidden),[true,true,false,true]);
    assert.deepEqual(detailRows.map(row=>row.hidden),[true,true,true,false]);
  }
  setLegacyDebugVisible(false);
});

test("a late lower-detail mutation resolves the sibling preview through its card",()=>{
  const preview={dataset:{nodeId:"preview-BV Regional Prompt"}};
  const card={querySelector:selector=>selector==='[data-node-id^="preview-"]'?preview:null};
  const detailRow={closest:selector=>selector==='[data-testid="node-preview-card"]'?card:null};
  assert.deepEqual(previewTargetsForMutationRoot(detailRow),[preview]);
});

test("lower detail names come from the label span instead of concatenated row text",()=>{
  const label={textContent:"regional_json"};
  const row={textContent:"regional_jsonSTRING",querySelector:selector=>selector==="span"?label:null};
  assert.equal(previewRowName(row),"regional_json");
});

test("an empty lower detail section is hidden while a public section remains",()=>{
  const heading={textContent:"INPUTS"};
  const hiddenRow={hidden:true,style:{display:"none"}};
  const visibleRow={hidden:false,style:{display:""}};
  const hiddenSection={children:[heading,hiddenRow],hidden:false,style:{display:""}};
  heading.parentElement=hiddenSection;
  const outputHeading={textContent:"OUTPUTS"};
  const visibleSection={children:[outputHeading,visibleRow],hidden:false,style:{display:""}};
  outputHeading.parentElement=visibleSection;
  const card={querySelectorAll:()=>[heading,outputHeading]};
  syncPreviewDetailSections({closest:()=>card});
  assert.equal(hiddenSection.hidden,true);
  assert.equal(hiddenSection.style.display,"none");
  assert.equal(visibleSection.hidden,false);
});

test("lower detail cleanup leaves unrelated card sections untouched",()=>{
  const heading={textContent:"Description"};
  const section={children:[heading],hidden:false,style:{display:""}};
  heading.parentElement=section;
  syncPreviewDetailSections({closest:()=>({querySelectorAll:()=>[heading]})});
  assert.equal(section.hidden,false);
  assert.equal(section.style.display,"");
});

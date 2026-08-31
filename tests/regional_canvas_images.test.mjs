import assert from"node:assert/strict";
import{readFileSync}from"node:fs";
import test from"node:test";
import React from"../ui/node_modules/react/index.js";
import{renderToStaticMarkup}from"../ui/node_modules/react-dom/server.node.js";
import RegionalCanvasImageSelect,{regionalCanvasImageOptions}from"../ui/src/regional/RegionalCanvasImageSelect.tsx";
import{emptyRegionalCanvasImageCatalog,ingestRegionalCanvasImagePublication,LAST_SENT_IMAGE_SELECTION,parseRegionalCanvasImagePublication,pruneRegionalCanvasImageCatalog,regionalCanvasImageId,regionalCanvasImagesForDocument,regionalCanvasSelectionForDocument,regionalCanvasSelectionsForScope,rememberRegionalCanvasSelection,resolveRegionalCanvasImage}from"../ui/src/regional/regionalCanvasImages.ts";
import{currentRegionalCanvasPublication,findNodeByExecutionId,regionalCanvasExecutionOutputs,regionalCanvasSourceIsCurrent,subscribeRegionalCanvasExecutions}from"../ui/src/regional/regionalCanvasExecution.ts";

const publication=(document_id,node_id,kind,batch_id,files)=>({schema:"bv.regional.canvas-images",version:1,document_id,source:{node_id,kind},batch_id,images:files.map((filename,index)=>({index,filename,subfolder:"",type:"temp"}))});
const styles=readFileSync(new URL("../ui/src/index.css",import.meta.url),"utf8");
const ruleBody=selector=>{const start=styles.lastIndexOf(`${selector} {`);assert.notEqual(start,-1,`missing CSS rule: ${selector}`);return styles.slice(styles.indexOf("{",start)+1,styles.indexOf("}",start))};
const escapeRegExp=value=>value.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
const hasDeclaration=(body,property,value)=>assert.match(body,new RegExp(`${property}\\s*:\\s*${escapeRegExp(value)}`));

test("catalog keeps workflows documents sources and complete batches isolated",()=>{
  const a={},b={};let catalog=emptyRegionalCanvasImageCatalog();
  catalog=ingestRegionalCanvasImagePublication(catalog,a,publication("doc","1","regional-image-send","a1",["a.png","b.png"]),"1");
  catalog=ingestRegionalCanvasImagePublication(catalog,a,publication("doc","2","regional-image-save","a2",["c.png"]),"2");
  catalog=ingestRegionalCanvasImagePublication(catalog,b,publication("doc","1","regional-image-send","b1",["other.png"]),"1");
  assert.deepEqual(regionalCanvasImagesForDocument(catalog,a,"doc").map(image=>image.filename),["a.png","b.png","c.png"]);
  assert.equal(resolveRegionalCanvasImage(catalog,a,"doc",LAST_SENT_IMAGE_SELECTION).filename,"c.png");
  assert.equal(resolveRegionalCanvasImage(catalog,b,"doc",LAST_SENT_IMAGE_SELECTION).filename,"other.png");
});

test("reexecution replaces one source batch while explicit selection remains stable or unavailable",()=>{
  const scope={};let catalog=emptyRegionalCanvasImageCatalog(),selected=regionalCanvasImageId("7","regional-image-send",1);
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("doc","7","regional-image-send","one",["old-a.png","old-b.png"]),"7");
  assert.equal(resolveRegionalCanvasImage(catalog,scope,"doc",selected).filename,"old-b.png");
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("doc","7","regional-image-send","two",["new-a.png","new-b.png"]),"7");
  assert.equal(resolveRegionalCanvasImage(catalog,scope,"doc",selected).filename,"new-b.png");
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("doc","7","regional-image-send","three",["only.png"]),"7");
  assert.equal(resolveRegionalCanvasImage(catalog,scope,"doc",selected),null);
});

test("canvas selector renders Last Sent Image and a fail-closed unavailable selection",()=>{
  const scope={};let catalog=emptyRegionalCanvasImageCatalog();catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("doc","7","regional-image-send","one",["a.png"]),"7");
  const images=regionalCanvasImagesForDocument(catalog,scope,"doc"),missing=regionalCanvasImageId("7","regional-image-send",9);
  const apiURL=path=>`/api${path}`;
  const normal=renderToStaticMarkup(React.createElement(RegionalCanvasImageSelect,{images,selection:LAST_SENT_IMAGE_SELECTION,onSelection(){},apiURL}));
  const unavailable=renderToStaticMarkup(React.createElement(RegionalCanvasImageSelect,{images,selection:missing,onSelection(){},apiURL}));
  const options=regionalCanvasImageOptions(images,missing,apiURL);
  assert.match(normal,/Last Sent Image/);assert.match(normal,/src="\/api\/view\?filename=a.png/);
  assert.match(unavailable,/Source unavailable/);assert.doesNotMatch(unavailable,/<img/);
  assert.equal(options[0].src,"/api/view?filename=a.png&type=temp&subfolder=");
  assert.equal(options[1].disabled,true);assert.equal(options[1].src,undefined);
  assert.equal(options[2].thumbnail,"/api/view?filename=a.png&type=temp&subfolder=");
});

test("Last Sent Image remains selectable without a published image",()=>{
  const options=regionalCanvasImageOptions([],LAST_SENT_IMAGE_SELECTION,path=>path);
  assert.deepEqual(options,[{id:LAST_SENT_IMAGE_SELECTION,name:"Last Sent Image"}]);
  const markup=renderToStaticMarkup(React.createElement(RegionalCanvasImageSelect,{images:[],selection:LAST_SENT_IMAGE_SELECTION,onSelection(){},apiURL:path=>path}));
  assert.match(markup,/Last Sent Image/);assert.match(markup,/bv-image-picker-placeholder/);assert.doesNotMatch(markup,/<img/);
});

test("canvas selector hides technical filenames and labels multi-image batches semantically",()=>{
  const scope={};let catalog=emptyRegionalCanvasImageCatalog();catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("doc","7","regional-image-send","batch",["bv_regional_canvas_temp_first.png","bv_regional_canvas_temp_second.png"]),"7");
  const images=regionalCanvasImagesForDocument(catalog,scope,"doc"),options=regionalCanvasImageOptions(images,images[1].id,path=>path).slice(1);
  assert.deepEqual(options.map(option=>option.name),["Send #7 · Image 1","Send #7 · Image 2"]);
  options.forEach((option,index)=>{assert.equal(Object.hasOwn(option,"meta"),false);assert.equal(option.id,images[index].id);assert.match(option.src,new RegExp(escapeRegExp(images[index].filename)));assert.equal(option.thumbnail,option.src)});
  const markup=renderToStaticMarkup(React.createElement(RegionalCanvasImageSelect,{images,selection:images[1].id,onSelection(){},apiURL:path=>path}));
  assert.match(markup,/Send #7 · Image 2/);assert.doesNotMatch(markup,/<small/);
});

test("canvas selector width is stable across option contents",()=>{
  const picker=ruleBody('.bv-canvas-image-select');
  hasDeclaration(picker,"box-sizing","border-box");
  hasDeclaration(picker,"display","flex");
  hasDeclaration(picker,"align-items","center");
  hasDeclaration(picker,"flex","0 0 min(300px,40vw)");
  hasDeclaration(picker,"inline-size","min(300px,40vw)");
  hasDeclaration(picker,"min-inline-size","min(220px,40vw)");
  hasDeclaration(picker,"max-inline-size","min(300px,40vw)");
  const control=ruleBody('.bv-canvas-image-select .bv-image-picker-control');
  hasDeclaration(control,"box-sizing","border-box");
  hasDeclaration(control,"width","100%");
  hasDeclaration(control,"min-width","0");
  hasDeclaration(control,"height","28px");
  const trigger=ruleBody('.bv-canvas-image-select .bv-image-picker-control>.bv-image-picker-trigger');
  hasDeclaration(trigger,"box-sizing","border-box");
  hasDeclaration(trigger,"height","100%");
  hasDeclaration(trigger,"min-height","0");
  hasDeclaration(trigger,"padding-block","0");
  hasDeclaration(ruleBody('.zoom-controls button'),"height","28px");
});

test("canvas selections remain ephemeral and isolated by workflow and document",()=>{
  const selections=new WeakMap(),scopeA={},scopeB={},a=regionalCanvasSelectionsForScope(selections,scopeA),b=regionalCanvasSelectionsForScope(selections,scopeB);rememberRegionalCanvasSelection(a,"doc","image-a");rememberRegionalCanvasSelection(b,"doc","image-b");
  assert.equal(regionalCanvasSelectionForDocument(a,"doc"),"image-a");assert.equal(regionalCanvasSelectionForDocument(b,"doc"),"image-b");assert.equal(regionalCanvasSelectionForDocument(a,"new-doc"),LAST_SENT_IMAGE_SELECTION);
});

test("Last Sent Image follows an identical A batch accepted again after B",()=>{
  const scope={};let catalog=emptyRegionalCanvasImageCatalog();const a=publication("doc","1","regional-image-send","same",["a.png"]),b=publication("doc","2","regional-image-send","other",["b.png"]);
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,a,"1");catalog=ingestRegionalCanvasImagePublication(catalog,scope,b,"2");assert.equal(resolveRegionalCanvasImage(catalog,scope,"doc",LAST_SENT_IMAGE_SELECTION).filename,"b.png");
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,a,"1");assert.equal(resolveRegionalCanvasImage(catalog,scope,"doc",LAST_SENT_IMAGE_SELECTION).filename,"a.png");
});

test("retarget and pruning remove stale source entries and malformed publications fail closed",()=>{
  const scope={};let catalog=emptyRegionalCanvasImageCatalog();
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("old","7","regional-image-send","one",["a.png"]),"7");
  catalog=ingestRegionalCanvasImagePublication(catalog,scope,publication("new","7","regional-image-send","two",["b.png"]),"7");
  assert.equal(regionalCanvasImagesForDocument(catalog,scope,"old").length,0);
  const unchanged=ingestRegionalCanvasImagePublication(catalog,scope,{schema:"wrong"},"7");assert.equal(unchanged,catalog);assert.equal(parseRegionalCanvasImagePublication({}),null);
  catalog=pruneRegionalCanvasImageCatalog(catalog,scope,()=>false);assert.equal(regionalCanvasImagesForDocument(catalog,scope,"new").length,0);
});

test("queue origin rejects stale workflow results and resolves nested execution ids",async()=>{
  const listeners=new Map(),api={queuePrompt:async()=>({prompt_id:"p-1"}),addEventListener(type,callback){listeners.set(type,callback)},removeEventListener(){}};
  const scopeA={},scopeB={},accepted=[];let active=scopeA;
  const stop=subscribeRegionalCanvasExecutions(api,()=>active,(event,scope)=>{if(scope===active)accepted.push(event.detail.output)});
  await api.queuePrompt();active=scopeB;listeners.get("executed")({type:"executed",detail:{prompt_id:"p-1",output:"stale"}});assert.deepEqual(accepted,[]);
  stop();
  const leaf={id:9},parent={id:4,subgraph:{_nodes:[leaf]}},root={_nodes:[parent]};assert.equal(findNodeByExecutionId(root,"4:9"),leaf);assert.equal(findNodeByExecutionId(root,"4:8"),null);
});

test("execution start binds a prompt to its queue-time scope before the HTTP response resolves",async()=>{
  const listeners=new Map();let resolveQueue;const queuedResponse=new Promise(resolve=>{resolveQueue=resolve});
  const api={queuePrompt:()=>queuedResponse,addEventListener(type,callback){listeners.set(type,callback)},removeEventListener(){}};
  const scope={},accepted=[];subscribeRegionalCanvasExecutions(api,()=>scope,(event,owner)=>{if(owner===scope)accepted.push(event.detail.output)});
  const queued=api.queuePrompt();listeners.get("execution_start")({type:"execution_start",detail:{prompt_id:"early"}});listeners.get("executed")({type:"executed",detail:{prompt_id:"early",output:"accepted"}});
  assert.deepEqual(accepted,["accepted"]);resolveQueue({prompt_id:"early"});await queued;
});

test("two pending prompts consume distinct queue-time scopes before either response resolves",async()=>{
  const listeners=new Map(),resolvers=[],api={queuePrompt:()=>new Promise(resolve=>resolvers.push(resolve)),addEventListener(type,callback){listeners.set(type,callback)},removeEventListener(){}};
  const scopeA={},scopeB={},accepted=[];let active=scopeA;subscribeRegionalCanvasExecutions(api,()=>active,(event,owner)=>accepted.push([event.detail.output,owner]));
  const first=api.queuePrompt();active=scopeB;const second=api.queuePrompt();
  listeners.get("execution_start")({detail:{prompt_id:"first"}});listeners.get("execution_start")({detail:{prompt_id:"second"}});
  listeners.get("executed")({detail:{prompt_id:"first",output:"A"}});listeners.get("executed")({detail:{prompt_id:"second",output:"B"}});
  assert.deepEqual(accepted,[["A",scopeA],["B",scopeB]]);resolvers[0]({prompt_id:"first"});resolvers[1]({prompt_id:"second"});await Promise.all([first,second]);
});

test("late publications are rejected after source delete retarget or Prompt disconnect",()=>{
  const send={id:7,type:"BV Regional Image Send",widgets:[{name:"document_id",value:"doc-a"}]},prompt={id:9,type:"BV Regional Prompt",widgets:[{name:"regional_json",value:JSON.stringify({document_id:"doc-a"})}],inputs:[{name:"canvas_image",link:44}]},root={_nodes:[send,prompt]};
  const sent=publication("doc-a","7","regional-image-send","one",["a.png"]),prompted=publication("doc-a","9","regional-prompt-canvas","two",["b.png"]);
  assert.ok(currentRegionalCanvasPublication(root,sent,"7"));assert.ok(currentRegionalCanvasPublication(root,prompted,"9"));
  send.widgets[0].value="doc-b";assert.equal(currentRegionalCanvasPublication(root,sent,"7"),null);
  prompt.inputs[0].link=null;assert.equal(currentRegionalCanvasPublication(root,prompted,"9"),null);
  root._nodes=[];assert.equal(regionalCanvasSourceIsCurrent(root,"7","regional-image-send","doc-b"),false);
});

test("cached execution hydrates the matching current node output",()=>{
  const first={bv_regional_canvas_images:[publication("doc","7","regional-image-send","one",["a.png"])]},second={bv_regional_canvas_images:[publication("doc","8","regional-image-save","two",["b.png"])]};
  assert.deepEqual(regionalCanvasExecutionOutputs({type:"execution_cached",detail:{nodes:["7","8"]}},{7:first,8:second}),[{nodeId:"7",output:first},{nodeId:"8",output:second}]);
  assert.deepEqual(regionalCanvasExecutionOutputs({type:"executed",detail:{node:"7",output:first}},undefined),[{nodeId:"7",output:first}]);
});

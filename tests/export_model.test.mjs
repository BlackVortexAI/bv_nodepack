import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertCanvasSize, normalizeExportOptions, rectFromItems, suggestedFilename } from "../ui/src/export/model.ts";
import { createOffscreenGraphCanvas, disposeOffscreenGraphCanvas, graphExportBounds, resolveGraphSubject } from "../ui/src/export/graphCapture.ts";

test("export options use the agreed safe defaults",()=>{
  assert.deepEqual(normalizeExportOptions(),{source:"graph",background:"transparent",scale:2,padding:32,embedWorkflow:true,filename:undefined});
  assert.equal(normalizeExportOptions({scale:7,padding:900}).scale,2);
  assert.equal(normalizeExportOptions({scale:7,padding:900}).padding,256);
});

test("bounds are tight and add only explicit uniform padding",()=>{
  assert.deepEqual(rectFromItems([{left:-20,top:10,right:80,bottom:70},{left:100,top:-5,right:140,bottom:40}],16),{left:-36,top:-21,right:156,bottom:86,width:192,height:107});
});

test("filenames are stable and scope-aware",()=>{
  assert.equal(suggestedFilename("Midnight Café.json","selection"),"Midnight-Cafe--selection.png");
  assert.equal(suggestedFilename("Demo","graph","Detail Pass"),"Demo--Detail-Pass--graph.png");
  assert.equal(suggestedFilename("Demo","ui:BV Regional Editor"),"Demo--BV-Regional-Editor.png");
});

test("unsafe canvas sizes fail instead of silently scaling",()=>{
  assert.doesNotThrow(()=>assertCanvasSize(4096,4096));
  assert.throws(()=>assertCanvasSize(20000,100),/safe canvas limit/);
});

test("entire subgraph bounds include native input and output interface nodes",()=>{
  const ordinary={pos:[100,100],size:[200,100]},inputBounds=new Float64Array([-100,110,80,80]),outputBounds=new Float64Array([400,110,80,80]);
  const inputNode={boundingRect:inputBounds,pos:inputBounds.subarray(0,2),size:inputBounds.subarray(2,4)},outputNode={boundingRect:outputBounds,pos:outputBounds.subarray(0,2),size:outputBounds.subarray(2,4)};
  const rootGraph={id:"root"},subgraph={id:"subgraph",_nodes:[ordinary],_groups:[],inputNode,outputNode};
  const subject=resolveGraphSubject({graph:rootGraph,canvas:{graph:subgraph,getCurrentGraph:()=>subgraph,selectedItems:new Set()}});
  assert.deepEqual(graphExportBounds(subject,"graph",0),{left:-100,top:100,right:480,bottom:200,width:580,height:100});
});

test("offscreen subgraph canvases initialize against the root graph before switching and always detach",()=>{
  const calls=[];
  class CanvasMock{
    constructor(canvas,graph){
      assert.equal(graph,rootGraph,"the active subgraph must not be passed into the unsafe ComfyUI constructor path");
      this.canvas=canvas;this.graph=graph;calls.push("construct-root");
    }
    stopRendering(){calls.push("stop")}
    setGraph(graph){calls.push(graph?"switch-subgraph":"detach");this.graph=graph}
    setCanvas(canvas){calls.push(canvas?"canvas":"clear-canvas");this.canvas=canvas}
    unbind_events(){calls.push("unbind")}
  }
  const element={},rootGraph={id:"root"},graph={id:"subgraph"},offscreen=createOffscreenGraphCanvas(CanvasMock,element,graph,rootGraph);
  assert.equal(offscreen.canvas,element);
  assert.equal(offscreen.graph,graph);
  assert.deepEqual(calls,["construct-root","stop","switch-subgraph"]);
  disposeOffscreenGraphCanvas(offscreen);
  assert.equal(offscreen.graph,null);
  assert.equal(offscreen.canvas,null);
  assert.deepEqual(calls,["construct-root","stop","switch-subgraph","stop","detach","clear-canvas","unbind"]);
});

test("failed offscreen graph attachment removes partially registered canvases",()=>{
  const calls=[];
  const rootGraph={id:"root"};
  const graph={
    attachCanvas(canvas){calls.push("attach");canvas.graph=this;throw new Error("attach failed")},
    detachCanvas(canvas){calls.push("detach");canvas.graph=null}
  };
  class CanvasMock{
    constructor(canvas,attachedGraph){assert.equal(attachedGraph,rootGraph);this.canvas=canvas;this.graph=attachedGraph}
    stopRendering(){calls.push("stop")}
    setCanvas(canvas){calls.push(canvas?"canvas":"clear-canvas");this.canvas=canvas}
    unbind_events(){calls.push("unbind")}
  }
  assert.throws(()=>createOffscreenGraphCanvas(CanvasMock,{},graph,rootGraph),/attach failed/);
  assert.deepEqual(calls,["stop","attach","detach","stop","clear-canvas","unbind"]);
});

test("export integration exposes the agreed command, context menus, and versioned automation API",()=>{
  const root=path.resolve(import.meta.dirname,"..");
  const index=fs.readFileSync(path.join(root,"ui/src/index.tsx"),"utf8"),install=fs.readFileSync(path.join(root,"ui/src/export/install.ts"),"utf8"),windowSource=fs.readFileSync(path.join(root,"ui/src/ui/window.tsx"),"utf8");
  assert.match(index,/id:\s*"bv\.export\.open"/);
  assert.match(index,/content:\s*"BV Node Pack"/);
  assert.match(index,/Export Graph Image…/);
  assert.match(index,/getTopMenu\?\.\(\)\.close\(event\)/);
  assert.match(index,/closeAllContextMenus/);
  for(const method of ["capture","download","openDialog","listSources"])assert.match(install,new RegExp(`\\b${method}\\b`));
  assert.match(install,/window\.bvNodepack\.export\.v1/);
  assert.match(windowSource,/Export BV UI Image…/);
  assert.match(windowSource,/data-bv-capture-window/);
  const dialog=fs.readFileSync(path.join(root,"ui/src/export/ExportDialog.tsx"),"utf8");
  assert.doesNotMatch(dialog,/<select\b/);
  assert.match(dialog,/<BvManagedWindow open=\{open\}/);
  assert.match(dialog,/footerStackAt=\{540\}/);
  assert.match(dialog,/<BvFooterActions/);
  assert.doesNotMatch(dialog,/<Dialog open=\{open\}/);
  assert.match(dialog,/<SelectField label="Source"/);
  assert.match(dialog,/<SelectField label="Background"/);
  assert.match(dialog,/<SelectField label="Scale"/);
  assert.match(dialog,/<DefinitionList compact/);
  assert.match(dialog,/<Callout tone="danger"/);
  assert.match(dialog,/sessionStorage\.setItem\(KEY,JSON\.stringify\(updated\)\)/);
  assert.match(dialog,/const run=async\(\)=>\{setBusy/);
  assert.match(dialog,/await saveExport\(await captureExport\(app,\{\.\.\.options,filename:filename\(\)\}\)\)/);
  const save=fs.readFileSync(path.join(root,"ui/src/export/save.ts"),"utf8");
  assert.doesNotMatch(save,/showSaveFilePicker/);
  assert.match(save,/anchor\.download=result\.filename/);
  const graphCapture=fs.readFileSync(path.join(root,"ui/src/export/graphCapture.ts"),"utf8");
  assert.match(graphCapture,/show_info:false/);
  const floating=fs.readFileSync(path.join(root,"ui/src/ui/components/floating.tsx"),"utf8");
  assert.match(floating,/event\.composedPath\(\)/);
  assert.match(floating,/path\.includes\(anchor\.current as EventTarget\)/);
  assert.match(floating,/path\.includes\(panel\.current as EventTarget\)/);
  assert.match(floating,/document\.addEventListener\("pointerdown",pointerDown,true\)/);
});

test("modern-screenshot is pinned and its MIT notice is retained",()=>{
  const root=path.resolve(import.meta.dirname,"..");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"ui/package.json"),"utf8")),notices=fs.readFileSync(path.join(root,"THIRD_PARTY_NOTICES.md"),"utf8");
  assert.equal(manifest.dependencies["modern-screenshot"],"4.7.0");
  assert.match(notices,/## modern-screenshot/);
  assert.match(notices,/Copyright \(c\) 2021-present wxm/);
});

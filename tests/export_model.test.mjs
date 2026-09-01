import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertCanvasSize, normalizeExportOptions, rectFromItems, suggestedFilename } from "../ui/src/export/model.ts";
import { copyLiveDomState } from "../ui/src/export/domRaster.ts";
import {
  awaitGraphCaptureImages,
  clientRectToExportRect,
  createOffscreenGraphCanvas,
  disposeOffscreenGraphCanvas,
  graphExportBounds,
  nodeDomGraphRect,
  planGraphDomLayers,
  resolveGraphSubject,
  settleDeferredCanvasImages,
  withNeutralPositionableSelection,
  withSuppressedCanvasTransientState,
  widgetGraphRect
} from "../ui/src/export/graphCapture.ts";

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

test("graph DOM layers choose one complete Nodes 2 node or Classic widget roots without double-rendering",()=>{
  const vueRoot={id:"vue-root"},widgetA={id:"positive"},widgetB={id:"negative"};
  const vueNode={id:11,widgets:[{element:{id:"nested-widget"}}]},classicNode={id:12,widgets:[{element:widgetA},{inputEl:widgetB}]},unselectedNode={id:13,widgets:[{element:{id:"outside-scope"}}]};
  const plan=planGraphDomLayers([vueNode,classicNode],{
    nodeRootOf:node=>node===vueNode?vueRoot:null,
    widgetRootsOf:node=>node.widgets.flatMap(widget=>[widget.element,widget.inputEl].filter(Boolean))
  });
  assert.deepEqual(plan.layers.map(layer=>[layer.kind,layer.node.id,layer.element.id]),[["node",11,"vue-root"],["widget",12,"positive"],["widget",12,"negative"]]);
  assert.deepEqual([...plan.suppressCanvasNodes],[vueNode]);
  assert.ok(!plan.layers.some(layer=>layer.node===unselectedNode));
});

test("client DOM rectangles map to export pixels independently of live pan and zoom",()=>{
  const result=clientRectToExportRect(
    {left:200,top:150,width:150,height:100},
    {left:100,top:50,width:1200,height:800},
    {offset:[10,-20],scale:.5},
    {left:150,top:100,right:900,bottom:700,width:750,height:600},
    2
  );
  assert.deepEqual(result,{left:80,top:240,right:680,bottom:640,width:600,height:400});
});

test("offscreen Classic widgets derive geometry from their node contract instead of viewport DOM",()=>{
  const node={pos:[1000,-200],size:[400,300]},widget={y:80,computedHeight:120,margin:10};
  assert.deepEqual(widgetGraphRect(node,widget),{left:1010,top:-110,right:1390,bottom:-10,width:380,height:100});
});

test("Nodes 2 DOM roots use the Vue position and dimensions instead of overridable LiteGraph bounds",()=>{
  const node={pos:[200,300],size:[220,140],title_mode:"NO_TITLE",getBounding:()=>[-999,-888,777,666],onBounding:()=>{}};
  const element={offsetWidth:260,offsetHeight:190,getBoundingClientRect:()=>({left:900,top:800,width:520,height:380})};
  const rect=nodeDomGraphRect(node,element,{ds:{scale:2}},30);
  assert.deepEqual(rect,{left:200,top:270,right:460,bottom:460,width:260,height:190});
  const subject={graphItems:[node],groups:[],selectedNodes:new Set(),selectedGroups:new Set()};
  assert.deepEqual(graphExportBounds(subject,"graph",0,[rect]),{left:-999,top:-888,right:460,bottom:460,width:1459,height:1348});
});

test("live form values survive the exporter clone and a second serializer clone without exposing secrets",()=>{
  const previous={HTMLElement:globalThis.HTMLElement,HTMLInputElement:globalThis.HTMLInputElement,HTMLTextAreaElement:globalThis.HTMLTextAreaElement,HTMLSelectElement:globalThis.HTMLSelectElement,HTMLCanvasElement:globalThis.HTMLCanvasElement};
  class ElementMock{
    constructor(children=[]){this.children=children;this.scrollTop=0;this.scrollLeft=0;this.attributes=new Map()}
    querySelectorAll(){const result=[];const visit=item=>{for(const child of item.children??[]){result.push(child);visit(child)}};visit(this);return result}
    setAttribute(name,value){this.attributes.set(name,String(value))}
    removeAttribute(name){this.attributes.delete(name)}
    hasAttribute(name){return this.attributes.has(name)}
    cloneNode(deep=false){const clone=new ElementMock(deep?this.children.map(child=>child.cloneNode(true)):[]);for(const [name,value] of this.attributes)clone.setAttribute(name,value);return clone}
  }
  class InputMock extends ElementMock{
    constructor(type,defaultValue,value,defaultChecked=false,checked=defaultChecked){super();this.type=type;this.defaultValue=defaultValue;this.value=value;this.defaultChecked=defaultChecked;this.checked=checked;this.indeterminate=false}
    cloneNode(){const clone=new InputMock(this.type,this.defaultValue,this.defaultValue,this.defaultChecked,this.defaultChecked);for(const [name,value] of this.attributes)clone.setAttribute(name,value);return clone}
  }
  class TextareaMock extends ElementMock{
    constructor(defaultValue,value=defaultValue){super();this._defaultValue=defaultValue;this.value=value;this.textContent=defaultValue}
    get defaultValue(){return this._defaultValue}
    set defaultValue(value){this._defaultValue=String(value);this.textContent=String(value)}
    cloneNode(){return new TextareaMock(this.defaultValue,this.defaultValue)}
  }
  class OptionMock extends ElementMock{
    constructor(value,defaultSelected,selected=defaultSelected){super();this.value=value;this.defaultSelected=defaultSelected;this.selected=selected}
    cloneNode(){const clone=new OptionMock(this.value,this.defaultSelected,this.defaultSelected);for(const [name,value] of this.attributes)clone.setAttribute(name,value);return clone}
  }
  class SelectMock extends ElementMock{
    constructor(options,multiple=false){super(options);this.options=options;this.multiple=multiple}
    get value(){return this.options.find(option=>option.selected)?.value??""}
    set value(value){let matched=false;for(const option of this.options){const selected=!matched&&option.value===value;option.selected=selected;matched||=selected}}
    get selectedIndex(){return this.options.findIndex(option=>option.selected)}
    cloneNode(deep=false){const options=deep?this.options.map(option=>option.cloneNode(true)):[];return new SelectMock(options,this.multiple)}
  }
  class CanvasMock extends ElementMock{}
  Object.assign(globalThis,{HTMLElement:ElementMock,HTMLInputElement:InputMock,HTMLTextAreaElement:TextareaMock,HTMLSelectElement:SelectMock,HTMLCanvasElement:CanvasMock});
  try{
    const textarea=new TextareaMock("","positive\nsecond <&> 😀"),textInput=new InputMock("text","","live input"),checkbox=new InputMock("checkbox","on","on",false,true),password=new InputMock("password","","super-secret"),file=new InputMock("file","","C:\\private\\model.png"),hidden=new InputMock("hidden","","internal-token");
    password.setAttribute("value","super-secret");file.setAttribute("value","C:\\private\\model.png");hidden.setAttribute("value","internal-token");
    const select=new SelectMock([new OptionMock("a",true,false),new OptionMock("b",false,true),new OptionMock("c",false,true)],true);
    const nested=new ElementMock([textarea,textInput,checkbox]),source=new ElementMock([nested,select,password,file,hidden]),sourceBefore={textareaValue:textarea.value,passwordValue:password.value,fileValue:file.value,hiddenValue:hidden.value,selected:select.options.map(option=>option.selected)};
    const clone1=source.cloneNode(true);copyLiveDomState(source,clone1);const clone2=clone1.cloneNode(true),[nested2,select2,password2,file2,hidden2]=clone2.children,[textarea2,textInput2,checkbox2]=nested2.children;
    assert.equal(textarea2.value,"positive\nsecond <&> 😀");
    assert.equal(textarea2.textContent,"positive\nsecond <&> 😀");
    assert.equal(textInput2.value,"live input");
    assert.equal(checkbox2.checked,true);
    assert.equal(checkbox2.defaultChecked,true);
    assert.equal(checkbox2.hasAttribute("checked"),true);
    assert.deepEqual(select2.options.map(option=>option.selected),[false,true,true]);
    assert.doesNotMatch(password2.value,/super-secret/);
    assert.doesNotMatch(password2.attributes.get("value")??"",/super-secret/);
    assert.equal(file2.value,"");
    assert.equal(file2.hasAttribute("value"),false);
    assert.equal(hidden2.value,"");
    assert.equal(hidden2.hasAttribute("value"),false);
    assert.deepEqual({textareaValue:textarea.value,passwordValue:password.value,fileValue:file.value,hiddenValue:hidden.value,selected:select.options.map(option=>option.selected)},sourceBefore);
  }finally{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value}}
});

test("preview readiness includes Nodes 2 layer images, Classic node images, and deduplicates shared instances",async()=>{
  const calls=[];
  const shared={fakeImage:true,complete:true,src:"shared.png",decode:async()=>calls.push("shared")};
  const vueOnly={fakeImage:true,complete:true,src:"vue.png",decode:async()=>calls.push("vue")};
  const classicOnly={fakeImage:true,complete:true,src:"classic.png",decode:async()=>calls.push("classic")};
  const adapter={
    isImage:value=>value?.fakeImage===true,
    imagesIn:element=>element.images??[],
    sourceOf:image=>image.src
  };
  await awaitGraphCaptureImages([{imgs:[classicOnly,shared]}],[{element:{images:[shared,vueOnly]}}],adapter);
  assert.deepEqual(calls.sort(),["classic","shared","vue"]);

  const broken={fakeImage:true,complete:true,src:"broken.png",decode:async()=>{throw new Error("decode failed")}};
  await assert.rejects(()=>awaitGraphCaptureImages([],[{element:{images:[broken]}}],adapter),/visible graph preview image.*broken\.png/i);
});

test("selection is neutral only during a synchronous draw and restored exactly after success or failure",()=>{
  const selected={selected:true},explicitFalse={selected:false},inherited=Object.create({selected:true});
  const items=[selected,explicitFalse,inherited];
  const before=items.map(item=>({owns:Object.hasOwn(item,"selected"),value:item.selected,descriptor:Object.getOwnPropertyDescriptor(item,"selected")}));
  const result=withNeutralPositionableSelection(items,()=>{
    assert.deepEqual(items.map(item=>item.selected),[false,false,false]);
    return "drawn";
  });
  assert.equal(result,"drawn");
  items.forEach((item,index)=>{
    assert.equal(Object.hasOwn(item,"selected"),before[index].owns);
    assert.equal(item.selected,before[index].value);
    assert.deepEqual(Object.getOwnPropertyDescriptor(item,"selected"),before[index].descriptor);
  });

  const expected=new Error("draw failed");
  assert.throws(()=>withNeutralPositionableSelection(items,()=>{throw expected}),error=>error===expected);
  items.forEach((item,index)=>{
    assert.equal(Object.hasOwn(item,"selected"),before[index].owns);
    assert.equal(item.selected,before[index].value);
    assert.deepEqual(Object.getOwnPropertyDescriptor(item,"selected"),before[index].descriptor);
  });
});

test("offscreen canvas transient containers are restored by identity after success and failure",()=>{
  const selectedItems=new Set([{id:1}]),selectedNodes={1:{id:1}},highlightedLinks={4:true},nodeOver={id:2};
  const canvas={selectedItems,selected_nodes:selectedNodes,highlighted_links:highlightedLinks,node_over:nodeOver};
  const assertNeutral=()=>{
    assert.equal(canvas.selectedItems.size,0);
    assert.deepEqual(canvas.selected_nodes,{});
    assert.deepEqual(canvas.highlighted_links,{});
    assert.equal(canvas.node_over,null);
  };
  withSuppressedCanvasTransientState(canvas,assertNeutral);
  assert.equal(canvas.selectedItems,selectedItems);assert.equal(canvas.selected_nodes,selectedNodes);assert.equal(canvas.highlighted_links,highlightedLinks);assert.equal(canvas.node_over,nodeOver);
  const expected=new Error("canvas draw failed");
  assert.throws(()=>withSuppressedCanvasTransientState(canvas,()=>{assertNeutral();throw expected}),error=>error===expected);
  assert.equal(canvas.selectedItems,selectedItems);assert.equal(canvas.selected_nodes,selectedNodes);assert.equal(canvas.highlighted_links,highlightedLinks);assert.equal(canvas.node_over,nodeOver);
});

test("the final graph capture barrier flushes deferred Classic preview drawing",async()=>{
  let previewDrawn=false;
  queueMicrotask(()=>{previewDrawn=true});
  await settleDeferredCanvasImages();
  assert.equal(previewDrawn,true);
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

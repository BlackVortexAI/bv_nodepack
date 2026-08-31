import assert from "node:assert/strict";
import test from "node:test";
import {configureReactNodeWidgetHost,installReactNodeWidgetHost,refreshReactNodeWidget} from "../ui/src/regional/reactNodeWidgetHost.tsx";

test("central React node widget host mounts once, rerenders and owns cleanup",()=>{
  const events=[];
  const host={className:"",dataset:{},remove(){events.push("remove")}};
  const content={className:"",dataset:{}};
  configureReactNodeWidgetHost({
    createHost:()=>host,
    createContentHost:()=>content,
    createRoot:element=>{assert.equal(element,content);return{render:value=>events.push(["render",value]),unmount:()=>events.push("unmount")}},
    schedule:action=>action(),
    applyPresentation:(_node,nodeType)=>events.push(["presentation",nodeType]),
  });
  function NodeType(){}
  NodeType.prototype.onNodeCreated=function(){events.push("created")};
  NodeType.prototype.onConfigure=function(){events.push("configured")};
  NodeType.prototype.onRemoved=function(){events.push("removed")};
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",{id:"registry",name:"registry_widget",minHeight:220,render:node=>`view-${node.value}`});
  const node=new NodeType();node.value=1;node.addDOMWidget=(name,type,element,options)=>{events.push(["add",name,type,element,options.getMinHeight()]);return{serialize:true}};
  node.onNodeCreated();node.value=2;node.onConfigure();node.onRemoved();
  assert.equal(events.filter(event=>Array.isArray(event)&&event[0]==="add").length,1);
  assert.deepEqual(events.filter(event=>Array.isArray(event)&&event[0]==="render").map(event=>event[1]),["view-1","view-2"]);
  assert.deepEqual(events.filter(event=>Array.isArray(event)&&event[0]==="presentation").map(event=>event[1]),["BV LoRA Registry","BV LoRA Registry"]);
  assert.deepEqual(events.slice(-3),["unmount","remove","removed"]);
});

test("central React node widget host tracks content height and disconnects measurement",()=>{
  const events=[];let resize,disconnects=0,options;
  const host={className:"",dataset:{},remove(){events.push("remove")}};
  const content={className:"",dataset:{}};
  configureReactNodeWidgetHost({
    createHost:()=>host,
    createContentHost:()=>content,
    createRoot:()=>({render:()=>{},unmount:()=>events.push("unmount")}),
    schedule:action=>action(),
    applyPresentation:()=>events.push("presentation"),
    observeHost:(element,onHeight)=>{assert.equal(element,content);resize=onHeight;return()=>{disconnects++}},
  });
  function NodeType(){}
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",{id:"registry-size",name:"registry_widget",minHeight:72,render:()=>"view"});
  const node=new NodeType();node.addDOMWidget=(_name,_type,_host,next)=>{options=next;return{serialize:true}};
  node.onNodeCreated();
  assert.equal(typeof resize,"function");assert.equal(options.getMinHeight(),72);
  resize(344);assert.equal(options.getMinHeight(),344);assert.equal(events.filter(item=>item==="presentation").length,2);
  resize(344);assert.equal(events.filter(item=>item==="presentation").length,2);
  resize(40);assert.equal(options.getMinHeight(),72);
  node.onRemoved();assert.equal(disconnects,1);
});

test("central React node widget host measures intrinsic content and coalesces resize reconciliation",()=>{
  const outer={className:"",dataset:{},remove(){}},content={className:"",dataset:{}},queue=[];let resize,disconnects=0,options,presentations=0;
  configureReactNodeWidgetHost({
    createHost:()=>outer,
    createContentHost:host=>{assert.equal(host,outer);return content},
    createRoot:element=>{assert.equal(element,content);return{render:()=>{},unmount:()=>{}}},
    schedule:action=>queue.push(action),
    applyPresentation:()=>{presentations++},
    observeHost:(element,onHeight)=>{assert.equal(element,content);resize=onHeight;return()=>{disconnects++}},
  });
  function NodeType(){}
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",{id:"registry-intrinsic",name:"registry_widget",minHeight:72,render:()=>"view"});
  const node=new NodeType();node.addDOMWidget=(_name,_type,element,next)=>{assert.equal(element,outer);options=next;return{serialize:true}};
  node.onNodeCreated();assert.equal(queue.length,1);queue.shift()();assert.equal(presentations,1);
  resize(180);resize(240);assert.equal(queue.length,1);assert.equal(options.getMinHeight(),240);queue.shift()();assert.equal(presentations,2);
  resize(120);assert.equal(queue.length,1);queue.shift()();assert.equal(options.getMinHeight(),120);assert.equal(presentations,3);
  node.onRemoved();resize(300);assert.equal(queue.length,0);assert.equal(disconnects,1);
});

test("central React node widget host cancels pending mounts after node removal",()=>{
  const queue=[];let adds=0,roots=0,observers=0;
  const outer=()=>({className:"",dataset:{},remove(){}}),content=()=>({className:"",dataset:{}});
  configureReactNodeWidgetHost({
    createHost:outer,createContentHost:()=>content(),
    createRoot:()=>{roots++;return{render:()=>{},unmount:()=>{}}},
    schedule:action=>queue.push(action),applyPresentation:()=>{},
    observeHost:()=>{observers++;return()=>{}},
  });
  function NodeType(){}
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",{id:"registry-cancel",name:"registry_widget",minHeight:72,render:()=>"view"});
  const makeNode=()=>{const node=new NodeType();node.addDOMWidget=()=>{adds++;return{serialize:true}};return node};
  const created=makeNode();created.onNodeCreated();created.onRemoved();while(queue.length)queue.shift()();
  const configured=makeNode();configured.onConfigure();configured.onRemoved();while(queue.length)queue.shift()();
  assert.equal(adds,0);assert.equal(roots,0);assert.equal(observers,0);
  assert.equal(created.__bvReactNodeWidgets,undefined);assert.equal(configured.__bvReactNodeWidgets,undefined);
});

test("central React node widget host rejects direct refresh after node removal",()=>{
  let adds=0,roots=0,observers=0;
  configureReactNodeWidgetHost({
    createHost:()=>({className:"",dataset:{},remove(){}}),createContentHost:()=>({className:"",dataset:{}}),
    createRoot:()=>{roots++;return{render:()=>{},unmount:()=>{}}},schedule:action=>action(),applyPresentation:()=>{},
    observeHost:()=>{observers++;return()=>{}},
  });
  function NodeType(){}
  const spec={id:"registry-refresh",name:"registry_widget",minHeight:72,render:()=>"view"};
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",spec);
  const node=new NodeType();node.addDOMWidget=()=>{adds++;return{serialize:true}};
  node.onNodeCreated();assert.deepEqual([adds,roots,observers],[1,1,1]);node.onRemoved();
  assert.equal(refreshReactNodeWidget(node,"BV LoRA Registry",spec),null);
  assert.deepEqual([adds,roots,observers],[1,1,1]);assert.equal(node.__bvReactNodeWidgets,undefined);
});

test("central React node widget host caps intrinsic height against both pixels and viewport",()=>{
  const events=[];let resize,options,viewportHeight=900;
  const host={className:"",dataset:{},style:{},remove(){}},content={className:"",dataset:{},style:{}};
  configureReactNodeWidgetHost({
    createHost:()=>host,createContentHost:()=>content,
    createRoot:()=>({render:()=>{},unmount:()=>{}}),schedule:action=>action(),applyPresentation:()=>events.push("presentation"),
    viewportHeight:()=>viewportHeight,
    observeHost:(_element,onHeight)=>{resize=onHeight;return()=>{}},
  });
  function NodeType(){}
  const spec={id:"registry-cap",name:"registry_widget",minHeight:72,maxHeight:420,overflow:"auto",nativeActions:[{id:"open",name:"open_lora_registry",label:"Open LoRA Registry",invoke:node=>events.push(["open",node.id])}],render:()=>"view"};
  installReactNodeWidgetHost(NodeType,"BV LoRA Registry",spec);
  const node=new NodeType();node.id=9;node.widgets=[];
  node.addWidget=(type,name,_value,callback,next)=>{const widget={type,name,callback,serialize:true,spec:{existing:"kept"},...next};node.widgets.push(widget);events.push(["action",type,name]);return widget};
  node.addDOMWidget=(_name,_type,_host,next)=>{options=next;events.push("dom");return{serialize:true}};
  node.onNodeCreated();node.onConfigure();
  assert.equal(events.filter(item=>Array.isArray(item)&&item[0]==="action").length,1);
  assert.deepEqual(node.widgets[0].spec,{existing:"kept",socketless:true});
  assert.equal(node.widgets[0].serialize,false);node.widgets[0].callback();assert.deepEqual(events.at(-1),["open",9]);
  resize(900);assert.equal(options.getMinHeight(),420);
  viewportHeight=500;assert.equal(options.getMinHeight(),300);
  resize(900);assert.equal(options.getMinHeight(),300);
  viewportHeight=900;
  resize(180);assert.equal(options.getMinHeight(),180);
  assert.match(content.className,/bv-react-node-widget-scroll/);
  assert.equal(content.style.maxHeight,"min(420px, 60vh)");assert.equal(content.style.overflowY,"auto");
});

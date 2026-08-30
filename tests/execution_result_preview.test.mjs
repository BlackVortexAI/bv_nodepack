import assert from"node:assert/strict";
import test from"node:test";
import{configureReactNodeWidgetHost}from"../ui/src/regional/reactNodeWidgetHost.tsx";
import{executionResultPreviewState,installExecutionResultPreview}from"../ui/src/regional/executionResultPreview.tsx";

test("central execution preview chains lifecycle and keeps ephemeral node-local state",()=>{
  const renders=[];let unmounted=0;
  configureReactNodeWidgetHost({
    createHost:()=>({className:"",dataset:{},remove(){}}),createContentHost:()=>({className:"",dataset:{},style:{},addEventListener(){},removeEventListener(){}}),
    createRoot:()=>({render:value=>renders.push(value),unmount:()=>{unmounted++}}),schedule:action=>action(),applyPresentation:()=>{},observeHost:()=>()=>{},
  });
  function NodeType(){}
  NodeType.prototype.onExecuted=function(){this.originalExecuted=true;return"executed"};
  NodeType.prototype.onRemoved=function(){this.originalRemoved=true};
  installExecutionResultPreview(NodeType,"BV Inspect Any",{id:"inspect",widgetName:"inspect_preview",messageKey:"text",placeholder:"Run"});
  const node=new NodeType();node.addDOMWidget=()=>({serialize:true});
  node.onNodeCreated();
  assert.deepEqual(executionResultPreviewState(node),{text:"",truncated:false});
  assert.equal(node.onExecuted({text:["hello"],type_name:["str"],truncated:[false]}),"executed");
  assert.equal(node.originalExecuted,true);
  assert.deepEqual(executionResultPreviewState(node),{text:"hello",typeName:"str",truncated:false});
  assert.equal(renders.length,2);
  node.onExecuted({other:["ignored"]});assert.equal(renders.length,2);
  node.onRemoved();assert.equal(node.originalRemoved,true);assert.equal(unmounted,1);
  assert.deepEqual(executionResultPreviewState(node),{text:"",truncated:false});
  node.onExecuted({text:"late"});assert.equal(renders.length,2);assert.deepEqual(executionResultPreviewState(node),{text:"",truncated:false});
});

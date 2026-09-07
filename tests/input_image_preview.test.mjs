import test from "node:test";
import assert from "node:assert/strict";
import {inputImagePreview} from "../ui/src/regional/inputImagePreview.ts";
function fixture(){
 const source={id:1,type:"LoadImage",widgets:[{name:"image",value:"one.png"}],outputs:[{type:"IMAGE",links:[7]}]},target={id:2,inputs:[{name:"canvas_image",type:"IMAGE",link:7}]};
 const graph={_nodes:[source,target],links:{7:{origin_id:1,origin_slot:0,target_id:2,target_slot:0,type:"IMAGE"}},getNodeById(id){return this._nodes.find(n=>n.id===id)}};source.graph=target.graph=graph;return {source,target,graph};
}
test("connected loader follows current selection before execution without mutating graph",()=>{
 const {source,target,graph}=fixture(),before=JSON.stringify(graph.links);
 assert.deepEqual(inputImagePreview(target,"canvas_image",p=>p),{src:"/view?filename=one.png&subfolder=&type=input",previous:false});
 source.imgs=[{src:"/old-preview.png"}];source.widgets[0].value="folder/two #.png [temp]";
 assert.equal(inputImagePreview(target,"canvas_image",p=>p).src,"/view?filename=two+%23.png&subfolder=folder&type=temp");
 target.inputs[0].link=null;assert.equal(inputImagePreview(target,"canvas_image",p=>p),null);assert.equal(JSON.stringify(graph.links),before);
});
test("preview never traverses transformations and rejects ambiguous/muted sources",()=>{
 const {source,target}=fixture();source.type="ImageScale";
 assert.equal(inputImagePreview(target,"canvas_image",p=>p),null);
 source.imgs=[{src:"blob:previous"}];assert.deepEqual(inputImagePreview(target,"canvas_image",p=>p),{src:"blob:previous",previous:true});
 source.outputs.push({type:"IMAGE",links:[]});assert.equal(inputImagePreview(target,"canvas_image",p=>p),null);
 source.outputs.pop();source.mode=4;assert.equal(inputImagePreview(target,"canvas_image",p=>p),null);
});
test("invalid filenames and linked loader filename inputs fail closed",()=>{
 const {source,target}=fixture();for(const value of ["../secret.png","C:\\secret.png","/secret.png",""]){source.widgets[0].value=value;assert.equal(inputImagePreview(target,"canvas_image",p=>p),null)}
 source.widgets[0].value="one.png";source.inputs=[{name:"image",link:9}];assert.equal(inputImagePreview(target,"canvas_image",p=>p),null);
});

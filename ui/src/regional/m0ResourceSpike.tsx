import React from "react";
import ReactDOM from "react-dom/client";
import { getApi, getApp } from "../appHelper.js";
import { ResourcePickerCollector } from "../ui/components";
import { M0ResourcePickerPanel } from "./M0ResourcePickerPanel";
import { ensureM0CollectorOutput, ensureM0ConsumerInput, M0_PROVIDER_TYPE } from "./m0GraphContract";
import { installM0CanvasVisibility, markM0NodeElement } from "./m0VisualProjection";

const COLLECTOR="BV M0 Fake Resource Collector", CONSUMER="BV M0 Fake Resource Consumer", PROVIDER=M0_PROVIDER_TYPE;
const A="a1bdeceb-76ae-4e45-ae36-e5c2664819ce", B="d97a4268-c02c-42a3-8793-8e578e12e12c";
const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const hideWidget=(item:any)=>{if(!item)return;item.type="converted-widget";item.hidden=true;item.computeSize=()=>[0,-4];item.serializeValue=()=>item.value};
const ensureId=(item:any,fallback?:string)=>{if(item&&!String(item.value??"").trim())item.value=fallback??crypto.randomUUID();return String(item?.value??"")};
const ensureCanvasVisibility=()=>{let attempts=0;const apply=()=>{const canvas=getApp().canvas;if(canvas)installM0CanvasVisibility(canvas);else if(attempts++<40)setTimeout(apply,50)};apply()};
type IdRemap={collector:Record<string,string>;resources:Record<string,string>};
function repairCopiedCollector(node:any){
    const cid=widget(node,"collector_id"),aid=widget(node,"resource_a_id"),bid=widget(node,"resource_b_id");if(!cid||!aid||!bid||!node.graph)return;
    const duplicate=(node.graph._nodes??[]).find((item:any)=>item!==node&&item.__bvM0ResourceProvider===true&&String(widget(item,"collector_id")?.value??"")===String(cid.value??""));
    if(!duplicate)return;
    const remap:IdRemap={collector:{[String(cid.value)]:crypto.randomUUID()},resources:{[String(aid.value)]:crypto.randomUUID(),[String(bid.value)]:crypto.randomUUID()}};
    cid.value=remap.collector[String(cid.value)];aid.value=remap.resources[String(aid.value)];bid.value=remap.resources[String(bid.value)];node.__bvM0IdRemap=remap;
}
function linkedCollector(node:any){const input=node.inputs?.find((item:any)=>item.name==="resource_provider"),link=input?.link==null?null:node.graph?.links?.[input.link];return link&&String(link.target_id)===String(node.id)?node.graph?.getNodeById?.(link.origin_id):null;}
function applyLinkedRemap(node:any){
    const source=linkedCollector(node),remap:IdRemap|undefined=source?.__bvM0IdRemap;if(!remap)return;
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id");if(cid&&remap.collector[String(cid.value)])cid.value=remap.collector[String(cid.value)];if(rid&&remap.resources[String(rid.value)])rid.value=remap.resources[String(rid.value)];
}
function collectors(node:any):ResourcePickerCollector[]{
    return (node.graph?._nodes??[]).filter((item:any)=>item.__bvM0ResourceProvider===true).map((item:any)=>({
        id:String(widget(item,"collector_id")?.value??""),label:String(item.title||`Collector #${item.id}`),
        resources:[{id:String(widget(item,"resource_a_id")?.value??""),label:"Alpha"},{id:String(widget(item,"resource_b_id")?.value??""),label:"Beta"}],node:item,
    })).filter((item:any)=>item.id);
}
function refreshCollector(node:any){
    if(!node?.__bvM0ResourceProvider)return;
    const output=node.outputs?.find((item:any)=>item.type===PROVIDER),debug=(node.graph?._nodes??[]).some((consumer:any)=>Boolean(consumer.properties?.bvM0DebugVisible)&&linkedCollector(consumer)===node);
    if(output)output.__bvM0VisualHidden=!debug;
    markM0NodeElement(node,"collector",debug);
}
function installDomRefresh(node:any,refresh:()=>void){
    if(node.__bvM0DomRefresh)return;
    const listener=()=>{setTimeout(refresh,0);setTimeout(refresh,100)};
    node.__bvM0DomRefresh=listener;
    getApi().addEventListener("executed",listener);
    getApi().addEventListener("graphChanged",listener);
    const removed=node.onRemoved;
    node.onRemoved=function(){getApi().removeEventListener("executed",listener);getApi().removeEventListener("graphChanged",listener);return removed?.apply(this,arguments)};
}
function setDebug(node:any,visible:boolean,markDirty=true){
    node.properties??={};node.properties.bvM0DebugVisible=visible;
    const input=node.inputs?.find((item:any)=>item.name==="resource_provider");
    if(input){input.__bvM0VisualHidden=!visible;input.label=visible?"resource provider":"";}
    markM0NodeElement(node,"consumer",visible);refreshCollector(linkedCollector(node));
    if(markDirty)node.setDirtyCanvas?.(true,true);
}
function connect(node:any,collectorId:string){
    const previous=linkedCollector(node);
    const input=ensureM0ConsumerInput(node);
    const current=node.inputs?.[input]?.link;if(current!=null)node.disconnectInput?.(input);
    const source=(collectors(node) as any[]).find(item=>item.id===collectorId)?.node;
    const output=source?ensureM0CollectorOutput(source):-1;
    if(source&&input>=0&&output>=0)source.connect(output,node,input);
    setDebug(node,Boolean(node.properties?.bvM0DebugVisible));refreshCollector(previous);
}
function renderPicker(node:any){
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id");if(!cid||!rid)return;
    let host=node.__bvM0PickerHost as HTMLDivElement|undefined;
    if(!host){host=document.createElement("div");host.className="bv-ui bv-m0-picker-host";host.style.position="relative";host.style.zIndex="1";node.__bvM0PickerHost=host;const dom=node.addDOMWidget?.("bv_resource_picker","div",host,{serialize:false});if(dom)dom.serialize=false;}
    node.__bvM0PickerRoot??=ReactDOM.createRoot(host!);
    const draw=()=>{const source=linkedCollector(node),linkedId=String(widget(source,"collector_id")?.value??"");node.__bvM0PickerRoot.render(<M0ResourcePickerPanel collectors={collectors(node)} collectorId={String(cid.value??"")} resourceId={String(rid.value??"")} resolved={Boolean(source)&&linkedId===String(cid.value??"")} debugVisible={Boolean(node.properties?.bvM0DebugVisible)} onDebug={visible=>{setDebug(node,visible);draw();}} onCollector={id=>{cid.value=id;const first=collectors(node).find(item=>item.id===id)?.resources[0];rid.value=first?.id??"";connect(node,id);draw();}} onResource={id=>{rid.value=id;draw();}}/>);};
    draw();setDebug(node,Boolean(node.properties?.bvM0DebugVisible),false);
}
export function installM0ResourceSpike(nodeType:any,nodeData:any){
    if(nodeData.name===COLLECTOR){const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure;const upgrade=function(this:any){ensureCanvasVisibility();this.__bvM0ResourceProvider=true;ensureM0CollectorOutput(this);ensureId(widget(this,"collector_id"));ensureId(widget(this,"resource_a_id"),A);ensureId(widget(this,"resource_b_id"),B);repairCopiedCollector(this);["collector_id","resource_a_id","resource_b_id"].forEach(name=>hideWidget(widget(this,name)));installDomRefresh(this,()=>refreshCollector(this));refreshCollector(this);};nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};return true;}
    if(nodeData.name===CONSUMER){const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange;const upgrade=function(this:any){ensureCanvasVisibility();ensureM0ConsumerInput(this);applyLinkedRemap(this);["collector_id","resource_id"].forEach(name=>hideWidget(widget(this,name)));installDomRefresh(this,()=>renderPicker(this));renderPicker(this);setTimeout(()=>renderPicker(this),0);};nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConnectionsChange=function(){const previous=linkedCollector(this),r=changed?.apply(this,arguments);queueMicrotask(()=>{applyLinkedRemap(this);renderPicker(this);refreshCollector(previous);refreshCollector(linkedCollector(this))});return r};return true;}
    return false;
}

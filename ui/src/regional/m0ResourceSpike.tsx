import React from "react";
import ReactDOM from "react-dom/client";
import { getApi, getApp } from "../appHelper.js";
import { ResourcePickerCollector } from "../ui/components";
import { M0ResourcePickerPanel } from "./M0ResourcePickerPanel";
import { M0MultiResourcePickerPanel, M0ResourceBinding } from "./M0MultiResourcePickerPanel";
import { ensureM0CollectorOutput, ensureM0ConsumerInput, ensureM0MultiConsumerInputs, M0_MAX_MULTI_COLLECTORS, M0_PROVIDER_TYPE } from "./m0GraphContract";
import { installM0CanvasVisibility, markM0NodeElement, requestM0DebugAnimation, syncM0DebugRoot } from "./m0VisualProjection";
import { resolveM0LocalLinkedCollector } from "./m0LocalGraph";

const COLLECTOR="BV M0 Fake Resource Collector", CONSUMER="BV M0 Fake Resource Consumer", MULTI_CONSUMER="BV M0 Fake Multi Resource Consumer", PROVIDER=M0_PROVIDER_TYPE;
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
function selectLinkedCollector(node:any,inputName:string,expectedId=""){
    const source=resolveM0LocalLinkedCollector(node,inputName);return source&&(!expectedId||String(widget(source,"collector_id")?.value??"")===expectedId)?source:null;
}
function linkedCollector(node:any){return selectLinkedCollector(node,"resource_provider",String(widget(node,"collector_id")?.value??""));}
function linkedCollectorAt(node:any,index:number){const binding=parseBindings(node)[index];return selectLinkedCollector(node,`resource_provider_${index+1}`,binding?.collector_id??"");}
function applyLinkedRemap(node:any){
    const source=linkedCollector(node),remap:IdRemap|undefined=source?.__bvM0IdRemap;if(!remap)return;
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id");if(cid&&remap.collector[String(cid.value)])cid.value=remap.collector[String(cid.value)];if(rid&&remap.resources[String(rid.value)])rid.value=remap.resources[String(rid.value)];
}
function collectors(node:any):ResourcePickerCollector[]{
    return (node.graph?._nodes??[]).filter((item:any)=>item.__bvM0ResourceProvider===true&&item.graph===node.graph).map((item:any)=>({
        id:String(widget(item,"collector_id")?.value??""),label:String(item.title||`Collector #${item.id}`),
        resources:[{id:String(widget(item,"resource_a_id")?.value??""),label:"Alpha"},{id:String(widget(item,"resource_b_id")?.value??""),label:"Beta"}],node:item,
    })).filter((item:any,index:number,items:any[])=>item.id&&items.findIndex(candidate=>candidate.id===item.id)===index);
}
function refreshCollector(node:any){
    if(!node?.__bvM0ResourceProvider)return;
    const consumers=node.graph?._nodes??[];
    const output=node.outputs?.find((item:any)=>item.type===PROVIDER),debug=consumers.some((consumer:any)=>Boolean(consumer.properties?.bvM0DebugVisible)&&(linkedCollector(consumer)===node||consumer.inputs?.some((_:any,index:number)=>linkedCollectorAt(consumer,index)===node)));
    if(output){output.hidden=true;output.__bvM0VisualHidden=!debug;output.__bvM0PortHidden=true;output.__bvM0ResourceSlot=true;}
    markM0NodeElement(node,"collector",debug);
}
function parseBindings(node:any):M0ResourceBinding[]{
    const item=widget(node,"resource_bindings");if(!item)return[];
    try{const value=JSON.parse(String(item.value??"[]"));return Array.isArray(value)?value.slice(0,M0_MAX_MULTI_COLLECTORS).map(binding=>({binding_id:String(binding.binding_id||crypto.randomUUID()),collector_id:String(binding.collector_id||""),resource_id:String(binding.resource_id||""),resolved:false})):[];}catch{return[];}
}
function saveBindings(node:any,bindings:M0ResourceBinding[]){const item=widget(node,"resource_bindings");if(item)item.value=JSON.stringify(bindings.map(({binding_id,collector_id,resource_id})=>({binding_id,collector_id,resource_id})));}
function repairMultiBindingIds(node:any){
    const bindings=parseBindings(node),ids=new Set(bindings.map(item=>item.binding_id));
    const duplicate=(node.graph?._nodes??[]).some((candidate:any)=>candidate!==node&&candidate.type===MULTI_CONSUMER&&parseBindings(candidate).some(binding=>ids.has(binding.binding_id)));
    if(duplicate){for(const binding of bindings)binding.binding_id=crypto.randomUUID();saveBindings(node,bindings);}
}
function applyMultiLinkedRemaps(node:any){
    const bindings=parseBindings(node);let changed=false;
    bindings.forEach((binding,index)=>{const remap:IdRemap|undefined=linkedCollectorAt(node,index)?.__bvM0IdRemap;if(!remap)return;const collector=remap.collector[binding.collector_id],resource=remap.resources[binding.resource_id];if(collector){binding.collector_id=collector;changed=true}if(resource){binding.resource_id=resource;changed=true}});
    if(changed)saveBindings(node,bindings);
}
function collectorHasResource(source:any,resourceId:string){return ["resource_a_id","resource_b_id"].some(name=>String(widget(source,name)?.value??"")===resourceId);}
function sanitizeSingleSelection(node:any){
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id"),source=resolveM0LocalLinkedCollector(node,"resource_provider");if(!cid||!rid)return;
    const valid=Boolean(source)&&String(cid.value??"")===String(widget(source,"collector_id")?.value??"")&&collectorHasResource(source,String(rid.value??""));
    if(valid)return;
    cid.value="";rid.value="";const slot=node.inputs?.findIndex((input:any)=>input.name==="resource_provider")??-1;if(slot>=0&&node.inputs?.[slot]?.link!=null)node.disconnectInput?.(slot);
}
function sanitizeMultiSelections(node:any){
    const bindings=parseBindings(node),slots=ensureM0MultiConsumerInputs(node);let changed=false;
    bindings.forEach((binding,index)=>{const source=resolveM0LocalLinkedCollector(node,`resource_provider_${index+1}`),valid=Boolean(source)&&binding.collector_id===String(widget(source,"collector_id")?.value??"")&&collectorHasResource(source,binding.resource_id);if(valid)return;binding.collector_id="";binding.resource_id="";changed=true;const slot=slots[index];if(slot>=0&&node.inputs?.[slot]?.link!=null)node.disconnectInput?.(slot);});
    if(changed)saveBindings(node,bindings);
}
function setMultiDebug(node:any,visible:boolean,markDirty=true){
    node.properties??={};node.properties.bvM0DebugVisible=visible;
    const providerInputs=(node.inputs??[]).map((input:any,index:number)=>({input,index})).filter(({input}:any)=>String(input.name??"").startsWith("resource_provider_"));
    node.__bvM0FanInAnchorSlot=visible?providerInputs[0]?.index:undefined;
    for(const {input} of providerInputs){input.hidden=true;input.__bvM0ResourceSlot=true;input.__bvM0VisualHidden=!visible;input.__bvM0PortHidden=true;input.label="";}
    markM0NodeElement(node,"consumer",visible);
    for(let index=0;index<M0_MAX_MULTI_COLLECTORS;index++)refreshCollector(linkedCollectorAt(node,index));
    syncM0DebugRoot(node.graph);
    if(visible)requestM0DebugAnimation(getApp().canvas);if(markDirty)node.setDirtyCanvas?.(true,true);
}
function connectMulti(node:any,index:number,collectorId:string){
    const slots=ensureM0MultiConsumerInputs(node),input=slots[index],previous=linkedCollectorAt(node,index);
    if(input>=0&&node.inputs?.[input]?.link!=null)node.disconnectInput?.(input);
    const source=(collectors(node) as any[]).find(item=>item.id===collectorId)?.node,output=source?ensureM0CollectorOutput(source):-1;
    if(source&&input>=0&&output>=0)source.connect(output,node,input);
    setMultiDebug(node,Boolean(node.properties?.bvM0DebugVisible));refreshCollector(previous);
}
function syncLegacyPickerLayout(node:any,host:HTMLElement){
    const legacy=host.parentElement?.style.position==="fixed";
    if(!legacy){host.style.transform="";host.style.maxHeight="";host.style.overflowY="";return;}
    const slots=(node.inputs??[]).filter((input:any)=>input.__bvM0ResourceSlot||input.type===PROVIDER).length;
    host.style.transform=`translateY(-${slots*20}px)`;
    host.style.maxHeight=`${Math.max(120,Number(node.size?.[1]??200)-40)}px`;
    host.style.overflowY="auto";
}
function scheduleLegacyPickerLayout(node:any,host:HTMLElement){
    [0,50,150,300].forEach(delay=>setTimeout(()=>syncLegacyPickerLayout(node,host),delay));
}
function renderMultiPicker(node:any){
    const item=widget(node,"resource_bindings");if(!item)return;
    let host=node.__bvM0PickerHost as HTMLDivElement|undefined;
    if(!host){host=document.createElement("div");host.className="bv-ui bv-m0-picker-host";host.style.position="relative";host.style.zIndex="1";node.__bvM0PickerHost=host;const dom=node.addDOMWidget?.("bv_multi_resource_picker","div",host,{serialize:false,getMinHeight:()=>Math.max(150,78+parseBindings(node).length*124),onDraw:()=>syncLegacyPickerLayout(node,host!),afterResize:()=>syncLegacyPickerLayout(node,host!)});if(dom)dom.serialize=false;}
    node.__bvM0PickerRoot??=ReactDOM.createRoot(host!);
    const draw=()=>{
        const catalog=collectors(node),bindings=parseBindings(node).map((binding,index)=>{const source=linkedCollectorAt(node,index);return{...binding,resolved:Boolean(source)&&String(widget(source,"collector_id")?.value??"")===binding.collector_id};});
        node.__bvM0PickerRoot.render(<M0MultiResourcePickerPanel collectors={catalog} bindings={bindings} debugVisible={Boolean(node.properties?.bvM0DebugVisible)}
            onDebug={visible=>{setMultiDebug(node,visible);draw();}}
            onBinding={(index,collector_id,resource_id)=>{bindings[index]={...bindings[index],collector_id,resource_id};saveBindings(node,bindings);connectMulti(node,index,collector_id);draw();}}
            onAdd={()=>{if(bindings.length>=M0_MAX_MULTI_COLLECTORS)return;bindings.push({binding_id:crypto.randomUUID(),collector_id:"",resource_id:"",resolved:false});saveBindings(node,bindings);draw();}}
            onRemove={index=>{const slots=ensureM0MultiConsumerInputs(node),slot=slots[index];if(slot>=0&&node.inputs?.[slot]?.link!=null)node.disconnectInput?.(slot);bindings.splice(index,1);saveBindings(node,bindings);for(let offset=index;offset<bindings.length;offset++)connectMulti(node,offset,bindings[offset].collector_id);const trailing=slots[bindings.length];if(trailing>=0&&node.inputs?.[trailing]?.link!=null)node.disconnectInput?.(trailing);draw();}}/>);
    };
    draw();setMultiDebug(node,Boolean(node.properties?.bvM0DebugVisible),false);scheduleLegacyPickerLayout(node,host!);
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
    if(input){input.hidden=true;input.__bvM0VisualHidden=!visible;input.__bvM0PortHidden=true;input.__bvM0ResourceSlot=true;input.label="";}
    markM0NodeElement(node,"consumer",visible);refreshCollector(linkedCollector(node));
    syncM0DebugRoot(node.graph);
    if(visible)requestM0DebugAnimation(node.graph?.list_of_graphcanvas?.[0]??getApp().canvas);
    if(markDirty)node.setDirtyCanvas?.(true,true);
}
function connect(node:any,collectorId:string){
    const previous=linkedCollector(node);
    const input=ensureM0ConsumerInput(node);
    if(input>=0&&node.inputs?.[input]?.link!=null)node.disconnectInput?.(input);
    const source=(collectors(node) as any[]).find(item=>item.id===collectorId)?.node,output=source?ensureM0CollectorOutput(source):-1;
    if(source&&input>=0&&output>=0)source.connect(output,node,input);
    setDebug(node,Boolean(node.properties?.bvM0DebugVisible));refreshCollector(previous);
}
function renderPicker(node:any){
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id");if(!cid||!rid)return;
    let host=node.__bvM0PickerHost as HTMLDivElement|undefined;
    if(!host){host=document.createElement("div");host.className="bv-ui bv-m0-picker-host";host.style.position="relative";host.style.zIndex="1";node.__bvM0PickerHost=host;const dom=node.addDOMWidget?.("bv_resource_picker","div",host,{serialize:false,getMinHeight:()=>150,onDraw:()=>syncLegacyPickerLayout(node,host!),afterResize:()=>syncLegacyPickerLayout(node,host!)});if(dom)dom.serialize=false;}
    node.__bvM0PickerRoot??=ReactDOM.createRoot(host!);
    const draw=()=>{const source=linkedCollector(node),linkedId=String(widget(source,"collector_id")?.value??"");node.__bvM0PickerRoot.render(<M0ResourcePickerPanel collectors={collectors(node)} collectorId={String(cid.value??"")} resourceId={String(rid.value??"")} resolved={Boolean(source)&&linkedId===String(cid.value??"")} debugVisible={Boolean(node.properties?.bvM0DebugVisible)} onDebug={visible=>{setDebug(node,visible);draw();}} onCollector={id=>{cid.value=id;const first=collectors(node).find(item=>item.id===id)?.resources[0];rid.value=first?.id??"";connect(node,id);draw();}} onResource={id=>{rid.value=id;draw();}}/>);};
    draw();setDebug(node,Boolean(node.properties?.bvM0DebugVisible),false);scheduleLegacyPickerLayout(node,host!);
}
export function installM0ResourceSpike(nodeType:any,nodeData:any){
    if(nodeData.name===COLLECTOR){const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure;const upgrade=function(this:any){ensureCanvasVisibility();this.__bvM0ResourceProvider=true;ensureM0CollectorOutput(this);ensureId(widget(this,"collector_id"));ensureId(widget(this,"resource_a_id"),A);ensureId(widget(this,"resource_b_id"),B);repairCopiedCollector(this);["collector_id","resource_a_id","resource_b_id"].forEach(name=>hideWidget(widget(this,name)));installDomRefresh(this,()=>refreshCollector(this));refreshCollector(this);};nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};return true;}
    if(nodeData.name===CONSUMER){const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange;const upgrade=function(this:any){ensureCanvasVisibility();this.__bvM0ResourceConsumer=true;ensureM0ConsumerInput(this);applyLinkedRemap(this);sanitizeSingleSelection(this);["collector_id","resource_id"].forEach(name=>hideWidget(widget(this,name)));installDomRefresh(this,()=>renderPicker(this));renderPicker(this);setTimeout(()=>renderPicker(this),0);};nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConnectionsChange=function(){const previous=linkedCollector(this),r=changed?.apply(this,arguments);queueMicrotask(()=>{applyLinkedRemap(this);sanitizeSingleSelection(this);renderPicker(this);refreshCollector(previous);refreshCollector(linkedCollector(this))});return r};return true;}
    if(nodeData.name===MULTI_CONSUMER){const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange;const upgrade=function(this:any){ensureCanvasVisibility();this.__bvM0ResourceConsumer=true;ensureM0MultiConsumerInputs(this);repairMultiBindingIds(this);applyMultiLinkedRemaps(this);sanitizeMultiSelections(this);hideWidget(widget(this,"resource_bindings"));installDomRefresh(this,()=>{applyMultiLinkedRemaps(this);renderMultiPicker(this)});renderMultiPicker(this);[0,50,150].forEach(delay=>setTimeout(()=>{applyMultiLinkedRemaps(this);sanitizeMultiSelections(this);renderMultiPicker(this)},delay));};nodeType.prototype.onNodeCreated=function(){const r=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConfigure=function(){const r=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return r};nodeType.prototype.onConnectionsChange=function(){const r=changed?.apply(this,arguments);queueMicrotask(()=>{applyMultiLinkedRemaps(this);sanitizeMultiSelections(this);setMultiDebug(this,Boolean(this.properties?.bvM0DebugVisible),false);renderMultiPicker(this)});return r};return true;}
    return false;
}

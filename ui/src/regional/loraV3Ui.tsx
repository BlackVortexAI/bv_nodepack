import React from "react";
import ReactDOM from "react-dom/client";
import { getApp } from "../appHelper.js";
import { LoraV3ResourcePickerPanel, LoraV3Config } from "./LoraV3ResourcePickerPanel";
import { parseLoraV3Config, serializeLoraV3Config } from "./loraV3Config";
import { connectLocalLoraCollector, connectLoraConsumerTree, ensureLoraCollectorOutput, ensureLoraConsumerInput, linkedLocalLoraCollector, localLoraCollectors, upstreamLoraTransformer } from "./loraV3Graph";
import { installM0CanvasVisibility } from "./m0VisualProjection";

const widget=(node:any,name:string)=>node.widgets?.find((item:any)=>item.name===name);
const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
const hide=(item:any)=>{if(!item)return;item.type="hidden";item.computeSize=()=>[0,-4];item.serializeValue=item.serializeValue??function(this:any){return this.value};};
const ensureId=(item:any)=>{if(item&&!String(item.value??"").trim())item.value=crypto.randomUUID();};
const ensureCanvasVisibility=()=>{let attempts=0;const apply=()=>{const canvas=getApp().canvas;if(canvas)installM0CanvasVisibility(canvas);else if(attempts++<40)setTimeout(apply,50)};apply();};

function upstreamNamedStacks(collector:any){
    const found:any[]=[],seen=new Set<any>(),queue=[collector];
    while(queue.length){
        const target=queue.shift();if(!target||seen.has(target))continue;seen.add(target);
        for(const input of target.inputs??[]){
            if(!["lora_registry","registry"].includes(input.name))continue;
            const link=graphLink(target.graph,input.link),source=link&&target.graph?.getNodeById?.(link.origin_id);
            if(!source||source.graph!==target.graph)continue;
            if(source.type==="BV Named LoRA Stack"){
                const id=String(widget(source,"stack_id")?.value??"").trim(),label=String(widget(source,"name")?.value??"").trim();
                if(id&&label)found.push({id,label,node:source});
            }
            queue.push(source);
        }
    }
    return found.reverse();
}

function catalog(node:any){
    return localLoraCollectors(node).map((collector:any)=>({
        id:String(widget(collector,"collector_id")?.value??"").trim(),
        label:String(collector.title||"BV LoRA Stack Collector"),
        resources:upstreamNamedStacks(collector),node:collector,
    })).filter((item:any)=>item.id);
}

function installCollector(node:any){
    ensureCanvasVisibility();
    const id=widget(node,"collector_id");ensureId(id);const current=String(id?.value??"").trim(),duplicate=(node.graph?._nodes??[]).find((item:any)=>item!==node&&item.type==="BV LoRA Stack Collector"&&String(widget(item,"collector_id")?.value??"").trim()===current);
    if(id&&current&&duplicate){const next=crypto.randomUUID();id.value=next;node.__bvLoraCollectorIdRemap={[current]:next};}
    hide(id);ensureLoraCollectorOutput(node);node.__bvRuntimeResourceProvider=true;
}

function installConsumerSlot(node:any){
    ensureCanvasVisibility();
    const index=ensureLoraConsumerInput(node),input=node.inputs?.[index];if(input){input.hidden=true;input.__bvM0VisualHidden=true;input.__bvM0PortHidden=true;input.__bvM0ResourceSlot=true;}
    if(!linkedLocalLoraCollector(node)){const transformer=upstreamLoraTransformer(node),collector=transformer&&linkedLocalLoraCollector(transformer);if(collector)connectLocalLoraCollector(node,collector);}
}

function renderTransformer(node:any){
    installConsumerSlot(node);
    const configWidget=widget(node,"config_json");if(!configWidget)return;
    let config:LoraV3Config;try{config=parseLoraV3Config(configWidget.value)}catch{return;}
    const choices=catalog(node),linked=linkedLocalLoraCollector(node),collectorRemap=linked?.__bvLoraCollectorIdRemap?.[String(config.collector_id??"")],resourceRemaps=Object.assign({},...upstreamNamedStacks(linked).map((item:any)=>item.node?.__bvLoraResourceIdRemap??{}));
    if(collectorRemap){config={...config,collector_id:collectorRemap,entries:config.entries.map(entry=>entry.source.kind==="external"&&resourceRemaps[entry.source.resource_id]?{...entry,source:{...entry.source,resource_id:resourceRemaps[entry.source.resource_id]}}:entry)};configWidget.value=serializeLoraV3Config(config);}
    const resolved=Boolean(linked)&&String(widget(linked,"collector_id")?.value??"")===String(config.collector_id??"");
    if(config.collector_id&&!resolved){config={...config,collector_id:null,entries:config.entries.map(entry=>entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:""}}:entry)};configWidget.value=serializeLoraV3Config(config);connectLoraConsumerTree(node,null);}
    let host=node.__bvLoraPickerHost as HTMLDivElement|undefined;
    if(!host){host=document.createElement("div");host.className="bv-ui bv-lora-v3-picker-host";node.__bvLoraPickerHost=host;const dom=node.addDOMWidget?.("bv_lora_resource_picker","div",host,{serialize:false,getMinHeight:()=>Math.max(140,90+config.entries.length*90)});if(dom)dom.serialize=false;node.__bvLoraPickerRoot=ReactDOM.createRoot(host);}
    const save=(next:LoraV3Config)=>{configWidget.value=serializeLoraV3Config(next);node.setDirtyCanvas?.(true,true);queueMicrotask(()=>renderTransformer(node));};
    const selectable=choices.filter((choice:any)=>choice.resources.length>0);
    node.__bvLoraPickerRoot.render(<LoraV3ResourcePickerPanel collectors={selectable} config={config} resolved={resolved}
        onCollector={id=>{const choice=choices.find((item:any)=>item.id===id);const first=choice?.resources[0]?.id??"";const next={...config,collector_id:id||null,entries:config.entries.map(entry=>entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:first}}:entry)};connectLoraConsumerTree(node,choice?.node??null);save(next);}}
        onResource={(entryId,id)=>save({...config,entries:config.entries.map(entry=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:id}}:entry)})}
        onAddExternal={()=>{const choice=selectable.find((item:any)=>item.id===config.collector_id)??selectable[0],resource=choice?.resources[0];if(!choice||!resource)return;connectLoraConsumerTree(node,choice.node);save({...config,collector_id:choice.id,entries:[...config.entries,{id:crypto.randomUUID(),source:{kind:"external",resource_id:resource.id},targets:[{scope:"global"}]}]});}}/>);
}

export function installLoraV3Ui(nodeType:any,nodeData:any){
    const collector=nodeData.name==="BV LoRA Stack Collector",transformer=nodeData.name==="BV Regional LoRA",consumer=["BV Regional Native Conditioning","BV Regional Krea 2 Attention","BV Regional Anima Conditioning"].includes(nodeData.name);
    if(!collector&&!transformer&&!consumer)return false;
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange;
    const upgrade=function(this:any){if(collector)installCollector(this);if(transformer)renderTransformer(this);if(consumer)installConsumerSlot(this);};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};
    nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};
    nodeType.prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};
    return true;
}

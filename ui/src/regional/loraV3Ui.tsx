import { getApp } from "../appHelper.js";
import type { ResourcePickerCollector } from "../ui/components";
import type { LoraV3Config, LoraV3Target } from "./LoraV3ResourcePickerPanel";
import { emptyLoraV3Config, parseLoraV3Config, serializeLoraV3Config } from "./loraV3Config";
import { connectLoraConsumerTree, ensureLoraCollectorOutput, ensureLoraConsumerInput, linkedLocalLoraCollector, localLoraCollectors, upstreamLoraTransformer } from "./loraV3Graph";
import { installM0CanvasVisibility } from "./m0VisualProjection";

export const OPEN_LORA_V3_EDITOR_EVENT="bv-open-regional-lora-editor";
const widget=(node:any,name:string)=>node.widgets?.find((item:any)=>item.name===name);
const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
export const hideLoraV3Widget=(item:any)=>{if(!item)return;item.type="converted-widget";item.hidden=true;item.computeSize=()=>[0,-4];if(item.element)item.element.style.display="none";item.serializeValue=item.serializeValue??function(this:any){return this.value};};
const ensureId=(item:any)=>{if(item&&!String(item.value??"").trim())item.value=crypto.randomUUID();};
const ensureCanvasVisibility=()=>{let attempts=0;const apply=()=>{const canvas=getApp().canvas;if(canvas)installM0CanvasVisibility(canvas);else if(attempts++<40)setTimeout(apply,50)};apply();};

function upstreamNamedStacks(collector:any){
    const found:any[]=[],seen=new Set<any>(),queue=[collector];
    while(queue.length){const target=queue.shift();if(!target||seen.has(target))continue;seen.add(target);for(const input of target.inputs??[]){if(!["lora_registry","registry"].includes(input.name))continue;const link=graphLink(target.graph,input.link),source=link&&target.graph?.getNodeById?.(link.origin_id);if(!source||source.graph!==target.graph)continue;if(source.type==="BV Named LoRA Stack"){const id=String(widget(source,"stack_id")?.value??"").trim(),label=String(widget(source,"name")?.value??"").trim();if(id&&label)found.push({id,label,node:source});}queue.push(source);}}
    return found.reverse();
}

export type LoraV3CollectorChoice=ResourcePickerCollector&{node:any};
export function loraV3Catalog(node:any):LoraV3CollectorChoice[]{return localLoraCollectors(node).map((collector:any)=>({id:String(widget(collector,"collector_id")?.value??"").trim(),label:String(collector.title||"BV LoRA Stack Collector"),resources:upstreamNamedStacks(collector),node:collector})).filter((item:any)=>item.id);}
export function readNodeLoraV3Config(node:any,name=node?.type==="BV Regional Prompt"?"lora_v3_config_json":"config_json"){
    try{
        let config=parseLoraV3Config(widget(node,name)?.value),linked=linkedLocalLoraCollector(node);
        const collectorRemap=linked?.__bvLoraCollectorIdRemap?.[String(config.collector_id??"")],resourceRemaps=Object.assign({},...upstreamNamedStacks(linked).map((item:any)=>item.node?.__bvLoraResourceIdRemap??{}));
        if(collectorRemap){config={...config,collector_id:collectorRemap,entries:config.entries.map(entry=>entry.source.kind==="external"&&resourceRemaps[entry.source.resource_id]?{...entry,source:{...entry.source,resource_id:resourceRemaps[entry.source.resource_id]}}:entry)};writeNodeLoraV3Config(node,config,name);}
        return config;
    }catch{return emptyLoraV3Config();}
}
export function writeNodeLoraV3Config(node:any,config:LoraV3Config,name=node?.type==="BV Regional Prompt"?"lora_v3_config_json":"config_json"){const item=widget(node,name);if(!item)return;item.value=serializeLoraV3Config(config);item.callback?.(item.value);node.setDirtyCanvas?.(true,true);}
export function loraV3Resolved(node:any,config:LoraV3Config){const linked=linkedLocalLoraCollector(node);return Boolean(linked)&&String(widget(linked,"collector_id")?.value??"")===String(config.collector_id??"");}
export function setLoraV3Target(node:any,config:LoraV3Config,target:LoraV3Target,collectorId:string|null,resourceId:string|null){
    const matches=(candidate:Record<string,unknown>)=>candidate.scope===target.scope&&(target.scope==="global"||(candidate.document_id===target.document_id&&candidate.region_id===target.region_id));
    const collectorChanged=Boolean(collectorId&&collectorId!==config.collector_id),fallbackResource=collectorChanged?loraV3Catalog(node).find(item=>item.id===collectorId)?.resources[0]?.id:null;
    let entries=config.entries.filter(entry=>!entry.targets.some(matches)).map(entry=>collectorChanged&&entry.source.kind==="external"&&fallbackResource?{...entry,source:{...entry.source,resource_id:fallbackResource}}:entry);
    if(resourceId)entries=[...entries,{id:crypto.randomUUID(),source:{kind:"external",resource_id:resourceId},targets:[target]}];
    const next:LoraV3Config={...config,collector_id:entries.some(entry=>entry.source.kind==="external")?collectorId:null,entries};
    const choice=loraV3Catalog(node).find(item=>item.id===next.collector_id);connectLoraConsumerTree(node,choice?.node??null);writeNodeLoraV3Config(node,next);return next;
}

function installCollector(node:any){ensureCanvasVisibility();const id=widget(node,"collector_id");ensureId(id);const current=String(id?.value??"").trim(),duplicate=(node.graph?._nodes??[]).find((item:any)=>item!==node&&item.type==="BV LoRA Stack Collector"&&String(widget(item,"collector_id")?.value??"").trim()===current);if(id&&current&&duplicate){const next=crypto.randomUUID();id.value=next;node.__bvLoraCollectorIdRemap={[current]:next};}hideLoraV3Widget(id);ensureLoraCollectorOutput(node);node.__bvRuntimeResourceProvider=true;}
export function installLoraV3ConsumerSlot(node:any){ensureCanvasVisibility();const index=ensureLoraConsumerInput(node),input=node.inputs?.[index];if(input){input.hidden=true;input.__bvM0VisualHidden=true;input.__bvM0PortHidden=true;input.__bvM0ResourceSlot=true;}if(!linkedLocalLoraCollector(node)){const transformer=upstreamLoraTransformer(node),collector=transformer&&linkedLocalLoraCollector(transformer);if(collector)connectLoraConsumerTree(transformer,collector);}}
function installTransformer(node:any){installLoraV3ConsumerSlot(node);hideLoraV3Widget(widget(node,"operation"));hideLoraV3Widget(widget(node,"config_json"));if(!node.widgets?.find((item:any)=>item.name==="open_lora_editor")){const button=node.addWidget?.("button","open_lora_editor",null,()=>window.dispatchEvent(new CustomEvent(OPEN_LORA_V3_EDITOR_EVENT,{detail:{node}})),{serialize:false});if(button){button.label="Open LoRA Editor";button.serialize=false;}}node.setSize?.([Math.max(node.size?.[0]??0,220),node.computeSize?.()[1]??60]);}

export function installLoraV3Ui(nodeType:any,nodeData:any){
    const collector=nodeData.name==="BV LoRA Stack Collector",transformer=nodeData.name==="BV Regional LoRA",consumer=["BV Regional Native Conditioning","BV Regional Krea 2 Attention","BV Regional Anima Conditioning"].includes(nodeData.name);if(!collector&&!transformer&&!consumer)return false;
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange,upgrade=function(this:any){if(collector)installCollector(this);if(transformer)installTransformer(this);if(consumer)installLoraV3ConsumerSlot(this);};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};nodeType.prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};return true;
}

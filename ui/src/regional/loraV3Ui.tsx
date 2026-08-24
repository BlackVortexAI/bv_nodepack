import { getApp } from "../appHelper.js";
import type { ResourcePickerCollector } from "../ui/components";
import { withoutLoraV3Target, type LoraV3Config, type LoraV3Target, type LoraV3TargetOption } from "./LoraV3ResourcePickerPanel";
import { emptyLoraV3Config, parseLoraV3Config, serializeLoraV3Config, updateLoraV3EntryCollector } from "./loraV3Config";
import { compactLoraConsumerNode, ensureLoraCollectorOutput, ensureLoraConsumerInputs, linkedLocalLoraCollectors, localLoraCollectors, migrateLegacyLoraCollectorLink, reconcileDownstreamLoraWriters, reconcileLoraWriterCollectors, scheduleCompactLoraConsumerNode, trimUnusedLoraConsumerInputs } from "./loraV3Graph";
import { installM0CanvasVisibility } from "./m0VisualProjection";
import { requestRegionalWindow } from "./windowRequests";

export const OPEN_LORA_V3_EDITOR_EVENT="bv-open-regional-lora-editor";
export const LORA_V3_INVENTORY_CHANGED_EVENT="bv-regional-lora-inventory-changed";
const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const nodeClass=(node:any)=>String(node?.comfyClass??node?.type??"");
const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
export const hideLoraV3Widget=(item:any)=>{if(!item)return;item.type="converted-widget";item.hidden=true;item.computeSize=()=>[0,-4];if(item.element)item.element.style.display="none";item.serializeValue=item.serializeValue??function(this:any){return this.value};};
const ensureId=(item:any)=>{if(item&&!String(item.value??"").trim())item.value=crypto.randomUUID();};
const ensureCanvasVisibility=()=>{let attempts=0;const apply=()=>{const canvas=getApp().canvas;if(canvas)installM0CanvasVisibility(canvas);else if(attempts++<40)setTimeout(apply,50)};apply();};

function upstreamNamedStacks(collector:any){
    const found:any[]=[],seen=new Set<any>(),queue=[collector];
    while(queue.length){const target=queue.shift();if(!target||seen.has(target))continue;seen.add(target);for(const input of target.inputs??[]){if(!["lora_registry","registry"].includes(input.name))continue;const link=graphLink(target.graph,input.link),source=link&&target.graph?.getNodeById?.(link.origin_id);if(!source||source.graph!==target.graph)continue;if(nodeClass(source)==="BV Named LoRA Stack"){const id=String(widget(source,"stack_id")?.value??"").trim(),label=String(widget(source,"name")?.value??"").trim();if(id&&label)found.push({id,label,node:source});}queue.push(source);}}
    return found.reverse();
}

export type LoraV3CollectorChoice=ResourcePickerCollector&{node:any};
export function loraV3Catalog(node:any):LoraV3CollectorChoice[]{return localLoraCollectors(node).map((collector:any)=>({id:String(widget(collector,"collector_id")?.value??"").trim(),label:String(collector.title||"BV LoRA Stack Collector"),resources:upstreamNamedStacks(collector),node:collector})).filter((item:any)=>item.id);}
export function loraV3CollectorIds(config:LoraV3Config){const ids:string[]=[];for(const entry of [...config.entries,...(config.steps??[]).flatMap(step=>step.entries)])if(entry.source.kind==="external"&&entry.source.collector_id&&!ids.includes(entry.source.collector_id))ids.push(entry.source.collector_id);return ids;}
export function readNodeLoraV3Config(node:any,name=nodeClass(node)==="BV Regional Prompt"?"lora_v3_config_json":"config_json"){
    try{
        let config=parseLoraV3Config(widget(node,name)?.value),linked=linkedLocalLoraCollectors(node),changed=false;
        const remap=(entry:any)=>{if(entry.source.kind!=="external")return entry;const sourceNode=linked.find(item=>item?.__bvLoraCollectorIdRemap?.[entry.source.collector_id]||String(widget(item,"collector_id")?.value??"")===entry.source.collector_id),collectorId=sourceNode?.__bvLoraCollectorIdRemap?.[entry.source.collector_id]??entry.source.collector_id,resourceRemaps=Object.assign({},...upstreamNamedStacks(sourceNode).map((item:any)=>item.node?.__bvLoraResourceIdRemap??{})),resourceId=resourceRemaps[entry.source.resource_id]??entry.source.resource_id;changed||=collectorId!==entry.source.collector_id||resourceId!==entry.source.resource_id;return {...entry,source:{...entry.source,collector_id:collectorId,resource_id:resourceId}};};
        config={...config,entries:config.entries.map(remap),steps:config.steps?.map(step=>({...step,entries:step.entries.map(remap)}))};if(changed)writeNodeLoraV3Config(node,config,name);
        return config;
    }catch{return emptyLoraV3Config();}
}
export function writeNodeLoraV3Config(node:any,config:LoraV3Config,name=nodeClass(node)==="BV Regional Prompt"?"lora_v3_config_json":"config_json"){const item=widget(node,name);if(!item)return;item.value=serializeLoraV3Config(config);item.callback?.(item.value);node.setDirtyCanvas?.(true,true);}
export function loraV3TargetOptions(node:any):LoraV3TargetOption[]{
    const graph=node?.graph,queue=[node],seen=new Set<any>();let document:any=null;
    while(queue.length&&!document){const target=queue.shift();if(!target||seen.has(target))continue;seen.add(target);if(nodeClass(target)==="BV Regional Prompt"){try{const parsed=JSON.parse(String(widget(target,"regional_json")?.value??"{}"));document=parsed.version===3?parsed.core:parsed;}catch{}break;}for(const input of target.inputs??[]){if(input.type!=="BV_REGIONAL")continue;const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id);if(source?.graph===graph)queue.push(source);}}
    if(!document?.document_id)return [{value:"global",label:"Global",target:{scope:"global"}}];
    return [{value:"global",label:"Global",target:{scope:"global"}},...(document.regions??[]).map((region:any)=>({value:`region:${document.document_id}:${region.id}`,label:String(region.name||region.id),target:{scope:"region" as const,document_id:String(document.document_id),region_id:String(region.id)}}))];
}
const linkedLoraCollectorIds=(node:any)=>new Set(linkedLocalLoraCollectors(node).map(linked=>String(widget(linked,"collector_id")?.value??"")).filter(Boolean));
export function loraV3Resolved(node:any,config:LoraV3Config){const linkedIds=linkedLoraCollectorIds(node);return loraV3CollectorIds(config).every(id=>linkedIds.has(id));}
export function loraV3EntryResolved(node:any,_config:LoraV3Config,entry:any){return entry.source.kind!=="external"||linkedLoraCollectorIds(node).has(entry.source.collector_id);}
export function commitLoraV3Config(node:any,next:LoraV3Config){
    writeNodeLoraV3Config(node,next);scheduleConfiguredLoraWriterTree(node,next);return next;
}
export function setLoraV3Collector(node:any,config:LoraV3Config,entryId:string,collectorId:string){const choice=loraV3Catalog(node).find(item=>item.id===collectorId),resourceId=choice?.resources[0]?.id??"";return commitLoraV3Config(node,updateLoraV3EntryCollector(config,entryId,collectorId,resourceId));}
export function setLoraV3EntryResource(node:any,config:LoraV3Config,entryId:string,resourceId:string){const map=(entry:any)=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:resourceId}}:entry;return commitLoraV3Config(node,{...config,entries:config.entries.map(map),steps:config.steps?.map(step=>({...step,entries:step.entries.map(map)}))});}
export function setLoraV3EntrySource(node:any,config:LoraV3Config,entryId:string,collectorId:string,resourceId:string){return commitLoraV3Config(node,updateLoraV3EntryCollector(config,entryId,collectorId,resourceId));}
export function addLoraV3TargetEntry(node:any,config:LoraV3Config,target:LoraV3Target){const choice=loraV3Catalog(node)[0],resource=choice?.resources[0];if(!choice||!resource)return config;return commitLoraV3Config(node,{...config,entries:[...config.entries,{id:crypto.randomUUID(),source:{kind:"external",collector_id:choice.id,resource_id:resource.id},targets:[target]}]});}
export function removeLoraV3TargetEntry(node:any,config:LoraV3Config,entryId:string,target:LoraV3Target){return commitLoraV3Config(node,withoutLoraV3Target(config,target,entryId));}
export function clearLoraV3Target(node:any,config:LoraV3Config,target:LoraV3Target){return commitLoraV3Config(node,withoutLoraV3Target(config,target));}

function installCollector(node:any){ensureCanvasVisibility();const id=widget(node,"collector_id");ensureId(id);const current=String(id?.value??"").trim(),duplicate=(node.graph?._nodes??[]).find((item:any)=>item!==node&&nodeClass(item)==="BV LoRA Stack Collector"&&String(widget(item,"collector_id")?.value??"").trim()===current);if(id&&current&&duplicate){const next=crypto.randomUUID();id.value=next;node.__bvLoraCollectorIdRemap={[current]:next};}hideLoraV3Widget(id);ensureLoraCollectorOutput(node);node.__bvRuntimeResourceProvider=true;}
function configuredCollectorCount(node:any){try{const name=nodeClass(node)==="BV Regional Prompt"?"lora_v3_config_json":"config_json",config=JSON.parse(String(widget(node,name)?.value??"{}")),entries=[...(config.entries??[]),...(config.steps??[]).flatMap((step:any)=>step.entries??[])],ids:string[]=[];for(const entry of entries)if(entry?.source?.kind==="external"&&entry.source.collector_id&&!ids.includes(entry.source.collector_id))ids.push(entry.source.collector_id);return ids.length;}catch{return 0;}}
function reconcileConfiguredLoraWriterCollectors(node:any,config?:LoraV3Config){
    const localConfig=config??readNodeLoraV3Config(node),catalog=loraV3Catalog(node),local=loraV3CollectorIds(localConfig).map(id=>catalog.find(item=>item.id===id)?.node??null);
    return reconcileLoraWriterCollectors(node,local);
}
function configuredLoraCollectorNodes(node:any){const config=readNodeLoraV3Config(node),catalog=loraV3Catalog(node);return loraV3CollectorIds(config).map(id=>catalog.find(item=>item.id===id)?.node??null);}
function reconcileConfiguredLoraWriterTree(node:any,config?:LoraV3Config){
    const current=reconcileConfiguredLoraWriterCollectors(node,config);reconcileDownstreamLoraWriters(node,configuredLoraCollectorNodes);return current;
}
function scheduleConfiguredLoraWriterTree(node:any,config?:LoraV3Config){
    node.__bvLoraPendingConfig=config??node.__bvLoraPendingConfig;if(node.__bvLoraReconcileScheduled)return;
    node.__bvLoraReconcileScheduled=true;setTimeout(()=>{const pending=node.__bvLoraPendingConfig;delete node.__bvLoraPendingConfig;node.__bvLoraReconcileScheduled=false;reconcileConfiguredLoraWriterTree(node,pending);window.dispatchEvent(new CustomEvent(LORA_V3_INVENTORY_CHANGED_EVENT,{detail:{node}}));},0);
}
export function installLoraV3ConsumerSlot(node:any){ensureCanvasVisibility();migrateLegacyLoraCollectorLink(node);scheduleConfiguredLoraWriterTree(node);const linked=linkedLocalLoraCollectors(node),lastLinked=linked.reduce((last,item,index)=>item?index+1:last,0),count=Math.max(configuredCollectorCount(node),lastLinked);trimUnusedLoraConsumerInputs(node,count);for(const index of ensureLoraConsumerInputs(node,count)){const input=node.inputs?.[index];if(input){input.hidden=true;input.label="";input.__bvM0VisualHidden=true;input.__bvM0PortHidden=true;input.__bvM0ResourceSlot=true;}}scheduleCompactLoraConsumerNode(node);}
function installTransformer(node:any){installLoraV3ConsumerSlot(node);hideLoraV3Widget(widget(node,"operation"));hideLoraV3Widget(widget(node,"config_json"));if(!node.widgets?.find((item:any)=>item.name==="open_lora_editor")){const button=node.addWidget?.("button","open_lora_editor",null,()=>requestRegionalWindow("lora",node),{serialize:false});if(button){button.label="Open LoRA Editor";button.serialize=false;}}compactLoraConsumerNode(node);}

export {compactLoraConsumerNode};

export function installLoraV3Ui(nodeType:any,nodeData:any){
    const collector=nodeData.name==="BV LoRA Stack Collector",transformer=nodeData.name==="BV Regional LoRA",consumer=nodeData.name==="BV Regional Prompt";if(!collector&&!transformer&&!consumer)return false;
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange,removed=nodeType.prototype.onRemoved,upgrade=function(this:any){if(collector)installCollector(this);if(transformer)installTransformer(this);if(consumer)installLoraV3ConsumerSlot(this);if(transformer)window.dispatchEvent(new CustomEvent(LORA_V3_INVENTORY_CHANGED_EVENT));};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};nodeType.prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueMicrotask(()=>upgrade.call(this));return result;};nodeType.prototype.onRemoved=function(){const result=removed?.apply(this,arguments);if(transformer)queueMicrotask(()=>window.dispatchEvent(new CustomEvent(LORA_V3_INVENTORY_CHANGED_EVENT)));return result;};return true;
}

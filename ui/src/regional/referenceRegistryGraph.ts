import {parseReferenceConfig} from "./referenceRegistryLifecycle";
import {registryDomainId,workflowRegistries,enableRegistryFamily} from "./registryDgFamilies";
import {reconcileRegistryFamily} from "./registryDgReconcile";
import {scheduleDgUpgrade} from "./dgRouting";
import {markProjectedProvider} from "./portProjection";
import {resolveNativeInputSource} from "./regionalNativeSource";
import {sourceRegionalPrompt} from "./regionalSourceDocument";

export const REFERENCE_INVENTORY_EVENT="bv-reference-inventory-changed";
export const MAX_REFERENCE_COLLECTORS=20;
export type ReferenceSelection={version:1;collector_ids:string[]};
const widget=(node:any)=>node.widgets?.find((item:any)=>item.name==="reference_v3_config_json");
export function parseReferenceSelection(raw:any):ReferenceSelection{
    const value=typeof raw==="string"?JSON.parse(raw):raw;
    if(!value||value.version!==1||!Array.isArray(value.collector_ids)||value.collector_ids.length>MAX_REFERENCE_COLLECTORS||value.collector_ids.some((id:any)=>typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))||new Set(value.collector_ids).size!==value.collector_ids.length)throw Error("Invalid reference collector selection");
    return value;
}
export const readReferenceSelection=(node:any)=>parseReferenceSelection(widget(node)?.value||'{"version":1,"collector_ids":[]}');
export function referenceRegistryCatalog(node:any){
    const sources=workflowRegistries(node,"reference");
    return sources.filter(source=>sources.filter(other=>registryDomainId(other)===registryDomainId(source)).length===1).map(source=>{
        const config=parseReferenceConfig(source.widgets?.find((item:any)=>item.name==="config_json")?.value),counts:Record<string,number>={};
        return {id:config.collector_id,nodeId:String(source.id),label:`Reference Registry · #${source.id}`,resources:(config.places??config.entries).map(entry=>{
            const index=source.inputs?.findIndex((slot:any)=>slot.name===`media.${entry.slot}`),upstream=resolveNativeInputSource(source,index),type=upstream?.node?.outputs?.[upstream.outputIndex]?.type;
            const label=({IMAGE:"Image",AUDIO:"Audio",VIDEO:"Video"} as Record<string,string>)[entry.media_type??type]??"Media";
            counts[label]=(counts[label]??0)+1;return{id:entry.id,label:`${label} ${counts[label]}`};
        }).filter(entry=>config.entries.some(active=>active.id===entry.id))};
    });
}
export function prepareReferenceConsumer(node:any){
    const source=sourceRegionalPrompt(node);
    const selected=source?readReferenceSelection(source):{version:1,collector_ids:[]};
    reconcileRegistryFamily(node,"reference",selected.collector_ids.map(id=>({kind:"reference",id})),index=>`reference_resource_provider_${index+1}`,MAX_REFERENCE_COLLECTORS);
    node.__bvApplyPresentation?.();
    if(source===node)refreshReferenceConsumers(node);
}
function refreshReferenceConsumers(node:any,adopt=false){
    const owner=node.__bvConcreteGraph??node.graph,seen=new Set<any>();
    const visit=(graph:any)=>{if(!graph||seen.has(graph))return;seen.add(graph);for(const candidate of graph._nodes??graph.nodes??[]){
        if(String(candidate.comfyClass??candidate.type)==="BV Regional Krea 2 Attention"){
            if(adopt&&sourceRegionalPrompt(candidate)===node)enableRegistryFamily(candidate,"reference");
            scheduleDgUpgrade(candidate,()=>prepareReferenceConsumer(candidate));
        }
        visit(candidate.subgraph??candidate.getSubgraph?.());
    }};visit(owner?.rootGraph??owner);
}
export function commitReferenceSelection(node:any,value:ReferenceSelection){
    parseReferenceSelection(value);const target=widget(node);if(!target)return;
    const owner=node.__bvConcreteGraph??node.graph,graph=owner?.rootGraph??owner;
    graph?.beforeChange?.();try{target.value=JSON.stringify(value);enableRegistryFamily(node,"reference");prepareReferenceConsumer(node);refreshReferenceConsumers(node,true)}finally{graph?.afterChange?.()}
    if(typeof window!=="undefined")window.dispatchEvent(new Event(REFERENCE_INVENTORY_EVENT));
}
export function publishReferenceRegistry(node:any){
    const output=node.outputs?.find((slot:any)=>slot.type==="BV_RUNTIME_RESOURCE_PROVIDER");markProjectedProvider(output);node.__bvRuntimeResourceProvider=true;
    const owner=node.__bvConcreteGraph??node.graph,root=owner?.rootGraph??owner,seen=new Set<any>();
    const visit=(graph:any)=>{if(!graph||seen.has(graph))return;seen.add(graph);for(const candidate of graph._nodes??graph.nodes??[]){
        if(String(candidate.comfyClass??candidate.type)==="BV Regional Prompt")scheduleDgUpgrade(candidate,()=>prepareReferenceConsumer(candidate));
        visit(candidate.subgraph??candidate.getSubgraph?.());
    }};visit(root);
    if(typeof window!=="undefined")window.dispatchEvent(new Event(REFERENCE_INVENTORY_EVENT));
}

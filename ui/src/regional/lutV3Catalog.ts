import type{ResourcePickerCollector}from"../ui/components";
import{scheduleCompactLoraConsumerNode}from"./loraV3Graph.js";
import{markProjectedProvider,retainNeededProjectedInputs}from"./portProjection.js";
import{resolveNativeInputSource}from"./regionalNativeSource";
import{enableRegistryFamily,registryDomainId,workflowRegistries}from"./registryDgFamilies";
import{reconcileRegistryFamily,type RegistryReference}from"./registryDgReconcile";
import{scheduleDgUpgrade}from"./dgRouting";
import{sourceRegionalPrompt}from"./regionalSourceDocument";
const parseLutRegistryConfig=(value:unknown)=>{try{const parsed=JSON.parse(String(value??"{}")),collector_id=String(parsed?.collector_id??"").trim()||crypto.randomUUID(),seen=new Set<string>(),luts=Array.isArray(parsed?.luts)?parsed.luts.flatMap((entry:any)=>{const id=String(entry?.id??"").trim(),lut_name=String(entry?.lut_name??"").trim();if(!id||!lut_name||seen.has(id))return[];seen.add(id);return[{id,lut_name}]}):[];return{schema:"bv.lut_registry_config",version:1 as const,collector_id,luts}}catch{return{schema:"bv.lut_registry_config",version:1 as const,collector_id:crypto.randomUUID(),luts:[]}}},serializeLutRegistryConfig=(value:any)=>JSON.stringify(value);
const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name),nodeClass=(node:any)=>String(node?.comfyClass??node?.type??""),graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null),graphOf=(node:any)=>node?.__bvConcreteGraph??node?.graph??null,source=(node:any,name:string)=>{const graph=graphOf(node),input=node?.inputs?.find((item:any)=>item.name===name),link=graphLink(graph,input?.link);return link&&graph?.getNodeById?.(link.origin_id)};
const TYPE="BV_RUNTIME_RESOURCE_PROVIDER",MAX=40;
function ensureOutput(node:any){let index=node.outputs?.findIndex((slot:any)=>slot?.type===TYPE)??-1;if(index<0&&node.addOutput){node.addOutput("resource_provider",TYPE);index=node.outputs?.findIndex((slot:any)=>slot?.type===TYPE)??-1}const output=node.outputs?.[index];markProjectedProvider(output);return index}
function registryConfig(node:any){return parseLutRegistryConfig(widget(node,"config_json")?.value)}
function providerId(node:any){if(nodeClass(node)==="BV LUT Registry")return registryConfig(node).collector_id;if(nodeClass(node)==="BV Detector Registry")try{return String(JSON.parse(String(widget(node,"config_json")?.value??"{}")).collector_id??"").trim()}catch{return""}return""}
export function prepareLutRegistryV3(node:any){if(nodeClass(node)!=="BV LUT Registry")return;const item=widget(node,"config_json");if(!item)return;const config=registryConfig(node),graph=graphOf(node),duplicate=(graph?._nodes??graph?.nodes??[]).find((other:any)=>other!==node&&nodeClass(other)==="BV LUT Registry"&&providerId(other)===config.collector_id);if(duplicate)config.collector_id=crypto.randomUUID();item.value=serializeLutRegistryConfig(config);ensureOutput(node);node.__bvRuntimeResourceProvider=true;window.dispatchEvent(new CustomEvent("bv-regional-lut-inventory-changed",{detail:{node}}))}
export function lutV3Catalog(node:any):ResourcePickerCollector[]{const nodes=workflowRegistries(node,"lut");return nodes.filter(item=>registryDomainId(item)&&nodes.filter(other=>registryDomainId(other)===registryDomainId(item)).length===1).map((item:any)=>{const resources=registryConfig(item).luts.map((entry:{id:string;lut_name:string})=>({id:entry.id,label:`${entry.id} · ${entry.lut_name}`}));return{id:providerId(item),nodeId:String(item.id),label:`${String(item.title||"BV LUT Registry")} · #${item.id}`,resources}}).filter((item:any)=>item.id)}
/** Same concrete owner for configuration reads and explicitly confirmed legacy adoption. */
export function lutConfigOwner(node:any):any|null{
    if(nodeClass(node)!=="BV LUT Loop Start")return ["BV Regional Prompt","BV Regional LUT Plan"].includes(nodeClass(node))?node:null;
    const resolved=resolveNativeInputSource(node,node.inputs?.findIndex((item:any)=>item.name==="plan")??-1);
    if(!resolved)return null;
    const upstream=resolved.node,outputType=upstream.outputs?.[resolved.outputIndex]?.type;
    if(outputType==="BV_REGIONAL")return sourceRegionalPrompt(upstream);
    return outputType==="BV_LUT_PLAN"&&nodeClass(upstream)==="BV Regional LUT Plan"?upstream:null;
}
function config(node:any){try{const owner=lutConfigOwner(node);if(!owner)return{version:1,jobs:[]};const name=nodeClass(owner)==="BV Regional LUT Plan"?"config_json":"lut_v3_config_json",value=JSON.parse(String(widget(owner,name)?.value??"{}"));return value?.version===1&&Array.isArray(value.jobs)?value:{version:1,jobs:[]}}catch{return{version:1,jobs:[]}}}
/** Only called inside a confirmed source-editor commit, never prepare/configure/catalog. */
export function adoptLutLoopConsumers(owner:any,reconcileLoop:(node:any)=>void=reconcileLutV3Now){
    if(!["BV Regional Prompt","BV Regional LUT Plan"].includes(nodeClass(owner)))return [];
    const graph=graphOf(owner),seen=new Set<any>(),adopted:any[]=[];
    const visit=(current:any)=>{if(!current||seen.has(current))return;seen.add(current);
        for(const candidate of current._nodes??current.nodes??[]){
            if(nodeClass(candidate)==="BV LUT Loop Start"&&graphOf(candidate)===current&&lutConfigOwner(candidate)===owner){
                enableRegistryFamily(candidate,"lut");adopted.push(candidate);
                scheduleDgUpgrade(candidate,()=>{
                    if((current._nodes??current.nodes??[]).includes(candidate)&&lutConfigOwner(candidate)===owner)reconcileLoop(candidate);
                });
            }
            visit(candidate?.subgraph??candidate?.getSubgraph?.());
        }
    };visit(graph?.rootGraph??graph);return adopted;
}
export function commitLutSourceConfig(node:any,value:string){
    const item=widget(node,nodeClass(node)==="BV Regional LUT Plan"?"config_json":"lut_v3_config_json");
    if(!item)return;
    const ownerGraph=graphOf(node),graph=ownerGraph?.rootGraph??ownerGraph;
    graph?.beforeChange?.();
    try{item.value=value;item.callback?.(value);enableRegistryFamily(node,"lut");adoptLutLoopConsumers(node);}
    finally{graph?.afterChange?.();}
    scheduleLutV3Reconcile(node);ownerGraph?.setDirtyCanvas?.(true,true);
}
function reconcile(node:any){const graph=graphOf(node),wanted:string[]=[];for(const job of config(node).jobs)for(const candidate of[job?.lut_source?.collector_id,job?.detector_source?.collector_id]){const id=String(candidate??"");if(id&&!wanted.includes(id))wanted.push(id)}const available=(graph?._nodes??graph?.nodes??[]).filter((item:any)=>graphOf(item)===graph&&["BV LUT Registry","BV Detector Registry"].includes(nodeClass(item))),prefix=nodeClass(node)==="BV Regional Prompt"?"lut_resource_provider_":"resource_provider_",wantedNames=wanted.map((_,ordinal)=>`${prefix}${ordinal+1}`);wanted.forEach((id,ordinal)=>{const name=wantedNames[ordinal];let index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;if(index<0&&node.addInput){node.addInput(name,TYPE);index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1}const input=node.inputs?.[index];markProjectedProvider(input);const target=available.find((item:any)=>providerId(item)===id),current=source(node,name);if(current!==target){if(input?.link!=null)node.disconnectInput?.(index);if(target)target.connect?.(ensureOutput(target),node,index)}});for(const {slot,index}of(node.inputs??[]).map((slot:any,index:number)=>({slot,index})).filter(({slot}:any)=>String(slot.name??"").startsWith(prefix)&&!wantedNames.includes(slot.name)&&slot.link!=null))node.disconnectInput?.(index);retainNeededProjectedInputs(node,wantedNames,slot=>String(slot.name??"").startsWith(prefix)&&slot.type===TYPE);node.__bvM0ResourceConsumer=wanted.length>0;scheduleCompactLoraConsumerNode(node)}
export function reconcileLutV3Now(node:any){
    const references:RegistryReference[]=[];
    for(const job of config(node).jobs){
        if(job?.lut_source?.collector_id)references.push({kind:"lut",id:String(job.lut_source.collector_id)});
        if(job?.detector_source?.collector_id)references.push({kind:"detector",id:String(job.detector_source.collector_id)});
    }
    const prefix=nodeClass(node)==="BV Regional Prompt"?"lut_resource_provider_":"resource_provider_";
    if(reconcileRegistryFamily(node,"lut",references,index=>`${prefix}${index+1}`,MAX)){node.__bvM0ResourceConsumer=references.length>0;scheduleCompactLoraConsumerNode(node)}else reconcile(node);
}
export function scheduleLutV3Reconcile(node:any){if(!node||node.__bvLutV3Scheduled)return;node.__bvLutV3Scheduled=true;scheduleDgUpgrade(node,()=>{node.__bvLutV3Scheduled=false;reconcileLutV3Now(node)})}
export function prepareLutV3(node:any,graph?:any){if(node&&graph)node.__bvConcreteGraph=graph;scheduleLutV3Reconcile(node)}

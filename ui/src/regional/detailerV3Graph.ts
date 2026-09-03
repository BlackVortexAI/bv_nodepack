import { detectorCapabilities,parseDetectorRegistryConfig,serializeDetectorRegistryConfig } from "./detectorRegistryConfig";
import { serializeDetailerPlanConfig } from "./detailerPlanConfig";
import { scheduleCompactLoraConsumerNode } from "./loraV3Graph";
import { applyProjectedSlotLabel, markProjectedProvider } from "./portProjection";
import { sourceRegionalPrompt } from "./regionalSourceDocument";
import { registryDomainId, workflowRegistries } from "./registryDgFamilies";
import { reconcileRegistryFamily } from "./registryDgReconcile";
import { scheduleDgUpgrade } from "./dgRouting";
import { nativeRegionalDescendants } from "./regionalNativeSource";

export const DETAILER_V3_INVENTORY_CHANGED_EVENT="bv-regional-detailer-inventory-changed";
const TYPE="BV_RUNTIME_RESOURCE_PROVIDER",COLLECTOR="BV Detector Registry",MAX=20;
const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const nodeClass=(node:any)=>String(node?.comfyClass??node?.type??"");
const slotName=(ordinal:number)=>ordinal===0?"resource_provider":`resource_provider_${ordinal}`;
const promptSlotName=(ordinal:number)=>`detailer_resource_provider_${ordinal+1}`;
const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
const concreteGraph=(node:any)=>node?.__bvConcreteGraph??node?.graph??null;
export function bindDetailerV3Graph(node:any,graph:any){if(node&&graph)node.__bvConcreteGraph=graph;return graph;}
const configOf=(collector:any)=>parseDetectorRegistryConfig(widget(collector,"config_json")?.value);
const planConfig=(node:any)=>{try{const value=JSON.parse(String(widget(node,"config_json")?.value??"{}"));return value?.version===1&&Array.isArray(value.jobs)?value:{version:1,jobs:[]};}catch{return{version:1,jobs:[]};}};

export function ensureDetectorProviderOutput(node:any){let index=node.outputs?.findIndex((slot:any)=>slot?.type===TYPE)??-1;if(index<0&&node.addOutput){node.addOutput("resource_provider",TYPE);index=node.outputs?.findIndex((slot:any)=>slot?.type===TYPE)??-1;}const output=node.outputs?.[index];if(output){output.name="resource_provider";output.type=TYPE;output.hidden=true;output.__bvResourceSlot=true;}return index;}
function ensureInputs(node:any,count:number){const indexes:number[]=[];for(let ordinal=0;ordinal<count;ordinal++){const name=slotName(ordinal);let index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;if(index<0&&node.addInput){node.addInput(name,TYPE);index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;}const input=node.inputs?.[index];if(input){input.type=TYPE;markProjectedProvider(input);}indexes.push(index);}return indexes;}
const providerOrdinal=(slot:any)=>slot?.name==="resource_provider"?0:Number(String(slot?.name??"").match(/^resource_provider_(\d+)$/)?.[1]??-1);
function trimUnusedInputs(node:any,keepCount:number){const removable=(node.inputs??[]).map((slot:any,index:number)=>({slot,index,ordinal:providerOrdinal(slot)})).filter((item:any)=>item.slot?.type===TYPE&&item.ordinal>=keepCount&&item.slot?.link==null).sort((a:any,b:any)=>b.index-a.index);for(const item of removable)node.removeInput?.(item.index);}
function linked(node:any,ordinal:number){const graph=concreteGraph(node),input=node.inputs?.find((slot:any)=>slot.name===slotName(ordinal)),link=graphLink(graph,input?.link);if(!link)return null;const source=graph?.getNodeById?.(link.origin_id),output=source?.outputs?.[Number(link.origin_slot)];return concreteGraph(source)===graph&&output?.type===TYPE?source:null;}
function collectors(node:any){const nodes=workflowRegistries(node,"detector");return nodes.filter(item=>registryDomainId(item)&&nodes.filter(other=>registryDomainId(other)===registryDomainId(item)).length===1);}
function collectorIds(config:any){const ids:string[]=[];for(const job of config.jobs??[])for(const assignment of job.detector_assignments??[]){const id=String(assignment?.source?.collector_id??"");if(id&&!ids.includes(id))ids.push(id);}return ids;}
const promptConfig=(node:any)=>{try{const value=JSON.parse(String(widget(node,"detailer_v3_config_json")?.value??"{}"));return value?.version===1&&Array.isArray(value.jobs)?value:{version:1,jobs:[]};}catch{return{version:1,jobs:[]};}};
const lutDetectorIds=(node:any)=>{try{const value=JSON.parse(String(widget(node,"lut_v3_config_json")?.value??"{}"));return [...new Set((value?.jobs??[]).map((job:any)=>String(job?.detector_source?.collector_id??"")).filter(Boolean))] as string[];}catch{return[];}};
const upstreamPrompt=sourceRegionalPrompt;
function effectiveCollectorIds(node:any,config:any){if(String(widget(node,"config_json")?.value??"").trim())return collectorIds(config);const prompt=upstreamPrompt(node);return prompt?collectorIds(promptConfig(prompt)):collectorIds(config);}

export function prepareDetectorCollectorV3(node:any,graph?:any){
    bindDetailerV3Graph(node,graph);
    const item=widget(node,"config_json");if(!item)return;
    let config=configOf(node);
    // Preparation also runs after restore: self is not a duplicate. Use the raw
    // inventory because the selectable catalog deliberately excludes duplicate IDs.
    const duplicate=workflowRegistries(node,"detector").find(other=>other!==node&&configOf(other).collector_id===config.collector_id);
    if(duplicate){const previous=config.collector_id;config={...config,collector_id:crypto.randomUUID()};item.value=serializeDetectorRegistryConfig(config);item.callback?.(item.value);node.__bvDetectorCollectorIdRemap={[previous]:config.collector_id};}
    ensureDetectorProviderOutput(node);node.__bvRuntimeResourceProvider=true;
    window.dispatchEvent(new CustomEvent(DETAILER_V3_INVENTORY_CHANGED_EVENT,{detail:{node}}));
}
export function detailerV3Catalog(node:any){return collectors(node).map((collector:any)=>{const graph=concreteGraph(collector),config=configOf(collector),resources:any[]=config.detectors.map((entry:any)=>({id:entry.id,label:entry.id,detectorCapabilities:detectorCapabilities(entry)}));for(const input of collector.inputs??[]){if(!String(input.name).startsWith("external_detector_")||input.link==null)continue;const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id),id=String(widget(source,"detector_id")?.value??"").trim();if(id&&!resources.some((item:any)=>item.id===id))resources.push({id,label:id});}return{id:config.collector_id,label:`${String(collector.title||COLLECTOR)} · #${collector.id}`,resources};}).filter((item:any)=>item.id);}
function applyLinkedRemaps(node:any,config:any){let changed=false;const jobs=config.jobs.map((job:any)=>({...job,detector_assignments:job.detector_assignments.map((assignment:any)=>{const sourceNode=Array.from({length:MAX+1},(_,i)=>linked(node,i)).find((item:any)=>item?.__bvDetectorCollectorIdRemap?.[assignment.source.collector_id]);const next=sourceNode?.__bvDetectorCollectorIdRemap?.[assignment.source.collector_id];if(!next)return assignment;changed=true;return{...assignment,source:{...assignment.source,collector_id:next}};})}));return{config:changed?{...config,jobs}:config,changed};}
function reconcile(node:any){const graph=concreteGraph(node),item=widget(node,"config_json");if(!item)return;let config=planConfig(node),remapped=applyLinkedRemaps(node,config);config=remapped.config;if(remapped.changed){item.value=serializeDetailerPlanConfig(config);item.callback?.(item.value);}const catalog=collectors(node),wanted=effectiveCollectorIds(node,config).map(id=>catalog.find((collector:any)=>configOf(collector).collector_id===id)??null),inputs=ensureInputs(node,wanted.length);wanted.forEach((collector:any,ordinal:number)=>{const index=inputs[ordinal],current=linked(node,ordinal);if(current===collector)return;if(node.inputs?.[index]?.link!=null)node.disconnectInput?.(index);if(collector&&concreteGraph(collector)===graph){const output=ensureDetectorProviderOutput(collector);collector.connect?.(output,node,index);}});for(let ordinal=wanted.length;ordinal<=MAX;ordinal++){const index=node.inputs?.findIndex((slot:any)=>slot.name===slotName(ordinal))??-1;if(index>=0&&node.inputs[index].link!=null)node.disconnectInput?.(index);}trimUnusedInputs(node,wanted.length);scheduleCompactLoraConsumerNode(node);window.dispatchEvent(new CustomEvent(DETAILER_V3_INVENTORY_CHANGED_EVENT,{detail:{node}}));}
export function reconcileDetailerV3Now(node:any){
    const references=effectiveCollectorIds(node,planConfig(node)).map(id=>({kind:"detector" as const,id}));
    if(reconcileRegistryFamily(node,"detailer",references,slotName,MAX+1))scheduleCompactLoraConsumerNode(node);else reconcile(node);
}
export function scheduleDetailerV3Reconcile(node:any){if(node.__bvDetailerV3Scheduled)return;node.__bvDetailerV3Scheduled=true;scheduleDgUpgrade(node,()=>{node.__bvDetailerV3Scheduled=false;reconcileDetailerV3Now(node)});}
export function prepareDetailerPlanV3(node:any,graph?:any){bindDetailerV3Graph(node,graph);scheduleDetailerV3Reconcile(node);const count=Math.max(effectiveCollectorIds(node,planConfig(node)).length,Array.from({length:MAX+1},(_,i)=>linked(node,i)).filter(Boolean).length);for(const index of ensureInputs(node,count)){const input=node.inputs?.[index];if(input){input.hidden=true;applyProjectedSlotLabel(input);input.__bvM0PortHidden=true;}}trimUnusedInputs(node,count);scheduleCompactLoraConsumerNode(node);}

function downstreamPlans(node:any){return nativeRegionalDescendants(node,target=>nodeClass(target)==="BV Regional Detailer Plan");}
function ensurePromptInputs(node:any,count:number){const indexes:number[]=[];for(let ordinal=0;ordinal<count;ordinal++){const name=promptSlotName(ordinal);let index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;if(index<0&&node.addInput){node.addInput(name,TYPE);index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;}const input=node.inputs?.[index];if(input){input.type=TYPE;markProjectedProvider(input);}indexes.push(index);}return indexes;}
function reconcilePrompt(node:any){const graph=concreteGraph(node),ids=[...new Set([...collectorIds(promptConfig(node)),...lutDetectorIds(node)])],catalog=collectors(node),wanted=ids.map(id=>catalog.find((item:any)=>configOf(item).collector_id===id)??null),inputs=ensurePromptInputs(node,wanted.length);wanted.forEach((collector:any,ordinal:number)=>{const index=inputs[ordinal],input=node.inputs?.[index],link=graphLink(graph,input?.link),current=link&&graph?.getNodeById?.(link.origin_id);if(current===collector)return;if(input?.link!=null)node.disconnectInput?.(index);if(collector&&concreteGraph(collector)===graph)collector.connect?.(ensureDetectorProviderOutput(collector),node,index);});for(let ordinal=wanted.length;ordinal<MAX;ordinal++){const index=node.inputs?.findIndex((slot:any)=>slot.name===promptSlotName(ordinal))??-1;if(index>=0&&node.inputs[index].link!=null)node.disconnectInput?.(index);if(index>=0&&node.inputs[index].link==null)node.removeInput?.(index);}for(const plan of downstreamPlans(node))reconcile(plan);scheduleCompactLoraConsumerNode(node);}
export function reconcileDetailerPromptV3Now(node:any){
    // LUT detector references belong to LUT channels; do not claim them twice.
    const references=collectorIds(promptConfig(node)).map(id=>({kind:"detector" as const,id}));
    if(reconcileRegistryFamily(node,"detailer",references,promptSlotName,MAX)){
        for(const plan of downstreamPlans(node))reconcileDetailerV3Now(plan);
        scheduleCompactLoraConsumerNode(node);
    }else reconcilePrompt(node);
}
export function scheduleDetailerPromptV3Reconcile(node:any){if(!node||node.__bvDetailerPromptV3Scheduled)return;node.__bvDetailerPromptV3Scheduled=true;scheduleDgUpgrade(node,()=>{node.__bvDetailerPromptV3Scheduled=false;reconcileDetailerPromptV3Now(node)});}
export function prepareDetailerPromptV3(node:any,graph?:any){bindDetailerV3Graph(node,graph);scheduleDetailerPromptV3Reconcile(node);}

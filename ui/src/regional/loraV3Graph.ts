export const LORA_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
export const LORA_PROVIDER_SLOT="resource_provider";
export const LORA_COLLECTOR_NODE="BV LoRA Stack Collector";
export const LORA_REGISTRY_NODE="BV LoRA Registry";
export const LORA_PROVIDER_NODES=new Set([LORA_COLLECTOR_NODE,LORA_REGISTRY_NODE]);
export const LORA_MAX_COLLECTORS=20;
import{compactProjectedPortLayout,markProjectedProvider,scheduleProjectedPortLayout}from"./portProjection.js";
import{strictLoraRegistryConfig}from"./loraRegistryConfig";
import{connectRuntimeResource,disconnectRuntimeResource}from"./runtimeResourceGraph";
export const loraProviderSlot=(ordinal:number)=>`${LORA_PROVIDER_SLOT}_${ordinal}`;
const LORA_PROVIDER_SLOT_HEIGHT=20;

const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
export const loraV3GraphOf=(node:any)=>node?.__bvConcreteGraph??node?.graph??null;
export function bindLoraV3Graph(node:any,graph:any){if(node&&graph)node.__bvConcreteGraph=graph;return graph;}
const inLoraV3Graph=(node:any,graph:any)=>(loraV3GraphOf(node)??bindLoraV3Graph(node,graph))===graph;
const loraProviderNode=(node:any)=>LORA_PROVIDER_NODES.has(String(node?.comfyClass??node?.type));
const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const registryConfig=(node:any)=>strictLoraRegistryConfig(widget(node,"config_json")?.value);

export function loraProviderIdentity(node:any):string{
    if(String(node?.comfyClass??node?.type)===LORA_REGISTRY_NODE)return registryConfig(node)?.registry_id??"";
    return String(widget(node,"collector_id")?.value??"").trim();
}
export function loraRegistryResources(node:any):Array<{id:string;label:string;node:any}>|null{
    if(String(node?.comfyClass??node?.type)!==LORA_REGISTRY_NODE)return null;
    return(registryConfig(node)?.stacks??[]).map(stack=>({id:stack.id,label:stack.name,node}));
}
export function loraProviderResources(node:any):Array<{id:string;label:string;node:any}>{
    const registry=loraRegistryResources(node);if(registry!==null)return registry;
    if(String(node?.comfyClass??node?.type)!==LORA_COLLECTOR_NODE)return[];
    const found:Array<{id:string;label:string;node:any}>=[],queue=[node],seen=new Set<any>();
    while(queue.length){const target=queue.shift();if(!target||seen.has(target))continue;seen.add(target);const graph=loraV3GraphOf(target);for(const input of target.inputs??[]){if(input.name!==LORA_PROVIDER_SLOT)continue;const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id);if(!source||!inLoraV3Graph(source,graph)||seen.has(source))continue;if(String(source.comfyClass??source.type)==="BV Named LoRA Stack"){const id=String(widget(source,"stack_id")?.value??"").trim(),label=String(widget(source,"name")?.value??"").trim();if(id&&label&&!found.some(item=>item.id===id))found.push({id,label,node:source});}queue.push(source);}}
    return found.reverse();
}

const slotIndex=(slots:any[]|undefined)=>slots?.findIndex(slot=>slot?.name===LORA_PROVIDER_SLOT||slot?.type===LORA_PROVIDER_TYPE)??-1;

export function ensureLoraCollectorOutput(node:any){
    let index=slotIndex(node.outputs);
    if(index<0&&node.addOutput){node.addOutput(LORA_PROVIDER_SLOT,LORA_PROVIDER_TYPE);index=slotIndex(node.outputs);}
    const output=node.outputs?.[index];
    if(output){output.name=LORA_PROVIDER_SLOT;output.type=LORA_PROVIDER_TYPE;output.hidden=true;output.__bvResourceSlot=true;}
    return index;
}

export function ensureLoraConsumerInputs(node:any,count=LORA_MAX_COLLECTORS){
    const indexes:number[]=[];
    for(let ordinal=1;ordinal<=count;ordinal++){
        const name=loraProviderSlot(ordinal);let index=node.inputs?.findIndex((slot:any)=>slot?.name===name)??-1;
        if(index<0&&node.addInput){node.addInput(name,LORA_PROVIDER_TYPE);index=node.inputs?.findIndex((slot:any)=>slot?.name===name)??-1;}
        const input=node.inputs?.[index];if(input){input.name=name;input.type=LORA_PROVIDER_TYPE;input.__bvLoraProviderOrdinal=ordinal;markProjectedProvider(input);}
        indexes.push(index);
    }
    return indexes;
}
export function ensureLoraConsumerInput(node:any){return ensureLoraConsumerInputs(node,1)[0];}
export function trimUnusedLoraConsumerInputs(node:any,keepCount=0){
    const removable=(node.inputs??[]).map((slot:any,index:number)=>({slot,index,ordinal:Number(slot?.__bvLoraProviderOrdinal??String(slot?.name??"").match(/^resource_provider_(\d+)$/)?.[1]??0)}))
        .filter((item:any)=>item.ordinal>keepCount&&item.slot?.type===LORA_PROVIDER_TYPE&&item.slot?.link==null).sort((a:any,b:any)=>b.index-a.index);
    for(const item of removable)node.removeInput?.(item.index);
}

export function installLoraSizePolicy(node:any){
    // Compatibility marker for older callers/tests. The actual policy now lives
    // in the shared projected-port layout module.
    if(node&&!node.__bvLoraOriginalComputeSize)node.__bvLoraOriginalComputeSize=node.computeSize;
    compactProjectedPortLayout(node);
}
export function compactLoraConsumerNode(node:any){
    compactProjectedPortLayout(node);
}
export function scheduleCompactLoraConsumerNode(node:any){
    if(node?.__bvPresentationManaged)return;
    scheduleProjectedPortLayout(node);
}

export function linkedLocalLoraCollector(node:any){
    const graph=loraV3GraphOf(node);
    const input=node.inputs?.find((item:any)=>item.name===loraProviderSlot(1));
    const link=graphLink(graph,input?.link);
    if(!link||String(link.target_id)!==String(node.id))return null;
    const source=graph?.getNodeById?.(link.origin_id);
    const output=source?.outputs?.[Number(link.origin_slot)];
    return inLoraV3Graph(source,graph)&&(loraProviderNode(source)||output?.type===LORA_PROVIDER_TYPE)?source:null;
}

export function linkedLocalLoraCollectors(node:any){return Array.from({length:LORA_MAX_COLLECTORS},(_,index)=>{
    const graph=loraV3GraphOf(node),input=node.inputs?.find((slot:any)=>slot?.name===loraProviderSlot(index+1)),link=graphLink(graph,input?.link);if(!link||String(link.target_id)!==String(node.id))return null;
    const source=graph?.getNodeById?.(link.origin_id),output=source?.outputs?.[Number(link.origin_slot)];
    return inLoraV3Graph(source,graph)&&(loraProviderNode(source)||output?.type===LORA_PROVIDER_TYPE)?source:null;
});}

export function connectLocalLoraCollector(consumer:any,collector:any|null){
    const graph=loraV3GraphOf(consumer);
    const input=ensureLoraConsumerInput(consumer);
    if(input<0)return false;
    if(linkedLocalLoraCollector(consumer)===collector)return true;
    if(consumer.inputs?.[input]?.link!=null&&!disconnectRuntimeResource(graph,consumer,input))return false;
    if(!collector)return true;
    if(loraV3GraphOf(collector)!==graph)return false;
    const output=ensureLoraCollectorOutput(collector);
    if(output<0)return false;
    if(!connectRuntimeResource(graph,collector,output,consumer,input))return false;
    return linkedLocalLoraCollector(consumer)===collector;
}

export function connectLocalLoraCollectors(consumer:any,collectors:(any|null)[]){
    const graph=loraV3GraphOf(consumer);if(collectors.length>LORA_MAX_COLLECTORS)return false;const inputs=ensureLoraConsumerInputs(consumer,collectors.length),linked=linkedLocalLoraCollectors(consumer);
    for(let ordinal=0;ordinal<collectors.length;ordinal++){
        if(linked[ordinal]===collectors[ordinal])continue;
        const index=inputs[ordinal],current=consumer.inputs?.[index];if(current?.link!=null&&!disconnectRuntimeResource(graph,consumer,index))return false;
        const collector=collectors[ordinal];if(!collector)continue;if(loraV3GraphOf(collector)!==graph)return false;
        const output=ensureLoraCollectorOutput(collector);if(output<0||!connectRuntimeResource(graph,collector,output,consumer,index))return false;
    }
    for(const {slot,index,ordinal} of (consumer.inputs??[]).map((slot:any,index:number)=>({slot,index,ordinal:Number(slot?.__bvLoraProviderOrdinal??String(slot?.name??"").match(/^resource_provider_(\d+)$/)?.[1]??0)})))if(ordinal>collectors.length&&slot?.type===LORA_PROVIDER_TYPE&&slot.link!=null&&!disconnectRuntimeResource(graph,consumer,index))return false;
    trimUnusedLoraConsumerInputs(consumer,collectors.length);
    return linkedLocalLoraCollectors(consumer).slice(0,collectors.length).every((collector,index)=>collector===collectors[index]);
}

export function localLoraCollectors(node:any){
    const graph=loraV3GraphOf(node);
    return (graph?._nodes??graph?.nodes??[]).filter((candidate:any)=>candidate!==node&&inLoraV3Graph(candidate,graph)&&loraProviderNode(candidate));
}

const LORA_EXECUTORS=new Set(["BV Regional LoRA"]);

export function downstreamLoraConsumers(transformer:any){
    const graph=loraV3GraphOf(transformer),queue=[transformer],seen=new Set<any>([transformer]),found:any[]=[];
    while(queue.length){
        const source=queue.shift();
        for(const output of source?.outputs??[]){
            if(output?.type!=="BV_REGIONAL")continue;
            for(const linkId of output.links??[]){
                const link=graphLink(graph,linkId),target=link&&graph?.getNodeById?.(link.target_id);
                if(!target||!inLoraV3Graph(target,graph)||seen.has(target))continue;
                seen.add(target);
                if(LORA_EXECUTORS.has(String(target.comfyClass??target.type)))found.push(target);
                if((target.outputs??[]).some((item:any)=>item.type==="BV_REGIONAL")){queue.push(target);}
            }
        }
    }
    return found;
}

export function connectLoraConsumerTree(transformer:any,collector:any|null){
    const targets=[transformer,...downstreamLoraConsumers(transformer)];
    return targets.map(target=>connectLocalLoraCollector(target,collector)).every(Boolean);
}
export function connectLoraConsumerTreeCollectors(transformer:any,collectors:(any|null)[]){
    const targets=[transformer,...downstreamLoraConsumers(transformer)];return targets.map(target=>connectLocalLoraCollectors(target,collectors)).every(Boolean);
}

export function upstreamLoraTransformer(consumer:any){
    const graph=loraV3GraphOf(consumer),queue=[consumer],seen=new Set<any>([consumer]);
    while(queue.length){
        const target=queue.shift();
        for(const input of target?.inputs??[]){
            if(input?.type!=="BV_REGIONAL")continue;
            const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id);
            if(!source||!inLoraV3Graph(source,graph)||seen.has(source))continue;
            if(["BV Regional LoRA","BV Regional Prompt"].includes(String(source.comfyClass??source.type)))return source;
            seen.add(source);queue.push(source);
        }
    }
    return null;
}

export function reconcileLoraWriterCollectors(writer:any,localCollectors:(any|null)[]){
    const upstream=upstreamLoraTransformer(writer),collectors=upstream?linkedLocalLoraCollectors(upstream).filter(Boolean):[];
    for(const collector of localCollectors)if(collector&&!collectors.includes(collector))collectors.push(collector);
    const linked=linkedLocalLoraCollectors(writer);
    if(!linked.slice(collectors.length).some(Boolean)&&collectors.every((collector,index)=>linked[index]===collector))return collectors;
    connectLocalLoraCollectors(writer,collectors);return collectors;
}

export function reconcileDownstreamLoraWriters(transformer:any,localCollectors:(writer:any)=>(any|null)[]){
    return downstreamLoraConsumers(transformer).map(writer=>reconcileLoraWriterCollectors(writer,localCollectors(writer)));
}

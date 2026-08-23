export const LORA_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
export const LORA_PROVIDER_SLOT="resource_provider";
export const LORA_COLLECTOR_NODE="BV LoRA Stack Collector";

const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);

const slotIndex=(slots:any[]|undefined)=>slots?.findIndex(slot=>slot?.name===LORA_PROVIDER_SLOT||slot?.type===LORA_PROVIDER_TYPE)??-1;

export function ensureLoraCollectorOutput(node:any){
    let index=slotIndex(node.outputs);
    if(index<0&&node.addOutput){node.addOutput(LORA_PROVIDER_SLOT,LORA_PROVIDER_TYPE);index=slotIndex(node.outputs);}
    const output=node.outputs?.[index];
    if(output){output.name=LORA_PROVIDER_SLOT;output.type=LORA_PROVIDER_TYPE;output.hidden=true;output.__bvResourceSlot=true;}
    return index;
}

export function ensureLoraConsumerInput(node:any){
    let index=slotIndex(node.inputs);
    if(index<0&&node.addInput){node.addInput(LORA_PROVIDER_SLOT,LORA_PROVIDER_TYPE);index=slotIndex(node.inputs);}
    const input=node.inputs?.[index];
    if(input){input.name=LORA_PROVIDER_SLOT;input.type=LORA_PROVIDER_TYPE;input.hidden=true;input.__bvResourceSlot=true;}
    return index;
}

export function linkedLocalLoraCollector(node:any){
    const input=node.inputs?.find((item:any)=>item.name===LORA_PROVIDER_SLOT||item.type===LORA_PROVIDER_TYPE);
    const link=graphLink(node.graph,input?.link);
    if(!link||String(link.target_id)!==String(node.id))return null;
    const source=node.graph?.getNodeById?.(link.origin_id);
    const output=source?.outputs?.[Number(link.origin_slot)];
    return source?.graph===node.graph&&(source?.type===LORA_COLLECTOR_NODE||output?.type===LORA_PROVIDER_TYPE)?source:null;
}

export function connectLocalLoraCollector(consumer:any,collector:any|null){
    const input=ensureLoraConsumerInput(consumer);
    if(input<0)return false;
    if(consumer.inputs?.[input]?.link!=null)consumer.disconnectInput?.(input);
    if(!collector)return true;
    if(collector.graph!==consumer.graph)return false;
    const output=ensureLoraCollectorOutput(collector);
    if(output<0)return false;
    collector.connect?.(output,consumer,input);
    return linkedLocalLoraCollector(consumer)===collector;
}

export function localLoraCollectors(node:any){
    return (node.graph?._nodes??[]).filter((candidate:any)=>candidate!==node&&candidate.graph===node.graph&&candidate.type===LORA_COLLECTOR_NODE);
}

const LORA_EXECUTORS=new Set(["BV Regional Native Conditioning","BV Regional Krea 2 Attention","BV Regional Anima Conditioning"]);

export function downstreamLoraConsumers(transformer:any){
    const graph=transformer.graph,queue=[transformer],seen=new Set<any>([transformer]),found:any[]=[];
    while(queue.length){
        const source=queue.shift();
        for(const output of source?.outputs??[]){
            if(output?.type!=="BV_REGIONAL")continue;
            for(const linkId of output.links??[]){
                const link=graphLink(graph,linkId),target=link&&graph?.getNodeById?.(link.target_id);
                if(!target||target.graph!==graph||seen.has(target))continue;
                seen.add(target);
                if(LORA_EXECUTORS.has(target.type))found.push(target);
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

export function upstreamLoraTransformer(consumer:any){
    const graph=consumer.graph,queue=[consumer],seen=new Set<any>([consumer]);
    while(queue.length){
        const target=queue.shift();
        for(const input of target?.inputs??[]){
            if(input?.type!=="BV_REGIONAL")continue;
            const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id);
            if(!source||source.graph!==graph||seen.has(source))continue;
            if(source.type==="BV Regional LoRA")return source;
            seen.add(source);queue.push(source);
        }
    }
    return null;
}

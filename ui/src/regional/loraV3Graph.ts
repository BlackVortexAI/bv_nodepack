export const LORA_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
export const LORA_PROVIDER_SLOT="resource_provider";
export const LORA_COLLECTOR_NODE="BV LoRA Stack Collector";
export const LORA_MAX_COLLECTORS=20;
export const loraProviderSlot=(ordinal:number)=>`${LORA_PROVIDER_SLOT}_${ordinal}`;
const LORA_PROVIDER_SLOT_HEIGHT=20;

const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);

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
        const input=node.inputs?.[index];if(input){input.name=name;input.type=LORA_PROVIDER_TYPE;input.hidden=true;input.__bvResourceSlot=true;input.__bvLoraProviderOrdinal=ordinal;}
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
    if(node.__bvLoraOriginalComputeSize||typeof node.computeSize!=="function")return;
    const original=node.computeSize;node.__bvLoraOriginalComputeSize=original;
    node.computeSize=function(){
        const computed=original.apply(this,arguments),providerCount=(this.inputs??[]).filter((slot:any)=>slot?.type===LORA_PROVIDER_TYPE).length;
        return [Number(computed?.[0]??this.size?.[0]??220),Math.max(60,Number(computed?.[1]??this.size?.[1]??60)-providerCount*LORA_PROVIDER_SLOT_HEIGHT)];
    };
}
export function compactLoraConsumerNode(node:any){
    installLoraSizePolicy(node);if(!node.setSize)return;
    const computed=node.computeSize?.()??node.size??[220,60],width=Math.max(Number(node.size?.[0]??0),Number(computed[0]??0),220),height=Math.max(60,Number(computed[1]??60));
    if(Math.abs(Number(node.size?.[0]??0)-width)<0.5&&Math.abs(Number(node.size?.[1]??0)-height)<0.5)return;
    node.setSize([width,height]);
}
export function scheduleCompactLoraConsumerNode(node:any){
    if(node.__bvLoraCompactScheduled)return;
    node.__bvLoraCompactScheduled=true;compactLoraConsumerNode(node);
    for(const delay of [0,50,150])setTimeout(()=>{compactLoraConsumerNode(node);if(delay===150)node.__bvLoraCompactScheduled=false;},delay);
}

export function linkedLocalLoraCollector(node:any){
    const input=node.inputs?.find((item:any)=>item.name===LORA_PROVIDER_SLOT||item.name===loraProviderSlot(1));
    const link=graphLink(node.graph,input?.link);
    if(!link||String(link.target_id)!==String(node.id))return null;
    const source=node.graph?.getNodeById?.(link.origin_id);
    const output=source?.outputs?.[Number(link.origin_slot)];
    return source?.graph===node.graph&&(source?.type===LORA_COLLECTOR_NODE||output?.type===LORA_PROVIDER_TYPE)?source:null;
}

export function linkedLocalLoraCollectors(node:any){return Array.from({length:LORA_MAX_COLLECTORS},(_,index)=>{
    const input=node.inputs?.find((slot:any)=>slot?.name===loraProviderSlot(index+1)),link=graphLink(node.graph,input?.link);if(!link||String(link.target_id)!==String(node.id))return null;
    const source=node.graph?.getNodeById?.(link.origin_id),output=source?.outputs?.[Number(link.origin_slot)];
    return source?.graph===node.graph&&(source?.type===LORA_COLLECTOR_NODE||source?.comfyClass===LORA_COLLECTOR_NODE||output?.type===LORA_PROVIDER_TYPE)?source:null;
});}

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

export function connectLocalLoraCollectors(consumer:any,collectors:(any|null)[]){
    if(collectors.length>LORA_MAX_COLLECTORS)return false;const inputs=ensureLoraConsumerInputs(consumer,collectors.length);
    for(let ordinal=0;ordinal<collectors.length;ordinal++){
        const index=inputs[ordinal],current=consumer.inputs?.[index];if(current?.link!=null)consumer.disconnectInput?.(index);
        const collector=collectors[ordinal];if(!collector)continue;if(collector.graph!==consumer.graph)return false;
        const output=ensureLoraCollectorOutput(collector);if(output<0)return false;collector.connect?.(output,consumer,index);
    }
    trimUnusedLoraConsumerInputs(consumer,collectors.length);
    return linkedLocalLoraCollectors(consumer).slice(0,collectors.length).every((collector,index)=>collector===collectors[index]);
}

export function migrateLegacyLoraCollectorLink(consumer:any){
    const legacyIndex=consumer.inputs?.findIndex((item:any)=>item.name===LORA_PROVIDER_SLOT)??-1;if(legacyIndex<0||consumer.inputs?.[legacyIndex]?.link==null)return false;
    const link=graphLink(consumer.graph,consumer.inputs[legacyIndex].link),source=link&&consumer.graph?.getNodeById?.(link.origin_id);if(!source||source.graph!==consumer.graph)return false;
    if(!connectLocalLoraCollectors(consumer,[source]))return false;consumer.disconnectInput?.(legacyIndex);return true;
}

export function localLoraCollectors(node:any){
    return (node.graph?._nodes??[]).filter((candidate:any)=>candidate!==node&&candidate.graph===node.graph&&String(candidate.comfyClass??candidate.type)===LORA_COLLECTOR_NODE);
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
export function connectLoraConsumerTreeCollectors(transformer:any,collectors:(any|null)[]){
    const targets=[transformer,...downstreamLoraConsumers(transformer)];return targets.map(target=>connectLocalLoraCollectors(target,collectors)).every(Boolean);
}

export function upstreamLoraTransformer(consumer:any){
    const graph=consumer.graph,queue=[consumer],seen=new Set<any>([consumer]);
    while(queue.length){
        const target=queue.shift();
        for(const input of target?.inputs??[]){
            if(input?.type!=="BV_REGIONAL")continue;
            const link=graphLink(graph,input.link),source=link&&graph?.getNodeById?.(link.origin_id);
            if(!source||source.graph!==graph||seen.has(source))continue;
            if(["BV Regional LoRA","BV Regional Prompt"].includes(String(source.comfyClass??source.type)))return source;
            seen.add(source);queue.push(source);
        }
    }
    return null;
}

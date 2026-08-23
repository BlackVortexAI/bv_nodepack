export const M0_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER_M0";
export const M0_PROVIDER_SLOT="resource_provider";
export const M0_MAX_MULTI_COLLECTORS=20;
export const M0_PROVIDER_SLOT_HEIGHT=20;

function slotIndex(slots:any[]|undefined){return slots?.findIndex(slot=>slot?.name===M0_PROVIDER_SLOT||slot?.type===M0_PROVIDER_TYPE)??-1;}

export function ensureM0CollectorOutput(node:any){
    let index=slotIndex(node.outputs);
    if(index<0&&node.addOutput){node.addOutput(M0_PROVIDER_SLOT,M0_PROVIDER_TYPE);index=slotIndex(node.outputs);}
    const output=node.outputs?.[index];
    if(output){output.name=M0_PROVIDER_SLOT;output.type=M0_PROVIDER_TYPE;}
    return index;
}

export function ensureM0ConsumerInput(node:any){
    let index=slotIndex(node.inputs);
    if(index<0&&node.addInput){node.addInput(M0_PROVIDER_SLOT,M0_PROVIDER_TYPE);index=slotIndex(node.inputs);}
    const input=node.inputs?.[index];
    if(input){input.name=M0_PROVIDER_SLOT;input.type=M0_PROVIDER_TYPE;}
    return index;
}

export function multiProviderSlot(index:number){return `${M0_PROVIDER_SLOT}_${index}`;}

export function ensureM0MultiConsumerInputs(node:any,count=M0_MAX_MULTI_COLLECTORS){
    const indexes:number[]=[];
    for(let ordinal=1;ordinal<=count;ordinal++){
        const name=multiProviderSlot(ordinal);
        let index=node.inputs?.findIndex((slot:any)=>slot?.name===name)??-1;
        if(index<0&&node.addInput){node.addInput(name,M0_PROVIDER_TYPE);index=node.inputs?.findIndex((slot:any)=>slot?.name===name)??-1;}
        const input=node.inputs?.[index];
        if(input){input.name=name;input.type=M0_PROVIDER_TYPE;input.__bvM0ProviderOrdinal=ordinal;}
        indexes.push(index);
    }
    return indexes;
}

export function compactM0HiddenProviderSlots(node:any,count:number){
    const computed=node.computeSize?.(),current=node.size??[0,0];if(!computed||!node.setSize)return;
    node.setSize([Math.max(Number(current[0]??0),Number(computed[0]??0),220),Math.max(60,Number(computed[1]??0)-count*M0_PROVIDER_SLOT_HEIGHT)]);
}

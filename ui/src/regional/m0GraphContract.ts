export const M0_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER_M0";
export const M0_PROVIDER_SLOT="resource_provider";

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

import { connectCompositeRegistryInput, ownsCompositeRegistryInput, releaseCompositeRegistryInput } from "./loraRegistryDgAdapter";
import { registryChannelFamily, registryFamilyEnabled, uniqueWorkflowRegistry, type RegistryDgFamily, type RegistrySourceKind } from "./registryDgFamilies";
import { markProjectedProvider, retainNeededProjectedInputs } from "./portProjection";
import { withNativeGraphOwnership } from "./runtimeResourceGraph";

export type RegistryReference = {kind:RegistrySourceKind; id:string};
const TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
/** Returns false only for legacy consumers: their existing reconciliation stays intact. */
export function reconcileRegistryFamily(node:any,family:RegistryDgFamily,references:RegistryReference[],nameAt:(ordinal:number)=>string,limit:number) {
    if(!registryFamilyEnabled(node,family))return false;
    const wanted=references.filter((ref,index,all)=>ref.id && all.findIndex(other=>other.id===ref.id&&other.kind===ref.kind)===index);
    if(wanted.length>limit)throw new Error(`Registry ${family} exceeds ${limit} provider channels`);
    const names=wanted.map((_,index)=>nameAt(index));
    const graph=node.__bvConcreteGraph??node.graph;
    wanted.forEach((ref,ordinal)=>{
        const name=names[ordinal];let index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1;
        if(index<0){node.addInput?.(name,TYPE);index=node.inputs?.findIndex((slot:any)=>slot.name===name)??-1}
        if(index<0)return;
        markProjectedProvider(node.inputs[index]);
        const sender=uniqueWorkflowRegistry(node,ref.kind,ref.id);
        if(sender){
            if(!sender.outputs?.some((slot:any)=>slot.type===TYPE))sender.addOutput?.("resource_provider",TYPE);
            connectCompositeRegistryInput(node,name,sender,ref.kind);
        }else if(ownsCompositeRegistryInput(node,name))releaseCompositeRegistryInput(node,name);
        else if(node.inputs[index].link!=null)withNativeGraphOwnership(graph,[node],()=>node.disconnectInput?.(index));
    });
    for(const name of Object.keys(node.properties?.bvRegistryDgSelections??{})){
        if(registryChannelFamily(node,name)===family&&!names.includes(name))releaseCompositeRegistryInput(node,name);
    }
    for(const {slot,index} of (node.inputs??[]).map((slot:any,index:number)=>({slot,index}))){
        if(registryChannelFamily(node,slot.name)!==family||names.includes(slot.name)||slot.type!==TYPE)continue;
        if(slot.link!=null&&!ownsCompositeRegistryInput(node,slot.name))withNativeGraphOwnership(graph,[node],()=>node.disconnectInput?.(index));
    }
    retainNeededProjectedInputs(node,names,slot=>registryChannelFamily(node,slot.name)===family&&slot.type===TYPE);
    return true;
}

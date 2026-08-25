import { ensureM0MultiConsumerInputs, M0_MAX_MULTI_COLLECTORS } from "./m0GraphContract";
import { resolveM0LocalLinkedCollector } from "./m0LocalGraph";

type Binding = { binding_id: string; collector_id: string; resource_id: string };

const widget = (node:any,name:string) => node?.widgets?.find((item:any)=>item.name===name);
const parse = (node:any):Binding[] => {
    try {
        const value=JSON.parse(String(widget(node,"resource_bindings")?.value??"[]"));
        return Array.isArray(value)?value.slice(0,M0_MAX_MULTI_COLLECTORS).map(binding=>({binding_id:String(binding.binding_id??""),collector_id:String(binding.collector_id??""),resource_id:String(binding.resource_id??"")})):[];
    } catch { return []; }
};
const hasResource = (source:any,resourceId:string) => ["resource_a_id","resource_b_id"].some(name=>String(widget(source,name)?.value??"")===resourceId);

export function sanitizeM0SingleSelection(node:any){
    const cid=widget(node,"collector_id"),rid=widget(node,"resource_id");if(!cid||!rid)return false;
    const source=resolveM0LocalLinkedCollector(node,"resource_provider",candidate=>String(widget(candidate,"collector_id")?.value??"")===String(cid.value??""));
    return Boolean(source)&&hasResource(source,String(rid.value??""));
}

export function sanitizeM0MultiSelections(node:any){
    const bindings=parse(node);ensureM0MultiConsumerInputs(node);
    return bindings.every((binding,index)=>{const source=resolveM0LocalLinkedCollector(node,`resource_provider_${index+1}`,candidate=>String(widget(candidate,"collector_id")?.value??"")===binding.collector_id);return Boolean(source)&&hasResource(source,binding.resource_id)});
}

import type {LoraCatalogItem} from "./loraRegistryConfig";

/** An older running backend omits both fields; null links and Unknown are valid data. */
export const catalogBackendUpdateRequired=(items:LoraCatalogItem[])=>items.length>0&&items.every(item=>!Object.prototype.hasOwnProperty.call(item,"compatibility")&&!Object.prototype.hasOwnProperty.call(item,"civitai_url"));

export function loraRoutingPresentation(item:LoraCatalogItem):{label:string;description:string}|null{
    if(!item.compatibility)return null;
    if(item.compatibility.status==="multipass")return{label:"Multipass",description:"Includes non-spatial targets. Regional use requires multipass. Exact target-model compatibility is checked at execution."};
    if(item.compatibility.status==="token_candidate")return{label:"Token candidate",description:"Header targets support token gating. Exact target-model compatibility is checked at execution."};
    return{label:"Not checked",description:"Regional adapter support has not been verified for this file. Exact target-model compatibility is checked at execution."};
}

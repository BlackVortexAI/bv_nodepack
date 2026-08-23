const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
const graphLinks=(graph:any)=>[
    ...(graph?._links?.values?.()??[]),
    ...(graph?.links?.values?.()??Object.values(graph?.links??{})),
];
import { M0_PROVIDER_TYPE } from "./m0GraphContract";

const localSource=(node:any,link:any)=>{
    if(!link||String(link.target_id)!==String(node.id))return null;
    const source=node.graph?.getNodeById?.(link.origin_id);
    const output=source?.outputs?.[Number(link.origin_slot)];
    return source?.graph===node.graph&&(source.__bvM0ResourceProvider===true||link.type===M0_PROVIDER_TYPE||output?.type===M0_PROVIDER_TYPE)?source:null;
};

export function resolveM0LocalLinkedCollector(node:any,inputName:string,accept?:(source:any)=>boolean){
    const input=node.inputs?.find((item:any)=>item.name===inputName),link=graphLink(node.graph,input?.link);
    const direct=localSource(node,link);
    if(direct&&(!accept||accept(direct)))return direct;
    if(!accept)return null;
    for(const candidate of graphLinks(node.graph)){const source=localSource(node,candidate);if(source&&accept(source))return source;}
    return null;
}

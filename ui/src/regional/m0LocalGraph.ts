const graphLink=(graph:any,id:any)=>id==null?null:(graph?.links?.get?.(id)??graph?.links?.[id]??null);

export function resolveM0LocalLinkedCollector(node:any,inputName:string){
    const input=node.inputs?.find((item:any)=>item.name===inputName),link=graphLink(node.graph,input?.link);
    if(!link||String(link.target_id)!==String(node.id))return null;
    const source=node.graph?.getNodeById?.(link.origin_id);
    return source?.graph===node.graph&&source.__bvM0ResourceProvider===true?source:null;
}

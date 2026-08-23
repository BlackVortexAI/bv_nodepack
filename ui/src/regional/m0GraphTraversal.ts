const graphLink=(graph:any,id:any)=>id==null?null:(graph?.links?.get?.(id)??graph?.links?.[id]??null);

export function allM0WorkflowGraphs(graph:any){
    const root=graph?.rootGraph??graph,graphs=[root];
    for(const subgraph of root?.subgraphs?.values?.()??root?._subgraphs?.values?.()??[])if(!graphs.includes(subgraph))graphs.push(subgraph);
    return graphs;
}

function subgraphParents(subgraph:any){
    return allM0WorkflowGraphs(subgraph).flatMap((graph:any)=>(graph?._nodes??[]).filter((node:any)=>node?.subgraph===subgraph&&node.isSubgraphNode?.()));
}

function providerOutputSlot(node:any){return node?.outputs?.findIndex((slot:any)=>slot?.type==="BV_RUNTIME_RESOURCE_PROVIDER_M0")??-1;}

function collectorEndpoint(graph:any,collector:any){
    if(collector?.graph===graph){const sourceSlot=providerOutputSlot(collector);return sourceSlot>=0?{source:collector,sourceSlot}:null;}
    for(const host of graph?._nodes??[]){
        if(!host?.isSubgraphNode?.())continue;
        for(let sourceSlot=0;sourceSlot<(host.outputs?.length??0);sourceSlot++)if(resolveProviderOrigins(graph,host.id,sourceSlot,new Set()).includes(collector))return{source:host,sourceSlot};
    }
    return null;
}

function resolveProviderOrigins(graph:any,originId:any,originSlot:number,seen:Set<string>):any[]{
    const key=`${String(graph?.id)}:${String(originId)}:${originSlot}`;if(seen.has(key))return[];seen.add(key);
    if(String(originId)==="-10")return subgraphParents(graph).flatMap((parent:any)=>{const input=parent.inputs?.[originSlot],link=graphLink(parent.graph,input?.link);return link?resolveProviderOrigins(parent.graph,link.origin_id,link.origin_slot,seen):[]});
    const origin=graph?.getNodeById?.(originId);if(!origin)return[];
    if(origin.__bvM0ResourceProvider===true)return[origin];
    if(origin.isSubgraphNode?.()&&origin.subgraph){const boundary=origin.subgraph.outputs?.[originSlot],link=graphLink(origin.subgraph,boundary?.linkIds?.[0]);return link?resolveProviderOrigins(origin.subgraph,link.origin_id,link.origin_slot,seen):[];}
    return[];
}

function projectProviderOrigins(graph:any,originId:any,originSlot:number,hidden:boolean,seen:Set<string>){
    const key=`${String(graph?.id)}:${String(originId)}:${originSlot}`;if(seen.has(key))return;seen.add(key);
    if(String(originId)==="-10"){
        for(const parent of subgraphParents(graph)){const input=parent.inputs?.[originSlot];if(input){input.__bvM0VisualHidden=hidden;input.__bvM0ResourceSlot=true;}const link=graphLink(parent.graph,input?.link);if(link)projectProviderOrigins(parent.graph,link.origin_id,link.origin_slot,hidden,seen);}
        return;
    }
    const origin=graph?.getNodeById?.(originId);if(!origin)return;
    const output=origin.outputs?.[originSlot];if(output){output.__bvM0VisualHidden=hidden;output.__bvM0ResourceSlot=true;}
    if(origin.isSubgraphNode?.()&&origin.subgraph){const boundary=origin.subgraph.outputs?.[originSlot],link=graphLink(origin.subgraph,boundary?.linkIds?.[0]);if(link)projectProviderOrigins(origin.subgraph,link.origin_id,link.origin_slot,hidden,seen);}
}

export function resolveM0LinkedCollectors(node:any,inputName:string){
    const input=node.inputs?.find((item:any)=>item.name===inputName),link=graphLink(node.graph,input?.link);if(!link||String(link.target_id)!==String(node.id))return[];
    return [...new Set(resolveProviderOrigins(node.graph,link.origin_id,link.origin_slot,new Set()))];
}

export function projectM0InputRoute(node:any,inputName:string,visible:boolean){
    const input=node.inputs?.find((item:any)=>item.name===inputName);if(!input)return;
    input.__bvM0VisualHidden=!visible;input.__bvM0ResourceSlot=true;
    const link=graphLink(node.graph,input.link);if(link)projectProviderOrigins(node.graph,link.origin_id,link.origin_slot,!visible,new Set());
}


export function planM0CollectorConnection(node:any,inputName:string,collector:any){
    const targetSlot=node.inputs?.findIndex((item:any)=>item.name===inputName)??-1;if(targetSlot<0)return null;
    const local=collectorEndpoint(node.graph,collector);if(local)return{...local,target:node,targetSlot,preserveLocal:false};
    const localLink=graphLink(node.graph,node.inputs?.[targetSlot]?.link);if(!localLink||String(localLink.origin_id)!=="-10")return null;
    const plans=subgraphParents(node.graph).flatMap((parent:any)=>{
        const endpoint=collectorEndpoint(parent.graph,collector);return endpoint?[{...endpoint,target:parent,targetSlot:localLink.origin_slot,preserveLocal:true}]:[];
    });
    return plans.length===1?plans[0]:null;
}

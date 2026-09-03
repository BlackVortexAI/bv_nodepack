/** Read-only traversal of existing native input connections, including Subgraph I/O. */
export const concreteRegionalGraph=(node:any,fallback:any=null)=>node?.__bvConcreteGraph??node?.graph??fallback;
const same=(a:any,b:any)=>a!=null&&b!=null&&String(a)===String(b);
const child=(node:any)=>{try{return node?.subgraph??node?.getSubgraph?.()??null}catch{return null}};
const graphLink=(graph:any,id:any)=>id==null?null:graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null;
const contains=(ids:any,id:any)=>Array.isArray(ids)&&ids.some(value=>same(value,id));
const compatible=(a:any,b:any)=>!a||!b||a==="*"||b==="*"||String(a).split(",").some(type=>String(b).split(",").includes(type));
export type RegionalNativeSource={node:any;outputIndex:number;graph:any};

export function resolveNativeInputSource(node:any,inputIndex:number,fallback:any=null):RegionalNativeSource|null{
 const owner=concreteRegionalGraph(node,fallback);if(!owner)return null;
 const parents=new Map<any,{graph:any;host:any}|null>(),visitedGraphs=new Set<any>();
 const visit=(graph:any)=>{if(!graph||visitedGraphs.has(graph))return;visitedGraphs.add(graph);
  for(const host of graph._nodes??graph.nodes??[]){const nested=child(host);if(!nested)continue;
   parents.set(nested,parents.has(nested)?null:{graph,host});visit(nested);
  }
 };visit(owner.rootGraph??owner);
 const seen=new Map<any,Set<any>>();
 const follow=(graph:any,target:any,index:number):RegionalNativeSource|null=>{
  const boundary=target===graph.outputNode,slot=boundary?graph.outputs?.[index]:target.inputs?.[index];
  const ids=boundary?slot?.linkIds:null,id=boundary?(Array.isArray(ids)&&ids.length===1?ids[0]:null):slot?.link;
  if(id==null)return null;
  const link=graphLink(graph,id);if(!link||!same(link.target_id,target.id)||Number(link.target_slot)!==index)return null;
  if(!compatible(link.type,slot?.type))return null;
  const visited=seen.get(graph)??new Set();if(visited.has(id))return null;visited.add(id);seen.set(graph,visited);
  const sourceIndex=Number(link.origin_slot);if(!Number.isInteger(sourceIndex)||sourceIndex<0)return null;
  if(same(link.origin_id,graph.inputNode?.id)){
   const input=graph.inputs?.[sourceIndex],parent=parents.get(graph);
   if(!parent||!contains(input?.linkIds,id)||!parent.host.inputs?.[sourceIndex])return null;
   if(!compatible(slot?.type,input?.type)||!compatible(input?.type,parent.host.inputs[sourceIndex].type)||!compatible(link.type,input?.type))return null;
   return follow(parent.graph,parent.host,sourceIndex);
  }
  const source=graph.getNodeById?.(link.origin_id),output=source?.outputs?.[sourceIndex];
  if(!source||concreteRegionalGraph(source,graph)!==graph||!contains(output?.links,id))return null;
  if(!compatible(slot?.type,output?.type)||!compatible(link.type,output?.type))return null;
  const nested=child(source);
  if(nested){
   const parent=parents.get(nested);if(!parent||parent.host!==source||parent.graph!==graph||!nested.outputNode)return null;
   const inner=nested.outputs?.[sourceIndex];if(!inner||output.type&&inner.type&&output.type!==inner.type)return null;
   return follow(nested,nested.outputNode,sourceIndex);
  }
  return{node:source,outputIndex:sourceIndex,graph};
 };
 return follow(owner,node,inputIndex);
}

/** Nearest-first existing Regional chain. Ambiguous branches and cycles have no answer. */
export function nativeRegionalAncestors(node:any):any[]{
 const found:any[]=[],seen=new Set<any>([node]);let target=node;
 while(target){
  const inputs=(target.inputs??[]).map((slot:any,index:number)=>({slot,index})).filter(({slot}:any)=>slot.type==="BV_REGIONAL"&&slot.link!=null);
  if(inputs.length===0)return found;
  if(inputs.length!==1)return [];
  const resolved=resolveNativeInputSource(target,inputs[0].index),source=resolved?.node;
  if(!source||source.outputs?.[resolved!.outputIndex]?.type!=="BV_REGIONAL"||seen.has(source))return [];
  found.push(source);seen.add(source);target=source;
 }
 return found;
}

/** Instance walk + actual ancestry, not definition IDs or graph-local link guesses. */
export function nativeRegionalDescendants(node:any,accept:(candidate:any)=>boolean):any[]{
 const owner=concreteRegionalGraph(node),seen=new Set<any>(),found:{node:any;distance:number;order:number}[]=[];let order=0;
 const visit=(graph:any)=>{if(!graph||seen.has(graph))return;seen.add(graph);
  for(const candidate of graph._nodes??graph.nodes??[]){
   const ordinal=order++;if(candidate!==node&&accept(candidate)){
    const distance=nativeRegionalAncestors(candidate).indexOf(node);
    if(distance>=0)found.push({node:candidate,distance,order:ordinal});
   }
   visit(child(candidate));
  }
 };visit(owner?.rootGraph??owner);
 return found.sort((a,b)=>a.distance-b.distance||a.order-b.order).map(item=>item.node);
}

type NativeGraphBinding={owner:any;depth:number;hadOwn:boolean;descriptor?:PropertyDescriptor};

const bindings=new WeakMap<object,NativeGraphBinding>();
const own=(value:any,key:PropertyKey)=>Object.prototype.hasOwnProperty.call(value,key);
const graphLink=(graph:any,id:any)=>id==null?null:(graph?._links?.get?.(id)??graph?.links?.get?.(id)??graph?.links?.[id]??null);
const nodeOwner=(node:any)=>node?.__bvConcreteGraph??node?.graph??null;

function bindNativeGraph(node:any,owner:any){
    if(!node||typeof node!=="object")return false;
    const active=bindings.get(node);
    if(active){if(active.owner!==owner)return false;active.depth++;return true;}
    const hadOwn=own(node,"graph"),descriptor=hadOwn?Object.getOwnPropertyDescriptor(node,"graph"):undefined;
    try{
        if(descriptor&&!descriptor.configurable){
            if(!("value" in descriptor)||!descriptor.writable)return false;
            node.graph=owner;
        }else Object.defineProperty(node,"graph",{configurable:true,enumerable:descriptor?.enumerable??true,writable:true,value:owner});
    }catch{return false;}
    bindings.set(node,{owner,depth:1,hadOwn,descriptor});return true;
}

function restoreNativeGraph(node:any){
    const active=bindings.get(node);if(!active)return;
    if(--active.depth>0)return;
    bindings.delete(node);
    if(active.hadOwn&&active.descriptor)Object.defineProperty(node,"graph",active.descriptor);
    else delete node.graph;
}

function withNativeGraphOwnership<T>(owner:any,nodes:any[],action:()=>T):T|false{
    if(!owner)return false;
    const unique=[...new Set(nodes.filter(Boolean))],bound:any[]=[];
    try{
        for(const node of unique){if(nodeOwner(node)!==owner||!bindNativeGraph(node,owner))return false;bound.push(node);}
        return action();
    }finally{for(const node of bound.reverse())restoreNativeGraph(node);}
}

function matchingLink(graph:any,source:any,outputIndex:number,target:any,inputIndex:number){
    const linkId=target?.inputs?.[inputIndex]?.link,link=graphLink(graph,linkId);
    return link&&String(link.origin_id)===String(source.id)&&Number(link.origin_slot)===outputIndex&&String(link.target_id)===String(target.id)&&Number(link.target_slot)===inputIndex&&(source.outputs?.[outputIndex]?.links??[]).some((id:any)=>String(id)===String(linkId));
}

export function connectRuntimeResource(owner:any,source:any,outputIndex:number,target:any,inputIndex:number){
    if(!owner||nodeOwner(source)!==owner||nodeOwner(target)!==owner||typeof source?.connect!=="function")return false;
    const output=source.outputs?.[outputIndex],input=target.inputs?.[inputIndex];
    if(!output||!input||(output.type&&input.type&&output.type!==input.type))return false;
    if(matchingLink(owner,source,outputIndex,target,inputIndex))return true;
    if(input.link!=null&&!disconnectRuntimeResource(owner,target,inputIndex))return false;
    const result=withNativeGraphOwnership(owner,[source,target],()=>source.connect(outputIndex,target,inputIndex));
    return result!==false&&Boolean(matchingLink(owner,source,outputIndex,target,inputIndex));
}

export function disconnectRuntimeResource(owner:any,target:any,inputIndex:number){
    if(!owner||nodeOwner(target)!==owner||typeof target?.disconnectInput!=="function")return false;
    const input=target.inputs?.[inputIndex],linkId=input?.link;if(linkId==null)return true;
    const link=graphLink(owner,linkId),source=link&&owner?.getNodeById?.(link.origin_id);
    if(!link||!source||nodeOwner(source)!==owner)return false;
    const result=withNativeGraphOwnership(owner,[source,target],()=>target.disconnectInput(inputIndex));
    return result!==false&&target.inputs?.[inputIndex]?.link==null&&!graphLink(owner,linkId);
}

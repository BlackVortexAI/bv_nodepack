export type BvDraftMergeResult<T>={ok:true;value:T}|{ok:false;reason:string};
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
const stableId=(value:any)=>value?.id??value?.key;

export function mergeBvDraft<T>(base:T,draft:T,current:T,path="draft"):BvDraftMergeResult<T>{
    if(same(current,base))return{ok:true,value:structuredClone(draft)};
    if(same(draft,base))return{ok:true,value:structuredClone(current)};
    if(same(draft,current))return{ok:true,value:structuredClone(draft)};
    if(Array.isArray(base)&&Array.isArray(draft)&&Array.isArray(current)){
        if(![...base,...draft,...current].every(value=>stableId(value)!=null))return{ok:false,reason:`Concurrent list change at ${path}`};
        const baseIds=base.map(stableId),draftIds=draft.map(stableId),currentIds=current.map(stableId),draftReordered=!same(baseIds,draftIds.filter(id=>baseIds.includes(id))),currentReordered=!same(baseIds,currentIds.filter(id=>baseIds.includes(id)));
        if(draftReordered&&currentReordered&&!same(draftIds,currentIds))return{ok:false,reason:`Concurrent reorder at ${path}`};
        const byBase=new Map(base.map(value=>[stableId(value),value])),byDraft=new Map(draft.map(value=>[stableId(value),value])),byCurrent=new Map(current.map(value=>[stableId(value),value])),order=draftReordered?draftIds:currentIds,ids=[...order,...draftIds,...currentIds].filter((id,index,all)=>all.indexOf(id)===index),merged:any[]=[];
        for(const id of ids){const before=byBase.get(id),local=byDraft.get(id),external=byCurrent.get(id);if(before&&local&&!external&&!same(before,local))return{ok:false,reason:`Edited item ${id} was removed externally`};if(before&&!local&&external&&!same(before,external))return{ok:false,reason:`Removed item ${id} changed externally`};if(!local&&!external)continue;if(!before){if(local&&external&&!same(local,external))return{ok:false,reason:`Item ${id} was added differently`};merged.push(structuredClone(local??external));continue}if(!local||!external){merged.push(structuredClone(local??external));continue}const result=mergeBvDraft(before,local,external,`${path}.${id}`);if(!result.ok)return result;merged.push(result.value)}
        return{ok:true,value:merged as T};
    }
    if(base&&draft&&current&&typeof base==="object"&&typeof draft==="object"&&typeof current==="object"){
        const value:any={};for(const key of new Set([...Object.keys(base),...Object.keys(draft),...Object.keys(current)])){const result=mergeBvDraft((base as any)[key],(draft as any)[key],(current as any)[key],`${path}.${key}`);if(!result.ok)return result;value[key]=result.value}return{ok:true,value};
    }
    return{ok:false,reason:`Concurrent value change at ${path}`};
}

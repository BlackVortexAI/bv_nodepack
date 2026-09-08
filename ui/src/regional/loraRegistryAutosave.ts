import {loraRegistryValidation,parseLoraRegistryConfig,serializeLoraRegistryConfig,type LoraRegistryConfig} from "./loraRegistryConfig";

/** Rebase external changes onto drafts and every undo snapshot; external fields win conflicts. */
export function rebaseLoraRegistryDraft(draft:any,before:any,after:any):any {
    if(JSON.stringify(before)===JSON.stringify(after))return structuredClone(draft);
    if(Array.isArray(before)&&Array.isArray(after)&&Array.isArray(draft)){
        const keyed=[...before,...after,...draft].every(item=>item&&typeof item.id==="string");
        if(!keyed)return structuredClone(after);
        const old=new Map(before.map(item=>[item.id,item])),live=new Map(after.map(item=>[item.id,item])),local=new Map(draft.map(item=>[item.id,item]));
        const reordered=JSON.stringify(before.map(item=>item.id))!==JSON.stringify(after.map(item=>item.id));
        const order=[...(reordered?after:draft).map(item=>item.id),...after.map(item=>item.id),...draft.map(item=>item.id)];
        return [...new Set(order)].flatMap(id=>{
            if(old.has(id)&&!live.has(id))return [];
            if(!local.has(id))return old.has(id)?[]:[structuredClone(live.get(id))];
            if(!live.has(id))return [structuredClone(local.get(id))];
            return [rebaseLoraRegistryDraft(local.get(id),old.get(id),live.get(id))];
        });
    }
    if(before&&after&&draft&&typeof before==="object"&&typeof after==="object"&&typeof draft==="object"){
        const result={...draft};for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
            if(!(key in after)){delete result[key];continue}
            result[key]=rebaseLoraRegistryDraft(draft[key],before[key],after[key]);
        }return result;
    }
    return structuredClone(after);
}

/** Synchronous node-config persistence: no debounce or unmount work can lose a valid edit. */
export function createLoraRegistryAutosave(stored:unknown,save:(value:string)=>void,readStored?:()=>unknown){
    let saved=parseLoraRegistryConfig(stored),value=structuredClone(saved),past:LoraRegistryConfig[]=[],future:LoraRegistryConfig[]=[];
    const sync=(raw:unknown)=>{const next=parseLoraRegistryConfig(raw);if(serializeLoraRegistryConfig(next)===serializeLoraRegistryConfig(saved))return;
        value=rebaseLoraRegistryDraft(value,saved,next);past=past.map(item=>rebaseLoraRegistryDraft(item,saved,next));future=future.map(item=>rebaseLoraRegistryDraft(item,saved,next));saved=next;
    };
    const persist=()=>{if(!loraRegistryValidation(value).valid)return;const serialized=serializeLoraRegistryConfig(value);if(serialized===serializeLoraRegistryConfig(saved))return;const previous=saved;saved=structuredClone(value);try{save(serialized)}catch(error){saved=previous;throw error}if(readStored)sync(readStored())};
    const refresh=()=>{if(readStored)sync(readStored())};
    return {get value(){return value},get canUndo(){return past.length>0},get canRedo(){return future.length>0},sync,
        commit(next:LoraRegistryConfig|((current:LoraRegistryConfig)=>LoraRegistryConfig)){const previous=value;refresh();const resolved=typeof next==="function"?next(structuredClone(value)):rebaseLoraRegistryDraft(next,previous,value);past=[...past.slice(-99),structuredClone(value)];future=[];value=structuredClone(resolved);persist()},
        undo(){refresh();if(!past.length)return;future=[structuredClone(value),...future].slice(0,100);value=past.pop()!;persist()},
        redo(){refresh();if(!future.length)return;past=[...past.slice(-99),structuredClone(value)];value=future.shift()!;persist()}
    };
}

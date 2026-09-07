import {useEffect,useState} from "react";
import {workflowRegistries,registryDomainId} from "./registryDgFamilies";
import {parseReferenceConfig} from "./referenceRegistryLifecycle";
import {resolveNativeInputSource} from "./regionalNativeSource";
import {REFERENCE_INVENTORY_EVENT} from "./referenceRegistryGraph";
import type {ReferenceChoice} from "../completion/referenceMentions";

export function referencePromptCatalog(node:any):ReferenceChoice[] {
    if(!node)return [];
    const sources=workflowRegistries(node,"reference"), result:ReferenceChoice[]=[];
    for(const source of sources){
        if(sources.filter(other=>registryDomainId(other)===registryDomainId(source)).length!==1)continue;
        const config=parseReferenceConfig(source.widgets?.find((item:any)=>item.name==="config_json")?.value), counts:Record<string,number>={};
        for(const place of config.places??config.entries){
            const index=source.inputs?.findIndex((input:any)=>input.name===`media.${place.slot}`);
            const upstream=resolveNativeInputSource(source,index), type=String(upstream?.node?.outputs?.[upstream.outputIndex]?.type??"");
            const kind=({IMAGE:"Image",AUDIO:"Audio",VIDEO:"Video"} as Record<string,string>)[place.media_type??type]??"Media";
            counts[kind]=(counts[kind]??0)+1;
            const image=upstream?.node?.imgs?.[0]?.src;
            const preview=typeof image==="string"&&/^(https?:|blob:|data:image\/)/.test(image)?image:undefined;
            result.push({collector_id:config.collector_id,resource_id:place.id,label:`${kind} ${counts[kind]}`,origin:`Registry #${source.id}`,preview,media_type:place.media_type??type,available:config.entries.some(entry=>entry.id===place.id)});
        }
    }
    return result;
}
export function useReferencePromptCatalog(node:any){
    const [value,setValue]=useState<ReferenceChoice[]>([]);
    useEffect(()=>{const refresh=()=>setValue(referencePromptCatalog(node));refresh();window.addEventListener(REFERENCE_INVENTORY_EVENT,refresh);return()=>window.removeEventListener(REFERENCE_INVENTORY_EVENT,refresh)},[node]);
    return value;
}

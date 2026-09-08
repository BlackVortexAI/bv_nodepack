import type { LoraV3Config } from "./LoraV3ResourcePickerPanel";

export const emptyLoraV3Config=():LoraV3Config=>({version:3,entries:[],steps:[]});

// BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): LoRA config v1/v2 -> v3.
// Remove old-version acceptance and collector_id lifting after saved workflows have migrated.
const migrateEntry=(entry:any,collectorId:string|null)=>entry?.source?.kind==="external"?{...entry,source:{...entry.source,collector_id:String(entry.source.collector_id??collectorId??"")}}:entry;

export function parseLoraV3Config(value:unknown):LoraV3Config{
    const candidate=typeof value==="string"?JSON.parse(value):value;
    if(!candidate||typeof candidate!=="object"||![1,2,3].includes((candidate as any).version)||!Array.isArray((candidate as any).entries)||((candidate as any).version>=2&&!Array.isArray((candidate as any).steps)))throw new Error("Invalid BV Regional LoRA v3 configuration");
    const source:any=structuredClone(candidate),collectorId=source.collector_id??null;
    if("apply_global" in source&&typeof source.apply_global!=="boolean")throw new Error("Invalid Global LoRA application flag");
    const registryIds=source.registry_ids??[];
    if(!Array.isArray(registryIds)||registryIds.length>20||new Set(registryIds).size!==registryIds.length||registryIds.some((id:any)=>typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)))throw new Error("Invalid explicit LoRA Registry selection");
    const entries=source.entries.map((entry:any)=>migrateEntry(entry,collectorId)),steps=(source.steps??[]).map((step:any)=>({...step,entries:step.entries.map((entry:any)=>migrateEntry(entry,collectorId))}));
    const ids=new Set(registryIds);for(const entry of [...entries,...steps.flatMap((step:any)=>step.entries)])if(entry?.source?.kind==="external")ids.add(entry.source.collector_id);
    if(ids.size>20)throw new Error("LoRA selection exceeds 20 providers");
    return {version:3,entries,steps,...("registry_ids" in source?{registry_ids:registryIds}:{}),...("apply_global" in source?{apply_global:source.apply_global}:{})};
}

export const serializeLoraV3Config=(value:LoraV3Config)=>JSON.stringify(value);

export function updateLoraV3EntryCollector(config:LoraV3Config,entryId:string,collectorId:string,resourceId:string):LoraV3Config{
    const map=(entry:any)=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,collector_id:collectorId,resource_id:resourceId}}:entry;
    return {...config,entries:config.entries.map(map),steps:config.steps?.map(step=>({...step,entries:step.entries.map(map)}))};
}

export function loraV3CollectorIds(config:LoraV3Config){const ids:string[]=[...(config.registry_ids??[])];for(const entry of [...config.entries,...(config.steps??[]).flatMap(step=>step.entries)])if(entry.source.kind==="external"&&entry.source.collector_id&&!ids.includes(entry.source.collector_id))ids.push(entry.source.collector_id);return ids;}

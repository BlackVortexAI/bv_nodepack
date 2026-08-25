import type { LoraV3Config } from "./LoraV3ResourcePickerPanel";

export const emptyLoraV3Config=():LoraV3Config=>({version:3,entries:[],steps:[]});

// BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): LoRA config v1/v2 -> v3.
// Remove old-version acceptance and collector_id lifting after saved workflows have migrated.
const migrateEntry=(entry:any,collectorId:string|null)=>entry?.source?.kind==="external"?{...entry,source:{...entry.source,collector_id:String(entry.source.collector_id??collectorId??"")}}:entry;

export function parseLoraV3Config(value:unknown):LoraV3Config{
    const candidate=typeof value==="string"?JSON.parse(value):value;
    if(!candidate||typeof candidate!=="object"||![1,2,3].includes((candidate as any).version)||!Array.isArray((candidate as any).entries)||((candidate as any).version>=2&&!Array.isArray((candidate as any).steps)))throw new Error("Invalid BV Regional LoRA v3 configuration");
    const source:any=structuredClone(candidate),collectorId=source.collector_id??null;
    return {version:3,entries:source.entries.map((entry:any)=>migrateEntry(entry,collectorId)),steps:(source.steps??[]).map((step:any)=>({...step,entries:step.entries.map((entry:any)=>migrateEntry(entry,collectorId))}))};
}

export const serializeLoraV3Config=(value:LoraV3Config)=>JSON.stringify(value);

export function updateLoraV3EntryCollector(config:LoraV3Config,entryId:string,collectorId:string,resourceId:string):LoraV3Config{
    const map=(entry:any)=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,collector_id:collectorId,resource_id:resourceId}}:entry;
    return {...config,entries:config.entries.map(map),steps:config.steps?.map(step=>({...step,entries:step.entries.map(map)}))};
}

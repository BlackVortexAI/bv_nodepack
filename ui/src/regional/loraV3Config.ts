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

/** Only the owning document proves a region was removed. Missing providers are
 * not deletion evidence: disconnected and empty named stacks remain valid. */
export function reconcileRegionalLoraConfig(config:LoraV3Config,document:{document_id:string;regions:Array<{id:string}>}):LoraV3Config{
    const ids=new Set(document.regions.map(region=>region.id));
    const keep=(target:Record<string,unknown>)=>target.scope!=="region"||target.document_id!==document.document_id||ids.has(String(target.region_id));
    const entries=(values:LoraV3Config["entries"])=>values.flatMap(entry=>{
        const targets=entry.targets.filter(keep);
        return targets.length===entry.targets.length?[entry]:targets.length?[{...entry,targets}]:[];
    });
    return {...config,entries:entries(config.entries),...(config.steps?{steps:config.steps.filter(step=>keep(step.target)).map(step=>({...step,entries:entries(step.entries)}))}:{})};
}

/** Document Undo restores only associations for regions it brings back. Later
 * picker/global-switch edits are independent and must not be rolled back. */
export function restoreRegionalLoraConfig(current:LoraV3Config,before:{document_id:string;regions:Array<{id:string}>},restored:typeof before,snapshot?:LoraV3Config):LoraV3Config{
    const existing=new Set(before.document_id===restored.document_id?before.regions.map(region=>region.id):[]);
    const added=new Set(restored.regions.map(region=>region.id).filter(id=>!existing.has(id)));
    const revived=(target:Record<string,unknown>)=>target.scope==="region"&&target.document_id===restored.document_id&&added.has(String(target.region_id));
    if(!snapshot||!added.size)return reconcileRegionalLoraConfig(current,restored);
    const merge=(entries:LoraV3Config["entries"],saved:LoraV3Config["entries"])=>{
        const result=structuredClone(entries);
        for(const entry of saved){
            const targets=entry.targets.filter(revived);if(!targets.length)continue;
            const found=result.find(item=>item.id===entry.id);
            if(found)for(const target of targets){if(!found.targets.some(item=>item.scope===target.scope&&item.document_id===target.document_id&&item.region_id===target.region_id))found.targets.push(structuredClone(target));}
            else {
                const following=new Set(saved.slice(saved.indexOf(entry)+1).map(item=>item.id));
                const index=result.findIndex(item=>following.has(item.id));
                result.splice(index<0?result.length:index,0,{...structuredClone(entry),targets:structuredClone(targets)});
            }
        }
        return result;
    };
    const steps=(current.steps??[]).map(step=>({...step,entries:merge(step.entries,snapshot.steps?.find(item=>item.id===step.id)?.entries??[])}));
    for(const step of snapshot.steps??[])if(revived(step.target)&&!steps.some(item=>item.id===step.id)){
        const following=new Set(snapshot.steps!.slice(snapshot.steps!.indexOf(step)+1).map(item=>item.id));
        const index=steps.findIndex(item=>following.has(item.id));
        steps.splice(index<0?steps.length:index,0,structuredClone(step));
    }
    return reconcileRegionalLoraConfig({...current,entries:merge(current.entries,snapshot.entries),...(current.steps||steps.length?{steps}:{})},restored);
}

export function updateLoraV3EntryCollector(config:LoraV3Config,entryId:string,collectorId:string,resourceId:string):LoraV3Config{
    const map=(entry:any)=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,collector_id:collectorId,resource_id:resourceId}}:entry;
    return {...config,entries:config.entries.map(map),steps:config.steps?.map(step=>({...step,entries:step.entries.map(map)}))};
}

export function loraV3CollectorIds(config:LoraV3Config){const ids:string[]=[...(config.registry_ids??[])];for(const entry of [...config.entries,...(config.steps??[]).flatMap(step=>step.entries)])if(entry.source.kind==="external"&&entry.source.collector_id&&!ids.includes(entry.source.collector_id))ids.push(entry.source.collector_id);return ids;}

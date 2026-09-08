export type LoraCatalogItem={
    name:string;
    display_name:string;
    base_model:string;
    tags:string[];
    trigger_words:string[];
    author:string;
    description:string;
    size:number;
    preview_url:string|null;
    preview_safe:boolean;
    preview_media_type?:"image"|"video";
    metadata_sources:string[];
    type:string;
    category:string;
    directory:string;
    civitai_url?:string|null;
    compatibility?:{status:"unknown"|"multipass"|"token_candidate";family:string|null;reason:string;target_model:"unknown"};
};
export type LoraCatalog={schema:"bv.lora_catalog";version:1;items:LoraCatalogItem[]};
export type LoraRegistryEntry={id:string;lora_name:string;enabled:boolean;model_strength:number;clip_strength:number};
export type LoraRegistryStack={id:string;name:string;enabled:boolean;role?:"normal"|"basis"|"global";entries:LoraRegistryEntry[]};
export type LoraRegistryConfig={schema:"bv.lora_registry_config";version:1|2;registry_id:string;stacks:LoraRegistryStack[]};

const freshId=()=>crypto.randomUUID();
export const safeCivitaiUrl=(value:unknown):string|null=>{
    if(typeof value!=="string"||/[\s\u0000-\u001f]/.test(value))return null;
    try{const url=new URL(value);return["http:","https:"].includes(url.protocol)&&["civitai.com","www.civitai.com"].includes(url.hostname)&&!url.username&&!url.password&&["","80","443"].includes(url.port)&&/^\/models\/[1-9]\d*(?:\/[A-Za-z0-9_-]+)?\/?$/.test(url.pathname)?url.href:null}catch{return null}
};
const finite=(value:unknown,fallback:number)=>{
    if(value===undefined)return fallback;
    if(typeof value==="string"&&!value.trim())return Number.NaN;
    const number=Number(value);return Number.isFinite(number)?number:Number.NaN;
};
const logicalName=(value:unknown)=>String(value??"").trim().replaceAll("\\","/");
const canonicalUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const uuidShape=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const normalizedUuid=(value:unknown)=>{const text=String(value??"").trim();return uuidShape.test(text)?text.toLocaleLowerCase():text};
const record=(value:unknown):value is Record<string,unknown>=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const exactKeys=(value:Record<string,unknown>,allowed:string[])=>Object.keys(value).every(key=>allowed.includes(key));
const optionalBoolean=(value:Record<string,unknown>,key:string)=>!(key in value)||typeof value[key]==="boolean";
const optionalFiniteNumber=(value:Record<string,unknown>,key:string)=>!(key in value)||(typeof value[key]==="number"&&Number.isFinite(value[key]));
const rawEntryShape=(entry:unknown)=>record(entry)&&exactKeys(entry,["id","lora_name","enabled","model_strength","clip_strength"])&&typeof entry.id==="string"&&typeof entry.lora_name==="string"&&optionalBoolean(entry,"enabled")&&optionalFiniteNumber(entry,"model_strength")&&optionalFiniteNumber(entry,"clip_strength");
const rawStackShape=(stack:unknown)=>record(stack)&&exactKeys(stack,["id","name","enabled","entries","role"])&&(!("role" in stack)||stack.role==="normal"||stack.role==="basis"||stack.role==="global")&&typeof stack.id==="string"&&typeof stack.name==="string"&&optionalBoolean(stack,"enabled")&&Array.isArray(stack.entries)&&stack.entries.every(rawEntryShape);
const rawConfigShape=(value:unknown):value is Record<string,unknown>=>record(value)&&exactKeys(value,["schema","version","registry_id","stacks"])&&value.schema==="bv.lora_registry_config"&&(value.version===1||value.version===2)&&typeof value.registry_id==="string"&&Array.isArray(value.stacks)&&value.stacks.every(rawStackShape);
const safeLoraName=(value:string)=>{
    const name=logicalName(value),parts=name.split("/");
    return Boolean(name)&&!name.startsWith("/")&&!parts.some(part=>!part||part==="."||part==="..")&&!parts[0].includes(":")&&name.toLocaleLowerCase().endsWith(".safetensors");
};

export const automaticLoraStack=(stack:LoraRegistryStack)=>stack.role==="global"||stack.role==="basis";
export const loraStackLabel=(stack:LoraRegistryStack)=>stack.role==="global"?"Global · Automatically applied":stack.role==="basis"?`${stack.name} · Global (migrated basis)`:stack.name;
export const GLOBAL_LORA_DESCRIPTION="Applied to the entire generation. Regional stacks are added on top.";
const ensureGlobal=(config:LoraRegistryConfig):LoraRegistryConfig=>{
    if(config.stacks.some(stack=>stack.role==="global"))return{...config,version:2};
    const id=config.registry_id.slice(0,-1)+(parseInt(config.registry_id.slice(-1),16)^1).toString(16);
    if(config.stacks.some(stack=>stack.id===id))return{...config,registry_id:""};
    let name="Global";const names=new Set(config.stacks.map(stack=>stack.name.toLocaleLowerCase()));while(names.has(name.toLocaleLowerCase()))name+=" · Automatically applied";
    const enabled=config.version===1&&config.stacks.some(stack=>stack.role==="basis"&&stack.enabled&&stack.entries.some(entry=>entry.enabled));
    return{...config,version:2,stacks:[{id,name,enabled,role:"global",entries:[]},...config.stacks]};
};
export const emptyLoraRegistryConfig=():LoraRegistryConfig=>ensureGlobal({schema:"bv.lora_registry_config",version:2,registry_id:freshId(),stacks:[]});
export const newLoraRegistryStack=(name="LoRA Stack"):LoraRegistryStack=>({id:freshId(),name,enabled:true,entries:[]});
export const newLoraRegistryEntry=(loraName:string):LoraRegistryEntry=>({id:freshId(),lora_name:logicalName(loraName),enabled:true,model_strength:1,clip_strength:1});
export const addLoraEntryToStack=(config:LoraRegistryConfig,targetStackId:string,loraName:string):{config:LoraRegistryConfig;added:boolean;entryId?:string}=>{
    const target=config.stacks.find(stack=>stack.id===targetStackId);
    if(!target)return{config,added:false};
    const entry=newLoraRegistryEntry(loraName);
    return{added:true,entryId:entry.id,config:{...config,stacks:config.stacks.map(stack=>stack.id===targetStackId?{...stack,entries:[...stack.entries,entry]}:stack)}};
};
export const addLoraEntryToLatestStored=(readStored:()=>unknown,targetStackId:string,loraName:string)=>addLoraEntryToStack(parseLoraRegistryConfig(readStored()),targetStackId,loraName);
export type SharedStrength={kind:"value";value:number}|{kind:"mixed";model:number;clip:number};
export const readSharedStrength=(entry:LoraRegistryEntry):SharedStrength=>entry.model_strength===entry.clip_strength?{kind:"value",value:entry.model_strength}:{kind:"mixed",model:entry.model_strength,clip:entry.clip_strength};
export const writeSharedStrength=(entry:LoraRegistryEntry,value:number):LoraRegistryEntry=>({...entry,model_strength:value,clip_strength:value});
const clampedStrength=(value:number)=>Math.round(Math.max(-5,Math.min(5,value))*10000)/10000;
const effectiveStrengthDelta=(values:number[],delta:number)=>{
    if(!values.length||!Number.isFinite(delta)||delta===0)return 0;
    const bounded=delta>0?Math.min(delta,5-Math.max(...values)):Math.max(delta,-5-Math.min(...values));
    return Math.round(bounded*10000)/10000;
};
export const moveLoraEntry=(config:LoraRegistryConfig,stackId:string,entryId:string,targetEntryId:string,placement:"before"|"after"="before"):LoraRegistryConfig=>{
    const stack=config.stacks.find(item=>item.id===stackId),source=stack?.entries.findIndex(item=>item.id===entryId)??-1,target=stack?.entries.findIndex(item=>item.id===targetEntryId)??-1;
    if(!stack||source<0||target<0||source===target)return config;
    const entries=[...stack.entries],[moved]=entries.splice(source,1),remainingTarget=entries.findIndex(item=>item.id===targetEntryId);entries.splice(remainingTarget+(placement==="after"?1:0),0,moved);
    return{...config,stacks:config.stacks.map(item=>item.id===stackId?{...item,entries}:item)};
};
export const applyEntryStrengthDelta=(config:LoraRegistryConfig,stackId:string,entryId:string,delta:number):LoraRegistryConfig=>{
    if(!Number.isFinite(delta)||delta===0)return config;
    const stack=config.stacks.find(item=>item.id===stackId),entry=stack?.entries.find(item=>item.id===entryId);if(!stack||!entry)return config;
    const effective=effectiveStrengthDelta([entry.model_strength,entry.clip_strength],delta);if(effective===0)return config;
    return{...config,stacks:config.stacks.map(item=>item.id!==stackId?item:{...item,entries:item.entries.map(value=>value.id!==entryId?value:{...value,model_strength:clampedStrength(value.model_strength+effective),clip_strength:clampedStrength(value.clip_strength+effective)})})};
};
export const applyStackStrengthDelta=(config:LoraRegistryConfig,stackId:string,delta:number):LoraRegistryConfig=>{
    if(!Number.isFinite(delta)||delta===0)return config;
    const stack=config.stacks.find(item=>item.id===stackId);if(!stack)return config;
    const effective=effectiveStrengthDelta(stack.entries.flatMap(entry=>[entry.model_strength,entry.clip_strength]),delta);if(effective===0)return config;
    return{...config,stacks:config.stacks.map(item=>item.id!==stackId?item:{...item,entries:item.entries.map(value=>({...value,model_strength:clampedStrength(value.model_strength+effective),clip_strength:clampedStrength(value.clip_strength+effective)}))})};
};
export const writeStackStrength=(config:LoraRegistryConfig,stackId:string,value:number):LoraRegistryConfig=>Number.isFinite(value)?{...config,stacks:config.stacks.map(item=>item.id!==stackId?item:{...item,entries:item.entries.map(entry=>writeSharedStrength(entry,clampedStrength(value)))})}:config;

export function parseLoraRegistryConfig(value:unknown):LoraRegistryConfig{
    if(value==null||(typeof value==="string"&&!value.trim()))return emptyLoraRegistryConfig();
    try{
        const parsed=typeof value==="string"?JSON.parse(value):structuredClone(value);
        if(!rawConfigShape(parsed))return{schema:"bv.lora_registry_config",version:1,registry_id:"",stacks:[]};
        const stacks:LoraRegistryStack[]=(parsed.stacks as any[]).map((source:any)=>({
            id:normalizedUuid(source.id),name:String(source.name??"").trim(),enabled:source.enabled!==false,...(source.role==="basis"||source.role==="global"?{role:source.role as "basis"|"global"}:{}),
            entries:source.entries.map((item:any)=>({id:normalizedUuid(item.id),lora_name:logicalName(item.lora_name),enabled:item.enabled!==false,model_strength:finite(item.model_strength,1),clip_strength:finite(item.clip_strength,1)})),
        }));
        return ensureGlobal({schema:"bv.lora_registry_config",version:parsed.version as 1|2,registry_id:normalizedUuid(parsed.registry_id),stacks});
    }catch{return{schema:"bv.lora_registry_config",version:1,registry_id:"",stacks:[]}}
}

export const serializeLoraRegistryConfig=(value:LoraRegistryConfig)=>JSON.stringify(value);
export const freshenLoraRegistryIdentities=(value:LoraRegistryConfig):LoraRegistryConfig=>({...structuredClone(value),registry_id:freshId(),stacks:value.stacks.map(stack=>({...structuredClone(stack),id:freshId(),entries:stack.entries.map(entry=>({...entry,id:freshId()}))}))});
export const clearLoraRegistryStacks=(value:LoraRegistryConfig):LoraRegistryConfig=>ensureGlobal({...structuredClone(value),stacks:value.stacks.filter(stack=>stack.role==="global").map(stack=>({...stack,entries:[]}))});
export const needsFreshLoraRegistryId=(nodeId:string,registryId:string,registries:Array<{nodeId:string;registryId:string}>)=>{
    const duplicates=registries.filter(item=>item.registryId===registryId);
    return Boolean(registryId)&&duplicates.length>1&&duplicates[0].nodeId!==nodeId;
};
export const activeLoraCount=(stack:LoraRegistryStack)=>stack.enabled?stack.entries.filter(entry=>entry.enabled).length:0;
export const loraRegistryIsEmptyActive=(config:LoraRegistryConfig)=>config.stacks.every(stack=>activeLoraCount(stack)===0);
export const loraRegistryValidation=(config:LoraRegistryConfig)=>{
    const names=config.stacks.map(stack=>stack.name.trim().toLocaleLowerCase());
    const duplicateName=config.stacks.find((_stack,index)=>names.indexOf(names[index])!==index)?.name;
    const incomplete=config.stacks.some(stack=>!stack.name.trim()||stack.entries.some(entry=>!entry.lora_name.trim()));
    const stackIds=config.stacks.map(stack=>stack.id),duplicateId=stackIds.some((id,index)=>stackIds.indexOf(id)!==index)||config.stacks.some(stack=>{const ids=stack.entries.map(entry=>entry.id);return ids.some((id,index)=>ids.indexOf(id)!==index)});
    const invalidId=config.stacks.filter(stack=>stack.role==="global").length!==1||duplicateId||!canonicalUuid.test(config.registry_id)||config.stacks.some(stack=>!canonicalUuid.test(stack.id)||stack.entries.some(entry=>!canonicalUuid.test(entry.id)));
    const invalidPath=config.stacks.some(stack=>stack.entries.some(entry=>!safeLoraName(entry.lora_name)));
    const invalidStrength=config.stacks.some(stack=>stack.entries.some(entry=>!Number.isFinite(entry.model_strength)||!Number.isFinite(entry.clip_strength)));
    return{valid:!duplicateName&&!incomplete&&!invalidId&&!invalidPath&&!invalidStrength,duplicateName,incomplete,duplicateId,invalidId,invalidPath,invalidStrength};
};
export const strictLoraRegistryConfig=(value:unknown):LoraRegistryConfig|null=>{
    try{const raw=typeof value==="string"?JSON.parse(value):structuredClone(value);if(!rawConfigShape(raw))return null;const config=parseLoraRegistryConfig(raw);return loraRegistryValidation(config).valid?config:null}catch{return null}
};
export const shouldPersistNormalizedLoraConfig=(raw:unknown,strict:unknown)=>!String(raw??"").trim()||Boolean(strict);

export function searchLoraCatalog(items:LoraCatalogItem[],query:string,limit=Number.POSITIVE_INFINITY):LoraCatalogItem[]{
    const words=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    if(!words.length||limit<=0)return[];
    const results:LoraCatalogItem[]=[];
    for(const item of items){
        const text=[item.display_name,item.name,item.base_model,item.author,...item.tags,...item.trigger_words].join(" ").toLocaleLowerCase();
        if(words.every(word=>text.includes(word))){results.push(item);if(results.length>=limit)break}
    }
    return results;
}

export type LutRegistryEntry={id:string;lut_name:string};
export type LutRegistryConfig={schema:"bv.lut_registry_config";version:1;collector_id:string;luts:LutRegistryEntry[]};
const uuid=()=>crypto.randomUUID();
const validUuid=(value:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const emptyLutRegistryConfig=():LutRegistryConfig=>({schema:"bv.lut_registry_config",version:1,collector_id:uuid(),luts:[]});
export function parseLutRegistryConfig(value:unknown):LutRegistryConfig{try{const parsed=typeof value==="string"?JSON.parse(value||"{}"):value as any,collector=String(parsed?.collector_id??"").trim(),seen=new Set<string>(),luts=Array.isArray(parsed?.luts)?parsed.luts.flatMap((entry:any)=>{const id=String(entry?.id??"").trim(),lut_name=String(entry?.lut_name??"").trim();if(!id||!lut_name||seen.has(id))return[];seen.add(id);return[{id,lut_name}]}):[];return{schema:"bv.lut_registry_config",version:1,collector_id:validUuid(collector)?collector:uuid(),luts}}catch{return emptyLutRegistryConfig()}}
export const serializeLutRegistryConfig=(value:LutRegistryConfig)=>JSON.stringify(value);

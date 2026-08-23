import type { LoraV3Config } from "./LoraV3ResourcePickerPanel";

export const emptyLoraV3Config=():LoraV3Config=>({version:1,collector_id:null,entries:[]});

export function parseLoraV3Config(value:unknown):LoraV3Config{
    const candidate=typeof value==="string"?JSON.parse(value):value;
    if(!candidate||typeof candidate!=="object"||![1,2].includes((candidate as any).version)||!Array.isArray((candidate as any).entries)||((candidate as any).version===2&&!Array.isArray((candidate as any).steps)))throw new Error("Invalid BV Regional LoRA v3 configuration");
    return structuredClone(candidate as LoraV3Config);
}

export const serializeLoraV3Config=(value:LoraV3Config)=>JSON.stringify(value);

export type ModelPatcherConfig={version:1;collector_ids:string[]};
export function parseModelPatcherConfig(raw:unknown):ModelPatcherConfig{
    const value=typeof raw==="string"?JSON.parse(raw):raw;
    if(!value||typeof value!=="object")throw Error("Invalid Model Patcher configuration");
    const config=value as ModelPatcherConfig;
    if(Object.keys(config).some(key=>!["version","collector_ids"].includes(key))||config.version!==1||!Array.isArray(config.collector_ids)||config.collector_ids.length>20||config.collector_ids.some(id=>typeof id!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id))||new Set(config.collector_ids).size!==config.collector_ids.length)throw Error("Invalid Model Patcher Registry selection");
    return {version:1,collector_ids:[...config.collector_ids]};
}

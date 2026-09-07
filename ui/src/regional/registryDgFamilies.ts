/** Domain ownership for the single Registry DG adapter. No graph writes here. */
export type RegistryDgFamily = "lut" | "detailer" | "reference" | "basis";
export type RegistrySourceKind = "lora" | "lut" | "detector" | "reference";
const kind = (node:any) => String(node?.comfyClass ?? node?.type ?? "");
export const registrySourceKind = (node:any):RegistrySourceKind|null =>
    ({"BV LoRA Registry":"lora", "BV LUT Registry":"lut", "BV Detector Registry":"detector", "BV Reference Registry":"reference"} as const)[kind(node) as "BV LoRA Registry"] ?? null;
export function allowedRegistryFamilies(node:any):RegistryDgFamily[] {
    switch(kind(node)) {
        case "BV Model Patcher": return ["basis"];
        case "BV Regional Prompt": return ["lut", "detailer", "reference"];
        case "BV Regional Krea 2 Attention": return ["reference"];
        case "BV Regional LUT Plan": case "BV LUT Loop Start": return ["lut"];
        case "BV Regional Detailer Plan": return ["detailer"];
        default: return [];
    }
}
export const registryFamilyEnabled = (node:any, family:RegistryDgFamily) =>
    allowedRegistryFamilies(node).includes(family) && Array.isArray(node?.properties?.bvRegistryDgFamilies) && node.properties.bvRegistryDgFamilies.includes(family);
/** Called only by fresh creation or confirmed user configuration, never catalog reads. */
export function enableRegistryFamily(node:any, family:RegistryDgFamily) {
    if(!allowedRegistryFamilies(node).includes(family)) return;
    node.properties ??= {};
    node.properties.bvRegistryDgFamilies = allowedRegistryFamilies(node).filter(candidate => candidate===family || registryFamilyEnabled(node,candidate));
}
export function registryChannelFamily(node:any, name:string):RegistryDgFamily|null {
    const prompt=kind(node)==="BV Regional Prompt";
    if(allowedRegistryFamilies(node).includes("basis")&&/^base_resource_provider_([1-9]|1\d|20)$/.test(name))return "basis";
    if(allowedRegistryFamilies(node).includes("reference")&&/^reference_resource_provider_([1-9]|1\d|20)$/.test(name))return "reference";
    if(allowedRegistryFamilies(node).includes("lut") && (prompt ? /^lut_resource_provider_([1-9]|[1-3]\d|40)$/ : /^resource_provider_([1-9]|[1-3]\d|40)$/).test(name)) return "lut";
    if(allowedRegistryFamilies(node).includes("detailer") && (prompt ? /^detailer_resource_provider_([1-9]|1\d|20)$/ : /^resource_provider(?:_([1-9]|1\d|20))?$/).test(name)) return "detailer";
    return null;
}
export function registryKindAllowed(family:RegistryDgFamily, source:RegistrySourceKind|null) {
    if(family==="basis")return source==="lora";
    if(family==="reference")return source==="reference";
    return family==="lut" ? source==="lut" || source==="detector" : source==="detector";
}
/** Walk instances, not definitions or the currently viewed proxy graph. */
export function workflowRegistries(node:any, source:RegistrySourceKind) {
    const owner=node?.__bvConcreteGraph ?? node?.graph, root=owner?.rootGraph ?? owner;
    const result:any[]=[], seen=new Set<any>();
    const visit=(graph:any)=>{ if(!graph || seen.has(graph))return; seen.add(graph);
        const nodes=[...(graph._nodes??[]),...(graph.nodes??[])];
        for(const candidate of new Set(nodes)) {
            if(registrySourceKind(candidate)===source)result.push(candidate);
            visit(candidate?.subgraph ?? candidate?.getSubgraph?.());
        }
    };visit(root);return result;
}
export function registryDomainId(node:any):string {
    try { const raw=node?.widgets?.find((item:any)=>item.name==="config_json")?.value;
        const value=typeof raw==="string"?JSON.parse(raw):raw;
        return String(value?.[registrySourceKind(node)==="lora"?"registry_id":"collector_id"]??"");
    } catch { return ""; }
}
export function uniqueWorkflowRegistry(node:any, source:RegistrySourceKind, id:string) {
    const matches=workflowRegistries(node,source).filter(candidate=>registryDomainId(candidate)===id);
    return matches.length===1?matches[0]:null;
}

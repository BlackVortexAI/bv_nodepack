import { parseDocument, type RegionalDocument } from "./model";
import { resolveNativeInputSource } from "./regionalNativeSource";

const regionalSourceTypes = new Set(["BV Regional LoRA", "BV Apply Regional Enhancement"]);

const nodeType = (node: any): string => String(node?.comfyClass ?? node?.type ?? "");

export function sourceRegionalPrompt(node: any, fallbackGraph: any = null): any {
    let current = node;
    const visited = new Set<any>();

    while (current && !visited.has(current)) {
        visited.add(current);
        if(nodeType(current)==="BV Regional Prompt")return current;
        const indexes=(current.inputs??[]).map((item:any,index:number)=>({item,index})).filter(({item}:any)=>(item.name==="regional"||item.name==="regional_prompt")&&item.link!=null);
        if(indexes.length!==1)return null;
        const resolved=resolveNativeInputSource(current,indexes[0].index,fallbackGraph),source=resolved?.node;
        if(source?.outputs?.[resolved!.outputIndex]?.type!=="BV_REGIONAL")return null;
        const type = nodeType(source);
        if (type === "BV Regional Prompt")return source;
        if (!regionalSourceTypes.has(type)) return null;
        current = source;
    }
    return null;
}

export function sourceRegionalDocument(node:any,fallbackGraph:any=null):RegionalDocument|null{
    const source=sourceRegionalPrompt(node,fallbackGraph);
    if(!source)return null;
    try{return parseDocument(source.widgets?.find((widget:any)=>widget.name==="regional_json")?.value)}catch{return null}
}

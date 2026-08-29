import type{LoraCatalog}from"./loraRegistryConfig";

type FetchLike=(input:string)=>Promise<{ok:boolean;status?:number;json:()=>Promise<unknown>}>;
type ApiLike={apiURL:(path:string)=>string};

const EMPTY_CATALOG=Object.freeze({schema:"bv.lora_catalog",version:1,items:Object.freeze([])})as unknown as LoraCatalog;

function isCatalog(value:unknown):value is LoraCatalog{
    const candidate=value as Partial<LoraCatalog>|null;
    return Boolean(candidate&&candidate.schema==="bv.lora_catalog"&&candidate.version===1&&Array.isArray(candidate.items));
}

export function createLoraCatalogClient(fetcher:FetchLike=(input)=>fetch(input)){
    let cached:LoraCatalog|undefined,inFlight:Promise<LoraCatalog>|undefined;
    const listeners=new Set<()=>void>(),getSnapshot=()=>cached??EMPTY_CATALOG,notify=()=>{for(const listener of[...listeners])listener()};
    return{
        peek:()=>cached,
        getSnapshot,
        subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)},
        empty:()=>EMPTY_CATALOG,
        invalidate:()=>{if(!cached)return;cached=undefined;notify()},
        load(api:ApiLike){
            if(cached)return Promise.resolve(cached);
            if(inFlight)return inFlight;
            inFlight=(async()=>{
                const response=await fetcher(api.apiURL("/bv_nodepack/loras/catalog"));
                if(!response.ok)throw new Error(`LoRA catalog failed: ${response.status??"unknown"}`);
                const value=await response.json();
                if(!isCatalog(value))throw new Error("LoRA catalog response is invalid");
                cached=Object.freeze({...value,items:Object.freeze([...value.items])})as unknown as LoraCatalog;
                notify();
                return cached;
            })().finally(()=>{inFlight=undefined});
            return inFlight;
        },
    };
}

export const loraCatalogClient=createLoraCatalogClient();
export function bootstrapLoraCatalog(api:ApiLike,client=loraCatalogClient){void client.load(api).catch(()=>undefined)}

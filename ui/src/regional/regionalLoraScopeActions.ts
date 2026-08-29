import type{LoraV3Config,LoraV3Entry,LoraV3Target}from"./LoraV3ResourcePickerPanel";
import{addLoraV3TargetEntry,clearLoraV3Target,loraV3Catalog,loraV3EntryResolved,removeLoraV3TargetEntry,setLoraV3EntrySource}from"./loraV3Ui";

export function hasRegionalLoraV3(node:any){return Boolean(node?.widgets?.some((item:any)=>item.name==="lora_v3_config_json"));}

export function quickLoraV3Target(documentId:string,target:string):LoraV3Target{
    return target==="global"||target==="background"?{scope:"global"}:{scope:"region",document_id:documentId,region_id:target};
}

export function regionalLoraScopeActions(node:any,config:LoraV3Config,commit:(next:LoraV3Config)=>void){
    return{
        onSelection:(entryId:string,collectorId:string,resourceId:string)=>{if(node)commit(setLoraV3EntrySource(node,config,entryId,collectorId,resourceId));},
        onAdd:(target:LoraV3Target)=>{if(node)commit(addLoraV3TargetEntry(node,config,target));},
        onRemove:(entryId:string,target:LoraV3Target)=>{if(node)commit(removeLoraV3TargetEntry(node,config,entryId,target));},
        onClear:(target:LoraV3Target)=>{if(node)commit(clearLoraV3Target(node,config,target));},
    };
}

export function regionalLoraScopeViewProps(node:any,config:LoraV3Config,commit:(next:LoraV3Config)=>void){
    return{
        collectors:node?loraV3Catalog(node).filter(item=>item.resources.length>0):[],
        config,
        resolved:(entry:LoraV3Entry)=>Boolean(node)&&loraV3EntryResolved(node,config,entry),
        ...regionalLoraScopeActions(node,config,commit),
    };
}

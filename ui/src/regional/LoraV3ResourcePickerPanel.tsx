import React from "react";
import { Button, FieldFrame, ResourcePicker, ResourcePickerCollector } from "../ui/components";

export type LoraV3Entry={id:string;source:{kind:"external";resource_id:string}|{kind:"native";lora_name:string;model_strength:number;clip_strength:number};targets:Record<string,unknown>[]};
export type LoraV3Config={version:1;collector_id:string|null;entries:LoraV3Entry[]};

export type LoraV3Target={scope:"global"}|{scope:"region";document_id:string;region_id:string};

export function sameLoraTarget(left:Record<string,unknown>,right:LoraV3Target){return left.scope===right.scope&&(right.scope==="global"||(left.document_id===right.document_id&&left.region_id===right.region_id));}

export function LoraV3ScopePicker({label,help,collectors,config,target,resolved,onValue}:{label:string;help?:string;collectors:ResourcePickerCollector[];config:LoraV3Config;target:LoraV3Target;resolved:boolean;onValue:(collectorId:string|null,resourceId:string|null)=>void}){
    const entry=config.entries.find(item=>item.source.kind==="external"&&item.targets.some(candidate=>sameLoraTarget(candidate,target))),resourceId=entry?.source.kind==="external"?entry.source.resource_id:"";
    return <FieldFrame label={label} help={help}><div className="bv-lora-v3-scope-picker"><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={resourceId} resolved={!resourceId||resolved} onCollector={collectorId=>{const resource=collectors.find(item=>item.id===collectorId)?.resources[0]?.id??null;onValue(collectorId||null,resource)}} onResource={id=>onValue(config.collector_id,id||null)}/>{resourceId&&<Button density="compact" intent="ghost" onClick={()=>onValue(config.collector_id,null)}>Clear</Button>}</div></FieldFrame>;
}

export function LoraV3ResourcePickerPanel({collectors,config,resolved,onCollector,onResource,onAddExternal,onRemove}:{collectors:ResourcePickerCollector[];config:LoraV3Config;resolved:boolean;onCollector:(id:string)=>void;onResource:(entryId:string,resourceId:string)=>void;onAddExternal:()=>void;onRemove?:(entryId:string)=>void}){
    const external=config.entries.filter((entry):entry is LoraV3Entry&{source:{kind:"external";resource_id:string}}=>entry.source.kind==="external");
    return <div className="bv-lora-v3-picker-panel">
        {external.map((entry,index)=><section key={entry.id}><strong>External LoRA Stack {index+1}</strong><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={entry.source.resource_id} resolved={resolved} onCollector={onCollector} onResource={id=>onResource(entry.id,id)}/>{onRemove&&<Button density="compact" intent="ghost" onClick={()=>onRemove(entry.id)}>Remove</Button>}</section>) }
        {!external.length&&<p className="bv-field-help">No external live stack is configured.</p>}
        <Button intent="secondary" disabled={!collectors.some(collector=>collector.resources.length>0)} onClick={onAddExternal}>Add external stack</Button>
    </div>;
}

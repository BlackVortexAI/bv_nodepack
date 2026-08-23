import React from "react";
import { Button, ResourcePicker, ResourcePickerCollector } from "../ui/components";

export type LoraV3Entry={id:string;source:{kind:"external";resource_id:string}|{kind:"native";lora_name:string;model_strength:number;clip_strength:number};targets:Record<string,unknown>[]};
export type LoraV3Config={version:1;collector_id:string|null;entries:LoraV3Entry[]};

export function LoraV3ResourcePickerPanel({collectors,config,resolved,onCollector,onResource,onAddExternal}:{collectors:ResourcePickerCollector[];config:LoraV3Config;resolved:boolean;onCollector:(id:string)=>void;onResource:(entryId:string,resourceId:string)=>void;onAddExternal:()=>void}){
    const external=config.entries.filter((entry):entry is LoraV3Entry&{source:{kind:"external";resource_id:string}}=>entry.source.kind==="external");
    return <div className="bv-lora-v3-picker-panel">
        {external.map((entry,index)=><section key={entry.id}><strong>External LoRA Stack {index+1}</strong><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={entry.source.resource_id} resolved={resolved} onCollector={onCollector} onResource={id=>onResource(entry.id,id)}/></section>) }
        {!external.length&&<p className="bv-field-help">No external live stack is configured.</p>}
        <Button intent="secondary" disabled={!collectors.some(collector=>collector.resources.length>0)} onClick={onAddExternal}>Add external stack</Button>
    </div>;
}

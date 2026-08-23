import React, { useEffect, useState } from "react";
import { Button, FieldFrame, ResourcePicker, ResourcePickerCollector, TagSelect, ToggleField, type SelectOption } from "../ui/components";

export type LoraV3Entry={id:string;source:{kind:"external";resource_id:string}|{kind:"native";lora_name:string;model_strength:number;clip_strength:number};targets:Record<string,unknown>[]};
export type LoraV3Config={version:1;collector_id:string|null;entries:LoraV3Entry[]};

export type LoraV3Target={scope:"global"}|{scope:"region";document_id:string;region_id:string};
export type LoraV3TargetOption=SelectOption&{target:LoraV3Target};
export const loraV3TargetValue=(target:LoraV3Target)=>target.scope==="global"?"global":`region:${target.document_id}:${target.region_id}`;

export function sameLoraTarget(left:Record<string,unknown>,right:LoraV3Target){return left.scope===right.scope&&(right.scope==="global"||(left.document_id===right.document_id&&left.region_id===right.region_id));}

export function LoraV3ScopePicker({label,help,collectors,config,target,resolved,onValue}:{label:string;help?:string;collectors:ResourcePickerCollector[];config:LoraV3Config;target:LoraV3Target;resolved:boolean;onValue:(collectorId:string|null,resourceId:string|null)=>void}){
    const entry=config.entries.find(item=>item.source.kind==="external"&&item.targets.some(candidate=>sameLoraTarget(candidate,target))),resourceId=entry?.source.kind==="external"?entry.source.resource_id:"";
    return <FieldFrame label={label} help={help}><div className="bv-lora-v3-scope-picker"><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={resourceId} resolved={!resourceId||resolved} onCollector={collectorId=>{const resource=collectors.find(item=>item.id===collectorId)?.resources[0]?.id??null;onValue(collectorId||null,resource)}} onResource={id=>onValue(config.collector_id,id||null)}/>{resourceId&&<Button density="compact" intent="ghost" onClick={()=>onValue(config.collector_id,null)}>Clear</Button>}</div></FieldFrame>;
}

export function OptionalLoraV3ScopePicker(props:{label:string;help?:string;collectors:ResourcePickerCollector[];config:LoraV3Config;target:LoraV3Target;resolved:boolean;onValue:(collectorId:string|null,resourceId:string|null)=>void}){
    const targetKey=loraV3TargetValue(props.target),assigned=props.config.entries.some(entry=>entry.source.kind==="external"&&entry.targets.some(target=>sameLoraTarget(target,props.target))),[enabled,setEnabled]=useState(assigned);
    useEffect(()=>setEnabled(assigned),[assigned,targetKey]);
    return <div className="bv-optional-lora-scope"><ToggleField label="Use LoRA" value={enabled} trueLabel="Enabled" falseLabel="Disabled" help="Show or hide the LoRA assignment for this scope." onValue={next=>{setEnabled(next);if(!next)props.onValue(props.config.collector_id,null);}}/>{enabled&&<LoraV3ScopePicker {...props}/>}</div>;
}

export function LoraV3ResourcePickerPanel({collectors,config,resolved,targetOptions=[],onCollector,onResource,onTargets,onAddExternal,onRemove}:{collectors:ResourcePickerCollector[];config:LoraV3Config;resolved:boolean;targetOptions?:LoraV3TargetOption[];onCollector:(id:string)=>void;onResource:(entryId:string,resourceId:string)=>void;onTargets?:(entryId:string,targets:LoraV3Target[])=>void;onAddExternal:()=>void;onRemove?:(entryId:string)=>void}){
    const external=config.entries.filter((entry):entry is LoraV3Entry&{source:{kind:"external";resource_id:string}}=>entry.source.kind==="external");
    return <div className="bv-lora-v3-picker-panel">
        {external.map((entry,index)=><section key={entry.id}><strong>External LoRA Stack {index+1}</strong><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={entry.source.resource_id} resolved={resolved} onCollector={onCollector} onResource={id=>onResource(entry.id,id)}/>{onTargets&&targetOptions.length>0&&<TagSelect label="Assignment targets" value={entry.targets.map(target=>loraV3TargetValue(target as LoraV3Target))} options={targetOptions} minSelected={1} onValue={values=>onTargets(entry.id,values.flatMap(value=>{const target=targetOptions.find(option=>option.value===value)?.target;return target?[target]:[]}))}/>} {onRemove&&<Button density="compact" intent="ghost" onClick={()=>onRemove(entry.id)}>Remove</Button>}</section>) }
        {!external.length&&<p className="bv-field-help">No external live stack is configured.</p>}
        <Button intent="secondary" disabled={!collectors.some(collector=>collector.resources.length>0)} onClick={onAddExternal}>Add external stack</Button>
    </div>;
}

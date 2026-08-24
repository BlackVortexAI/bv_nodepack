import React from "react";
import { Button, ResourcePicker, ResourcePickerCollector, ToggleField, type SelectOption } from "../ui/components";

export type LoraV3Entry={id:string;source:{kind:"external";collector_id:string;resource_id:string}|{kind:"native";lora_name:string;model_strength:number;clip_strength:number};targets:Record<string,unknown>[]};
export type LoraV3Operation="replace"|"merge"|"subtract"|"clear";
export type LoraV3Step={id:string;operation:LoraV3Operation;target:LoraV3Target;entries:LoraV3Entry[]};
export type LoraV3Config={version:3;entries:LoraV3Entry[];steps?:LoraV3Step[]};

export type LoraV3Target={scope:"global"}|{scope:"region";document_id:string;region_id:string};
export type LoraV3TargetOption=SelectOption&{target:LoraV3Target};
export const loraV3TargetValue=(target:LoraV3Target)=>target.scope==="global"?"global":`region:${target.document_id}:${target.region_id}`;

export function sameLoraTarget(left:Record<string,unknown>,right:LoraV3Target){return left.scope===right.scope&&(right.scope==="global"||(left.document_id===right.document_id&&left.region_id===right.region_id));}
export function withoutLoraV3Target(config:LoraV3Config,target:LoraV3Target,entryId?:string){const entries=config.entries.flatMap(entry=>{if(entryId&&entry.id!==entryId)return [entry];const targets=entry.targets.filter(candidate=>!sameLoraTarget(candidate,target));return targets.length?[{...entry,targets}]:[];});return {...config,entries};}

type ScopeCallbacks={onSelection:(entryId:string,collectorId:string,resourceId:string)=>void;onAdd:(target:LoraV3Target)=>void;onRemove:(entryId:string,target:LoraV3Target)=>void};
type ScopeProps=ScopeCallbacks&{collectors:ResourcePickerCollector[];config:LoraV3Config;target:LoraV3Target;resolved:boolean|((entry:LoraV3Entry)=>boolean)};
const externalFor=(config:LoraV3Config,target:LoraV3Target)=>config.entries.filter((entry):entry is LoraV3Entry&{source:{kind:"external";resource_id:string}}=>entry.source.kind==="external"&&entry.targets.some(candidate=>sameLoraTarget(candidate,target)));

export function LoraV3ScopePicker({collectors,config,target,resolved,onSelection,onAdd,onRemove}:ScopeProps){
    const entries=externalFor(config,target);
    return <div className="bv-lora-v3-scope-picker">{entries.map((entry,index)=><section className="bv-lora-v3-stack-row" key={entry.id}><strong>LoRA Stack {index+1}</strong><ResourcePicker collectors={collectors} collectorId={entry.source.collector_id} resourceId={entry.source.resource_id} resolved={typeof resolved==="function"?resolved(entry):resolved} label="LoRA stack" emptyLabel="Select LoRA stack" onSelection={(collectorId,resourceId)=>onSelection(entry.id,collectorId,resourceId)}/><Button density="compact" intent="ghost" iconOnly aria-label={`Remove LoRA Stack ${index+1}`} title="Remove LoRA stack" onClick={()=>onRemove(entry.id,target)}><svg className="bv-trash-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"/></svg></Button></section>)}<Button intent="secondary" disabled={!collectors.some(collector=>collector.resources.length>0)} onClick={()=>onAdd(target)}>Add LoRA stack</Button></div>;
}

export function OptionalLoraV3ScopePicker(props:ScopeProps&{onClear:(target:LoraV3Target)=>void}){
    const enabled=externalFor(props.config,props.target).length>0;
    return <div className="bv-optional-lora-scope"><div className="bv-lora-v3-enable-row"><ToggleField label="" value={enabled} trueLabel="LoRA enabled" falseLabel="LoRA disabled" onValue={next=>{if(next)props.onAdd(props.target);else props.onClear(props.target);}}/>{enabled&&<LoraV3ScopePicker {...props}/>}</div></div>;
}

export function LoraV3ResourcePickerPanel({collectors,config,resolved,targetOptions=[],onSelection,onAddExternal,onRemove}:{collectors:ResourcePickerCollector[];config:LoraV3Config;resolved:boolean|((entry:LoraV3Entry)=>boolean);targetOptions?:LoraV3TargetOption[];onSelection:(entryId:string,collectorId:string,resourceId:string)=>void;onAddExternal:(target:LoraV3Target)=>void;onRemove:(entryId:string,target:LoraV3Target)=>void}){
    return <div className="bv-lora-v3-picker-panel">{targetOptions.map(option=><section className="bv-lora-v3-target" key={option.value}><h3>{option.label}</h3><LoraV3ScopePicker collectors={collectors} config={config} target={option.target} resolved={resolved} onSelection={onSelection} onAdd={onAddExternal} onRemove={onRemove}/></section>)}</div>;
}

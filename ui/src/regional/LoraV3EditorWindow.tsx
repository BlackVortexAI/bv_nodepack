import React, { useEffect, useState } from "react";
import { Button, ResourcePicker, SelectField, SortableList, type SortableItem } from "../ui/components";
import { BvManagedWindow } from "../ui/window";
import { setWindowMenuVisible, useWindowMenuVisibility } from "../ui/windowRegistry";
import { type LoraV3Config, type LoraV3Operation, type LoraV3Step, loraV3TargetValue } from "./LoraV3ResourcePickerPanel";
import { commitLoraV3Config, LORA_V3_INVENTORY_CHANGED_EVENT, loraV3Catalog, loraV3EntryResolved, loraV3TargetOptions, readNodeLoraV3Config, setLoraV3EntrySource } from "./loraV3Ui";

const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const operations=["replace","merge","subtract","clear"].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}));

export default function LoraV3EditorWindow({open,node,onClose}:{open:boolean;node:any|null;onClose:()=>void}){
    const [config,setConfig]=useState<LoraV3Config>(()=>readNodeLoraV3Config(node)),menuVisible=useWindowMenuVisibility(node);
    useEffect(()=>{if(open&&node)setConfig(readNodeLoraV3Config(node));},[node,open]);
    useEffect(()=>{if(!open||!node)return;const refresh=()=>setConfig(readNodeLoraV3Config(node));window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);},[node,open]);
    if(!node)return null;
    const collectors=loraV3Catalog(node).filter(item=>item.resources.length>0),targets=loraV3TargetOptions(node);
    const legacyOperation=String(widget(node,"operation")?.value??"replace") as LoraV3Operation;
    const steps:LoraV3Step[]=config.steps??config.entries.flatMap(entry=>entry.targets.map(target=>({id:crypto.randomUUID(),operation:legacyOperation,target:target as any,entries:[{...entry,targets:[target]}]})));
    const commit=(nextSteps:LoraV3Step[])=>{const next:LoraV3Config={version:3,entries:[],steps:nextSteps};setConfig(commitLoraV3Config(node,next));};
    const items:SortableItem[]=steps.map((step,index)=>{
        const targetValue=loraV3TargetValue(step.target),targetLabel=targets.find(item=>item.value===targetValue)?.label??"Missing region";
        return {id:step.id,title:`Step ${index+1}: ${targetLabel}`,description:step.operation,content:<div className="bv-ui-stack">
            <SelectField label="Target" value={targetValue} options={targets} onValue={value=>{const target=targets.find(item=>item.value===value)?.target;if(target)commit(steps.map(item=>item.id===step.id?{...item,target,entries:item.entries.map(entry=>({...entry,targets:[target]}))}:item));}}/>
            <SelectField label="Operation" value={step.operation} options={operations} onValue={value=>commit(steps.map(item=>item.id===step.id?{...item,operation:value as LoraV3Operation}:item))}/>
            {step.operation!=="clear"&&step.entries.map((entry,entryIndex)=>entry.source.kind==="external"?<section className="bv-lora-v3-stack-row" key={entry.id}><strong>LoRA Stack {entryIndex+1}</strong><ResourcePicker collectors={collectors} collectorId={entry.source.collector_id} resourceId={entry.source.resource_id} resolved={loraV3EntryResolved(node,config,entry)} label="LoRA stack" emptyLabel="Select LoRA stack" onSelection={(collectorId,resourceId)=>setConfig(setLoraV3EntrySource(node,config,entry.id,collectorId,resourceId))}/><Button intent="ghost" iconOnly aria-label={`Remove LoRA Stack ${entryIndex+1}`} onClick={()=>commit(steps.map(item=>item.id===step.id?{...item,entries:item.entries.filter(candidate=>candidate.id!==entry.id)}:item))}>×</Button></section>:null)}
            {step.operation!=="clear"&&<Button intent="secondary" disabled={!collectors.length} onClick={()=>{const choice=collectors[0],resource=choice?.resources[0];if(resource)commit(steps.map(item=>item.id===step.id?{...item,entries:[...item.entries,{id:crypto.randomUUID(),source:{kind:"external",collector_id:choice.id,resource_id:resource.id},targets:[item.target]}]}:item));}}>Add LoRA stack</Button>}
        </div>};
    });
    return <BvManagedWindow open={open} title="BV Regional LoRA Editor" shortTitle="Regional LoRA" menuVisible={menuVisible} onMenuVisible={visible=>setWindowMenuVisible(node,visible)} initialGeometry={{width:620,height:520}} minSize={{width:420,height:320}} onClose={onClose}><div className="bv-ui bv-lora-v3-window"><Button intent="secondary" disabled={!targets.length} onClick={()=>commit([...steps,{id:crypto.randomUUID(),operation:"merge",target:targets[0].target,entries:[]}])}>Add step</Button><SortableList items={items} initialExpanded={items.map(item=>item.id)} onReorder={ordered=>{const byId=new Map(steps.map(step=>[step.id,step]));commit(ordered.map(item=>byId.get(item.id)!).filter(Boolean));}} onRemove={id=>commit(steps.filter(step=>step.id!==id))}/></div></BvManagedWindow>;
}

import React, { useEffect, useState } from "react";
import { Button, ResourcePicker, SelectField, SortableList, type SortableItem } from "../ui/components";
import { BvManagedWindow } from "../ui/window";
import { setWindowMenuVisible, useWindowMenuVisibility } from "../ui/windowRegistry";
import { type LoraV3Config, type LoraV3Operation, type LoraV3Step, loraV3TargetValue } from "./LoraV3ResourcePickerPanel";
import { loraV3Catalog, loraV3Resolved, loraV3TargetOptions, readNodeLoraV3Config, setLoraV3Collector, setLoraV3EntryResource, writeNodeLoraV3Config } from "./loraV3Ui";

const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
const operations=["replace","merge","subtract","clear"].map(value=>({value,label:value[0].toUpperCase()+value.slice(1)}));

export default function LoraV3EditorWindow({open,node,onClose}:{open:boolean;node:any|null;onClose:()=>void}){
    const [config,setConfig]=useState<LoraV3Config>(()=>readNodeLoraV3Config(node)),menuVisible=useWindowMenuVisibility(node);
    useEffect(()=>{if(open&&node)setConfig(readNodeLoraV3Config(node));},[node,open]);
    if(!node)return null;
    const collectors=loraV3Catalog(node).filter(item=>item.resources.length>0),targets=loraV3TargetOptions(node),resolved=loraV3Resolved(node,config);
    const legacyOperation=String(widget(node,"operation")?.value??"replace") as LoraV3Operation;
    const steps:LoraV3Step[]=config.version===2?(config.steps??[]):config.entries.flatMap(entry=>entry.targets.map(target=>({id:crypto.randomUUID(),operation:legacyOperation,target:target as any,entries:[{...entry,targets:[target]}]})));
    const commit=(nextSteps:LoraV3Step[],collectorId=config.collector_id)=>{const next:LoraV3Config={version:2,collector_id:collectorId,entries:[],steps:nextSteps};writeNodeLoraV3Config(node,next);setConfig(next);};
    const items:SortableItem[]=steps.map((step,index)=>{
        const targetValue=loraV3TargetValue(step.target),targetLabel=targets.find(item=>item.value===targetValue)?.label??"Missing region";
        return {id:step.id,title:`Step ${index+1}: ${targetLabel}`,description:step.operation,content:<div className="bv-ui-stack">
            <SelectField label="Target" value={targetValue} options={targets} onValue={value=>{const target=targets.find(item=>item.value===value)?.target;if(target)commit(steps.map(item=>item.id===step.id?{...item,target,entries:item.entries.map(entry=>({...entry,targets:[target]}))}:item));}}/>
            <SelectField label="Operation" value={step.operation} options={operations} onValue={value=>commit(steps.map(item=>item.id===step.id?{...item,operation:value as LoraV3Operation}:item))}/>
            {step.operation!=="clear"&&step.entries.map((entry,entryIndex)=>entry.source.kind==="external"?<section className="bv-lora-v3-stack-row" key={entry.id}><strong>LoRA Stack {entryIndex+1}</strong><ResourcePicker collectors={collectors} collectorId={config.collector_id??""} resourceId={entry.source.resource_id} resolved={resolved} onCollector={id=>setConfig(setLoraV3Collector(node,config,id))} onResource={id=>setConfig(setLoraV3EntryResource(node,config,entry.id,id))}/><Button intent="ghost" iconOnly aria-label={`Remove LoRA Stack ${entryIndex+1}`} onClick={()=>commit(steps.map(item=>item.id===step.id?{...item,entries:item.entries.filter(candidate=>candidate.id!==entry.id)}:item))}>×</Button></section>:null)}
            {step.operation!=="clear"&&<Button intent="secondary" disabled={!collectors.length} onClick={()=>{const choice=collectors.find(item=>item.id===config.collector_id)??collectors[0],resource=choice?.resources[0];if(resource)commit(steps.map(item=>item.id===step.id?{...item,entries:[...item.entries,{id:crypto.randomUUID(),source:{kind:"external",resource_id:resource.id},targets:[item.target]}]}:item),choice.id);}}>Add LoRA stack</Button>}
        </div>};
    });
    return <BvManagedWindow open={open} title="BV Regional LoRA Editor" shortTitle="Regional LoRA" menuVisible={menuVisible} onMenuVisible={visible=>setWindowMenuVisible(node,visible)} initialGeometry={{width:620,height:520}} minSize={{width:420,height:320}} onClose={onClose}><div className="bv-ui bv-lora-v3-window"><Button intent="secondary" disabled={!targets.length} onClick={()=>commit([...steps,{id:crypto.randomUUID(),operation:"merge",target:targets[0].target,entries:[]}])}>Add step</Button><SortableList items={items} initialExpanded={items.map(item=>item.id)} onReorder={ordered=>{const byId=new Map(steps.map(step=>[step.id,step]));commit(ordered.map(item=>byId.get(item.id)!).filter(Boolean));}} onRemove={id=>commit(steps.filter(step=>step.id!==id))}/></div></BvManagedWindow>;
}

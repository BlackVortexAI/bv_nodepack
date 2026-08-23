import React, { useEffect, useState } from "react";
import { BvSelect } from "../ui/controls";
import { BvManagedWindow } from "../ui/window";
import { LoraV3ResourcePickerPanel, type LoraV3Config } from "./LoraV3ResourcePickerPanel";
import { addLoraV3TargetEntry, loraV3Catalog, loraV3Resolved, loraV3TargetOptions, readNodeLoraV3Config, removeLoraV3TargetEntry, setLoraV3Collector, setLoraV3EntryResource } from "./loraV3Ui";

const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);

export default function LoraV3EditorWindow({open,node,onClose}:{open:boolean;node:any|null;onClose:()=>void}){
    const [config,setConfig]=useState<LoraV3Config>(()=>readNodeLoraV3Config(node));
    useEffect(()=>{if(open&&node)setConfig(readNodeLoraV3Config(node));},[node,open]);
    if(!node)return null;
    const collectors=loraV3Catalog(node).filter(item=>item.resources.length>0),resolved=loraV3Resolved(node,config),targetOptions=loraV3TargetOptions(node);
    return <BvManagedWindow open={open} title="BV Regional LoRA Editor" initialGeometry={{width:620,height:520}} minSize={{width:420,height:320}} onClose={onClose}>
        <div className="bv-ui bv-lora-v3-window">
            <BvSelect label="Operation" value={String(widget(node,"operation")?.value??"replace")} onChange={value=>{const item=widget(node,"operation");if(item){item.value=value;item.callback?.(value);node.setDirtyCanvas?.(true,true);}}}><option value="replace">Replace</option><option value="merge">Merge</option><option value="subtract">Subtract</option><option value="clear">Clear</option></BvSelect>
            <LoraV3ResourcePickerPanel collectors={collectors} config={config} resolved={resolved} targetOptions={targetOptions} onCollector={id=>setConfig(setLoraV3Collector(node,config,id))} onResource={(entryId,id)=>setConfig(setLoraV3EntryResource(node,config,entryId,id))} onAddExternal={target=>setConfig(addLoraV3TargetEntry(node,config,target))} onRemove={(entryId,target)=>setConfig(removeLoraV3TargetEntry(node,config,entryId,target))}/>
        </div>
    </BvManagedWindow>;
}

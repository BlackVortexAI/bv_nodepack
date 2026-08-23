import React, { useEffect, useState } from "react";
import { BvSelect } from "../ui/controls";
import { BvManagedWindow } from "../ui/window";
import { LoraV3ResourcePickerPanel, type LoraV3Config } from "./LoraV3ResourcePickerPanel";
import { connectLoraConsumerTree } from "./loraV3Graph";
import { loraV3Catalog, loraV3Resolved, loraV3TargetOptions, readNodeLoraV3Config, writeNodeLoraV3Config } from "./loraV3Ui";

const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);

export default function LoraV3EditorWindow({open,node,onClose}:{open:boolean;node:any|null;onClose:()=>void}){
    const [config,setConfig]=useState<LoraV3Config>(()=>readNodeLoraV3Config(node));
    useEffect(()=>{if(open&&node)setConfig(readNodeLoraV3Config(node));},[node,open]);
    if(!node)return null;
    const collectors=loraV3Catalog(node).filter(item=>item.resources.length>0),resolved=loraV3Resolved(node,config),targetOptions=loraV3TargetOptions(node);
    const save=(next:LoraV3Config)=>{writeNodeLoraV3Config(node,next);setConfig(next);};
    return <BvManagedWindow open={open} title="BV Regional LoRA Editor" initialGeometry={{width:620,height:520}} minSize={{width:420,height:320}} onClose={onClose}>
        <div className="bv-ui bv-lora-v3-window">
            <BvSelect label="Operation" value={String(widget(node,"operation")?.value??"replace")} onChange={value=>{const item=widget(node,"operation");if(item){item.value=value;item.callback?.(value);node.setDirtyCanvas?.(true,true);}}}><option value="replace">Replace</option><option value="merge">Merge</option><option value="subtract">Subtract</option><option value="clear">Clear</option></BvSelect>
            <LoraV3ResourcePickerPanel collectors={collectors} config={config} resolved={resolved} targetOptions={targetOptions} onCollector={id=>{const choice=collectors.find(item=>item.id===id),first=choice?.resources[0]?.id??"";connectLoraConsumerTree(node,choice?.node??null);save({...config,collector_id:id||null,entries:config.entries.map(entry=>entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:first}}:entry)});}} onResource={(entryId,id)=>save({...config,entries:config.entries.map(entry=>entry.id===entryId&&entry.source.kind==="external"?{...entry,source:{...entry.source,resource_id:id}}:entry)})} onTargets={(entryId,targets)=>save({...config,entries:config.entries.map(entry=>entry.id===entryId?{...entry,targets}:entry)})} onAddExternal={()=>{const choice=collectors.find(item=>item.id===config.collector_id)??collectors[0],resource=choice?.resources[0];if(!choice||!resource)return;connectLoraConsumerTree(node,choice.node);save({...config,collector_id:choice.id,entries:[...config.entries,{id:crypto.randomUUID(),source:{kind:"external",resource_id:resource.id},targets:[{scope:"global"}]}]});}} onRemove={entryId=>{const entries=config.entries.filter(entry=>entry.id!==entryId),next={...config,collector_id:entries.some(entry=>entry.source.kind==="external")?config.collector_id:null,entries};if(!next.collector_id)connectLoraConsumerTree(node,null);save(next);}}/>
        </div>
    </BvManagedWindow>;
}

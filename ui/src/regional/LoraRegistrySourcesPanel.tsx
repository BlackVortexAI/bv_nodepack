import {useEffect,useState} from "react";
import {Button,SelectField} from "../ui/components";
import type {LoraV3Config} from "./LoraV3ResourcePickerPanel";
import {commitLoraV3Config,loraV3Catalog,loraV3CollectorIds} from "./loraV3Ui";
import {LORA_V3_INVENTORY_CHANGED_EVENT} from "./loraV3Inventory";

/** Explicit provider dependencies share the existing Registry/DG routing contract. */
export function LoraRegistrySourcesPanel({node,config,onConfig}:{node:any;config:LoraV3Config;onConfig:(config:LoraV3Config)=>void}){
    const[,refresh]=useState(0),[error,setError]=useState("");
    useEffect(()=>{const update=()=>refresh(value=>value+1);window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,update);return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,update)},[node]);
    if(!node)return null;
    const catalog=loraV3Catalog(node),selected=config.registry_ids??[];
    const change=(ids:string[])=>{try{onConfig(commitLoraV3Config(node,{...config,registry_ids:ids}));setError("")}catch(problem){setError(String(problem))}};
    return <section className="bv-inspector-section"><h3>LoRA Registry connections</h3>
        <SelectField label="Connect LoRA Registry" value="" disabled={loraV3CollectorIds(config).length>=20} options={[{value:"",label:"Choose a Registry or Collector…"},...catalog.filter(item=>!selected.includes(item.id)).map(item=>({value:item.id,label:item.label}))]} onValue={id=>{if(id)change([...selected,id])}}/>
        {selected.map(id=><div key={id}><strong>{catalog.find(item=>item.id===id)?.label??"Missing or ambiguous Registry"}</strong><Button intent="ghost" onClick={()=>change(selected.filter(value=>value!==id))}>Disconnect Registry selection</Button></div>)}
        <p className="option-hint">Connected Registries apply their Global LoRAs automatically. Regional stacks remain optional. A Registry still used by a manual stack stays connected.</p>
        {error&&<p role="alert">{error}</p>}
    </section>;
}

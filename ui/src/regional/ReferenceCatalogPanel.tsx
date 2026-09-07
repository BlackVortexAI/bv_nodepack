import React,{useEffect,useState} from "react";
import {BvSelect} from "../ui/controls";
import {Button} from "../ui/components";
import {commitReferenceSelection,MAX_REFERENCE_COLLECTORS,readReferenceSelection,referenceRegistryCatalog,REFERENCE_INVENTORY_EVENT} from "./referenceRegistryGraph";

/** Collector selection only. Per-region reference assignment is a later stage. */
export default function ReferenceCatalogPanel({node}:{node:any}){
    const [,refresh]=useState(0),[error,setError]=useState("");
    useEffect(()=>{const update=()=>refresh(value=>value+1);window.addEventListener(REFERENCE_INVENTORY_EVENT,update);return()=>window.removeEventListener(REFERENCE_INVENTORY_EVENT,update)},[node]);
    if(!node)return null;
    let selected:string[],catalog:ReturnType<typeof referenceRegistryCatalog>;
    try{selected=readReferenceSelection(node).collector_ids;catalog=referenceRegistryCatalog(node)}catch(problem){return <p role="alert">{String(problem)}</p>}
    const change=(ids:string[])=>{try{commitReferenceSelection(node,{version:1,collector_ids:ids});setError("");refresh(value=>value+1)}catch(problem){setError(String(problem))}};
    return <section className="bv-inspector-section"><h3>Reference Registries</h3>
        <BvSelect label="Add Reference Registry" value="" disabled={selected.length>=MAX_REFERENCE_COLLECTORS} onChange={id=>{if(id)change([...selected,id])}}>
            <option value="">Choose a registry…</option>{catalog.filter(item=>!selected.includes(item.id)).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
        </BvSelect>
        {selected.map(id=>{const source=catalog.find(item=>item.id===id);return <div key={id}>
            <strong>{source?.label??"Unavailable Reference Registry"}</strong>
            <Button intent="ghost" onClick={()=>change(selected.filter(value=>value!==id))}>Remove</Button>
            <p className="option-hint">{source?source.resources.map(item=>item.label).join(", ")||"No connected media.":"The selected registry is missing or ambiguous."}</p>
        </div>})}
        <p className="option-hint">Available references only. Regional assignment and model application follow separately.</p>
        {error&&<p role="alert">{error}</p>}
    </section>;
}

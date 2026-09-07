import React,{useState} from "react";
import {Callout,ImagePicker} from "../ui/components";
import type {RegionalDocument} from "./model";
import {useReferencePromptCatalog} from "./referencePromptCatalog";
import {commitReferenceSelection,readReferenceSelection} from "./referenceRegistryGraph";

/** Shared global reference assignment for full and quick editing. */
export default function ReferenceToolsPanel({node,value,onValue}:{node:any;value:RegionalDocument["reference_images"];onValue:(value:RegionalDocument["reference_images"])=>void}){
    const [error,setError]=useState("");
    const choices=useReferencePromptCatalog(node).filter(item=>item.media_type==="IMAGE");
    const selected=value?.[0];
    const key=(item:{collector_id:string;resource_id:string})=>`${item.collector_id}/${item.resource_id}`;
    const active=choices.find(item=>selected&&key(item)===key(selected));
    return <div className="bv-ui-stack"><ImagePicker label="Source image" value={selected?key(selected):""} options={[
        {id:"",name:"Choose an image…"},
        ...(selected&&!active?[{id:key(selected),name:"Unavailable image",disabled:true}]:[]),
        ...choices.map(choice=>({id:key(choice),name:choice.label,meta:choice.origin+(choice.available?"":" (disconnected)"),src:choice.preview,disabled:!choice.available})),
    ]} onValue={id=>{
        try{
        const choice=choices.find(item=>key(item)===id);
        if(choice){const current=readReferenceSelection(node);commitReferenceSelection(node,{...current,collector_ids:[...new Set([...current.collector_ids,choice.collector_id])]});}
        onValue(choice?[{collector_id:choice.collector_id,resource_id:choice.resource_id,role:"source"}]:[]);
        setError("");
        }catch(problem){setError(problem instanceof Error?problem.message:String(problem));}
    }}/>
    {error&&<Callout tone="danger" title="Reference selection unavailable">{error}</Callout>}
    <p className="option-hint">Source for Krea 2 Identity Edit. Use the global prompt to describe the edit.</p></div>;
}

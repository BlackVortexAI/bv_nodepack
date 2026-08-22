import { useState } from "react";
import { Button, Dialog, TextareaField } from "./components";
import { showBvToast } from "./toastStore";

export function DraftJsonActions({label,value,onImport,allowImport=true}:{label:string;value:unknown;onImport:(value:unknown)=>void;allowImport?:boolean}){
    const [open,setOpen]=useState(false),[text,setText]=useState(""),[error,setError]=useState("");
    const copy=async()=>{try{await navigator.clipboard.writeText(JSON.stringify(value,null,2));showBvToast({title:"Draft copied",message:`${label} draft JSON was copied to the clipboard.`,tone:"success",duration:4000})}catch{showBvToast({title:"Clipboard unavailable",message:"Copy the draft from the import/export dialog instead.",tone:"warning",duration:4000});setText(JSON.stringify(value,null,2));setOpen(true)}};
    const importValue=()=>{try{const parsed=JSON.parse(text);onImport(parsed);setOpen(false);setError("")}catch(caught){setError(caught instanceof Error?caught.message:"Invalid draft JSON")}};
    const showImport=()=>{setText("");setError("");setOpen(true)};
    return <><Button intent="ghost" onClick={copy}>Copy draft</Button>{allowImport&&<Button intent="ghost" onClick={showImport}>Import draft</Button>}<Dialog open={open} title={`Import ${label} draft`} description="Imported JSON updates only the editor draft. Save explicitly to update the workflow." onClose={()=>setOpen(false)} footer={<><Button intent="ghost" iconOnly aria-label="Paste from clipboard" title="Paste from clipboard" onClick={async()=>{try{setText(await navigator.clipboard.readText())}catch{setError("Clipboard permission was not granted.")}}}>⌘</Button><Button intent="primary" onClick={importValue}>Import draft</Button></>}><TextareaField label="Draft JSON" value={text} rows={14} resize="vertical" error={error} onValue={setText}/></Dialog></>;
}

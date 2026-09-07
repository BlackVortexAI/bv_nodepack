import {useEffect,useState} from "react";
import {inputImagePreview,type InputImagePreview} from "./inputImagePreview";
/** Scoped read-only refresh; no native callbacks or workflow state are modified. */
export function useInputImagePreview(node:any,inputName:string,apiURL:(path:string)=>string,open:boolean){
    const [snapshot,setSnapshot]=useState<{node:any;value:InputImagePreview|null}>({node:null,value:null});
    useEffect(()=>{
        if(!open)return;
        const refresh=()=>{const value=inputImagePreview(node,inputName,apiURL);setSnapshot(old=>old.node===node&&old.value?.src===value?.src&&old.value?.previous===value?.previous?old:{node,value})};
        refresh();const timer=window.setInterval(refresh,250);
        return()=>window.clearInterval(timer);
    },[node,inputName,apiURL,open]);
    return open&&snapshot.node===node?snapshot.value:null;
}

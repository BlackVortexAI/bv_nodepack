import {useEffect,useState} from "react";
import {observeImageDimensions,type ImageDimensions} from "./imageDimensions";
export function useImageDimensions(src:string|undefined,scope:unknown,enabled=true){
 const [snapshot,setSnapshot]=useState<{src:string;scope:unknown;value:ImageDimensions|null}|null>(null);
 useEffect(()=>{if(!src||!enabled)return;return observeImageDimensions(src,value=>setSnapshot({src,scope,value}))},[src,scope,enabled]);
 return enabled&&snapshot&&snapshot.src===src&&snapshot.scope===scope?snapshot.value:null;
}

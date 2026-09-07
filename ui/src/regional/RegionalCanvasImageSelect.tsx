import React from "react";
import {CONNECTED_IMAGE_SELECTION,type InputImagePreview} from "./inputImagePreview";
import { ImagePicker, type ImageOption } from "../ui/components";
import { LAST_SENT_IMAGE_SELECTION, regionalCanvasImageUrl, type RegionalCanvasImageItem } from "./regionalCanvasImages";

const sourceLabel=(kind:RegionalCanvasImageItem["sourceKind"])=>kind==="regional-image-save"?"Save":kind==="regional-prompt-canvas"?"Prompt":"Send";

export function regionalCanvasImageOptions(images:RegionalCanvasImageItem[],selection:string,apiURL:(path:string)=>string,input:InputImagePreview|null=null):ImageOption[]{
    const missing=selection!==CONNECTED_IMAGE_SELECTION&&selection!==LAST_SENT_IMAGE_SELECTION&&!images.some(image=>image.id===selection);
    const latest=images.length?images[images.length-1]:null,latestUrl=regionalCanvasImageUrl(latest,apiURL);
    const batchKey=(image:RegionalCanvasImageItem)=>JSON.stringify([image.sourceKind,image.sourceId,image.batchId]);
    const batchSizes=new Map<string,number>();
    images.forEach(image=>batchSizes.set(batchKey(image),(batchSizes.get(batchKey(image))??0)+1));
    return[
        {id:CONNECTED_IMAGE_SELECTION,name:input?(input.previous?"Input image · Previous preview":"Input image"):"Input image · Unavailable",...(input?{src:input.src}:{})},
        {id:LAST_SENT_IMAGE_SELECTION,name:"Last Sent Image",...(latestUrl?{src:latestUrl}: {})},
        ...(missing?[{id:selection,name:"Source unavailable",disabled:true}]:[]),
        ...images.map(image=>{const src=regionalCanvasImageUrl(image,apiURL),multiple=(batchSizes.get(batchKey(image))??0)>1,suffix=multiple?` · Image ${image.index+1}`:"";return{id:image.id,name:`${sourceLabel(image.sourceKind)} #${image.sourceId}${suffix}`,src,thumbnail:src}}),
    ];
}

export default function RegionalCanvasImageSelect({images,selection,onSelection,apiURL,input=null}:{images:RegionalCanvasImageItem[];selection:string;onSelection:(value:string)=>void;apiURL:(path:string)=>string;input?:InputImagePreview|null}){
    return <ImagePicker className="bv-canvas-image-select" label="Canvas image" labelVisible={false} largePreview={false} value={selection} options={regionalCanvasImageOptions(images,selection,apiURL,input)} onValue={onSelection}/>;
}

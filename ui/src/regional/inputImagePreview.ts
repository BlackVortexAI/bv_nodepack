import { resolveNativeInputSource } from "./regionalNativeSource";
export const CONNECTED_IMAGE_SELECTION="connected-input-image";
export type InputImagePreview={src:string;previous:boolean};
/** Only inspect the actual connected output. Never walk through image processing nodes. */
export function inputImagePreview(node:any,inputName:string,apiURL:(path:string)=>string):InputImagePreview|null {
    const index=node?.inputs?.findIndex((slot:any)=>slot.name===inputName)??-1;
    if(index<0)return null;
    const source=resolveNativeInputSource(node,index);
    if(!source||source.node.mode===2||source.node.mode===4||source.node.outputs?.[source.outputIndex]?.type!=="IMAGE")return null;
    const upstream=source.node;
    if(String(upstream.comfyClass??upstream.type)==="LoadImage"){
        const imageInput=upstream.inputs?.find((slot:any)=>slot.name==="image");
        if(imageInput?.link!=null)return null;
        const value=upstream.widgets?.find((widget:any)=>widget.name==="image")?.value;
        if(typeof value!=="string"||!value.trim())return null;
        const match=value.match(/^(.*) \[(input|output|temp)\]$/),path=(match?match[1]:value).replace(/\\/g,"/");
        if(path.startsWith("/")||path.includes(":")||path.split("/").some(part=>part===".."))return null;
        const split=path.lastIndexOf("/"),filename=path.slice(split+1);if(!filename)return null;
        const query=new URLSearchParams({filename,subfolder:split<0?"":path.slice(0,split),type:match?.[2]??"input"});
        return {src:apiURL(`/view?${query}`),previous:false};
    }
    if(upstream.outputs.filter((slot:any)=>slot.type==="IMAGE").length!==1)return null;
    const image=upstream.imgs?.[0],src=image?.src;
    return typeof src==="string"&&/^(https?:|blob:|data:image\/)/.test(src)?{src,previous:true}:null;
}

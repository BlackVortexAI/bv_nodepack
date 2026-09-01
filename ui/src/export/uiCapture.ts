import { domToBlob } from "modern-screenshot";
import { assertCanvasSize, normalizeExportOptions, safeFilename, suggestedFilename, type ExportOptions, type ExportResult } from "./model";
import { embedWorkflow } from "./pngMetadata";
import { getUiCaptureSource } from "./captureRegistry";
import { copyLiveDomState } from "./domRaster";

const visible=(node:HTMLElement)=>{const rect=node.getBoundingClientRect(),style=getComputedStyle(node);return rect.width>0&&rect.height>0&&style.display!=="none"&&style.visibility!=="hidden"};
const backgroundStyle=(background:string)=>background==="bv-grid"?{
    backgroundColor:"#0f1217",backgroundImage:"linear-gradient(rgba(35,48,68,.333) 1px, transparent 1px),linear-gradient(90deg,rgba(35,48,68,.333) 1px,transparent 1px)",backgroundSize:"28px 28px"
}:background==="comfyui"?{background:getComputedStyle(document.body).background}: {background:"transparent"};

export function uiExportBounds(id:string,padding=32){
    const source=getUiCaptureSource(id);if(!source)throw new Error("The selected BV UI window is no longer open.");
    const related=[source.element,...document.querySelectorAll<HTMLElement>(`[data-bv-capture-owner="${CSS.escape(id)}"]`)].filter(visible).filter(node=>!node.matches(".bv-context-menu,[data-bv-export-ui],.bv-toast-stack,.bv-completion-popup"));
    const rects=related.map(node=>node.getBoundingClientRect()),left=Math.min(...rects.map(rect=>rect.left))-padding,top=Math.min(...rects.map(rect=>rect.top))-padding,right=Math.max(...rects.map(rect=>rect.right))+padding,bottom=Math.max(...rects.map(rect=>rect.bottom))+padding;
    return {source,related,left,top,right,bottom,width:right-left,height:bottom-top};
}

export async function captureUi(app:any,id:string,raw:ExportOptions={}):Promise<ExportResult>{
    const options=normalizeExportOptions({...raw,source:`ui:${id}`}),bounds=uiExportBounds(id,options.padding),width=Math.ceil(bounds.width*options.scale),height=Math.ceil(bounds.height*options.scale);
    assertCanvasSize(width,height);await document.fonts?.ready;
    const host=document.createElement("div");host.className="bv-ui bv-export-capture-host";host.dataset.bvExportCapture="true";
    Object.assign(host.style,{position:"fixed",left:"-100000px",top:"0",width:`${bounds.width}px`,height:`${bounds.height}px`,overflow:"hidden",pointerEvents:"none",...backgroundStyle(options.background)});
    document.body.append(host);
    try{
        for(const original of bounds.related){const rect=original.getBoundingClientRect(),clone=original.cloneNode(true) as HTMLElement;Object.assign(clone.style,{position:"absolute",left:`${rect.left-bounds.left}px`,top:`${rect.top-bounds.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,margin:"0",transform:"none"});copyLiveDomState(original,clone);host.append(clone)}
        await Promise.all([...host.querySelectorAll("img")].map(async image=>{try{if(!image.complete)await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error("image load failed"))});await image.decode?.()}catch{throw new Error(`A visible image in ${bounds.source.title} could not be decoded.`)}}));
        let blob=await domToBlob(host,{scale:options.scale,backgroundColor:null,maximumCanvasSize:16384,timeout:30000,filter:node=>!(node instanceof Element)||!node.matches(".bv-context-menu,[data-bv-export-ui],.bv-toast-stack,.bv-completion-popup")});
        if(!blob)throw new Error("The browser failed to rasterize the BV UI.");
        if(options.embedWorkflow){if(!bounds.source.rootGraph||bounds.source.rootGraph!==app?.graph)throw new Error("Workflow embedding is unavailable because the UI workflow owner cannot be proven.");blob=await embedWorkflow(blob,JSON.stringify(bounds.source.rootGraph.serialize()))}
        const workflowName=String(app?.workflowManager?.activeWorkflow?.filename??app?.workflowManager?.activeWorkflow?.name??"workflow"),uiName=safeFilename(bounds.source.title,"bv-ui");
        return {blob,filename:options.filename??suggestedFilename(workflowName,`ui:${uiName}`),width,height};
    }finally{host.remove()}
}

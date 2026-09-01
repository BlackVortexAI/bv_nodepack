import { rasterizeDomElement } from "./domRaster";
import type { ExportRect } from "./model";

export type GraphDomLayer={kind:"node"|"widget";node:any;element:any;widget?:any};
type LayerResolvers={nodeRootOf:(node:any)=>any|null;widgetRootsOf:(node:any)=>any[]};
type ImageAdapter={isImage:(value:any)=>boolean;imagesIn:(element:any)=>any[];sourceOf:(image:any)=>string};

const elementVisible=(element:HTMLElement)=>{
    const rect=element.getBoundingClientRect(),style=getComputedStyle(element);
    return element.isConnected&&rect.width>0&&rect.height>0&&style.display!=="none"&&style.visibility!=="hidden";
};

const defaultNodeRootOf=(node:any)=>{
    if(typeof document==="undefined")return null;
    const id=String(node?.id),matches=[...document.querySelectorAll<HTMLElement>('[data-testid="transform-pane"] .lg-node[data-node-id]')].filter(element=>element.dataset.nodeId===id&&elementVisible(element));
    if(matches.length>1)throw new Error(`Graph export found multiple active Nodes 2 surfaces for node ${id}.`);
    return matches[0]??null;
};

const defaultWidgetRootsOf=(node:any)=>{
    const roots:any[]=[],seen=new Set<any>();
    for(const widget of node?.widgets??[]){
        const element=widget?.element??widget?.inputEl;if(!element)continue;
        if(typeof widget?.isVisible==="function"&&!widget.isVisible())continue;
        const root=typeof element.closest==="function"?element.closest(".dom-widget")??element:element;
        if(!seen.has(root)){seen.add(root);roots.push({element:root,widget})}
    }
    return roots;
};

export function planGraphDomLayers(nodes:any[],resolvers:Partial<LayerResolvers>={}){
    const nodeRootOf=resolvers.nodeRootOf??defaultNodeRootOf,widgetRootsOf=resolvers.widgetRootsOf??defaultWidgetRootsOf,layers:GraphDomLayer[]=[],suppressCanvasNodes=new Set<any>();
    for(const node of nodes){
        const root=nodeRootOf(node);
        if(root){layers.push({kind:"node",node,element:root});suppressCanvasNodes.add(node);continue}
        for(const entry of widgetRootsOf(node)){const owned=entry?.widget&&entry?.element?entry:{element:entry,widget:undefined};layers.push({kind:"widget",node,element:owned.element,widget:owned.widget})}
    }
    return {layers,suppressCanvasNodes};
}

export function clientRectToExportRect(rect:{left:number;top:number;width:number;height:number},canvasRect:{left:number;top:number},ds:{offset:ArrayLike<number>;scale:number},bounds:ExportRect,exportScale:number):ExportRect{
    if(!Number.isFinite(ds.scale)||ds.scale<=0)throw new Error("The active ComfyUI canvas has an invalid zoom scale.");
    const graphLeft=(rect.left-canvasRect.left)/ds.scale-Number(ds.offset[0]),graphTop=(rect.top-canvasRect.top)/ds.scale-Number(ds.offset[1]);
    const left=(graphLeft-bounds.left)*exportScale,top=(graphTop-bounds.top)*exportScale,width=rect.width/ds.scale*exportScale,height=rect.height/ds.scale*exportScale;
    return {left,top,right:left+width,bottom:top+height,width,height};
}

const defaultImageAdapter:ImageAdapter={
    isImage:value=>typeof HTMLImageElement!=="undefined"&&value instanceof HTMLImageElement,
    imagesIn:element=>typeof element?.querySelectorAll==="function"?[...element.querySelectorAll("img")].filter((image:any)=>!(image instanceof HTMLElement)||elementVisible(image)):[],
    sourceOf:image=>String(image?.currentSrc||image?.src||"")
};

const awaitImage=async(image:any)=>{
    if(!image.complete)await new Promise<void>((resolve,reject)=>{const timeout=window.setTimeout(()=>reject(new Error("image load timed out")),8000),done=(callback:()=>void)=>{window.clearTimeout(timeout);callback()};image.addEventListener("load",()=>done(resolve),{once:true});image.addEventListener("error",()=>done(()=>reject(new Error("load failed"))),{once:true});});
    await image.decode?.();
};

export async function awaitGraphCaptureImages(nodes:any[],layers:Array<Pick<GraphDomLayer,"element">>,adapter:Partial<ImageAdapter>={}){
    const imageAdapter={...defaultImageAdapter,...adapter},images=new Set<any>();
    for(const node of nodes)for(const image of Array.isArray(node?.imgs)?node.imgs:[])if(imageAdapter.isImage(image))images.add(image);
    for(const layer of layers)for(const image of imageAdapter.imagesIn(layer.element))if(imageAdapter.isImage(image))images.add(image);
    const failures:string[]=[];
    await Promise.all([...images].map(async image=>{try{await awaitImage(image)}catch{failures.push(imageAdapter.sourceOf(image)||"(unknown source)")}}));
    if(failures.length)throw new Error(`${failures.length} visible graph preview image${failures.length===1?"":"s"} could not be decoded: ${failures.join(", ")}`);
}

export const settleGraphDomSurfaces=async()=>{await Promise.resolve();await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))};

export const nodeDomGraphRect=(node:any,element:any,canvas?:any,titleHeight=Number((globalThis as any).LiteGraph?.NODE_TITLE_HEIGHT??30)):ExportRect|null=>{
    const pos=node?.pos??node?._pos,left=Number(pos?.[0]),top=Number(pos?.[1])-titleHeight,clientRect=element?.getBoundingClientRect?.(),zoom=Number(canvas?.ds?.scale);
    const width=Number(element?.offsetWidth)>0?Number(element.offsetWidth):Number(clientRect?.width)/(Number.isFinite(zoom)&&zoom>0?zoom:1);
    const height=Number(element?.offsetHeight)>0?Number(element.offsetHeight):Number(clientRect?.height)/(Number.isFinite(zoom)&&zoom>0?zoom:1);
    if(![left,top,width,height,titleHeight].every(Number.isFinite)||width<=0||height<=0)return null;
    return {left,top,right:left+width,bottom:top+height,width,height};
};

export const widgetGraphRect=(node:any,widget:any):ExportRect|null=>{
    if(!widget)return null;
    const pos=node?.pos??node?._pos,size=node?.size??node?._size,margin=Number(widget?.margin??widget?.options?.margin??10),left=Number(pos?.[0])+margin,top=Number(pos?.[1])+margin+Number(widget?.y??0),width=Number(widget?.width??node?.width??size?.[0])-margin*2,height=Number(widget?.computedHeight??50)-margin*2;
    if(![left,top,width,height].every(Number.isFinite)||width<=0||height<=0)return null;
    return {left,top,right:left+width,bottom:top+height,width,height};
};

export const graphDomExportRects=(layers:GraphDomLayer[],canvas:any)=>layers.map(layer=>{
    const rect=layer.kind==="node"?nodeDomGraphRect(layer.node,layer.element,canvas):widgetGraphRect(layer.node,layer.widget);
    if(!rect)return null;
    const inset=layer.kind==="node"?12:0;
    return {left:rect.left-inset,top:rect.top-inset,right:rect.right+inset,bottom:rect.bottom+inset,width:rect.width+inset*2,height:rect.height+inset*2};
}).filter((rect):rect is ExportRect=>!!rect);

const sanitizeGraphClone=(clone:HTMLElement)=>{
    clone.classList.remove("outline-node-component-outline");clone.style.outline="none";
    for(const overlay of clone.querySelectorAll<HTMLElement>('[data-testid="node-state-outline-overlay"]'))if(overlay.classList.contains("border-node-component-outline"))overlay.remove();
    for(const handle of clone.querySelectorAll<HTMLElement>("[data-corner]"))handle.remove();
};
const sanitizeWidgetClone=(clone:HTMLElement)=>{clone.style.display="block";clone.style.visibility="visible";clone.style.clipPath="none"};

export async function rasterizeGraphDomLayers(layers:GraphDomLayer[],canvas:any,bounds:ExportRect,scale:number){
    const canvasRect=canvas.canvas.getBoundingClientRect(),ordered=[...layers].sort((a,b)=>{
        const az=Number.parseInt(getComputedStyle(a.element).zIndex)||0,bz=Number.parseInt(getComputedStyle(b.element).zIndex)||0;if(az!==bz)return az-bz;
        if(a.element===b.element||!a.element?.isConnected||!b.element?.isConnected)return 0;
        const position=a.element.compareDocumentPosition?.(b.element)??0;
        if(position&Node.DOCUMENT_POSITION_DISCONNECTED)return 0;
        if(position&Node.DOCUMENT_POSITION_FOLLOWING)return -1;
        if(position&Node.DOCUMENT_POSITION_PRECEDING)return 1;
        return 0;
    }),result:Array<{canvas:HTMLCanvasElement;rect:ExportRect}> = [];
    for(const layer of ordered){
        const graphRect=layer.kind==="node"?nodeDomGraphRect(layer.node,layer.element,canvas):widgetGraphRect(layer.node,layer.widget),rect=graphRect?{left:(graphRect.left-bounds.left)*scale,top:(graphRect.top-bounds.top)*scale,right:(graphRect.right-bounds.left)*scale,bottom:(graphRect.bottom-bounds.top)*scale,width:graphRect.width*scale,height:graphRect.height*scale}:clientRectToExportRect(layer.element.getBoundingClientRect(),canvasRect,canvas.ds,bounds,scale);
        const padding=layer.kind==="node"?12:0,bitmap=await rasterizeDomElement(layer.element,rect.width/scale,rect.height/scale,scale,{padding,sanitize:layer.kind==="node"?sanitizeGraphClone:sanitizeWidgetClone});
        result.push({canvas:bitmap,rect:{left:rect.left-padding*scale,top:rect.top-padding*scale,right:rect.right+padding*scale,bottom:rect.bottom+padding*scale,width:rect.width+padding*scale*2,height:rect.height+padding*scale*2}});
    }
    return result;
}

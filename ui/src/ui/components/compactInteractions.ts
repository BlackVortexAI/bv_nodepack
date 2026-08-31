export type StableIdItem={id:string};
export type ReorderPlacement="before"|"after";
export const HOVER_PREVIEW_MAX_SIZE:Readonly<{width:number;height:number}>=Object.freeze({width:240,height:320});

const finite=(value:number,fallback:number)=>Number.isFinite(value)?value:fallback;
const rounded=(value:number)=>Math.round(value*10000)/10000;

export function numberScrubDelta(deltaX:number,sensitivity=.01,step=0){
    const raw=finite(deltaX,0)*finite(sensitivity,.01),quantum=Math.abs(finite(step,0));
    return rounded(quantum>0?Math.round(raw/quantum)*quantum:raw);
}

export function numberScrubValue(origin:number,deltaX:number,sensitivity=.01,min=-5,max=5,step=0){
    const start=finite(origin,0),delta=finite(deltaX,0),rate=finite(sensitivity,.01),low=Math.min(min,max),high=Math.max(min,max);
    return rounded(Math.max(low,Math.min(high,start+numberScrubDelta(delta,rate,step))));
}

export function createScrubSnapshotSession<T>(clone:(value:T)=>T=(value)=>structuredClone(value)){
    let snapshot:T|null=null;
    return{
        start(value:T){snapshot=clone(value)},
        end(){snapshot=null},
        cancel(restore:(value:T)=>void){if(snapshot!==null)restore(snapshot);snapshot=null},
        active(){return snapshot!==null},
    };
}

export function reorderByStableId<T extends StableIdItem>(items:T[],sourceId:string,targetId:string,placement:ReorderPlacement="before"):T[]{
    if(sourceId===targetId)return items;
    const source=items.findIndex(item=>item.id===sourceId),target=items.findIndex(item=>item.id===targetId);
    if(source<0||target<0)return items;
    const next=[...items],[moved]=next.splice(source,1),remainingTarget=next.findIndex(item=>item.id===targetId);
    next.splice(remainingTarget+(placement==="after"?1:0),0,moved);
    return next;
}

export function fitHoverPreviewSize(natural:{width:number;height:number},bounds=HOVER_PREVIEW_MAX_SIZE){
    const width=finite(natural.width,0),height=finite(natural.height,0),maxWidth=Math.max(0,finite(bounds.width,HOVER_PREVIEW_MAX_SIZE.width)),maxHeight=Math.max(0,finite(bounds.height,HOVER_PREVIEW_MAX_SIZE.height));
    if(width<=0||height<=0||maxWidth<=0||maxHeight<=0)return{width:maxWidth,height:maxHeight};
    const scale=Math.min(1,maxWidth/width,maxHeight/height);
    return{width:Math.round(width*scale),height:Math.round(height*scale)};
}

export function placeHoverPreview(pointer:{x:number;y:number},size:{width:number;height:number},viewport:{width:number;height:number},margin=8,gap=16){
    const{width,height}=fitHoverPreviewSize(size,{width:Math.max(0,viewport.width-margin*2),height:Math.max(0,viewport.height-margin*2)});
    const preferredLeft=pointer.x+gap,flippedLeft=pointer.x-gap-width;
    const left=Math.max(margin,Math.min(preferredLeft+width<=viewport.width-margin?preferredLeft:flippedLeft,viewport.width-width-margin));
    const preferredTop=pointer.y-gap,top=Math.max(margin,Math.min(preferredTop,viewport.height-height-margin));
    return{left:Math.round(left),top:Math.round(top),width,height};
}

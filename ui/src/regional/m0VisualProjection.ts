import { canvasLegacyDragType, legacyDebugVisible, refreshLegacyDragPorts } from "./legacyPorts";
import { M0_PROVIDER_SLOT_HEIGHT } from "./m0GraphContract";
import { providerTitlebarAnchor, providerBoundaryAnchor } from "./providerProjectionGeometry";
import { installProjectedPortCanvasInteraction } from "./projectedPortInteraction";
import { withDgLineStyle } from "./dgLineStyle";

const M0_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER_M0";
const V3_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
const providerType=(value:unknown)=>value===M0_PROVIDER_TYPE||value===V3_PROVIDER_TYPE;
const slotValue=(slot:any)=>slot?.slot??slot;
const projectedBoundarySlot=(slot:any)=>{
    const value=slotValue(slot);
    return providerType(value?.type)||value?.__bvM0PortHidden===true||value?.__bvM0ResourceSlot===true||value?.__bvDgAnchor===true||slot?.__bvM0PortHidden===true||slot?.__bvM0ResourceSlot===true||slot?.__bvDgAnchor===true;
};
type M0Slot = { name?:string; label?:string; localized_name?:string; type?:string; hidden?:boolean; __bvM0VisualHidden?: boolean; __bvM0PortHidden?:boolean; __bvM0ResourceSlot?: boolean; link?: unknown; links?:unknown[]|null; draw?:(...args:any[])=>unknown; drawCollapsed?:(...args:any[])=>unknown };
type M0Node = { id?: string|number; inputs?: M0Slot[]; outputs?: M0Slot[]; properties?:Record<string,unknown>; __bvM0ResourceConsumer?:boolean; __bvM0FanInAnchorSlot?:number; __bvM0FanInPoint?:Readonly<[number,number]>; __bvM0ElementMarkRevision?:number; getConnectionPos?:(input:boolean,slot:number)=>Readonly<[number,number]> };
type DebugAnimationState={running:boolean;graph:any};
const debugAnimations=new WeakMap<object,DebugAnimationState>();
// Draw-local canonical slots: native front draws temporarily see filtered arrays.
// Endpoint projection must not pair those filtered indices with real definitions.
const originalBoundarySlots=new WeakMap<object,any[]>();

function workflowHasM0Debug(graph:any){
    return legacyDebugVisible()||(graph?._nodes??[]).some((node:M0Node)=>node.__bvM0ResourceConsumer===true&&Boolean(node.properties?.bvM0DebugVisible));
}

function graphLinks(graph:any){
    const links=graph?._links??graph?.links;
    if(!links)return[];
    return typeof links.values==="function"?[...links.values()]:Object.values(links);
}

function specialIoSlot(graph:any,nodeId:unknown,slotIndex:unknown,direction:"origin"|"target"){
    const index=Number(slotIndex);
    if(!Number.isInteger(index)||index<0)return null;
    const linkedNode=graph?.getNodeById?.(nodeId);
    if(direction==="origin"&&(linkedNode===graph?.inputNode||String(nodeId)===String(graph?.inputNode?.id))){
        return graph?.inputs?.[index]??graph?.inputNode?.slots?.[index]??graph?.inputNode?.outputs?.[index]??null;
    }
    if(direction==="target"&&(linkedNode===graph?.outputNode||String(nodeId)===String(graph?.outputNode?.id))){
        return graph?.outputs?.[index]??graph?.outputNode?.slots?.[index]??graph?.outputNode?.inputs?.[index]??null;
    }
    return null;
}

function endpointSlot(graph:any,nodeId:unknown,slotIndex:unknown,direction:"origin"|"target"){
    const special=specialIoSlot(graph,nodeId,slotIndex,direction);
    if(special)return special;
    const node=graph?.getNodeById?.(nodeId);
    const index=Number(slotIndex),slot=direction==="origin"?node?.outputs?.[index]:node?.inputs?.[index],child=(()=>{try{return node?.subgraph??node?.getSubgraph?.()}catch{return node?.subgraph}})(),boundary=direction==="origin"?child?.outputs?.[index]:child?.inputs?.[index];
    return providerType(boundary?.type)||boundary?.__bvM0PortHidden?boundary:slot;
}

function projectedEndpoint(graph:any,nodeId:unknown,direction:"origin"|"target",fallback:Readonly<[number,number]>){
    const linkedNode=graph?.getNodeById?.(nodeId);
    const boundaryNode=direction==="origin"&&(linkedNode===graph?.inputNode||String(nodeId)===String(graph?.inputNode?.id))
        ?graph?.inputNode
        :direction==="target"&&(linkedNode===graph?.outputNode||String(nodeId)===String(graph?.outputNode?.id))
            ?graph?.outputNode:null;
    if(boundaryNode&&fallback){
        const definitions=direction==="origin"?(graph?.inputs??[]):(graph?.outputs??[]),boundarySlots=originalBoundarySlots.get(boundaryNode)??boundaryNode?.allSlots??boundaryNode?.slots??[],ordinaryIndex=boundarySlots.findIndex((slot:any,index:number)=>!projectedBoundarySlot(slot)&&!projectedBoundarySlot(definitions[index])),ordinarySlot=slotValue(boundarySlots[ordinaryIndex]??definitions[ordinaryIndex]??boundaryNode.emptySlot);
        const ordinaryAnchor=providerBoundaryAnchor(ordinarySlot?.pos);if(ordinaryAnchor)return ordinaryAnchor;
        const connectionIndex=direction==="origin"&&ordinaryIndex>=0
            ?definitions.slice(0,ordinaryIndex+1).filter((slot:any)=>!projectedBoundarySlot(slot)).length-1
            :ordinaryIndex;
        if(connectionIndex>=0&&typeof boundaryNode.getConnectionPos==="function")try{const point=boundaryNode.getConnectionPos(direction==="target",connectionIndex);if(Number.isFinite(Number(point?.[0]))&&Number.isFinite(Number(point?.[1])))return[Number(point[0]),Number(point[1])-M0_PROVIDER_SLOT_HEIGHT] as const}catch{}
        return[fallback[0],fallback[1]-M0_PROVIDER_SLOT_HEIGHT] as const;
    }
    return providerTitlebarAnchor(linkedNode,direction==="origin"?"output":"input")??fallback;
}

/** Classifies one real, graph-owned provider segment without bridging graph boundaries. */
export function projectedProviderLink(graph:any,link:any){
    if(!link)return false;
    const output=endpointSlot(graph,link.origin_id,link.origin_slot,"origin");
    const input=endpointSlot(graph,link.target_id,link.target_slot,"target");
    return Boolean((output?.__bvM0ResourceSlot||providerType(output?.type))&&(input?.__bvM0ResourceSlot||providerType(input?.type)));
}

function workflowHasConnectedResourceLink(graph:any){
    if(graphLinks(graph).some(link=>projectedProviderLink(graph,link)))return true;
    const nodes=(graph?._nodes??[]) as M0Node[];
    const providerInputLinks=new Set<unknown>();
    for(const node of nodes)for(const slot of node.inputs??[]){
        if((slot.__bvM0ResourceSlot||providerType(slot.type))&&slot.link!=null)providerInputLinks.add(slot.link);
    }
    return providerInputLinks.size>0&&nodes.some(node=>(node.outputs??[]).some(slot=>
        (slot.__bvM0ResourceSlot||providerType(slot.type))&&(slot.links??[]).some(link=>providerInputLinks.has(link))
    ));
}

function hiddenLink(canvas:any,link:any) {
    if (!link) return false;
    const origin=canvas.graph?.getNodeById?.(link.origin_id) as M0Node|undefined;
    const target=canvas.graph?.getNodeById?.(link.target_id) as M0Node|undefined;
    if(origin?.outputs?.[link.origin_slot]?.type===V3_PROVIDER_TYPE||target?.inputs?.[link.target_slot]?.type===V3_PROVIDER_TYPE)return !legacyDebugVisible();
    if(resourceLink(canvas,link))return !workflowHasM0Debug(canvas.graph);
    return Boolean(origin?.outputs?.[link.origin_slot]?.__bvM0VisualHidden||target?.inputs?.[link.target_slot]?.__bvM0VisualHidden);
}

function resourceLink(canvas:any,link:any) {
    return projectedProviderLink(canvas?.graph,link);
}

export function requestM0DebugAnimation(canvas:any){
    if(!canvas||typeof requestAnimationFrame!=="function")return;
    const existing=debugAnimations.get(canvas);
    if(existing?.running)return;
    const state:DebugAnimationState=existing??{running:false,graph:undefined};
    state.running=true;state.graph=canvas.graph;debugAnimations.set(canvas,state);
    canvas.__bvM0DebugAnimation=true;
    const frame=()=>{
        const surface=canvas.canvas;
        const detached=surface&&"isConnected"in surface&&surface.isConnected===false;
        if(canvas.graph!==state.graph||detached){state.running=false;canvas.__bvM0DebugAnimation=false;return;}
        const active=workflowHasM0Debug(canvas.graph);
        if(typeof document!=="undefined")document.documentElement.classList.toggle("bv-m0-debug-active",active);
        if(!active||!workflowHasConnectedResourceLink(canvas.graph)){state.running=false;canvas.__bvM0DebugAnimation=false;return;}
        if(typeof canvas.setDirty==="function")canvas.setDirty(false,true);
        else canvas.setDirtyCanvas?.(false,true);
        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

export function syncM0DebugRoot(graph:any){
    if(typeof document==="undefined")return;
    const active=workflowHasM0Debug(graph);
    document.documentElement.classList.toggle("bv-m0-debug-active",active);
}

export function installM0CanvasVisibility(canvas: any) {
    installProjectedPortCanvasInteraction(canvas);
    if (!canvas || canvas.__bvM0VisibilityInstalled) return;
    canvas.__bvM0VisibilityInstalled = true;
    let previousDragType:string|null=null,frame=0;
    const syncLegacyDrag=()=>{frame=0;const dragType=canvasLegacyDragType(canvas);if(dragType===previousDragType)return;previousDragType=dragType;refreshLegacyDragPorts(canvas);};
    const scheduleLegacyDrag=()=>{if(!frame)frame=requestAnimationFrame(syncLegacyDrag);};
    const finishLegacyDrag=()=>requestAnimationFrame(scheduleLegacyDrag);
    if(typeof window!=="undefined"){
        window.addEventListener("pointermove",scheduleLegacyDrag,true);
        window.addEventListener("pointerup",finishLegacyDrag,true);
        window.addEventListener("pointercancel",finishLegacyDrag,true);
    }
    const drawNode = canvas.drawNode;
    const drawFrontCanvas = canvas.drawFrontCanvas;
    const renderLink = canvas.renderLink;
    const suppressVirtualIoSlots=(graph:any,restores:Array<()=>void>)=>{
        for(const virtual of [graph?.inputNode,graph?.outputNode]){
            if(!virtual)continue;
            const slots=(virtual.slots??[]) as M0Slot[];
            const inputBoundary=virtual===graph?.inputNode;
            const definitions=inputBoundary?(graph?.inputs??[]):(graph?.outputs??[]);
            const projected=(slot:M0Slot,index:number)=>projectedBoundarySlot(slot)||projectedBoundarySlot(definitions[index]);
            if(!slots.some(projected))continue;
            {
                let collapsed=false;
                slots.forEach((slot:any,index)=>{
                    if(!projected(slot,index)||!slot?.measurement)return;
                    slot.measurement.minHeight=0;slot.measurement.maxHeight=0;slot.measurement.desiredHeight=0;collapsed=true;
                });
                if(collapsed&&typeof virtual.arrange==="function")virtual.arrange();
            }
            const fieldSlots={
                slots:[...slots],
                allSlots:[...(virtual.allSlots??slots)] as M0Slot[],
            };
            const previous=originalBoundarySlots.get(virtual);
            originalBoundarySlots.set(virtual,previous??fieldSlots.allSlots);
            restores.push(()=>{if(previous)originalBoundarySlots.set(virtual,previous);else originalBoundarySlots.delete(virtual)});
            for(const field of ["slots","allSlots"] as const){
                const own=Object.prototype.hasOwnProperty.call(virtual,field),descriptor=Object.getOwnPropertyDescriptor(virtual,field);
                const visibleSlots=fieldSlots[field].filter((slot,index)=>!projected(slot,index));
                Object.defineProperty(virtual,field,{configurable:true,value:visibleSlots});
                restores.push(()=>own&&descriptor?Object.defineProperty(virtual,field,descriptor):delete virtual[field]);
            }
        }
    };
    if(typeof drawFrontCanvas==="function")canvas.drawFrontCanvas=function(...args:any[]){
        const restores:Array<()=>void>=[];
        suppressVirtualIoSlots(this.graph,restores);
        try{return drawFrontCanvas.apply(this,args);}
        finally{for(let index=restores.length-1;index>=0;index--)restores[index]();}
    };
    canvas.renderLink = function (...args:any[]) {
        if (hiddenLink(this,args[3])) return;
        if(!resourceLink(this,args[3]))return renderLink.apply(this,args);
        requestM0DebugAnimation(this);
        args[1]=projectedEndpoint(this.graph,args[3]?.origin_id,"origin",args[1]);
        args[2]=projectedEndpoint(this.graph,args[3]?.target_id,"target",args[2]);
        const target=this.graph?.getNodeById?.(args[3]?.target_id) as M0Node|undefined;
        const providerSlots=target?.inputs?.map((slot,index)=>({slot,index})).filter(({slot})=>slot.__bvM0ResourceSlot)??[];
        const anchor=target?.__bvM0FanInAnchorSlot??(providerSlots.length>1?providerSlots[0].index:undefined);
        if(anchor!=null&&target){
            // Recompute world coordinates on every edge, including frames where
            // the first provider has no link (and therefore is never rendered).
            const current=providerTitlebarAnchor(target,"input");
            if(current)target.__bvM0FanInPoint=current;
            else if(args[3]?.target_slot===anchor||!target.__bvM0FanInPoint)target.__bvM0FanInPoint=args[2];
            args[2]=target.__bvM0FanInPoint;
        }
        const ctx=args[0] as CanvasRenderingContext2D;
        return withDgLineStyle(this,ctx,timeSeconds=>{
            args[5]=timeSeconds;
            return renderLink.apply(this,args);
        });
    };
    canvas.drawNode = function (node:M0Node,ctx:CanvasRenderingContext2D) {
        const restores:Array<()=>void>=[];
        const dragType=canvasLegacyDragType(this)??"";
        const presentationSlots=[...new Set([...(node.inputs??[]),...(node.outputs??[]),...((node as any).slots??[])])];
        const subgraphHost=Boolean((node as any).subgraph||(node as any).getSubgraph?.());
        if(subgraphHost)for(const field of["inputs","outputs"] as const){
            const slots=node[field];if(!Array.isArray(slots))continue;
            const child=(()=>{try{return (node as any).subgraph??(node as any).getSubgraph?.()}catch{return (node as any).subgraph}})(),definitions=field==="inputs"?child?.inputs:child?.outputs;
            const ownsProjected=slots.some((slot,index)=>field==="inputs"?projectedBoundarySlot(slot)||projectedBoundarySlot(definitions?.[index]):providerType(slot.type)||slot.__bvM0PortHidden||providerType(definitions?.[index]?.type)||definitions?.[index]?.__bvM0PortHidden);if(!ownsProjected)continue;
            const own=Object.prototype.hasOwnProperty.call(node,field),descriptor=Object.getOwnPropertyDescriptor(node,field),visible=slots.filter((slot,index)=>field==="inputs"?!projectedBoundarySlot(slot)&&!projectedBoundarySlot(definitions?.[index]):!providerType(slot.type)&&!slot.__bvM0PortHidden&&!providerType(definitions?.[index]?.type)&&!definitions?.[index]?.__bvM0PortHidden);
            Object.defineProperty(node,field,{configurable:true,writable:true,value:visible});
            restores.push(()=>own&&descriptor?Object.defineProperty(node,field,descriptor):delete (node as any)[field]);
        }
        const virtualIo=node===(this.graph as any)?.inputNode||node===(this.graph as any)?.outputNode;
        if(virtualIo)suppressVirtualIoSlots(this.graph,restores);
        for(const slot of presentationSlots){
            if((slot as any).__bvLegacyPort&&dragType&&slot.type===dragType)continue;
            if(!providerType(slot.type)&&!slot.__bvM0PortHidden)continue;
            for(const field of ["name","label","localized_name"] as const){
                const own=Object.prototype.hasOwnProperty.call(slot,field),value=slot[field];
                Object.defineProperty(slot,field,{configurable:true,writable:true,value:""});
                restores.push(()=>own?Object.defineProperty(slot,field,{configurable:true,writable:true,value}):delete slot[field]);
            }
            const hiddenOwn=Object.prototype.hasOwnProperty.call(slot,"hidden"),hiddenValue=slot.hidden;
            Object.defineProperty(slot,"hidden",{configurable:true,writable:true,value:true});
            restores.push(()=>hiddenOwn?Object.defineProperty(slot,"hidden",{configurable:true,writable:true,value:hiddenValue}):delete slot.hidden);
            for(const method of ["draw","drawCollapsed"] as const){
                if(typeof slot[method]!=="function")continue;
                const own=Object.prototype.hasOwnProperty.call(slot,method),value=slot[method];
                Object.defineProperty(slot,method,{configurable:true,writable:true,value:()=>undefined});
                restores.push(()=>own?Object.defineProperty(slot,method,{configurable:true,writable:true,value}):delete slot[method]);
            }
        }
        try{return drawNode.call(this,node,ctx);}
        finally{for(let index=restores.length-1;index>=0;index--)restores[index]();}
    };
}

export function markM0NodeElement(node:any,kind:"collector"|"consumer",debug:boolean) {
    let attempts=0;
    const revision=(node.__bvM0ElementMarkRevision??0)+1;
    node.__bvM0ElementMarkRevision=revision;
    const apply=()=>{
        if(node.__bvM0ElementMarkRevision!==revision)return;
        const id=CSS.escape(String(node.id));
        const element=document.querySelector<HTMLElement>(`.lg-node[data-node-id="${id}"]`);
        if(!element){if(attempts++<40)setTimeout(apply,50);return;}
        element.classList.add(`bv-m0-${kind}`);
        element.classList.toggle("bv-m0-debug",debug);
        const slots=element.querySelectorAll<HTMLElement>(".lg-slot--input"),providerSlots=node.inputs?.map((slot:any,index:number)=>({slot,index})).filter(({slot}:any)=>slot.__bvM0ResourceSlot)??[],fanInAnchor=providerSlots.length>1?providerSlots[0].index:undefined;
        slots.forEach((slot,index)=>slot.classList.toggle("bv-m0-port-hidden",Boolean(node.inputs?.[index]?.__bvM0PortHidden)||(fanInAnchor!=null&&index!==fanInAnchor)));
        element.classList.toggle("bv-m0-fan-in",fanInAnchor!=null);
        if(attempts++<4)setTimeout(apply,75*attempts);
    };
    apply();
}

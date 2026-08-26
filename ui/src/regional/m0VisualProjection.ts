import { canvasLegacyDragType, legacyDebugVisible, refreshLegacyDragPorts } from "./legacyPorts";

const M0_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER_M0";
const V3_PROVIDER_TYPE="BV_RUNTIME_RESOURCE_PROVIDER";
const providerType=(value:unknown)=>value===M0_PROVIDER_TYPE||value===V3_PROVIDER_TYPE;
type M0Slot = { name?:string; label?:string; localized_name?:string; type?:string; hidden?:boolean; __bvM0VisualHidden?: boolean; __bvM0PortHidden?:boolean; __bvM0ResourceSlot?: boolean; link?: unknown; draw?:(...args:any[])=>unknown; drawCollapsed?:(...args:any[])=>unknown };
type M0Node = { id?: string|number; inputs?: M0Slot[]; outputs?: M0Slot[]; properties?:Record<string,unknown>; __bvM0ResourceConsumer?:boolean; __bvM0FanInAnchorSlot?:number; __bvM0FanInPoint?:Readonly<[number,number]>; __bvM0ElementMarkRevision?:number; getConnectionPos?:(input:boolean,slot:number)=>Readonly<[number,number]> };

function workflowHasM0Debug(graph:any){
    return legacyDebugVisible()||(graph?._nodes??[]).some((node:M0Node)=>node.__bvM0ResourceConsumer===true&&Boolean(node.properties?.bvM0DebugVisible));
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
    if(!link)return false;
    const origin=canvas.graph?.getNodeById?.(link.origin_id) as M0Node|undefined;
    const target=canvas.graph?.getNodeById?.(link.target_id) as M0Node|undefined;
    const output=origin?.outputs?.[link.origin_slot],input=target?.inputs?.[link.target_slot];
    return Boolean((output?.__bvM0ResourceSlot||providerType(output?.type))&&(input?.__bvM0ResourceSlot||providerType(input?.type)));
}

export function requestM0DebugAnimation(canvas:any){
    if(!canvas||canvas.__bvM0DebugAnimation)return;
    canvas.__bvM0DebugAnimation=true;
    const frame=()=>{
        const active=workflowHasM0Debug(canvas.graph);
        document.documentElement.classList.toggle("bv-m0-debug-active",active);
        if(!active){canvas.__bvM0DebugAnimation=false;return;}
        canvas.setDirty?.(false,true);canvas.setDirtyCanvas?.(false,true);
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
    const renderLink = canvas.renderLink;
    canvas.renderLink = function (...args:any[]) {
        if (hiddenLink(this,args[3])) return;
        if(!resourceLink(this,args[3]))return renderLink.apply(this,args);
        const target=this.graph?.getNodeById?.(args[3]?.target_id) as M0Node|undefined;
        const providerSlots=target?.inputs?.map((slot,index)=>({slot,index})).filter(({slot})=>slot.__bvM0ResourceSlot)??[];
        const anchor=target?.__bvM0FanInAnchorSlot??(providerSlots.length>1?providerSlots[0].index:undefined);
        if(anchor!=null&&target){
            if(args[3]?.target_slot===anchor||!target.__bvM0FanInPoint)target.__bvM0FanInPoint=args[2];
            args[2]=target.__bvM0FanInPoint;
        }
        const ctx=args[0] as CanvasRenderingContext2D;
        ctx.save();
        try{
            const exportTime=Number(this.__bvExportTimeSeconds);
            const timeSeconds=Number.isFinite(exportTime)?exportTime:(typeof performance==="undefined"?0:performance.now()/1000);
            ctx.setLineDash([7,5]);
            ctx.lineDashOffset=-((timeSeconds*1000)/45%12);
            args[5]=timeSeconds;
            return renderLink.apply(this,args);
        }finally{ctx.restore();}
    };
    canvas.drawNode = function (node:M0Node,ctx:CanvasRenderingContext2D) {
        const restores:Array<()=>void>=[];
        const dragType=canvasLegacyDragType(this)??"";
        for(const slot of [...(node.inputs??[]),...(node.outputs??[])]){
            if((slot as any).__bvLegacyPort&&dragType&&slot.type===dragType)continue;
            if(!providerType(slot.type)&&!slot.__bvM0PortHidden)continue;
            for(const field of ["name","label","localized_name"] as const){
                const own=Object.prototype.hasOwnProperty.call(slot,field),value=slot[field];
                Object.defineProperty(slot,field,{configurable:true,writable:true,value:""});
                restores.push(()=>own?Object.defineProperty(slot,field,{configurable:true,writable:true,value}):delete slot[field]);
            }
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

// Shared interaction boundary for program-owned projected ports. Geometry and
// connection data remain untouched; only native pointer entry points are gated.
import {providerBoundaryAnchor} from "./providerProjectionGeometry";
type SlotPredicate=(slot:any)=>boolean;
const guardedNodes=new WeakMap<object,SlotPredicate>();
const guardOwners=new WeakMap<object,Set<SlotPredicate>>();
const noOwnership:SlotPredicate=()=>false;
type ElementBinding={node:any;direction:"input"|"output";index:number;handler:(event:any)=>void};
const guardedElements=new WeakMap<object,ElementBinding>();
const elementEvents=["pointerdown","mousedown","click","dblclick"];
export function removeProjectedPortElementInteraction(element:any,owner?:any){
    const binding=element&&guardedElements.get(element);if(!binding||(owner&&binding.node!==owner))return;
    for(const name of elementEvents)element.removeEventListener?.(name,binding.handler,true);
    guardedElements.delete(element);
}
// Vue slots bypass the Classic canvas pointer entry point. Capture only an
// explicitly opted-in current slot, before its native DOM handler runs.
export function syncProjectedPortElementInteraction(element:any,node:any,direction:"input"|"output",index:number){
    if(!element?.addEventListener)return;
    const field=direction==="input"?"inputs":"outputs";
    if(!guardedNodes.get(node)?.(node[field]?.[index])){removeProjectedPortElementInteraction(element);return}
    const existing=guardedElements.get(element);
    if(existing){existing.node=node;existing.direction=direction;existing.index=index;return}
    const binding:ElementBinding={node,direction,index,handler(event){
        const slots=binding.node[binding.direction==="input"?"inputs":"outputs"];
        if(!guardedNodes.get(binding.node)?.(slots?.[binding.index]))return;
        event.preventDefault();event.stopImmediatePropagation();
    }};
    guardedElements.set(element,binding);
    for(const name of elementEvents)element.addEventListener(name,binding.handler,true);
}
const guardedCanvases=new WeakSet<object>();
const conversionGraphs=new WeakSet<object>();
const clipboardCanvases=new WeakSet<object>();
export function installProjectedClipboard(canvas:any,prepare:(data:any)=>any){
    if(!canvas||clipboardCanvases.has(canvas)||typeof canvas._deserializeItems!=="function")return;
    clipboardCanvases.add(canvas);const original=canvas._deserializeItems;
    canvas._deserializeItems=function(data:any,...args:any[]){
        return original.call(this,prepare(data),...args);
    };
}

// Native conversion reconnects existing edges through the same hooks as manual
// connections. Privilege only this synchronous structural transaction.
export function installProjectedPortConversion(graph:any,run:<T>(action:()=>T)=>T){
    if(!graph||conversionGraphs.has(graph))return;
    conversionGraphs.add(graph);
    for(const method of ["convertToSubgraph","unpackSubgraph"]){
        const original=graph[method];if(typeof original!=="function")continue;
        graph[method]=function(...args:any[]){
            const result=run(()=>original.apply(this,args));
            installProjectedPortConversion(result?.subgraph,run);
            return result;
        };
    }
}
const slotValue=(hit:any)=>hit?.input??hit?.output??(typeof hit?.slot==="object"?hit.slot:hit);
const contains=(rect:any,x:number,y:number)=>typeof rect?.containsXy==="function"?rect.containsXy(x,y):rect&&x>=rect[0]&&x<=rect[0]+rect[2]&&y>=rect[1]&&y<=rect[1]+rect[3];
const suppressPointer=(pointer:any)=>{if(!pointer)return;const noop=()=>{};pointer.onClick=noop;pointer.onDoubleClick=noop;pointer.onDragStart=noop;pointer.onDrag=noop;pointer.onDragEnd=noop};

const isInternal=(slot:any)=>slot?.__bvPresentationRole==="internalState"||(slot?.__bvPresentationRole==="legacy"&&slot.__bvM0VisualHidden===true);
// Internal widget inputs retain their serialized indices and geometry. During a
// native hit test only, make them transparent so overlapping public ports win.
function withoutInternalHits<T>(node:any,action:()=>T):T{
    const restore:Array<()=>void>=[];
    try{
        for(const [field,method]of [["inputs","getInputPos"],["outputs","getOutputPos"]]){
            if(!(node[field]??[]).some(isInternal))continue;
            const original=node[method],descriptor=Object.getOwnPropertyDescriptor(node,method);
            if(typeof original==="function"){
                node[method]=function(index:number,...args:any[]){return isInternal(this[field]?.[index])?[NaN,NaN]:original.call(this,index,...args)};
                restore.push(()=>{if(descriptor)Object.defineProperty(node,method,descriptor);else delete node[method]});
            }
            for(const slot of node[field]??[]){
                const rect=slot.boundingRect;if(!isInternal(slot)||!rect)continue;
                const x=rect[0],y=rect[1];rect[0]=NaN;rect[1]=NaN;
                restore.push(()=>{rect[0]=x;rect[1]=y});
            }
        }
        return action();
    }finally{for(const undo of restore.reverse())undo()}
}

export function installProjectedPortInteraction(node:any,isOwned:SlotPredicate=noOwnership){
    if(!node)return;
    const owners=guardOwners.get(node)??new Set<SlotPredicate>();owners.add(isOwned);guardOwners.set(node,owners);
    if(guardedNodes.has(node))return;
    isOwned=slot=>isInternal(slot)||Array.from(owners).some(owner=>owner(slot));
    guardedNodes.set(node,isOwned);
    for(const method of ["getSlotInPosition","getInputOnPos","getOutputOnPos","getSlotOnPos"]){
        const original=node[method];if(typeof original!=="function")continue;
        node[method]=function(...args:any[]){const hit=withoutInternalHits(this,()=>original.apply(this,args));return isOwned(slotValue(hit))?undefined:hit};
    }
    const original=node.onPointerDown;
    if(typeof original==="function")node.onPointerDown=function(e:any,pointer:any,...args:any[]){
        const slots=Array.from(this.allSlots??[]) as any[];
        // Special-I/O DG paint sits one row above the first normal port. Keep
        // that projected point inert too, even outside the zero-height DG row.
        const normal=slots.find(slot=>!isOwned(slotValue(slot))),pos=providerBoundaryAnchor(slotValue(normal)?.pos);
        if(slots.some(slot=>isOwned(slotValue(slot)))&&pos&&contains([pos[0]-8,pos[1]-8,16,16],e.canvasX,e.canvasY)){
            suppressPointer(pointer);return;
        }
        // Native SpecialIO registers every matching slot; the last match wins.
        const hit=slots.filter((slot:any)=>contains(slot.boundingRect,e.canvasX,e.canvasY)).pop();
        if(hit&&isOwned(slotValue(hit))){suppressPointer(pointer);return}
        return original.call(this,e,pointer,...args);
    };
}

export function installProjectedPortCanvasInteraction(canvas:any){
    if(!canvas||guardedCanvases.has(canvas)||typeof canvas._processNodeClick!=="function")return;
    guardedCanvases.add(canvas);const original=canvas._processNodeClick;
    canvas._processNodeClick=function(e:any,ctrlOrMeta:boolean,node:any){
        const isOwned=guardedNodes.get(node);
        if(isOwned&&!node.flags?.collapsed&&!node.isPointInCollapse?.(e.canvasX,e.canvasY)){
            // Match native output-before-input priority; do not reindex slots.
            for(const [field,position]of [["outputs","getOutputPos"],["inputs","getInputPos"]]){
                for(const [index,slot]of (node[field]??[]).entries()){
                    if(isInternal(slot))continue;
                    const pos=node[position]?.(index);if(!pos)continue;
                    const hit=field==="inputs"&&slot.boundingRect?contains(slot.boundingRect,e.canvasX,e.canvasY):contains([pos[0]-15,pos[1]-10,30,20],e.canvasX,e.canvasY);
                    if(!hit)continue;
                    if(isOwned(slotValue(slot))){suppressPointer(this.pointer);return}
                    return withoutInternalHits(node,()=>original.call(this,e,ctrlOrMeta,node));
                }
            }
        }
        return withoutInternalHits(node,()=>original.call(this,e,ctrlOrMeta,node));
    };
}

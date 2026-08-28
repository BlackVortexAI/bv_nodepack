export const SHOW_LEGACY_PORTS_SETTING_ID="BV.Regional.ShowLegacyPorts";
export const LEGACY_DEBUG_SETTING_ID="BV.Regional.LegacyDebugMode";
export const LEGACY_DEBUG_COMMAND_ID="bv.regional.toggleDebugWiring";
export const LEGACY_USAGE_EVENT="bv-regional-legacy-usage";
export const LEGACY_DEBUG_VISIBILITY_EVENT="bv-regional-legacy-debug-visibility";

// BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Entire Regional sidecar-port UX.
// Remove this module, its command/setting hooks, and canvas projection branches with the ports.

type Slot={name?:string;type?:string;link?:unknown;links?:unknown[]|null;hidden?:boolean;__bvLegacyPort?:boolean;__bvLegacySticky?:boolean;__bvLegacyWasConnected?:boolean;__bvM0PortHidden?:boolean;__bvM0VisualHidden?:boolean};
type Node={id?:string|number;inputs?:Slot[];outputs?:Slot[];setDirtyCanvas?:(a:boolean,b?:boolean)=>void;__bvApplyPresentation?:()=>void;__bvPresentationHasLegacy?:boolean;__bvRefreshPortProjection?:()=>void};
export type LegacyPortDescriptor={direction:"input"|"output";name:string;type:string;guidance:string};
let showAll=false;
let debugVisible=false;
const connected=(slot:Slot,direction:"input"|"output")=>direction==="input"?slot.link!=null:Boolean(slot.links?.length);
const visitGraphNodes=(graph:any,visit:(node:Node)=>void)=>{for(const node of graph?._nodes??[]){visit(node);if((node as any).subgraph)visitGraphNodes((node as any).subgraph,visit)}};
const LORA_CONSUMERS=new Set<string>(REGIONAL_LORA_CONSUMER_NODE_TYPES);

export function legacyPortDescriptors(nodeName:string):LegacyPortDescriptor[]{
    if(LORA_CONSUMERS.has(nodeName))return [
        {direction:"input",name:"lora_registry",type:"BV_LORA_STACK_REGISTRY",guidance:"Use Regional V3 resource providers."},
        {direction:"input",name:"lora_bindings",type:"BV_REGIONAL_LORA_BINDINGS",guidance:"Use the BV_REGIONAL context input."},
    ];
    if(nodeName==="BV Regional Detailer Plan")return [{direction:"input",name:"detector_registry",type:"BV_DETECTOR_REGISTRY",guidance:"Use Regional V3 detector resource providers."}];
    return [];
}

export function setLegacyPortsVisible(value:boolean,graph?:any){showAll=Boolean(value);visitGraphNodes(graph,refreshLegacyPorts);}
export function legacyPortsVisible(){return showAll}
export function setLegacyDebugVisible(value:boolean,graph?:any){
    debugVisible=Boolean(value);
    if(typeof document!=="undefined")document.documentElement.classList.toggle("bv-regional-debug-wiring-active",debugVisible);
    if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(LEGACY_DEBUG_VISIBILITY_EVENT,{detail:{visible:debugVisible}}));
    visitGraphNodes(graph,refreshLegacyPorts);
    graph?.setDirtyCanvas?.(true,true);
    return debugVisible;
}
export function toggleLegacyDebugVisible(graph?:any){return setLegacyDebugVisible(!debugVisible,graph)}
export function legacyDebugVisible(){return debugVisible}
export function legacyPortShouldShow(slot:Slot,direction:"input"|"output",dragType?:string|null){return showAll||debugVisible||connected(slot,direction)||slot.__bvLegacySticky===true||Boolean(dragType&&slot.type===dragType)}
export function canvasLegacyDragType(canvas:any){
    const legacy=canvas?.connecting_output?.type??canvas?.connecting_input?.type;
    if(legacy)return String(legacy);
    const modern=canvas?.linkConnector?.renderLinks?.[0]?.fromSlot?.type;
    return modern==null?null:String(modern);
}

export function installLegacyPorts(node:Node,descriptors:LegacyPortDescriptor[]){
    for(const descriptor of descriptors){
        const slots=descriptor.direction==="input"?node.inputs:node.outputs,slot=slots?.find(item=>item.name===descriptor.name);
        if(!slot)continue;slot.__bvLegacyPort=true;slot.__bvLegacyWasConnected=connected(slot,descriptor.direction);
        (slot as any).__bvLegacyGuidance=descriptor.guidance;
    }
    refreshLegacyPorts(node);
}

export function refreshLegacyPorts(node:Node,dragType?:string|null){
    if(node.__bvApplyPresentation){
        if(node.__bvPresentationHasLegacy!==false)node.__bvApplyPresentation();
        return;
    }
    for(const [direction,slots] of [["input",node.inputs],["output",node.outputs]] as const)for(const slot of slots??[]){
        if(!slot.__bvLegacyPort)continue;const isConnected=connected(slot,direction);
        if(slot.__bvLegacyWasConnected&&!isConnected)slot.__bvLegacySticky=true;
        slot.__bvLegacyWasConnected=isConnected;const visible=legacyPortShouldShow(slot,direction,dragType);
        slot.hidden=!visible;slot.__bvM0PortHidden=!visible;slot.__bvM0VisualHidden=!visible;
    }
    node.setDirtyCanvas?.(true,true);
    node.__bvRefreshPortProjection?.();
}

export function refreshLegacyDragPorts(canvas:any){
    const dragType=canvasLegacyDragType(canvas);
    for(const node of canvas?.graph?._nodes??[])refreshLegacyPorts(node,dragType);
    return dragType;
}

export function clearLegacyPortSticky(node:Node){for(const slot of [...(node.inputs??[]),...(node.outputs??[])])if(slot.__bvLegacyPort)slot.__bvLegacySticky=false;refreshLegacyPorts(node)}
export function legacyUsage(node:Node){return [...(node.inputs??[]),...(node.outputs??[])].filter(slot=>slot.__bvLegacyPort&&(slot.link!=null||Boolean(slot.links?.length)))}
import{REGIONAL_LORA_CONSUMER_NODE_TYPES}from"./nodePresentation.js";

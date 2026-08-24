export const SHOW_LEGACY_PORTS_SETTING_ID="BV.Regional.ShowLegacyPorts";
export const LEGACY_USAGE_EVENT="bv-regional-legacy-usage";

type Slot={name?:string;type?:string;link?:unknown;links?:unknown[]|null;hidden?:boolean;__bvLegacyPort?:boolean;__bvLegacySticky?:boolean;__bvLegacyWasConnected?:boolean;__bvM0PortHidden?:boolean;__bvM0VisualHidden?:boolean};
type Node={id?:string|number;inputs?:Slot[];outputs?:Slot[];setDirtyCanvas?:(a:boolean,b?:boolean)=>void};
export type LegacyPortDescriptor={direction:"input"|"output";name:string;type:string;guidance:string};
let showAll=false;
const connected=(slot:Slot,direction:"input"|"output")=>direction==="input"?slot.link!=null:Boolean(slot.links?.length);

export function setLegacyPortsVisible(value:boolean,graph?:any){showAll=Boolean(value);for(const node of graph?._nodes??[])refreshLegacyPorts(node);}
export function legacyPortsVisible(){return showAll}
export function legacyPortShouldShow(slot:Slot,direction:"input"|"output",dragType?:string|null){return showAll||connected(slot,direction)||slot.__bvLegacySticky===true||Boolean(dragType&&slot.type===dragType)}

export function installLegacyPorts(node:Node,descriptors:LegacyPortDescriptor[]){
    for(const descriptor of descriptors){
        const slots=descriptor.direction==="input"?node.inputs:node.outputs,slot=slots?.find(item=>item.name===descriptor.name);
        if(!slot)continue;slot.__bvLegacyPort=true;slot.__bvLegacyWasConnected=connected(slot,descriptor.direction);
        (slot as any).__bvLegacyGuidance=descriptor.guidance;
    }
    refreshLegacyPorts(node);
}

export function refreshLegacyPorts(node:Node,dragType?:string|null){
    for(const [direction,slots] of [["input",node.inputs],["output",node.outputs]] as const)for(const slot of slots??[]){
        if(!slot.__bvLegacyPort)continue;const isConnected=connected(slot,direction);
        if(slot.__bvLegacyWasConnected&&!isConnected)slot.__bvLegacySticky=true;
        slot.__bvLegacyWasConnected=isConnected;const visible=legacyPortShouldShow(slot,direction,dragType);
        slot.hidden=!visible;slot.__bvM0PortHidden=!visible;slot.__bvM0VisualHidden=!visible;
    }
    node.setDirtyCanvas?.(true,true);
}

export function clearLegacyPortSticky(node:Node){for(const slot of [...(node.inputs??[]),...(node.outputs??[])])if(slot.__bvLegacyPort)slot.__bvLegacySticky=false;refreshLegacyPorts(node)}
export function legacyUsage(node:Node){return [...(node.inputs??[]),...(node.outputs??[])].filter(slot=>slot.__bvLegacyPort&&(slot.link!=null||Boolean(slot.links?.length)))}

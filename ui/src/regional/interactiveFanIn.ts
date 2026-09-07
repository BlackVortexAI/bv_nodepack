/** Shared interactive fan-in projection. Canonical slots and links stay native. */
const bindings=new WeakMap<object,{restore:()=>void}>();

const nativeFloors=new WeakMap<object,Map<any,{get:()=>number;original?:PropertyDescriptor}>>();
function preserveNativePlaces(node:any){
    let tracked=nativeFloors.get(node);if(!tracked){tracked=new Map();nativeFloors.set(node,tracked)}
    for(const slot of slots(node)){
        const name=String(slot.name).split(".")[0],group=node.comfyDynamic?.autogrow?.[name];
        if(!group||tracked.has(group)||group.inputSpecs?.some((input:any)=>input.isOptional!==true))continue;
        const original=Object.getOwnPropertyDescriptor(group,"min"),get=()=>Math.max(Number(original?.value??0),...((node.inputs??[]).filter((input:any)=>String(input.name).startsWith(`${name}.`)).map((input:any)=>Number(String(input.name).match(/\d+$/)?.[0]??0)+2)));
        Object.defineProperty(group,"min",{get,configurable:true,enumerable:original?.enumerable??true});tracked.set(group,{get,original});
    }
}
const slots=(node:any)=>(node.inputs??[]).filter((slot:any)=>slot.__bvPresentationRole==="fanIn");
export const fanInTarget=(node:any)=>slots(node).find((slot:any)=>slot.link==null);
const anchorSlot=(node:any)=>fanInTarget(node)??slots(node)[0];
const localY=(node:any)=>node.flags?.collapsed?-15:10;
const point=(node:any)=>{
    if(node.__bvNodes2PresentationActive&&!node.flags?.collapsed&&node.__bvFanInNativeConnection){
        const value=node.__bvFanInNativeConnection.call(node,true,node.inputs.indexOf(anchorSlot(node)),new Float32Array(2));
        if(value&&Number.isFinite(value[0])&&Number.isFinite(value[1]))return value;
    }
    return [Number(node.pos?.[0]??0),Number(node.pos?.[1]??0)+localY(node)];
};

export function removeInteractiveFanIn(node:any){for(const [group,binding] of nativeFloors.get(node)??[]){if(Object.getOwnPropertyDescriptor(group,"min")?.get===binding.get){if(binding.original)Object.defineProperty(group,"min",binding.original);else delete group.min}}nativeFloors.delete(node);bindings.get(node)?.restore();bindings.delete(node)}
export function serializeInteractiveFanIn(node:any,data:any){
    const positions:Map<any,PropertyDescriptor|undefined>|undefined=node.__bvFanInPositions;
    for(const [index,slot]of (node.inputs??[]).entries()){
        if(!positions?.has(slot)||!data.inputs?.[index])continue;
        const original=positions.get(slot);
        if(original?.value!==undefined)data.inputs[index].pos=original.value;
        else delete data.inputs[index].pos;
    }
}

export function applyInteractiveFanIn(node:any){
    const entries=slots(node);if(!entries.length){removeInteractiveFanIn(node);return}
    preserveNativePlaces(node);
    if(!bindings.has(node)){
        const originals=new Map<string,PropertyDescriptor|undefined>();
        const wrap=(name:string,make:(original:any)=>any)=>{originals.set(name,Object.getOwnPropertyDescriptor(node,name));node[name]=make(node[name])};
        wrap("getInputOnPos",original=>function(this:any,...args:any[]){
            const coordinates:any=Array.isArray(args[0])||ArrayBuffer.isView(args[0])?args[0]:args;
            const x=coordinates[0],y=coordinates[1];
            const [ax,ay]=point(this);
            if(Math.abs(x-ax)<=16&&Math.abs(y-ay)<=12)return fanInTarget(this);
            const result=original?.apply(this,args);
            return result?.__bvPresentationRole==="fanIn"?undefined:result;
        });
        Object.defineProperty(node,"__bvFanInNativeConnection",{value:node.getConnectionPos,configurable:true});
        wrap("getConnectionPos",original=>function(this:any,input:boolean,index:number,out?:any){
            if(input&&this.inputs?.[index]?.__bvPresentationRole==="fanIn"){
                const position=point(this);if(out){out[0]=position[0];out[1]=position[1];return out}return position;
            }
            return original?.apply(this,arguments);
        });
        wrap("onConnectInput",original=>function(this:any,index:number){
            if(this.inputs?.[index]?.__bvPresentationRole==="fanIn"&&this.inputs[index].link!=null)return false;
            return original?.apply(this,arguments)??true;
        });
        const positions=new Map<any,PropertyDescriptor|undefined>();
        bindings.set(node,{restore(){for(const [name,descriptor]of originals){if(descriptor)Object.defineProperty(node,name,descriptor);else delete node[name]}for(const [slot,descriptor]of positions){if(descriptor)Object.defineProperty(slot,"pos",descriptor);else delete slot.pos}delete node.__bvFanInPositions;delete node.__bvFanInNativeConnection}});
        Object.defineProperty(node,"__bvFanInPositions",{value:positions,configurable:true});
    }
    const anchor=anchorSlot(node),positions:Map<any,PropertyDescriptor|undefined>=node.__bvFanInPositions;
    for(const slot of entries){
        if(!positions.has(slot)){positions.set(slot,Object.getOwnPropertyDescriptor(slot,"pos"));Object.defineProperty(slot,"pos",{get:()=>[0,localY(node)],set:()=>{},enumerable:false,configurable:true})}
        slot.hidden=slot!==anchor;slot.label="Media";slot.localized_name="Media";
        // These are public media edges, never DG-hidden provider edges.
        slot.__bvM0PortHidden=false;slot.__bvM0VisualHidden=false;
    }
}

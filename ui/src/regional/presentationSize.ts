const SIZE_VERSION=1;
const LEGACY_PROJECTED_VERSION=1;

type ResizeBinding={original:any;ownDescriptor?:PropertyDescriptor;wrapper:any;active:boolean;internalDepth:number};
type GraphBinding={original:any;ownDescriptor?:PropertyDescriptor;wrapper:any;active:boolean;nodes:Set<any>};
const bindings=new WeakMap<object,ResizeBinding>();
const graphBindings=new WeakMap<object,GraphBinding>();
const nodeGraphs=new WeakMap<object,object>();
const repairTokens=new WeakMap<object,object>();
let userResizeProbe=(node:any)=>false;

const positiveNumber=(value:unknown):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>0;
const hostReportsUserResize=(node:any)=>{try{return Boolean(userResizeProbe(node))}catch{return false}};

function migrateProperties(node:any){
    const properties=node?.properties;
    if(!properties||typeof properties!=="object")return;
    const centralValid=properties.bvPresentationSizeVersion===SIZE_VERSION&&positiveNumber(properties.bvPresentationUserHeight);
    if(!centralValid){delete properties.bvPresentationSizeVersion;delete properties.bvPresentationUserHeight;}
    const legacyValid=properties.bvProjectedLayoutVersion===LEGACY_PROJECTED_VERSION&&positiveNumber(properties.bvProjectedUserHeight);
    if(!centralValid&&legacyValid){properties.bvPresentationSizeVersion=SIZE_VERSION;properties.bvPresentationUserHeight=properties.bvProjectedUserHeight;}
    delete properties.bvProjectedLayoutVersion;delete properties.bvProjectedUserHeight;
}

function persistUserHeight(node:any){
    const height=Number(node?.size?.[1]);
    if(!positiveNumber(height))return;
    node.properties??={};
    node.properties.bvPresentationSizeVersion=SIZE_VERSION;
    node.properties.bvPresentationUserHeight=height;
}

function removeGraphLifecycle(node:any,graph=nodeGraphs.get(node)){
    if(!graph)return;
    nodeGraphs.delete(node);
    const binding=graphBindings.get(graph);
    if(!binding)return;
    binding.nodes.delete(node);
    if(binding.nodes.size)return;
    binding.active=false;
    if((graph as any).afterChange===binding.wrapper){
        if(binding.ownDescriptor)Object.defineProperty(graph,"afterChange",binding.ownDescriptor);
        else delete (graph as any).afterChange;
    }
    graphBindings.delete(graph);
}

function installGraphLifecycle(node:any){
    const graph=node?.graph,previous=nodeGraphs.get(node);
    if(previous&&previous!==graph)removeGraphLifecycle(node,previous);
    if(!graph||typeof graph.afterChange!=="function")return;
    const current=graphBindings.get(graph);
    if(current?.active&&graph.afterChange===current.wrapper){current.nodes.add(node);nodeGraphs.set(node,graph);return;}
    if(current)current.active=false;
    const original=graph.afterChange,ownDescriptor=Object.getOwnPropertyDescriptor(graph,"afterChange"),nodes=new Set(current?.nodes??[]);
    nodes.add(node);
    const binding:GraphBinding={original,ownDescriptor,wrapper:undefined,active:true,nodes};
    binding.wrapper=function(this:any){
        const result=original?.apply(this,arguments);
        if(binding.active){
            for(const managed of binding.nodes)if(hostReportsUserResize(managed))persistUserHeight(managed);
        }
        return result;
    };
    graphBindings.set(graph,binding);nodeGraphs.set(node,graph);graph.afterChange=binding.wrapper;
}

export function configurePresentationSizeLifecycle(options:{isUserResizing?:(node:any)=>boolean}){
    userResizeProbe=options.isUserResizing??(()=>false);
}

export function isPresentationUserResizing(node:any){return hostReportsUserResize(node)}

export function installPresentationSizeLifecycle(node:any){
    if(!node||typeof node.setSize!=="function")return false;
    migrateProperties(node);
    installGraphLifecycle(node);
    const existing=bindings.get(node);
    if(existing?.active&&node.setSize===existing.wrapper)return false;
    if(existing)existing.active=false;
    const original=node.setSize,ownDescriptor=Object.getOwnPropertyDescriptor(node,"setSize");
    const binding:ResizeBinding={original,ownDescriptor,wrapper:undefined,active:true,internalDepth:0};
    binding.wrapper=function(this:any){
        const result=original?.apply(this,arguments);
        if(binding.active&&binding.internalDepth===0&&hostReportsUserResize(this))persistUserHeight(this);
        return result;
    };
    bindings.set(node,binding);node.setSize=binding.wrapper;
    if(!repairTokens.has(node)){
        const token={};repairTokens.set(node,token);
        for(const delay of[0,50,150,500])setTimeout(()=>{if(repairTokens.get(node)===token)installPresentationSizeLifecycle(node)},delay);
    }
    return true;
}

export function removePresentationSizeLifecycle(node:any){
    removeGraphLifecycle(node);
    repairTokens.delete(node);
    const binding=bindings.get(node);
    if(!binding)return false;
    binding.active=false;
    if(node?.setSize===binding.wrapper){
        if(binding.ownDescriptor)Object.defineProperty(node,"setSize",binding.ownDescriptor);
        else delete node.setSize;
    }
    bindings.delete(node);
    return true;
}

export function presentationUserHeight(node:any){
    migrateProperties(node);
    return node?.properties?.bvPresentationSizeVersion===SIZE_VERSION&&positiveNumber(node?.properties?.bvPresentationUserHeight)
        ?Number(node.properties.bvPresentationUserHeight):0;
}

export function presentationSize(node:any,size:readonly[number,number]):[number,number]{
    const height=Number(size[1]);
    const resolved=Math.max(height,presentationUserHeight(node));
    return[Number(size[0]),resolved];
}

export function setAutomaticPresentationSize(node:any,size:readonly[number,number]){
    if(!node?.setSize)return false;
    installPresentationSizeLifecycle(node);
    const binding=bindings.get(node)!;
    binding.internalDepth++;
    try{node.setSize([Number(size[0]),Number(size[1])]);}
    finally{binding.internalDepth--;}
    return true;
}

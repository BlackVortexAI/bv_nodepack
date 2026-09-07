import{applyClassicNodePresentation,removeNodePresentation}from"./classicNodePresentation.js";
import{hasNodePresentationPolicy}from"./nodePresentation.js";
import{serializeInteractiveFanIn}from"./interactiveFanIn.js";
import{serializeProjectedPortPositions}from"./portProjection.js";

type NodeDefinition=Readonly<{name?:unknown;input?:any}>;
type InstalledLifecycle={nodeType:string};

const installed=new WeakMap<object,InstalledLifecycle>();

const prepare=(node:any,nodeType:string)=>{
    if(!node)return;
    node.__bvPresentationManaged=true;
    node.__bvPresentationDefinitionLifecycle=true;
    applyClassicNodePresentation(node,nodeType);
};

const chain=(prototype:any,name:"onNodeCreated"|"onConfigure"|"onConnectionsChange",nodeType:string)=>{
    const original=prototype[name];
    prototype[name]=function(){const result=original?.apply(this,arguments);queueMicrotask(()=>prepare(this,nodeType));return result};
};

export function installNodePresentationLifecycle(nodeType:any,nodeData:NodeDefinition){
    const name=String(nodeData?.name??"");
    if(!nodeType?.prototype||!hasNodePresentationPolicy(name))return false;
    const current=installed.get(nodeType.prototype);
    if(current)return current.nodeType===name;
    installed.set(nodeType.prototype,{nodeType:name});
    // The native STRING widget factory currently drops socketless from its
    // options. Preserve only explicitly declared flags before addInputWidget.
    const socketless=new Set(Object.entries({...nodeData.input?.required,...nodeData.input?.optional}).filter(([,spec]:any)=>spec?.[1]?.socketless===true).map(([key])=>key));
    for(const method of ["addWidget","addDOMWidget"]){
        const original=nodeType.prototype[method];if(!original||!socketless.size)continue;
        nodeType.prototype[method]=function(...args:any[]){const result=original.apply(this,args),widgetName=method==="addWidget"?args[1]:args[0];if(result&&socketless.has(widgetName)){result.options??={};result.options.socketless=true}return result};
    }
    chain(nodeType.prototype,"onNodeCreated",name);
    chain(nodeType.prototype,"onConfigure",name);
    chain(nodeType.prototype,"onConnectionsChange",name);
    const serialized=nodeType.prototype.onSerialize;
    nodeType.prototype.onSerialize=function(data:any){const result=serialized?.apply(this,arguments);serializeInteractiveFanIn(this,data);serializeProjectedPortPositions(this,data);return result};
    const removed=nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved=function(){try{return removed?.apply(this,arguments)}finally{removeNodePresentation(this)}};
    return true;
}

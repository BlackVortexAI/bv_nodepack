import{applyClassicNodePresentation,removeNodePresentation}from"./classicNodePresentation.js";
import{hasNodePresentationPolicy}from"./nodePresentation.js";

type NodeDefinition=Readonly<{name?:unknown}>;
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
    chain(nodeType.prototype,"onNodeCreated",name);
    chain(nodeType.prototype,"onConfigure",name);
    chain(nodeType.prototype,"onConnectionsChange",name);
    const removed=nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved=function(){try{return removed?.apply(this,arguments)}finally{removeNodePresentation(this)}};
    return true;
}

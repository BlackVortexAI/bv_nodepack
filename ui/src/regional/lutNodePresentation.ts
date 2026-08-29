import { applyClassicNodePresentation } from "./classicNodePresentation";
import { lutV3Catalog, prepareLutRegistryV3, prepareLutV3 } from "./lutV3Catalog";
import { parseLutPlanConfig } from "./lutPlanConfig";
import { parseLutRegistryConfig, serializeLutRegistryConfig } from "./lutRegistryConfig";
import { canonicalLutPath, lutLibrary, mergeLutChoices } from "./lutLibrary";

type WindowCandidate={id:string;label:string};
type LutPresentationDependencies=Readonly<{
    api:unknown;
    graphOwner:(node:any)=>any;
    scopedNodeKey:(node:any)=>string;
    workflowNodesOfType:(nodeType:string)=>any[];
    windowMenuVisible:(node:any)=>boolean;
    switchView:(currentKey:string,targetKey:string,open:()=>void,replace:boolean)=>void;
    sourceDocument:(node:any)=>any;
    detectorCollectors:(node:any)=>any[];
    openRegistry:(api:unknown,stored:unknown,save:(value:string)=>void,key:string,nodes:WindowCandidate[],navigate:(targetId:string,replace:boolean)=>void,node:any)=>Promise<unknown>;
    openPlan:(options:any)=>void;
    openDownload:(installed:(path:string)=>void)=>void;
}>;

const hideWidget=(widget:any)=>{
    widget.type="converted-widget";
    widget.hidden=true;
    widget.options??={};
    widget.options.hidden=true;
    widget.computeSize=()=>[0,0];
    widget.computeLayoutSize=()=>({minWidth:0,minHeight:0,maxHeight:0});
    widget.y=0;
    widget.last_y=0;
    if(widget.element)widget.element.style.display="none";
};

const dirty=(node:any)=>node.graph?.setDirtyCanvas?.(true,true);
const chain=(nodeType:any,name:"onNodeCreated"|"onConfigure"|"onConnectionsChange",prepare:(node:any)=>void)=>{
    const original=nodeType.prototype[name];
    nodeType.prototype[name]=function(){const result=original?.apply(this,arguments);queueMicrotask(()=>prepare(this));return result};
};

export function installLutNodePresentation(nodeType:any,nodeData:any,deps:LutPresentationDependencies):boolean{
    const nodeName=String(nodeData?.name??"");
    if(nodeName==="BV LUT Registry"){
        const prepare=(node:any)=>{
            node.__bvPresentationManaged=true;
            const hidden=node.widgets?.find((item:any)=>item.name==="config_json");
            if(!hidden)return;
            hideWidget(hidden);
            const normalized=parseLutRegistryConfig(hidden.value),serialized=serializeLutRegistryConfig(normalized);
            if(String(hidden.value??"")!==serialized){hidden.value=serialized;hidden.callback?.(serialized)}
            prepareLutRegistryV3(node);
            let action=node.widgets?.find((item:any)=>item.name==="configure_lut_registry");
            if(!action){
                action=node.addWidget("button","configure_lut_registry",null,()=>deps.openRegistry(
                    deps.api,hidden.value,value=>{hidden.value=value;hidden.callback?.(value);prepare(node);dirty(node)},
                    `lut-registry:${deps.scopedNodeKey(node)}`,
                    deps.workflowNodesOfType(nodeName).filter(deps.windowMenuVisible).map(item=>({id:deps.scopedNodeKey(item),label:`${item.title||nodeName} · #${item.id}`})),
                    (targetId,replace)=>{const target=deps.workflowNodesOfType(nodeName).find(item=>deps.scopedNodeKey(item)===targetId),targetAction=target?.widgets?.find((item:any)=>item.name==="configure_lut_registry");if(targetAction)deps.switchView(`lut-registry:${deps.scopedNodeKey(node)}`,`lut-registry:${deps.scopedNodeKey(target)}`,()=>targetAction.callback?.(),replace)},
                    node,
                ).catch(console.error),{serialize:false});
                action.serialize=false;
            }
            const count=normalized.luts.length;
            action.label=`Configure LUT Registry · ${count} LUT${count===1?"":"s"}`;
            applyClassicNodePresentation(node,nodeName);
            dirty(node);
        };
        chain(nodeType,"onNodeCreated",prepare);chain(nodeType,"onConfigure",prepare);return true;
    }
    if(nodeName==="BV LUT Loader"){
        const prepare=(node:any)=>{
            const combo=node.widgets?.find((item:any)=>item.name==="lut_name");
            if(!combo)return;
            const reconcile=()=>{
                const current=Array.isArray(combo.options?.values)?combo.options.values.map(String):[];
                const merged=mergeLutChoices(current,lutLibrary.getSnapshot());
                if(!combo.options)combo.options={};
                if(merged.length!==current.length||merged.some((value,index)=>value!==current[index])){combo.options.values=merged;dirty(node)}
                const value=String(combo.value??"");
                if(value&&!value.startsWith("Built-in: ")&&value!=="Download more LUTs…")combo.value=canonicalLutPath(value);
            };
            lutLibrary.seed(Array.isArray(combo.options?.values)?combo.options.values:[]);
            reconcile();
            if(!combo.__bvLutLibraryUnsubscribe)combo.__bvLutLibraryUnsubscribe=lutLibrary.subscribe(reconcile);
            if(combo.__bvLutDownloadInstalled)return;
            combo.__bvLutDownloadInstalled=true;
            let previous=String(combo.value??"Built-in: Identity");
            const callback=combo.callback;
            combo.callback=function(value:any){
                if(String(value)!=="Download more LUTs…"){previous=String(value);return callback?.apply(this,arguments)}
                combo.value=previous;
                deps.openDownload(path=>{const normalized=canonicalLutPath(path);reconcile();combo.value=normalized;previous=normalized;callback?.call(combo,normalized);dirty(node)});
            };
        };
        const removed=nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved=function(){try{return removed?.apply(this,arguments)}finally{const combo=this.widgets?.find((item:any)=>item.name==="lut_name");combo?.__bvLutLibraryUnsubscribe?.();if(combo)delete combo.__bvLutLibraryUnsubscribe}};
        chain(nodeType,"onNodeCreated",prepare);chain(nodeType,"onConfigure",prepare);return true;
    }
    if(nodeName==="BV LUT Loop Start"){
        const prepare=(node:any)=>{node.__bvPresentationManaged=true;prepareLutV3(node,deps.graphOwner(node));applyClassicNodePresentation(node,nodeName)};
        chain(nodeType,"onNodeCreated",prepare);chain(nodeType,"onConfigure",prepare);chain(nodeType,"onConnectionsChange",prepare);return true;
    }
    if(nodeName==="BV Regional LUT Plan"){
        const prepare=(node:any)=>{
            node.__bvPresentationManaged=true;
            prepareLutV3(node,deps.graphOwner(node));
            const hidden=node.widgets?.find((item:any)=>item.name==="config_json");
            if(!hidden)return;
            hideWidget(hidden);
            let action=node.widgets?.find((item:any)=>item.name==="configure_lut_plan");
            if(!action){
                action=node.addWidget("button","configure_lut_plan",null,()=>{
                    const document=deps.sourceDocument(node);if(!document)return;
                    deps.openPlan({nodeId:deps.scopedNodeKey(node),regions:document.regions,lutCollectors:lutV3Catalog(node),detectorCollectors:deps.detectorCollectors(node),stored:hidden.value,save:(value:string)=>{hidden.value=value;hidden.callback?.(value);prepareLutV3(node,deps.graphOwner(node));prepare(node);dirty(node)},nodes:deps.workflowNodesOfType(nodeName).filter(deps.windowMenuVisible).map(item=>({id:deps.scopedNodeKey(item),label:`${item.title||nodeName} · #${item.id}`})),onNavigate:(targetId:string,replace:boolean)=>{const target=deps.workflowNodesOfType(nodeName).find(item=>deps.scopedNodeKey(item)===targetId),targetAction=target?.widgets?.find((item:any)=>item.name==="configure_lut_plan");if(targetAction)deps.switchView(`lut-plan:${deps.scopedNodeKey(node)}`,`lut-plan:${deps.scopedNodeKey(target)}`,()=>targetAction.callback?.(),replace)},currentNode:node});
                },{serialize:false});
                action.serialize=false;
            }
            const document=deps.sourceDocument(node),count=document?parseLutPlanConfig(hidden.value,document.regions).jobs.length:0;
            action.label=document?`Configure LUT Plan · ${count} Job${count===1?"":"s"}`:"Connect a BV Regional Prompt";
            action.disabled=!document;
            applyClassicNodePresentation(node,nodeName);
            dirty(node);
        };
        chain(nodeType,"onNodeCreated",prepare);chain(nodeType,"onConfigure",prepare);chain(nodeType,"onConnectionsChange",prepare);return true;
    }
    return false;
}

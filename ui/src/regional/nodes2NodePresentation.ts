import{legacyDebugVisible}from"./legacyPorts.js";
import{resolveNodePresentation}from"./nodePresentation.js";
import{refreshProjectedProviderAnchors}from"./portProjection.js";
import{configurePresentationSizeLifecycle,installPresentationSizeLifecycle,isPresentationUserResizing,presentationSize,setAutomaticPresentationSize}from"./presentationSize.js";

type Nodes2Document=Pick<Document,"querySelector">;
type Nodes2PresentationOptions=Readonly<{legacyDebug?:boolean}>;
type ManagedPresentation={node:any;nodeType:string;documentLike:Nodes2Document;classicRestored?:boolean};

const managed=new Map<any,ManagedPresentation>();
type LegacyColorBinding={variable:string;value:string;priority:string};
type HeightBinding={value:string;priority:string;applied:string};
type GeometryBinding={element:any;observer:any;observed:Set<any>};
const legacyColorBindings=new WeakMap<object,LegacyColorBinding>();
const legacyRowsByNode=new Map<any,Set<any>>();
const heightBindings=new WeakMap<object,HeightBinding>();
const geometryBindings=new WeakMap<object,GeometryBinding>();
const geometryFrames=new WeakMap<object,number>();
const settleTokens=new WeakMap<object,object>();
let observer:MutationObserver|undefined;
let projectionFrame=0;
const NODES2_CHROME_HEIGHT=36;
export function configureNodes2NodePresentation(options:{isUserResizing?:(node:any)=>boolean}){configurePresentationSizeLifecycle(options)}

const escaped=(value:unknown)=>typeof CSS!=="undefined"&&CSS.escape?CSS.escape(String(value)):String(value).replace(/["\\]/g,"\\$&");
const rows=(element:any,selector:string)=>[...(element?.querySelectorAll?.(selector)??[])];
const canonicalRowIndexes=(items:any[],direction:"input"|"output")=>{
    const indexed=new Map<number,any>(),token=direction==="input"?"in":"out";
    for(const row of items){
        const marker=row?.querySelector?.("[data-slot-key]"),key=marker?.dataset?.slotKey??marker?.getAttribute?.("data-slot-key"),match=String(key??"").match(/-(in|out)-(\d+)$/);
        if(match?.[1]===token)indexed.set(Number(match[2]),row);
    }
    return indexed;
};
const originalDisplay=(row:any)=>row?.dataset?.bvPresentationDisplay??row?.style?.display??"";
const originalVisibility=(row:any)=>row?.dataset?.bvPresentationVisibility??row?.style?.visibility??"";
const setVisible=(row:any,visible:boolean)=>{
    if(!row)return;
    row.dataset??={};
    if(row.dataset.bvPresentationDisplay===undefined)row.dataset.bvPresentationDisplay=originalDisplay(row);
    if(row.dataset.bvPresentationVisibility===undefined)row.dataset.bvPresentationVisibility=originalVisibility(row);
    const marker=visible?"true":"false";
    if(row.dataset.bvPresentationVisible!==marker)row.dataset.bvPresentationVisible=marker;
    if(Boolean(row.hidden)===visible)row.hidden=!visible;
    if(row.style){const display=visible?"":"none";if(row.style.display!==display)row.style.display=display;if(row.style.visibility!=="")row.style.visibility="";}
};
const ensureProjectionStyle=()=>{
    if(typeof document==="undefined"||document.getElementById("bv-nodes2-presentation-style"))return;
    const style=document.createElement("style");
    style.id="bv-nodes2-presentation-style";
    style.textContent=[
        '[data-testid="node-widget"][data-bv-presentation-visible="true"]{display:grid!important}',
        '[data-testid="node-widget"][data-bv-presentation-visible="false"]{display:none!important}',
        '.lg-node .lg-slot[data-bv-presentation-provider-anchor]{display:flex!important;position:absolute!important;top:5px!important;z-index:30!important;margin:0!important}',
        '.lg-node .lg-slot[data-bv-presentation-provider-anchor="input"]{left:0!important;right:auto!important}',
        '.lg-node .lg-slot[data-bv-presentation-provider-anchor="output"]{right:0!important;left:auto!important}',
        '.lg-node .lg-slot[data-bv-presentation-provider-visible="false"]{visibility:hidden!important;pointer-events:none!important}',
        '.lg-node .lg-slot[data-bv-presentation-provider-visible="true"]{visibility:visible!important}',
        '.lg-slot--input[data-bv-presentation-provider-anchor]>:last-child,.lg-slot--output[data-bv-presentation-provider-anchor]>:first-child{display:none!important}',
    ].join("");
    document.head.append(style);
};
const setLegacyVisible=(row:any,visible:boolean)=>{
    setVisible(row,true);
    if(row?.style){const visibility=visible?"":"hidden";if(row.style.visibility!==visibility)row.style.visibility=visibility;}
};
const syncElementHeight=(element:any,height:number)=>{
    const style=element?.style;if(!style?.setProperty||!Number.isFinite(height)||height<=0)return;
    let binding=heightBindings.get(element);
    if(!binding){binding={value:style.getPropertyValue?.("--node-height")??"",priority:style.getPropertyPriority?.("--node-height")??"",applied:""};heightBindings.set(element,binding)}
    const applied=`${height}px`;binding.applied=applied;
    if(style.getPropertyValue?.("--node-height")!==applied)style.setProperty("--node-height",applied);
};
const restoreElementHeight=(element:any)=>{
    const style=element?.style,binding=element&&heightBindings.get(element);if(!style||!binding)return;
    if(style.getPropertyValue?.("--node-height")===binding.applied){if(binding.value)style.setProperty("--node-height",binding.value,binding.priority);else style.removeProperty?.("--node-height")}
    heightBindings.delete(element);
};
const cancelGeometryProjection=(node:any)=>{
    const frame=geometryFrames.get(node);
    if(frame!==undefined&&typeof cancelAnimationFrame!=="undefined")cancelAnimationFrame(frame);
    geometryFrames.delete(node);
};
const disconnectGeometryObservation=(node:any)=>{
    cancelGeometryProjection(node);
    geometryBindings.get(node)?.observer?.disconnect?.();
    geometryBindings.delete(node);
};
const scheduleGeometryProjection=(node:any)=>{
    if(geometryFrames.has(node)||typeof requestAnimationFrame==="undefined")return;
    const frame=requestAnimationFrame(()=>{
        geometryFrames.delete(node);
        const entry=managed.get(node);
        if(!entry||entry.node?.graph==null){disconnectGeometryObservation(node);return}
        projectNodes2NodePresentation(entry.node,entry.nodeType,entry.documentLike);
    });
    geometryFrames.set(node,frame);
};
const syncGeometryObservation=(node:any,element:any,targets:any[])=>{
    const Observer=(globalThis as any).ResizeObserver;
    if(typeof Observer!=="function"||!managed.has(node))return;
    let binding=geometryBindings.get(node);
    if(!binding||binding.element!==element){
        binding?.observer?.disconnect?.();
        const observer=new Observer(()=>scheduleGeometryProjection(node));
        binding={element,observer,observed:new Set<any>()};geometryBindings.set(node,binding);
    }
    const next=new Set(targets.filter(Boolean));
    for(const target of binding.observed)if(!next.has(target))binding.observer.unobserve?.(target);
    for(const target of next)if(!binding.observed.has(target))binding.observer.observe?.(target);
    binding.observed=next;
};
const restoreLegacyColor=(row:any)=>{
    const binding=row&&legacyColorBindings.get(row);
    if(!binding)return;
    if(row.style?.getPropertyValue?.(binding.variable)!==undefined){
        if(binding.value)row.style.setProperty(binding.variable,binding.value,binding.priority);
        else row.style.removeProperty?.(binding.variable);
    }
    if(row.dataset)delete row.dataset.bvPresentationLegacyConnected;
    legacyColorBindings.delete(row);
};
const graphLink=(node:any,id:any)=>{
    if(id===null||id===undefined)return undefined;
    const graph=node?.graph,direct=graph?.getLink?.(id);
    if(direct)return direct;
    for(const collection of[graph?.links,graph?._links]){
        const link=collection instanceof Map?collection.get(id):collection?.[id];
        if(link)return link;
    }
    return undefined;
};
const connectedLink=(node:any,slot:any,direction:"input"|"output")=>{
    const ids=direction==="input"?[slot?.link]:Array.isArray(slot?.links)?slot.links:[];
    return ids.map((id:any)=>graphLink(node,id)).find(Boolean);
};
const canonicalLinkColor=(node:any,slot:any,link:any)=>{
    if(link?.color)return String(link.color);
    const globalCanvas=(globalThis as any).LGraphCanvas??(globalThis as any).LiteGraph?.LGraphCanvas;
    const palette=globalCanvas?.link_type_colors;
    const type=String(link?.type??slot?.type??"");
    const canvas=node?.graph?.list_of_graphcanvas?.[0]??node?.graph?.canvas;
    return palette?.[type]??palette?.[String(slot?.type??"")]??canvas?.default_link_color;
};
const projectLegacyColor=(row:any,node:any,slot:any,direction:"input"|"output")=>{
    restoreLegacyColor(row);
    if(!row?.style||!slot)return;
    const link=connectedLink(node,slot,direction),color=canonicalLinkColor(node,slot,link);
    if(!link||!color)return;
    const variable=`--color-datatype-${String(slot.type??link.type??"").toUpperCase()}`;
    if(variable.endsWith("-"))return;
    legacyColorBindings.set(row,{variable,value:row.style.getPropertyValue?.(variable)??"",priority:row.style.getPropertyPriority?.(variable)??""});
    row.style.setProperty(variable,String(color));
    row.dataset??={};row.dataset.bvPresentationLegacyConnected="true";
};
const clearProviderAnchor=(row:any)=>{
    if(!row?.dataset)return;
    delete row.dataset.bvPresentationProviderAnchor;
    delete row.dataset.bvPresentationProviderVisible;
};
const setProviderAnchor=(row:any,direction:"input"|"output",visible:boolean)=>{
    if(!row)return;
    setVisible(row,true);
    row.dataset.bvPresentationProviderAnchor=direction;
    row.dataset.bvPresentationProviderVisible=visible?"true":"false";
};
const connected=(slot:any,direction:"input"|"output")=>direction==="input"?slot?.link!=null:Boolean(slot?.links?.length);

export function projectNodes2NodePresentation(node:any,nodeType:string,documentLike?:Nodes2Document,options:Nodes2PresentationOptions={}){
    if(!documentLike)return false;
    const element=documentLike.querySelector?.(`.lg-node[data-node-id="${escaped(node?.id)}"]`) as HTMLElement|null;
    if(!element){disconnectGeometryObservation(node);return false;}
    installPresentationSizeLifecycle(node);
    node.__bvNodes2PresentationActive=true;
    refreshProjectedProviderAnchors(node,false);
    const context={surface:"nodes2" as const,legacyDebug:options.legacyDebug??legacyDebugVisible()};
    const plan=resolveNodePresentation(nodeType,{
        ports:[
            ...(node.inputs??[]).map((slot:any)=>({direction:"input" as const,name:String(slot?.name??""),type:String(slot?.type??""),connected:connected(slot,"input")})),
            ...(node.outputs??[]).map((slot:any)=>({direction:"output" as const,name:String(slot?.name??""),type:String(slot?.type??""),connected:connected(slot,"output")})),
        ],
        widgets:(node.widgets??[]).map((widget:any)=>({name:String(widget?.name??"")})),
    },context);
    const inputRows=rows(element,".lg-slot--input"),outputRows=rows(element,".lg-slot--output"),inputRowsByIndex=canonicalRowIndexes(inputRows,"input"),outputRowsByIndex=canonicalRowIndexes(outputRows,"output");
    const previousLegacyRows=legacyRowsByNode.get(node)??new Set<any>(),currentLegacyRows=new Set<any>();
    let inputIndex=0,outputIndex=0,reservedInputs=0,reservedOutputs=0,measuredInputs=0,measuredOutputs=0;
    const measuredRowHeights:number[]=[];
    for(const port of plan.ports){
        const index=port.direction==="input"?inputIndex++:outputIndex++,indexed=port.direction==="input"?inputRowsByIndex:outputRowsByIndex,ordered=port.direction==="input"?inputRows:outputRows,row=indexed.size?indexed.get(index):ordered[index];
        if(port.role!=="provider"&&(port.visible||port.role==="legacy")){
            const rowHeight=Number(row?.offsetHeight??0);
            if(port.direction==="input"){reservedInputs++;if(rowHeight>0){measuredInputs++;measuredRowHeights.push(rowHeight)}}
            else{reservedOutputs++;if(rowHeight>0){measuredOutputs++;measuredRowHeights.push(rowHeight)}}
        }
        if(port.role==="provider"){
            restoreLegacyColor(row);
            setProviderAnchor(row,port.direction,context.legacyDebug);
            continue;
        }
        restoreLegacyColor(row);
        clearProviderAnchor(row);
        const target=!port.visible&&port.role!=="legacy"?(row?.closest?.('[data-testid="node-widget"]')??row):row;
        if(port.role==="legacy"){
            setLegacyVisible(target,port.visible);
            currentLegacyRows.add(row);
            const slot=(port.direction==="input"?node.inputs:node.outputs)?.[index];
            projectLegacyColor(row,node,slot,port.direction);
        }else setVisible(target,port.visible);
    }
    for(const row of previousLegacyRows)if(!currentLegacyRows.has(row))restoreLegacyColor(row);
    if(currentLegacyRows.size)legacyRowsByNode.set(node,currentLegacyRows);else legacyRowsByNode.delete(node);
    const widgetRows=rows(element,'[data-testid="node-widgets"] > [data-testid="node-widget"]');
    const remainingWidgets=[...(node.widgets??[])];
    for(const row of widgetRows){
        const label=row?.querySelector?.('[data-testid="widget-layout-field-label"]')?.textContent??row?.textContent??"";
        const normalized=String(label).trim();
        const matching=remainingWidgets.filter((widget:any)=>String(widget?.name??"")===normalized||String(widget?.label??"")===normalized);
        const plans=matching.map((widget:any)=>({widget,projected:resolveNodePresentation(nodeType,{ports:[],widgets:[{name:String(widget?.name??"")}]},context).widgets[0]}));
        const selected=plans.find(({projected})=>projected?.visible!==false)??plans[0];
        if(selected){const index=remainingWidgets.indexOf(selected.widget);if(index>=0)remainingWidgets.splice(index,1)}
        const projected=selected?.projected??resolveNodePresentation(nodeType,{ports:[],widgets:[{name:normalized}]},context).widgets[0];
        setVisible(row,projected?.visible!==false);
    }
    syncGeometryObservation(node,element,[element,...inputRows,...outputRows,...widgetRows]);
    const visibleMountedWidgets=widgetRows.some((row:any)=>!row?.hidden&&row?.style?.display!=="none"&&Number(row?.offsetHeight??0)>0),portOnly=!visibleMountedWidgets,completeGeometry=reservedInputs===measuredInputs&&reservedOutputs===measuredOutputs&&(reservedInputs>0||reservedOutputs>0),canonicalRowHeight=measuredRowHeights.length?Math.max(...measuredRowHeights):0,mountedPortHeight=portOnly&&completeGeometry?Math.max(60,NODES2_CHROME_HEIGHT+Math.max(reservedInputs,reservedOutputs)*canonicalRowHeight):0;
    const height=mountedPortHeight||Number(node.__bvPresentationAutoHeight);
    const newBaseline=Number.isFinite(height)&&height>0&&node.__bvNodes2CompactedHeight!==height;
    if(Number.isFinite(height)&&height>0){
        if(newBaseline)node.__bvNodes2CompactedHeight=height;
        const next=presentationSize(node,[node.size?.[0]??220,height]),appliedHeight=Number(node.__bvNodes2CompactedAppliedHeight),currentHeight=Number(node.size?.[1]),atTarget=Math.abs(currentHeight-next[1])<=.001,hostDrift=Number.isFinite(appliedHeight)&&Math.abs(appliedHeight-next[1])<=.001&&!atTarget;
        const resizing=isPresentationUserResizing(node);
        if(!resizing&&node.setSize&&(newBaseline||hostDrift)&&!atTarget){setAutomaticPresentationSize(node,next);node.__bvNodes2CompactedAppliedHeight=Number(node.size?.[1])}
        else if(atTarget)node.__bvNodes2CompactedAppliedHeight=next[1];
        if(!resizing&&Math.abs(Number(node.size?.[1])-next[1])<=.001)syncElementHeight(element,next[1]);
    }
    element.dataset.bvPresentation=nodeType;
    return true;
}

const projectManaged=()=>{
    for(const[node,entry]of managed){
        if(entry.node?.graph==null){const element=entry.documentLike.querySelector?.(`.lg-node[data-node-id="${escaped(entry.node?.id)}"]`);restoreElementHeight(element);disconnectGeometryObservation(node);managed.delete(node);settleTokens.delete(node);delete entry.node?.__bvApplyNodes2Presentation;continue}
        const projected=projectNodes2NodePresentation(entry.node,entry.nodeType,entry.documentLike);
        if(projected){entry.classicRestored=false;continue}
        if(!entry.classicRestored){entry.classicRestored=true;entry.node.__bvNodes2PresentationActive=false;entry.node.__bvApplyPresentation?.()}
    }
    if(!managed.size){observer?.disconnect();observer=undefined}
};
const scheduleProjectManaged=()=>{
    if(projectionFrame)return;
    projectionFrame=requestAnimationFrame(()=>{projectionFrame=0;projectManaged()});
};
const scheduleSettledProjection=(node:any)=>{
    const token={};settleTokens.set(node,token);
    for(const delay of[0,50,150])setTimeout(()=>{
        if(settleTokens.get(node)!==token)return;
        const entry=managed.get(node);
        if(!entry||entry.node?.graph==null){settleTokens.delete(node);return}
        projectNodes2NodePresentation(entry.node,entry.nodeType,entry.documentLike);
        if(delay===150&&settleTokens.get(node)===token)settleTokens.delete(node);
    },delay);
};

export function installNodes2NodePresentation(node:any,nodeType:string,documentLike?:Nodes2Document){
    documentLike??=typeof document!=="undefined"?document:undefined;
    if(!documentLike)return;
    installPresentationSizeLifecycle(node);
    ensureProjectionStyle();
    const previous=managed.get(node);
    managed.set(node,{node,nodeType,documentLike,classicRestored:previous?.classicRestored});
    projectNodes2NodePresentation(node,nodeType,documentLike);
    if(typeof MutationObserver!=="undefined"&&!observer&&typeof document!=="undefined"&&documentLike===document){
        observer=new MutationObserver(scheduleProjectManaged);
        observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
    }
    node.__bvApplyNodes2Presentation=()=>projectNodes2NodePresentation(node,nodeType,documentLike);
    scheduleSettledProjection(node);
}

export function removeNodes2NodePresentation(node:any){
    for(const row of legacyRowsByNode.get(node)??[])restoreLegacyColor(row);
    legacyRowsByNode.delete(node);
    const entry=managed.get(node),element=entry?.documentLike.querySelector?.(`.lg-node[data-node-id="${escaped(node?.id)}"]`);restoreElementHeight(element);
    disconnectGeometryObservation(node);managed.delete(node);settleTokens.delete(node);delete node?.__bvApplyNodes2Presentation;delete node?.__bvNodes2PresentationActive;delete node?.__bvNodes2CompactedAppliedHeight;
    if(managed.size)return;
    observer?.disconnect();observer=undefined;
    if(projectionFrame&&typeof cancelAnimationFrame!=="undefined")cancelAnimationFrame(projectionFrame);
    projectionFrame=0;
}

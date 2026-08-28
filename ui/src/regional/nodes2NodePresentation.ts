import{legacyDebugVisible}from"./legacyPorts.js";
import{resolveNodePresentation}from"./nodePresentation.js";

type Nodes2Document=Pick<Document,"querySelector">;
type Nodes2PresentationOptions=Readonly<{legacyDebug?:boolean}>;
type ManagedPresentation={node:any;nodeType:string;documentLike:Nodes2Document;classicRestored?:boolean};

const managed=new Map<any,ManagedPresentation>();
let observer:MutationObserver|undefined;
let projectionFrame=0;
let userResizeProbe=(node:any)=>false;

export function configureNodes2NodePresentation(options:{isUserResizing?:(node:any)=>boolean}){userResizeProbe=options.isUserResizing??(()=>false)}

const escaped=(value:unknown)=>typeof CSS!=="undefined"&&CSS.escape?CSS.escape(String(value)):String(value).replace(/["\\]/g,"\\$&");
const rows=(element:any,selector:string)=>[...(element?.querySelectorAll?.(selector)??[])];
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
    style.textContent='[data-testid="node-widget"][data-bv-presentation-visible="true"]{display:grid!important}[data-testid="node-widget"][data-bv-presentation-visible="false"]{display:none!important}';
    document.head.append(style);
};
const setLegacyVisible=(row:any,visible:boolean)=>{
    setVisible(row,true);
    if(row?.style){const visibility=visible?"":"hidden";if(row.style.visibility!==visibility)row.style.visibility=visibility;}
};
const connected=(slot:any,direction:"input"|"output")=>direction==="input"?slot?.link!=null:Boolean(slot?.links?.length);

export function projectNodes2NodePresentation(node:any,nodeType:string,documentLike?:Nodes2Document,options:Nodes2PresentationOptions={}){
    if(!documentLike)return false;
    const element=documentLike.querySelector?.(`.lg-node[data-node-id="${escaped(node?.id)}"]`) as HTMLElement|null;
    if(!element)return false;
    node.__bvNodes2PresentationActive=true;
    const context={surface:"nodes2" as const,legacyDebug:options.legacyDebug??legacyDebugVisible()};
    const plan=resolveNodePresentation(nodeType,{
        ports:[
            ...(node.inputs??[]).map((slot:any)=>({direction:"input" as const,name:String(slot?.name??""),connected:connected(slot,"input")})),
            ...(node.outputs??[]).map((slot:any)=>({direction:"output" as const,name:String(slot?.name??""),connected:connected(slot,"output")})),
        ],
        widgets:(node.widgets??[]).map((widget:any)=>({name:String(widget?.name??"")})),
    },context);
    const inputRows=rows(element,".lg-slot--input"),outputRows=rows(element,".lg-slot--output");
    let inputIndex=0,outputIndex=0;
    for(const port of plan.ports){
        const row=port.direction==="input"?inputRows[inputIndex++]:outputRows[outputIndex++];
        const target=!port.visible&&port.role!=="legacy"?(row?.closest?.('[data-testid="node-widget"]')??row):row;
        if(port.role==="legacy")setLegacyVisible(target,port.visible);else setVisible(target,port.visible);
    }
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
    const height=Number(node.__bvPresentationAutoHeight);
    const newBaseline=Number.isFinite(height)&&height>0&&node.__bvNodes2CompactedHeight!==height;
    if(newBaseline){
        node.__bvNodes2CompactedHeight=height;
        if(!userResizeProbe(node)&&node.setSize&&height!==node.size?.[1])node.setSize([node.size?.[0]??220,height]);
    }
    element.dataset.bvPresentation=nodeType;
    return true;
}

const projectManaged=()=>{
    for(const[node,entry]of managed){
        if(entry.node?.graph==null){managed.delete(node);delete entry.node?.__bvApplyNodes2Presentation;continue}
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

export function installNodes2NodePresentation(node:any,nodeType:string,documentLike?:Nodes2Document){
    documentLike??=typeof document!=="undefined"?document:undefined;
    if(!documentLike)return;
    ensureProjectionStyle();
    const previous=managed.get(node);
    managed.set(node,{node,nodeType,documentLike,classicRestored:previous?.classicRestored});
    projectNodes2NodePresentation(node,nodeType,documentLike);
    if(typeof MutationObserver!=="undefined"&&!observer&&typeof document!=="undefined"&&documentLike===document){
        observer=new MutationObserver(scheduleProjectManaged);
        observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["hidden"]});
    }
    node.__bvApplyNodes2Presentation=()=>projectNodes2NodePresentation(node,nodeType,documentLike);
}

export function removeNodes2NodePresentation(node:any){
    managed.delete(node);delete node?.__bvApplyNodes2Presentation;delete node?.__bvNodes2PresentationActive;
    if(managed.size)return;
    observer?.disconnect();observer=undefined;
    if(projectionFrame&&typeof cancelAnimationFrame!=="undefined")cancelAnimationFrame(projectionFrame);
    projectionFrame=0;
}

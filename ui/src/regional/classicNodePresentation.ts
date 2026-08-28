import{legacyDebugVisible}from"./legacyPorts.js";
import{resolveNodePresentation}from"./nodePresentation.js";
import{installNodes2NodePresentation}from"./nodes2NodePresentation.js";

type ClassicPresentationOptions=Readonly<{legacyDebug?:boolean;minWidth?:number;compactWidgetOnly?:boolean;widgetStartY?:number}>;

const connected=(slot:any,direction:"input"|"output")=>direction==="input"?slot?.link!=null:Boolean(slot?.links?.length);
const measurementView=(node:any,omitPromotedWidgetInputs=false)=>new Proxy(node,{get(target,key){
    if(key==="size")return[Number(target.size?.[0]??0),60];
    if(key==="inputs")return(target.inputs??[]).filter((slot:any)=>!slot.hidden&&(!omitPromotedWidgetInputs||!target.getWidgetFromSlot?.(slot)));
    if(key==="outputs")return(target.outputs??[]).filter((slot:any)=>!slot.hidden);
    if(key==="widgets")return(target.widgets??[]).filter((widget:any)=>!widget.hidden);
    return Reflect.get(target,key,target);
}});

export function applyClassicSubgraphLayout(node:any,widgetStartY=8){
    if(!node?.computeSize)return;
    node.widgets_start_y=widgetStartY;
    const original=node.__bvPresentationOriginalComputeSize??node.computeSize;
    const computed=original.apply(measurementView(node,true));
    const next:[number,number]=[Math.max(220,Number(node.size?.[0]??computed?.[0]??220)),Math.max(60,Number(computed?.[1]??60))];
    if(Number(node.size?.[1]??0)!==next[1])node.setSize?.(next);
    node.setDirtyCanvas?.(true,true);
    node.graph?.setDirtyCanvas?.(true,true);
    return next;
}

function installMeasuredComputeSize(node:any){
    if(!node?.computeSize||node.__bvPresentationOriginalComputeSize)return;
    const original=node.computeSize;
    node.__bvPresentationOriginalComputeSize=original;
    node.computeSize=function(){return original.apply(measurementView(this),arguments)};
}

export function applyClassicNodePresentation(node:any,nodeType:string,options:ClassicPresentationOptions={}){
    const legacyDebug=options.legacyDebug??legacyDebugVisible();
    const ports=[
        ...(node.inputs??[]).map((slot:any)=>({direction:"input" as const,name:String(slot?.name??""),connected:connected(slot,"input")})),
        ...(node.outputs??[]).map((slot:any)=>({direction:"output" as const,name:String(slot?.name??""),connected:connected(slot,"output")})),
    ];
    const widgets=(node.widgets??[]).map((widget:any)=>({name:String(widget?.name??"")}));
    const plan=resolveNodePresentation(nodeType,{ports,widgets},{surface:"classic",legacyDebug});
    if(options.widgetStartY!==undefined)node.widgets_start_y=options.widgetStartY;
    node.__bvPresentationHasLegacy=plan.ports.some(port=>port.role==="legacy");
    for(const projected of plan.ports){
        const slots=projected.direction==="input"?node.inputs:node.outputs;
        const slot=slots?.find((candidate:any)=>String(candidate?.name??"")===projected.name);
        if(!slot)continue;
        slot.__bvPresentationRole=projected.role;
        slot.__bvLegacyPort=projected.role==="legacy";
        slot.__bvResourceSlot=projected.role==="provider";
        slot.hidden=projected.role==="legacy"?false:!projected.visible;
        slot.__bvM0PortHidden=!projected.visible;
        slot.__bvM0VisualHidden=!projected.visible;
        if(projected.role==="provider"){slot.label="";slot.localized_name="";}
    }
    for(const projected of plan.widgets){
        const widget=node.widgets?.find((candidate:any)=>String(candidate?.name??"")===projected.name);
        if(!widget)continue;
        widget.__bvPresentationRole=projected.role;
        widget.__bvPresentationOriginal??={type:widget.type,hidden:Boolean(widget.hidden),computeSize:widget.computeSize,display:widget.element?.style?.display??"",y:widget.y,last_y:widget.last_y};
        if(!projected.visible){
            widget.hidden=true;
            widget.options??={};
            widget.options.hidden=true;
            widget.type="converted-widget";
            widget.computeSize=()=>[0,0];
            widget.y=0;widget.last_y=0;
            if(widget.element)widget.element.style.display="none";
        }else{
            widget.hidden=false;
            if(widget.options)widget.options.hidden=false;
            widget.type=widget.__bvPresentationOriginal.type;
            widget.computeSize=widget.__bvPresentationOriginal.computeSize;
            widget.y=widget.__bvPresentationOriginal.y;widget.last_y=widget.__bvPresentationOriginal.last_y;
            if(widget.element)widget.element.style.display=widget.__bvPresentationOriginal.display;
        }
    }
    installMeasuredComputeSize(node);
    const width=Math.max(220,Number(options.minWidth??0),Number(node.size?.[0]??0));
    const computed=node.computeSize?.()??node.size??[width,60];
    const widgetOnlyHeight=options.compactWidgetOnly&&plan.ports.every(port=>!port.visible)
        ?40+plan.widgets.reduce((height,projected)=>{if(!projected.visible)return height;const widget=node.widgets?.find((candidate:any)=>String(candidate?.name??"")===projected.name);return height+Math.max(0,Number(widget?.computeSize?.()[1]??20))},0)
        :undefined;
    const next:[number,number]=[Math.max(width,Number(computed[0]??0)),Math.max(60,Number(widgetOnlyHeight??computed[1]??60))];
    const reservedInputs=plan.ports.filter(port=>port.direction==="input"&&(port.visible||port.role==="legacy")).length;
    const reservedOutputs=plan.ports.filter(port=>port.direction==="output"&&(port.visible||port.role==="legacy")).length;
    const semanticWidgetHeight=plan.widgets.reduce((height,projected)=>{if(!projected.visible)return height;const widget=node.widgets?.find((candidate:any)=>String(candidate?.name??"")===projected.name);return height+Math.max(0,Number(widget?.computeSize?.()[1]??20))},0);
    node.__bvPresentationAutoHeight=Math.max(60,40+Math.max(reservedInputs,reservedOutputs)*20+semanticWidgetHeight);
    if(!node.__bvNodes2PresentationActive&&(Number(node.size?.[0]??0)!==next[0]||Number(node.size?.[1]??0)!==next[1]))node.setSize?.(next);
    node.__bvApplyPresentation=()=>applyClassicNodePresentation(node,nodeType,options);
    installNodes2NodePresentation(node,nodeType);
    node.setDirtyCanvas?.(true,true);
    node.graph?.setDirtyCanvas?.(true,true);
    return plan;
}

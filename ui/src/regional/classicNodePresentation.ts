import{legacyDebugVisible}from"./legacyPorts.js";
import{resolveNodePresentation}from"./nodePresentation.js";
import{installNodes2NodePresentation,removeNodes2NodePresentation}from"./nodes2NodePresentation.js";
import{applyProjectedSlotLabel,cancelScheduledProjectedPortLayout,installProjectedProviderAnchors,removeProjectedProviderAnchors}from"./portProjection.js";
import{installPresentationSizeLifecycle,presentationSize,removePresentationSizeLifecycle,setAutomaticPresentationSize}from"./presentationSize.js";

type ClassicPresentationOptions=Readonly<{legacyDebug?:boolean;minWidth?:number;compactWidgetOnly?:boolean}>;
type WidgetStartOrigin={kind:"own";descriptor:PropertyDescriptor}|{kind:"inherited"}|{kind:"absent"};
type WidgetStartBinding={origin:WidgetStartOrigin;value:number};

const connected=(slot:any,direction:"input"|"output")=>direction==="input"?slot?.link!=null:Boolean(slot?.links?.length);
const removalInstalled=new WeakSet<object>();
const widgetStartBindings=new WeakMap<object,WidgetStartBinding>();
const widgetBacked=(node:any,slot:any)=>Boolean(slot?.widget&&typeof slot.widget==="object")||Boolean(node?.getWidgetFromSlot?.(slot));
const slotHeight=()=>{const value=Number((globalThis as any).LiteGraph?.NODE_SLOT_HEIGHT??20);return Number.isFinite(value)&&value>0?value:20};
const visibleWidgetEntries=(node:any,plan:ReturnType<typeof resolveNodePresentation>)=>plan.widgets.flatMap(projected=>{const widget=node?.widgets?.find((candidate:any)=>String(candidate?.name??"")===projected.name);return projected.visible&&widget?[{projected,widget}]:[]});
const widgetStartOrigin=(node:any):WidgetStartOrigin=>{const descriptor=Object.getOwnPropertyDescriptor(node,"widgets_start_y");if(descriptor)return{kind:"own",descriptor};return"widgets_start_y"in node?{kind:"inherited"}:{kind:"absent"}};
function restoreProjectedWidgetStart(node:any){const binding=widgetStartBindings.get(node);if(!binding)return false;if(node?.widgets_start_y===binding.value){if(binding.origin.kind==="own")Object.defineProperty(node,"widgets_start_y",binding.origin.descriptor);else delete node.widgets_start_y}widgetStartBindings.delete(node);return true}
function applyProjectedWidgetStart(node:any,plan:ReturnType<typeof resolveNodePresentation>){
    const entries=plan.ports.map(projected=>{const slots=projected.direction==="input"?node?.inputs:node?.outputs;const slot=slots?.find((candidate:any)=>String(candidate?.name??"")===projected.name);return{projected,slot}});
    const rowEligible=({projected,slot}:any)=>slot&&!slot.pos&&!(projected.direction==="input"&&widgetBacked(node,slot));
    const hiddenVertical=entries.some(({projected,slot})=>slot&&!(projected.direction==="input"&&widgetBacked(node,slot))&&!projected.visible&&projected.role!=="legacy");
    const visible=entries.filter(entry=>rowEligible(entry)&&(entry.projected.visible||entry.projected.role==="legacy"));
    const visibleWidgets=visibleWidgetEntries(node,plan);
    if(!visibleWidgets.length){restoreProjectedWidgetStart(node);return}
    const leadingNativeAction=visible.length===0&&visibleWidgets[0].projected.role==="nativeAction";
    const binding=widgetStartBindings.get(node);
    if(!hiddenVertical&&!leadingNativeAction){restoreProjectedWidgetStart(node);return}
    if(!binding&&node?.widgets_start_y!==undefined&&node?.widgets_start_y!==null&&!leadingNativeAction)return;
    if(binding&&node.widgets_start_y!==binding.value)return;
    const inputs=visible.filter(({projected})=>projected.direction==="input").length,outputs=visible.filter(({projected})=>projected.direction==="output").length,rows=Math.max(inputs,outputs);
    const rowHeight=slotHeight(),rawSlotStart=Number(node?.constructor?.slot_start_y??0),slotStart=Number.isFinite(rawSlotStart)&&rawSlotStart>0?rawSlotStart:0,value=leadingNativeAction?rowHeight:rows?slotStart+(rows+.2)*rowHeight+2:2;
    const active=binding??{origin:widgetStartOrigin(node),value};active.value=value;widgetStartBindings.set(node,active);node.widgets_start_y=value;
}
export function removeNodePresentation(node:any){cancelScheduledProjectedPortLayout(node);restoreProjectedWidgetStart(node);removeProjectedProviderAnchors(node);removePresentationSizeLifecycle(node);removeNodes2NodePresentation(node)}
function installNodePresentationRemoval(node:any){if(!node||node.__bvPresentationDefinitionLifecycle||removalInstalled.has(node))return;const removed=node.onRemoved;node.onRemoved=function(){try{return removed?.apply(this,arguments)}finally{removeNodePresentation(this)}};removalInstalled.add(node)}
const measurementView=(node:any,omitPromotedWidgetInputs=false)=>new Proxy(node,{get(target,key){
    if(key==="size")return[Number(target.size?.[0]??0),60];
    if(key==="inputs")return(target.inputs??[]).filter((slot:any)=>!slot.hidden&&(!omitPromotedWidgetInputs||!target.getWidgetFromSlot?.(slot)));
    if(key==="outputs")return(target.outputs??[]).filter((slot:any)=>!slot.hidden);
    if(key==="widgets")return(target.widgets??[]).filter((widget:any)=>!widget.hidden);
    return Reflect.get(target,key,target);
}});

export function applyClassicSubgraphLayout(node:any,widgetStartY=8){
    if(!node?.computeSize)return;
    installPresentationSizeLifecycle(node);
    node.widgets_start_y=widgetStartY;
    const original=node.__bvPresentationOriginalComputeSize??node.computeSize;
    const computed=original.apply(measurementView(node,true));
    const next=presentationSize(node,[Math.max(220,Number(node.size?.[0]??computed?.[0]??220)),Math.max(60,Number(computed?.[1]??60))]);
    if(Number(node.size?.[1]??0)!==next[1])setAutomaticPresentationSize(node,next);
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
    installNodePresentationRemoval(node);
    installPresentationSizeLifecycle(node);
    const legacyDebug=options.legacyDebug??legacyDebugVisible();
    const ports=[
        ...(node.inputs??[]).map((slot:any)=>({direction:"input" as const,name:String(slot?.name??""),type:String(slot?.type??""),connected:connected(slot,"input")})),
        ...(node.outputs??[]).map((slot:any)=>({direction:"output" as const,name:String(slot?.name??""),type:String(slot?.type??""),connected:connected(slot,"output")})),
    ];
    const widgets=(node.widgets??[]).map((widget:any)=>({name:String(widget?.name??"")}));
    const plan=resolveNodePresentation(nodeType,{ports,widgets},{surface:"classic",legacyDebug});
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
        if(projected.role==="provider")applyProjectedSlotLabel(slot);
    }
    installProjectedProviderAnchors(node,legacyDebug);
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
    applyProjectedWidgetStart(node,plan);
    installMeasuredComputeSize(node);
    const width=Math.max(220,Number(options.minWidth??0),Number(node.size?.[0]??0));
    const computed=node.computeSize?.()??node.size??[width,60];
    const visibleWidgets=visibleWidgetEntries(node,plan);
    const leadingNativeActionSpacer=plan.ports.every(port=>!port.visible)&&visibleWidgets[0]?.projected.role==="nativeAction"?slotHeight():0;
    const widgetOnlyHeight=options.compactWidgetOnly&&plan.ports.every(port=>!port.visible)
        ?40+leadingNativeActionSpacer+visibleWidgets.reduce((height,{widget})=>height+Math.max(0,Number(widget?.computeSize?.()[1]??20)),0)
        :undefined;
    const next=presentationSize(node,[Math.max(width,Number(computed[0]??0)),Math.max(60,Number(widgetOnlyHeight??computed[1]??60))]);
    const reservedInputs=plan.ports.filter(port=>port.direction==="input"&&(port.visible||port.role==="legacy")).length;
    const reservedOutputs=plan.ports.filter(port=>port.direction==="output"&&(port.visible||port.role==="legacy")).length;
    const semanticWidgetHeight=visibleWidgets.reduce((height,{widget})=>height+Math.max(0,Number(widget?.computeSize?.()[1]??20)),0);
    node.__bvPresentationAutoHeight=Math.max(60,40+Math.max(reservedInputs,reservedOutputs)*slotHeight()+leadingNativeActionSpacer+semanticWidgetHeight);
    if(!node.__bvNodes2PresentationActive&&(Number(node.size?.[0]??0)!==next[0]||Number(node.size?.[1]??0)!==next[1]))setAutomaticPresentationSize(node,next);
    node.__bvApplyPresentation=()=>applyClassicNodePresentation(node,nodeType,options);
    installNodes2NodePresentation(node,nodeType);
    node.setDirtyCanvas?.(true,true);
    node.graph?.setDirtyCanvas?.(true,true);
    return plan;
}

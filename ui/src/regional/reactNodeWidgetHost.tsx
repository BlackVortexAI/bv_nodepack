import type{ReactNode}from"react";
import{createRoot,type Root}from"react-dom/client";
import{applyClassicNodePresentation,removeNodePresentation}from"./classicNodePresentation";

// Lifecycle exception registered centrally as `react-node-dom-widget-host` in
// nodePresentation.ts; feature modules delegate all DOM-widget ownership here.

type RootLike=Pick<Root,"render"|"unmount">;
type HostLike=HTMLElement;
type HostPlatform={createHost:()=>HostLike;createContentHost:(host:HostLike)=>HostLike;createRoot:(host:HostLike)=>RootLike;schedule:(action:()=>void)=>void;applyPresentation:(node:any,nodeType:string)=>void;viewportHeight:()=>number;observeHost:(host:HostLike,onHeight:(height:number)=>void)=>(()=>void)};
export type NativeNodeAction={id:string;name:string;label:string|((node:any)=>string);invoke:(node:any)=>void};
export type ReactNodeWidgetSpec={id:string;name:string;minHeight:number;maxHeight?:number;overflow?:"auto"|"hidden";nativeActions?:NativeNodeAction[];render:(node:any)=>ReactNode};
type MountedWidget={host:HostLike;root:RootLike;widget:any;disconnect:()=>void};
type HostLifecycle={generation:number;removed:boolean};

export function intrinsicNodeWidgetContentHeight(host:HostLike){
    const children=Array.from(host.children??[]) as HTMLElement[];
    if(!children.length)return Math.ceil(Math.max(host.getBoundingClientRect?.().height??0,host.scrollHeight??0));
    const contentBottom=children.reduce((bottom,child)=>Math.max(bottom,Number(child.offsetTop??0)+Math.max(Number(child.scrollHeight??0),Number(child.offsetHeight??0),Number(child.getBoundingClientRect?.().height??0))),0);
    const paddingBottom=typeof getComputedStyle==="function"?Number.parseFloat(getComputedStyle(host).paddingBottom)||0:0;
    return Math.ceil(contentBottom+paddingBottom);
}

let platform:HostPlatform={
    createHost:()=>document.createElement("div"),
    createContentHost:host=>{const content=document.createElement("div");content.className="bv-react-node-widget-content";host.appendChild(content);return content},
    createRoot:host=>createRoot(host),
    schedule:action=>queueMicrotask(action),
    applyPresentation:(node,nodeType)=>{applyClassicNodePresentation(node,nodeType)},
    viewportHeight:()=>typeof window==="undefined"?700:window.innerHeight,
    observeHost:(host,onHeight)=>{
        const measure=()=>onHeight(intrinsicNodeWidgetContentHeight(host));
        const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(measure);
        observer?.observe(host);queueMicrotask(measure);
        return()=>observer?.disconnect();
    },
};

export function configureReactNodeWidgetHost(overrides:Partial<HostPlatform>){platform={...platform,...overrides}}

const state=(node:any):Map<string,MountedWidget>=>node.__bvReactNodeWidgets??=(new Map<string,MountedWidget>());
const lifecycle=(node:any):HostLifecycle=>node.__bvReactNodeWidgetLifecycle??={generation:0,removed:false};
const actions=(node:any):Map<string,any>=>node.__bvNativeNodeActions??=(new Map<string,any>());
const heightCap=(spec:ReactNodeWidgetSpec)=>spec.maxHeight===undefined?Number.POSITIVE_INFINITY:Math.min(spec.maxHeight,Math.max(0,Math.floor(platform.viewportHeight()*.6)));
const markNativeActionSocketless=(widget:any)=>{
    if(!widget)return;
    widget.spec={...(widget.spec??{}),socketless:true};
    widget.options={...(widget.options??{}),socketless:true};
};

function reconcileNativeActions(node:any,spec:ReactNodeWidgetSpec){
    if(typeof node.addWidget!=="function")return;
    const mounted=actions(node);
    for(const action of spec.nativeActions??[]){
        const label=typeof action.label==="function"?action.label(node):action.label,existing=mounted.get(action.id)??node.widgets?.find((widget:any)=>widget.name===action.name);
        if(existing){existing.label=label;existing.callback=()=>action.invoke(node);existing.serialize=false;markNativeActionSocketless(existing);mounted.set(action.id,existing);continue}
        const widget=node.addWidget("button",action.name,null,()=>action.invoke(node),{serialize:false});
        if(widget){widget.label=label;widget.serialize=false;markNativeActionSocketless(widget);mounted.set(action.id,widget)}
    }
}

export function renderReactNodeWidget(node:any,nodeType:string,spec:ReactNodeWidgetSpec,reconcilePresentation=true){
    const marker=node.__bvReactNodeWidgetLifecycle as HostLifecycle|undefined;
    if(marker?.removed)return null;
    reconcileNativeActions(node,spec);
    const widgets=state(node),existing=widgets.get(spec.id);
    if(existing){existing.root.render(spec.render(node));if(reconcilePresentation)platform.applyPresentation(node,nodeType);return existing.widget}
    if(typeof node.addDOMWidget!=="function")return null;
    const host=platform.createHost();host.className="bv-ui bv-react-node-widget-host";host.dataset.bvNodeWidget=spec.id;
    const content=platform.createContentHost(host);
    if(spec.maxHeight){content.className=`${content.className} bv-react-node-widget-scroll`.trim();content.style.maxHeight=`min(${spec.maxHeight}px, 60vh, 100%)`;content.style.overflowY=spec.overflow??"auto";content.style.overscrollBehavior="contain"}
    let effectiveHeight=Math.min(spec.minHeight,heightCap(spec)),reconcilePending=false,disposed=false;
    const widget=node.addDOMWidget(spec.name,"div",host,{
        serialize:false,
        margin:10,
        getMinHeight:()=>Math.min(spec.minHeight,heightCap(spec)),
        getMaxHeight:()=>heightCap(spec),
    });
    if(!widget)return null;
    widget.serialize=false;
    const root=platform.createRoot(content),stopObserving=platform.observeHost(content,height=>{
        const cap=heightCap(spec),next=Math.max(Math.min(spec.minHeight,cap),Math.min(cap,Math.ceil(height)));
        if(disposed||next===effectiveHeight)return;
        effectiveHeight=next;
        if(reconcilePending)return;
        reconcilePending=true;platform.schedule(()=>{reconcilePending=false;if(!disposed)platform.applyPresentation(node,nodeType)});
    });
    const isolate=(event:Event)=>event.stopPropagation(),isolated=["contextmenu","pointerdown","pointermove","pointerup","pointercancel","click","dblclick","keydown"],wheel=(event:Event)=>{if(content.scrollHeight>content.clientHeight)event.stopPropagation()};
    isolated.forEach(name=>content.addEventListener?.(name,isolate));content.addEventListener?.("wheel",wheel,{passive:true});
    const disconnect=()=>{disposed=true;stopObserving();isolated.forEach(name=>content.removeEventListener?.(name,isolate));content.removeEventListener?.("wheel",wheel)};
    widgets.set(spec.id,{host,root,widget,disconnect});root.render(spec.render(node));platform.applyPresentation(node,nodeType);return widget;
}

export function refreshReactNodeWidget(node:any,nodeType:string,spec:ReactNodeWidgetSpec){return renderReactNodeWidget(node,nodeType,spec,false)}
export function reactNodeWidgetsRemoved(node:any){return Boolean((node.__bvReactNodeWidgetLifecycle as HostLifecycle|undefined)?.removed)}

export function removeReactNodeWidgets(node:any){
    const widgets=node.__bvReactNodeWidgets as Map<string,MountedWidget>|undefined;
    if(widgets){for(const mounted of widgets.values()){mounted.disconnect();mounted.root.unmount();mounted.host.remove()}widgets.clear()}
    delete node.__bvReactNodeWidgets;
    delete node.__bvNativeNodeActions;
}

export function installReactNodeWidgetHost(nodeType:any,nodeTypeName:string,spec:ReactNodeWidgetSpec){
    const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,removed=nodeType.prototype.onRemoved;
    const prepare=(node:any)=>renderReactNodeWidget(node,nodeTypeName,spec);
    const schedulePrepare=(node:any,revive=false)=>{const marker=lifecycle(node);if(revive)marker.removed=false;if(marker.removed)return;const generation=++marker.generation;platform.schedule(()=>{if(!marker.removed&&marker.generation===generation)prepare(node)})};
    nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);schedulePrepare(this,true);return result};
    nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);schedulePrepare(this);return result};
    nodeType.prototype.onRemoved=function(){const marker=lifecycle(this);marker.removed=true;marker.generation++;removeReactNodeWidgets(this);removeNodePresentation(this);return removed?.apply(this,arguments)};
}

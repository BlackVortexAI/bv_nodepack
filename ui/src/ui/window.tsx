import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { mergeChangedInitialGeometry, resizeFloatingWindow, type ResizeDirection, windowShelfPosition } from "./workspaceGeometry";
import { CompactSelect, type SelectOption } from "./components";
import { getWindowSwitchMode, setWindowSwitchMode, subscribeWindowSwitchMode } from "./preferences";

export type BvWindowMode = "workspace" | "floating";

const Icon = ({ children, className = "" }: { children: ReactNode; className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;

export function BvWindowHeader(props: { title: string; context?: ReactNode; center?: ReactNode; mode: BvWindowMode; allowWorkspace?: boolean; onMode?: () => void; onMinimize: () => void; onClose: () => void; onPointerDown?: PointerEventHandler<HTMLElement> }) {
    const workspace = props.mode === "workspace";
    return <header className="bv-ui-window-header bv-density-compact" onPointerDown={props.onPointerDown}>
        <div className="bv-ui-window-identity">
            <span className="bv-ui-window-icon"><Icon><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5c0-3.2-2.1-5.7-5.1-5.7-2.4 0-4.1 1.7-4.1 3.8 0 1.7 1.2 2.9 2.8 2.9 1.4 0 2.4-.9 2.4-2.1"/></Icon></span>
            <strong className="bv-ui-window-title">{props.title}</strong>
            {props.context && <div className="bv-ui-window-context">{props.context}</div>}
        </div>
        <div className="bv-ui-window-center">{props.center}</div>
        <div className="bv-ui-window-controls">
            <button type="button" className="bv-ui-window-control" title="Minimize" aria-label="Minimize window" onClick={props.onMinimize}><Icon><path d="M7 16.5h10"/></Icon></button>
            {props.allowWorkspace !== false && <button type="button" className="bv-ui-window-control" title={workspace ? "Restore floating window" : "Maximize to workspace"} aria-label={workspace ? "Restore floating window" : "Maximize to workspace"} onClick={props.onMode}>{workspace ? <Icon><rect x="4.5" y="7.5" width="12" height="12" rx="1.5"/><path d="M7.5 7.5v-3h12v12h-3"/></Icon> : <Icon><rect x="5" y="5" width="14" height="14" rx="1.5"/></Icon>}</button>}
            <button type="button" className="bv-ui-window-control bv-ui-window-control--close" title="Close" aria-label="Close window" onClick={props.onClose}><Icon><path d="m7 7 10 10M17 7 7 17"/></Icon></button>
        </div>
    </header>;
}

export type BvWindowGeometry = { x:number; y:number; width:number; height:number };
export type BvManagedWindowProps = {
    open:boolean; title:string; context?:ReactNode; center?:ReactNode; children:ReactNode; status?:ReactNode; actions?:ReactNode; activationToken?:number;
    allowWorkspace?:boolean; initialMode?:BvWindowMode; initialGeometry?:Partial<BvWindowGeometry>; minSize?:{width:number;height:number};
    className?:string; onClose:()=>void; onGeometry?:(geometry:BvWindowGeometry)=>void;
};

const clampManagedGeometry = (geometry:BvWindowGeometry, min:{width:number;height:number}):BvWindowGeometry => {
    const width=Math.max(min.width,Math.min(geometry.width,window.innerWidth-32)),height=Math.max(min.height,Math.min(geometry.height,window.innerHeight-32));
    return {x:Math.max(16,Math.min(geometry.x,window.innerWidth-width-16)),y:Math.max(16,Math.min(geometry.y,window.innerHeight-height-16)),width,height};
};

export function BvManagedWindow({open,title,context,center,children,status,actions,activationToken=0,allowWorkspace=true,initialMode="floating",initialGeometry,minSize={width:360,height:240},className="",onClose,onGeometry}:BvManagedWindowProps) {
    const defaults=()=>clampManagedGeometry({x:Math.max(16,(window.innerWidth-(initialGeometry?.width??760))/2),y:Math.max(16,(window.innerHeight-(initialGeometry?.height??640))/2),width:initialGeometry?.width??760,height:initialGeometry?.height??640,...initialGeometry},minSize);
    const [mode,setMode]=useState<BvWindowMode>(allowWorkspace?initialMode:"floating"),[minimized,setMinimized]=useState(false),[geometry,setGeometry]=useState<BvWindowGeometry>(defaults);
    const shell=useRef<HTMLDivElement>(null),geometryRef=useRef(geometry),initialGeometryRef=useRef(initialGeometry),drag=useRef<{pointerId:number;startX:number;startY:number;kind:"move";x:number;y:number}|{pointerId:number;startX:number;startY:number;kind:"resize";direction:ResizeDirection;geometry:BvWindowGeometry}>();
    useEffect(()=>{geometryRef.current=geometry},[geometry]);
    useEffect(()=>{if(open)setMinimized(false)},[open]);
    useEffect(()=>{const node=shell.current;if(!node)return;const activate=()=>{setMinimized(false);requestAnimationFrame(()=>node.focus({preventScroll:true}))},minimize=()=>setMinimized(true);node.addEventListener("bv-ui-activate",activate);node.addEventListener("bv-ui-minimize",minimize);return()=>{node.removeEventListener("bv-ui-activate",activate);node.removeEventListener("bv-ui-minimize",minimize)}},[]);
    useEffect(()=>{const node=shell.current;if(!node)return;const setRequestedState=(event:Event)=>{const requested=(event as CustomEvent<{mode?:BvWindowMode;geometry?:BvWindowGeometry}>).detail;if(allowWorkspace&&requested?.mode)setMode(requested.mode);if(requested?.mode==="floating"&&requested.geometry)setGeometry(clampManagedGeometry(requested.geometry,minSize))};node.addEventListener("bv-ui-set-window-state",setRequestedState);return()=>node.removeEventListener("bv-ui-set-window-state",setRequestedState)},[allowWorkspace,minSize.height,minSize.width]);
    useEffect(()=>{if(!open)return;setMinimized(false);requestAnimationFrame(()=>shell.current?.focus({preventScroll:true}))},[activationToken,open]);
    useEffect(()=>{const previous=initialGeometryRef.current;initialGeometryRef.current=initialGeometry;if(!initialGeometry)return;setGeometry(current=>clampManagedGeometry(mergeChangedInitialGeometry(current,previous,initialGeometry),minSize))},[initialGeometry?.height,initialGeometry?.width,initialGeometry?.x,initialGeometry?.y,minSize.height,minSize.width]);
    useEffect(()=>{if(!open)return;const recover=()=>setGeometry(current=>clampManagedGeometry(current,minSize));window.addEventListener("resize",recover);return()=>window.removeEventListener("resize",recover)},[minSize.height,minSize.width,open]);
    const begin:PointerEventHandler<HTMLElement>=event=>{if(mode!=="floating"||event.button!==0||(event.target as Element).closest("button,input,select,textarea"))return;drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,kind:"move",x:geometry.x,y:geometry.y};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()};
    const beginResize=(direction:ResizeDirection):PointerEventHandler<HTMLDivElement>=>event=>{if(mode!=="floating"||event.button!==0)return;drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,kind:"resize",direction,geometry};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()};
    const move:PointerEventHandler<HTMLDivElement>=event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;const delta={x:event.clientX-active.startX,y:event.clientY-active.startY};setGeometry(current=>clampManagedGeometry(active.kind==="move"?{...current,x:active.x+delta.x,y:active.y+delta.y}:resizeFloatingWindow(active.geometry,delta,active.direction,minSize),minSize))};
    const end:PointerEventHandler<HTMLDivElement>=event=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=undefined;requestAnimationFrame(()=>onGeometry?.(geometryRef.current))};
    if(!open)return null;
    const style=mode==="workspace"?undefined:{left:geometry.x,top:geometry.y,width:geometry.width,height:geometry.height};
    return <>{minimized&&<BvMinimizedWindow title={title} onRestore={()=>setMinimized(false)} onClose={onClose}/>}<div ref={shell} tabIndex={-1} hidden={minimized} className={`bv-managed-window ${mode} ${className}`.trim()} role="dialog" aria-modal={mode==="workspace"} aria-label={title} style={style} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event=>event.stopPropagation()}>
        <BvWindowHeader title={title} context={context} center={center} mode={mode} allowWorkspace={allowWorkspace} onMode={()=>allowWorkspace&&setMode(current=>current==="workspace"?"floating":"workspace")} onMinimize={()=>setMinimized(true)} onClose={onClose} onPointerDown={begin}/>
        <div className="bv-managed-window-body">{children}</div>
        {(status||actions)&&<BvWindowFooter status={status??null} actions={actions}/>}
        {mode==="floating"&&(["n","ne","e","se","s","sw","w","nw"] as ResizeDirection[]).map(direction=><div key={direction} className={`bv-window-resize-handle ${direction}`} aria-hidden="true" onPointerDown={beginResize(direction)}/>)}
    </div></>;
}

export function BvWindowFooter({ status, actions, warning = false }: { status: ReactNode; actions?: ReactNode; warning?: boolean }) {
    return <footer className={`bv-ui-window-footer${warning ? " has-warning" : ""}`}><div className="bv-ui-window-status">{status}</div>{actions && <div className="bv-ui-window-footer-actions">{actions}</div>}</footer>;
}

export function BvMinimizedWindow({ title, onRestore, onClose }: { title: string; onRestore: () => void; onClose?: () => void }) {
    const host = useMemo(() => {
        let node = document.getElementById("bv-ui-window-shelf");
        if (!node) { node = document.createElement("div"); node.id = "bv-ui-window-shelf"; node.className = "bv-ui-window-shelf"; document.body.append(node); }
        return node;
    }, []);
    useEffect(() => {
        const selector = "#graph-canvas, .graph-canvas-container, nav, aside, [role='navigation'], .side-tool-bar-container, .side-bar-panel";
        const position = () => {
            const canvas = document.querySelector<HTMLElement>("#graph-canvas, .graph-canvas-container");
            const canvasRect = canvas?.getBoundingClientRect() ?? null;
            const overlays = [...document.querySelectorAll<HTMLElement>("nav, aside, [role='navigation'], .side-tool-bar-container, .side-bar-panel")].map(element => element.getBoundingClientRect());
            const next = windowShelfPosition(canvasRect, overlays, { width: window.innerWidth, height: window.innerHeight });
            host.style.setProperty("--bv-ui-window-shelf-left", `${next.left}px`);
            host.style.setProperty("--bv-ui-window-shelf-bottom", `${next.bottom}px`);
        };
        const observer = new ResizeObserver(position);
        const observed = new Set<Element>();
        const observeWorkspace = () => document.querySelectorAll<HTMLElement>(selector).forEach(element => { if (!observed.has(element)) { observed.add(element); observer.observe(element); } });
        const mutations = new MutationObserver(() => { observeWorkspace(); position(); });
        observeWorkspace(); mutations.observe(document.body, { childList:true, subtree:true });
        window.addEventListener("resize", position); position();
        return () => { mutations.disconnect(); observer.disconnect(); window.removeEventListener("resize", position); };
    }, [host]);
    useEffect(() => () => { requestAnimationFrame(() => { if (!host.childElementCount) host.remove(); }); }, [host]);
    return createPortal(<div className="bv-ui-window-shelf-item"><button type="button" className="bv-ui-window-shelf-restore" onClick={onRestore} title={`Restore ${title}`}><span className="bv-ui-window-shelf-icon"><Icon><path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5c0-3.2-2.1-5.7-5.1-5.7-2.4 0-4.1 1.7-4.1 3.8 0 1.7 1.2 2.9 2.8 2.9 1.4 0 2.4-.9 2.4-2.1"/></Icon></span><span>{title}</span></button>{onClose&&<button type="button" className="bv-ui-window-shelf-close" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={onClose}><Icon><path d="m7 7 10 10M17 7 7 17"/></Icon></button>}</div>, host);
}

export function BvWindowNavigator({label,value,options,onNavigate}:{label:string;value:string;options:SelectOption[];onNavigate:(value:string,replaceCurrent:boolean)=>void}) {
    const mode=useSyncExternalStore(subscribeWindowSwitchMode,getWindowSwitchMode,getWindowSwitchMode),keep=mode==="keep";
    if(options.length<=1)return null;
    const switchLabel=keep?"Keep current window when switching. Hold Shift to replace once.":"Replace current window when switching. Hold Shift to keep once.";
    return <div className="bv-window-navigator"><CompactSelect label={label} value={value} options={options} onValue={(next,meta)=>onNavigate(next,meta.shiftKey?keep:!keep)}/><button type="button" role="switch" aria-label={switchLabel} aria-checked={keep} className="bv-window-switch-mode" title={switchLabel} onClick={()=>setWindowSwitchMode(keep?"replace":"keep")}><span className="bv-toggle-track"><span/></span><span aria-hidden="true">{keep?"Keep":"Replace"}</span></button></div>;
}

export function ResetLayoutButton({ onClick }: { onClick: () => void }) {
    return <button type="button" className="bv-ui-button bv-ui-button--secondary bv-ui-window-reset" title="Restore the default panel arrangement" onClick={onClick}><Icon><path d="M4.9 9A7.5 7.5 0 1 1 5 15M4 4v5h5"/></Icon><span>Reset layout</span></button>;
}

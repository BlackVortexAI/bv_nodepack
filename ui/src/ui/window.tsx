import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { mergeChangedInitialGeometry, resizeFloatingWindow, type ResizeDirection, windowShelfPosition } from "./workspaceGeometry";
import { AnchoredPopover, Button, CompactSelect, ContextMenu, Dialog, MenuButton, TextField, useBvConfirm, type MenuAction, type SelectOption } from "./components";
import { CaptureOwner, nextCaptureId, registerUiCaptureSource } from "../export/captureRegistry";
import { openExportDialog } from "../export/events";
import { getWindowSwitchMode, setWindowSwitchMode, subscribeWindowSwitchMode } from "./preferences";
import { activateBvWindow, registerBvWindow } from "./windowFocus";
import { BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT } from "./ToolbarWindowLauncher";
import { BV_FLEXLAYOUT_LIBRARY } from "./dock";
import { deleteLayoutProfile, getSessionLayoutDraft, getSessionLayoutRevision, isCompatibleLayoutProfile, readLayoutProfiles, renameLayoutProfile, saveLayoutProfile, setSessionLayoutDraft, subscribeSessionLayoutDraft } from "./layoutProfiles";
import { showBvToast } from "./toastStore";

export type BvWindowMode = "workspace" | "floating";

const Icon = ({ children, className = "" }: { children: ReactNode; className?: string }) => <svg className={className} viewBox="0 0 24 24" aria-hidden="true">{children}</svg>;
const CycloneIcon = () => <svg className="bv-brand-cyclone" viewBox="0 0 32 32" aria-hidden="true"><path d="M11.08 2.736a2 2 0 0 1-.286 2.814A12.99 12.99 0 0 0 6 15.64c0 5.525 4.475 10 10 10s10-4.475 10-10a7 7 0 0 0-14 0c0 2.215 1.785 4 4 4s4-1.785 4-4c0-.555-.445-1-1-1s-1 .445-1 1a2 2 0 1 1-4 0c0-2.765 2.235-5 5-5s5 2.235 5 5c0 4.425-3.575 8-8 8s-8-3.575-8-8c0-6.075 4.925-11 11-11s11 4.925 11 11c0 7.735-6.265 14-14 14s-14-6.265-14-14C2 10.313 4.45 5.563 8.266 2.45a2 2 0 0 1 2.814.286"/></svg>;

export type BvWindowHeaderLayout = { narrow:boolean; minimal:boolean; menuOverflow:boolean };
const BvWindowHeaderLayoutContext=createContext<BvWindowHeaderLayout>({narrow:false,minimal:false,menuOverflow:false});
export const useBvWindowHeaderLayout=()=>useContext(BvWindowHeaderLayoutContext);

export function BvWindowHeader(props: { title: string; shortTitle?: string; context?: ReactNode; center?: ReactNode; mode: BvWindowMode; allowWorkspace?: boolean; menuVisible?:boolean; onMenuVisible?:(visible:boolean)=>void; onMode?: () => void; onMinimize: () => void; onClose: () => void; onPointerDown?: PointerEventHandler<HTMLElement> }) {
    const workspace = props.mode === "workspace",header=useRef<HTMLElement>(null),[width,setWidth]=useState(Infinity),[utilityOpen,setUtilityOpen]=useState(false),utility=useRef<HTMLDivElement>(null);
    useEffect(()=>{const node=header.current;if(!node)return;const observer=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width??node.clientWidth));observer.observe(node);return()=>observer.disconnect()},[]);
    const layout=useMemo<BvWindowHeaderLayout>(()=>({narrow:width<760,minimal:width<620,menuOverflow:width<520}),[width]);
    return <BvWindowHeaderLayoutContext.Provider value={layout}><header ref={header} className={`bv-ui-window-header bv-density-compact ${layout.narrow?"is-narrow":""} ${layout.minimal?"is-minimal":""} ${layout.menuOverflow?"is-menu-overflow":""}`.trim()} onPointerDown={props.onPointerDown}>
        <div className="bv-ui-window-identity">
            <span className="bv-ui-window-icon"><CycloneIcon/></span>
            <strong className="bv-ui-window-title"><span className="bv-ui-window-title-full">{props.title}</span>{props.shortTitle&&<span className="bv-ui-window-title-short">{props.shortTitle}</span>}</strong>
            {props.context && <div className="bv-ui-window-context">{props.context}</div>}
        </div>
        <div className="bv-ui-window-center">{props.center}</div>
        <div className="bv-ui-window-controls">
            <button type="button" className="bv-ui-window-control" title="Choose BV window" aria-label="Choose BV window" onClick={event=>window.dispatchEvent(new CustomEvent(BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT,{detail:{anchor:event.currentTarget}}))}><Icon><rect x="4" y="5" width="7" height="6" rx="1"/><rect x="13" y="5" width="7" height="6" rx="1"/><rect x="4" y="13" width="7" height="6" rx="1"/><rect x="13" y="13" width="7" height="6" rx="1"/></Icon></button>
            {props.onMenuVisible&&(!layout.minimal?<button type="button" className="bv-ui-window-control bv-ui-window-control--visibility" title={props.menuVisible?"Hide this node from BV window menus":"Show this node in BV window menus"} aria-label={props.menuVisible?"Hide this node from BV window menus":"Show this node in BV window menus"} aria-pressed={props.menuVisible} onClick={()=>props.onMenuVisible?.(!props.menuVisible)}>{props.menuVisible?<Icon><path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z"/><circle cx="12" cy="12" r="2.5"/></Icon>:<Icon><path d="m4 4 16 16M9.5 7.4A10.8 10.8 0 0 1 12 7c6 0 9.5 5 9.5 5a16 16 0 0 1-2.2 2.5M6.2 8.3A15.2 15.2 0 0 0 2.5 12s3.5 5 9.5 5c1 0 2-.2 2.8-.4"/></Icon>}</button>:<div ref={utility} className="bv-window-header-utility"><button type="button" className="bv-ui-window-control" aria-label="More window actions" aria-expanded={utilityOpen} onClick={()=>setUtilityOpen(open=>!open)}>•••</button><AnchoredPopover open={utilityOpen} anchor={utility} onClose={()=>setUtilityOpen(false)} className="bv-window-navigator-menu"><button type="button" className="bv-window-visibility-menu-action" onClick={()=>{props.onMenuVisible?.(!props.menuVisible);setUtilityOpen(false)}}>{props.menuVisible?"Hide from BV window menus":"Show in BV window menus"}</button></AnchoredPopover></div>)}
            <button type="button" className="bv-ui-window-control" title="Minimize" aria-label="Minimize window" onClick={props.onMinimize}><Icon><path d="M7 16.5h10"/></Icon></button>
            {props.allowWorkspace !== false && <button type="button" className="bv-ui-window-control" title={workspace ? "Restore floating window" : "Maximize to workspace"} aria-label={workspace ? "Restore floating window" : "Maximize to workspace"} onClick={props.onMode}>{workspace ? <Icon><rect x="4.5" y="7.5" width="12" height="12" rx="1.5"/><path d="M7.5 7.5v-3h12v12h-3"/></Icon> : <Icon><rect x="5" y="5" width="14" height="14" rx="1.5"/></Icon>}</button>}
            <button type="button" className="bv-ui-window-control bv-ui-window-control--close" title="Close" aria-label="Close window" onClick={props.onClose}><Icon><path d="m7 7 10 10M17 7 7 17"/></Icon></button>
        </div>
    </header></BvWindowHeaderLayoutContext.Provider>;
}

export type BvWindowGeometry = { x:number; y:number; width:number; height:number };
export type BvManagedWindowProps = {
    open:boolean; title:string; shortTitle?:string; context?:ReactNode; center?:ReactNode; children:ReactNode; status?:ReactNode; actions?:ReactNode; activationToken?:number;
    allowWorkspace?:boolean; initialMode?:BvWindowMode; initialGeometry?:Partial<BvWindowGeometry>; minSize?:{width:number;height:number}; footerStackAt?:number;
    mode?:BvWindowMode; className?:string; bodyClassName?:string; menuVisible?:boolean; onMenuVisible?:(visible:boolean)=>void; onClose:()=>void; onGeometry?:(geometry:BvWindowGeometry)=>void; onModeChange?:(mode:BvWindowMode)=>void;
};

const clampManagedGeometry = (geometry:BvWindowGeometry, min:{width:number;height:number}):BvWindowGeometry => {
    const availableWidth=Math.max(280,window.innerWidth-32),availableHeight=Math.max(240,window.innerHeight-32),effectiveMinWidth=Math.min(min.width,420,availableWidth),effectiveMinHeight=Math.min(min.height,availableHeight);
    const width=Math.max(effectiveMinWidth,Math.min(geometry.width,availableWidth)),height=Math.max(effectiveMinHeight,Math.min(geometry.height,availableHeight));
    return {x:Math.max(16,Math.min(geometry.x,window.innerWidth-width-16)),y:Math.max(16,Math.min(geometry.y,window.innerHeight-height-16)),width,height};
};

export function BvManagedWindow({open,title,shortTitle,context,center,children,status,actions,activationToken=0,allowWorkspace=true,initialMode="floating",initialGeometry,minSize={width:360,height:240},footerStackAt=700,mode:controlledMode,className="",bodyClassName="",menuVisible,onMenuVisible,onClose,onGeometry,onModeChange}:BvManagedWindowProps) {
    const effectiveShortTitle=shortTitle??(title==="BV Regional Editor"?"Reg. Editor":title==="Regional Quick Edit"?"Quick Edit":undefined);
    const defaults=()=>clampManagedGeometry({x:Math.max(16,(window.innerWidth-(initialGeometry?.width??760))/2),y:Math.max(16,(window.innerHeight-(initialGeometry?.height??640))/2),width:initialGeometry?.width??760,height:initialGeometry?.height??640,...initialGeometry},minSize);
    const [internalMode,setInternalMode]=useState<BvWindowMode>(allowWorkspace?initialMode:"floating"),[minimized,setMinimized]=useState(false),[geometry,setGeometry]=useState<BvWindowGeometry>(defaults),mode=controlledMode??internalMode;
    const shell=useRef<HTMLDivElement>(null),captureId=useRef(nextCaptureId()).current,opener=useRef<HTMLElement|null>(null),geometryRef=useRef(geometry),initialGeometryRef=useRef(initialGeometry),drag=useRef<{pointerId:number;startX:number;startY:number;kind:"move";x:number;y:number}|{pointerId:number;startX:number;startY:number;kind:"resize";direction:ResizeDirection;geometry:BvWindowGeometry}>();
    const [captureMenu,setCaptureMenu]=useState<{x:number;y:number}|null>(null);
    useEffect(()=>{geometryRef.current=geometry},[geometry]);
    useEffect(()=>{if(open)setMinimized(false)},[open]);
    useEffect(()=>{const node=shell.current;if(!open||!node)return;opener.current=document.activeElement instanceof HTMLElement&&!node.contains(document.activeElement)?document.activeElement:opener.current;return registerBvWindow(node)},[open]);
    useEffect(()=>{const node=shell.current;if(!open||!node)return;return registerUiCaptureSource(captureId,title,node)},[captureId,open,title]);
    useEffect(()=>{const node=shell.current;if(!node)return;const activate=()=>{setMinimized(false);requestAnimationFrame(()=>node.focus({preventScroll:true}))},minimize=()=>setMinimized(true);node.addEventListener("bv-ui-activate",activate);node.addEventListener("bv-ui-minimize",minimize);return()=>{node.removeEventListener("bv-ui-activate",activate);node.removeEventListener("bv-ui-minimize",minimize)}},[]);
    useEffect(()=>{const node=shell.current;if(!node)return;const setRequestedState=(event:Event)=>{const requested=(event as CustomEvent<{mode?:BvWindowMode;geometry?:BvWindowGeometry}>).detail;if(allowWorkspace&&requested?.mode){setInternalMode(requested.mode);onModeChange?.(requested.mode)}if(requested?.mode==="floating"&&requested.geometry)setGeometry(clampManagedGeometry(requested.geometry,minSize))};node.addEventListener("bv-ui-set-window-state",setRequestedState);return()=>node.removeEventListener("bv-ui-set-window-state",setRequestedState)},[allowWorkspace,minSize.height,minSize.width,onModeChange]);
    useEffect(()=>{if(!open)return;setMinimized(false);requestAnimationFrame(()=>shell.current?.focus({preventScroll:true}))},[activationToken,open]);
    useEffect(()=>{const previous=initialGeometryRef.current;initialGeometryRef.current=initialGeometry;if(!initialGeometry)return;setGeometry(current=>clampManagedGeometry(mergeChangedInitialGeometry(current,previous,initialGeometry),minSize))},[initialGeometry?.height,initialGeometry?.width,initialGeometry?.x,initialGeometry?.y,minSize.height,minSize.width]);
    useEffect(()=>{if(!open)return;const recover=()=>setGeometry(current=>clampManagedGeometry(current,minSize));window.addEventListener("resize",recover);return()=>window.removeEventListener("resize",recover)},[minSize.height,minSize.width,open]);
    const begin:PointerEventHandler<HTMLElement>=event=>{if(mode!=="floating"||event.button!==0||(event.target as Element).closest("button,input,select,textarea"))return;drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,kind:"move",x:geometry.x,y:geometry.y};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()};
    const beginResize=(direction:ResizeDirection):PointerEventHandler<HTMLDivElement>=>event=>{if(mode!=="floating"||event.button!==0)return;drag.current={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,kind:"resize",direction,geometry};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault();event.stopPropagation()};
    const move:PointerEventHandler<HTMLDivElement>=event=>{const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;const delta={x:event.clientX-active.startX,y:event.clientY-active.startY},resizeMin={...minSize,width:Math.min(minSize.width,420)};setGeometry(current=>clampManagedGeometry(active.kind==="move"?{...current,x:active.x+delta.x,y:active.y+delta.y}:resizeFloatingWindow(active.geometry,delta,active.direction,resizeMin),minSize))};
    const end:PointerEventHandler<HTMLDivElement>=event=>{if(drag.current?.pointerId!==event.pointerId)return;drag.current=undefined;requestAnimationFrame(()=>onGeometry?.(geometryRef.current))};
    if(!open)return null;
    const style=mode==="workspace"?undefined:{left:geometry.x,top:geometry.y,width:geometry.width,height:geometry.height};
    const close=()=>{onClose();requestAnimationFrame(()=>opener.current?.focus({preventScroll:true}))};
    return <CaptureOwner id={captureId}><>{minimized&&<BvMinimizedWindow title={title} onRestore={()=>setMinimized(false)} onClose={close}/>}<div ref={shell} data-bv-capture-window={captureId} tabIndex={-1} hidden={minimized} className={`bv-managed-window ${mode} ${className}`.trim()} role="dialog" aria-modal={mode==="workspace"} aria-label={title} style={style} onContextMenu={event=>{if((event.target as Element).closest("input,textarea,select,[contenteditable='true'],[role='textbox']"))return;event.preventDefault();setCaptureMenu({x:event.clientX,y:event.clientY})}} onPointerDownCapture={()=>shell.current&&activateBvWindow(shell.current)} onFocusCapture={()=>shell.current&&activateBvWindow(shell.current)} onPointerMove={move} onPointerUp={end} onPointerCancel={end} onKeyDown={event=>{if(event.key==="Escape"){const overlay=[...document.querySelectorAll<HTMLElement>(".bv-anchored-popover,[role='listbox'],[role='menu']")].some(node=>node.offsetParent!==null);if(!overlay){event.preventDefault();event.stopPropagation();close();return;}}event.stopPropagation()}}><div className="bv-managed-window-surface">
        <BvWindowHeader title={title} shortTitle={effectiveShortTitle} context={context} center={center} mode={mode} allowWorkspace={allowWorkspace} menuVisible={menuVisible} onMenuVisible={onMenuVisible} onMode={()=>{if(!allowWorkspace)return;const next=mode==="workspace"?"floating":"workspace";setInternalMode(next);onModeChange?.(next)}} onMinimize={()=>setMinimized(true)} onClose={close} onPointerDown={begin}/>
        <div className={`bv-managed-window-body ${bodyClassName}`.trim()}>{children}</div>
        {(status||actions)&&<BvWindowFooter status={status??null} actions={actions} stacked={mode==="floating"&&geometry.width<footerStackAt} minimal={mode==="floating"&&geometry.width<470}/>}
    </div>{mode==="floating"&&(["n","ne","e","se","s","sw","w","nw"] as ResizeDirection[]).map(direction=><div key={direction} className={`bv-window-resize-handle ${direction}`} aria-hidden="true" onPointerDown={beginResize(direction)}/>)}</div>{captureMenu&&<div data-bv-export-ui><ContextMenu open x={captureMenu.x} y={captureMenu.y} actions={[{id:"export-bv-ui",label:"Export BV UI Image…",onSelect:()=>openExportDialog(`ui:${captureId}`)}]} onClose={()=>setCaptureMenu(null)}/></div>}</></CaptureOwner>;
}

export function BvWindowFooter({ status, actions, warning = false, stacked=false, minimal=false }: { status: ReactNode; actions?: ReactNode; warning?: boolean; stacked?:boolean; minimal?:boolean }) {
    return <footer className={`bv-ui-window-footer${warning ? " has-warning" : ""}${stacked?" is-stacked":""}${minimal?" is-minimal":""}`}><div className="bv-ui-window-status">{status}</div>{actions && <div className="bv-ui-window-footer-actions">{actions}</div>}</footer>;
}

export function BvFooterActions({primary,secondary,overflow=[]}:{primary:ReactNode;secondary?:ReactNode;overflow?:MenuAction[]}) {
    return <div className="bv-footer-action-set">{secondary&&<div className="bv-footer-secondary-actions">{secondary}</div>}{overflow.length>0&&<MenuButton label="More" actions={overflow} intent="ghost" density="compact"/>}<div className="bv-footer-primary-action">{primary}</div></div>;
}

export function BvMinimizedWindow({ title, onRestore, onClose }: { title: string; onRestore: () => void; onClose?: () => void }) {
    const host = useMemo(() => {
        let node = document.getElementById("bv-ui-window-shelf");
        if (!node) { node = document.createElement("div"); node.id = "bv-ui-window-shelf"; node.className = "bv-ui-window-shelf bv-ui bv-density-compact"; document.body.append(node); }
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
    return createPortal(<div className="bv-ui-window-shelf-item"><button type="button" className="bv-ui-window-shelf-restore" onClick={onRestore} title={`Restore ${title}`}><span className="bv-ui-window-shelf-icon"><CycloneIcon/></span><span>{title}</span></button>{onClose&&<button type="button" className="bv-ui-window-shelf-close" aria-label={`Close ${title}`} title={`Close ${title}`} onClick={onClose}><Icon><path d="m7 7 10 10M17 7 7 17"/></Icon></button>}</div>, host);
}

export function BvWindowNavigator({label,value,options,onNavigate}:{label:string;value:string;options:SelectOption[];onNavigate:(value:string,replaceCurrent:boolean)=>void}) {
    const mode=useSyncExternalStore(subscribeWindowSwitchMode,getWindowSwitchMode,getWindowSwitchMode),keep=mode==="keep";
    const layout=useBvWindowHeaderLayout(),[overflowOpen,setOverflowOpen]=useState(false),overflow=useRef<HTMLDivElement>(null);
    const targets=options.filter(option=>option.value!==value);
    if(!targets.length)return null;
    const switchLabel=keep?"Keep current window when switching. Hold Shift to replace once.":"Replace current window when switching. Hold Shift to keep once.";
    const nodeInOverflow=layout.minimal,modeInOverflow=layout.narrow;
    const select=<CompactSelect className="bv-window-node-select" label={label} value="" options={targets} onValue={(next,meta)=>onNavigate(next,meta.shiftKey?keep:!keep)}/>;
    const toggle=<button type="button" role="switch" aria-label={switchLabel} aria-checked={keep} className="bv-window-switch-mode" title={switchLabel} onClick={()=>setWindowSwitchMode(keep?"replace":"keep")}><span className="bv-toggle-track"><span/></span><span aria-hidden="true">{keep?"Keep":"Replace"}</span></button>;
    return <div className="bv-window-navigator">{!nodeInOverflow&&select}{!modeInOverflow&&toggle}{modeInOverflow&&<div ref={overflow} className="bv-window-navigator-overflow"><button type="button" aria-label="More window navigation options" aria-expanded={overflowOpen} onClick={()=>setOverflowOpen(open=>!open)}>•••</button><AnchoredPopover open={overflowOpen} anchor={overflow} onClose={()=>setOverflowOpen(false)} className="bv-window-navigator-menu"><div className="bv-window-navigator-panel">{nodeInOverflow&&<div className="bv-window-navigator-panel-row is-node">{select}</div>}<div className="bv-window-navigator-panel-row is-mode"><span>Keep current window</span>{toggle}</div></div></AnchoredPopover></div>}</div>;
}

export function ResetLayoutButton({onClick,storageId,editorType="regional",signature=`${editorType}:v1`}:{onClick:()=>void;storageId?:string;editorType?:string;signature?:string}){
    const [dialog,setDialog]=useState<"save"|"rename"|null>(null),[name,setName]=useState(""),[revision,setRevision]=useState(0),structural=useBvConfirm();void revision;
    const layoutKey=storageId??"",subscribe=useCallback((listener:()=>void)=>subscribeSessionLayoutDraft(layoutKey,listener),[layoutKey]),snapshot=useCallback(()=>getSessionLayoutRevision(layoutKey),[layoutKey]);useSyncExternalStore(subscribe,snapshot,()=>0);
    if(!storageId)return <button type="button" className="bv-ui-button bv-ui-button--secondary bv-ui-window-reset" title="Restore the default panel arrangement" onClick={onClick}><Icon><path d="M4.9 9A7.5 7.5 0 1 1 5 15M4 4v5h5"/></Icon><span>Reset layout</span></button>;
    const envelope=readLayoutProfiles(editorType),draft=getSessionLayoutDraft(storageId),selected=envelope.profiles.find(profile=>profile.id===draft?.profileId),refresh=()=>setRevision(value=>value+1),save=()=>{if(!draft)return;const profile=saveLayoutProfile({id:dialog==="rename"?selected?.id:undefined,name,editorType,editorVersion:"1",library:BV_FLEXLAYOUT_LIBRARY,signature,layout:draft.layout});setSessionLayoutDraft(storageId,draft.layout,"saved",profile.id);setDialog(null);refresh()};
    const compatibility={editorType,editorVersion:"1",library:BV_FLEXLAYOUT_LIBRARY,signature},switchLayout=(label:string,action:()=>void)=>draft?.status==="modified"?structural.confirm({title:"Replace modified layout?",message:`Structural panel changes in this session will be discarded when switching to ${label}.`,confirmLabel:"Switch layout",danger:true,action}):action();
    const actions:MenuAction[]=[{id:"factory",label:"Factory layout",onSelect:()=>switchLayout("Factory",onClick)},...envelope.profiles.map(profile=>{const compatible=isCompatibleLayoutProfile(profile,compatibility);return{id:profile.id,label:`${profile.name}${compatible?"":" · Incompatible"}`,onSelect:()=>switchLayout(profile.name,()=>{if(!compatible){onClick();showBvToast({title:"Layout could not be loaded",message:"The saved layout belongs to an incompatible editor version. Factory layout was restored.",tone:"warning",duration:5000});return}setSessionLayoutDraft(storageId,profile.layout,"saved",profile.id)})}}),{id:"save-as",label:"Save as new layout…",disabled:!draft,onSelect:()=>{setName("");setDialog("save")}},...(selected?[{id:"update",label:`Update ${selected.name}`,onSelect:()=>{if(!draft)return;saveLayoutProfile({...selected,layout:draft.layout});setSessionLayoutDraft(storageId,draft.layout,"saved",selected.id);refresh()}},{id:"rename",label:"Rename layout…",onSelect:()=>{setName(selected.name);setDialog("rename")}},{id:"delete",label:"Delete layout",danger:true,onSelect:()=>{deleteLayoutProfile(editorType,selected.id);onClick();refresh()}}] as MenuAction[]:[])];
    return <><MenuButton label={`${selected?.name??"Factory"}${draft?.status&&draft.status!=="saved"?` · ${draft.status[0].toUpperCase()}${draft.status.slice(1)}`:""}`} icon={<Icon><path d="M4 5h16v14H4zM8 5v14M8 10h12"/></Icon>} actions={actions}/><Dialog open={!!dialog} title={dialog==="rename"?"Rename layout":"Save layout"} onClose={()=>setDialog(null)} footer={<Button intent="primary" onClick={save}>{dialog==="rename"?"Rename":"Save layout"}</Button>}><TextField label="Layout name" value={name} maxLength={40} onValue={setName}/></Dialog>{structural.dialog}</>;
}

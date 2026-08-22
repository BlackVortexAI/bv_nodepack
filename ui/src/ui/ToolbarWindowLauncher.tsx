import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "./components";

export type ToolbarLauncherItem = { id:string; label:string; meta?:string; disabled?:boolean; onSelect:()=>void };
export type ToolbarLauncherColumn = { id:string; label:string; items:ToolbarLauncherItem[] };
export const BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT="bv-toggle-toolbar-window-launcher";

export function ToolbarWindowLauncher({getColumns}:{getColumns:()=>ToolbarLauncherColumn[]}) {
    const [columns,setColumns]=useState<ToolbarLauncherColumn[]>([]),[position,setPosition]=useState({left:0,top:0});
    const [open,setOpen]=useState(false),menu=useRef<HTMLDivElement>(null),openTimer=useRef<number>(),closeTimer=useRef<number>();
    const clearTimers=()=>{if(openTimer.current)window.clearTimeout(openTimer.current);if(closeTimer.current)window.clearTimeout(closeTimer.current)};
    const reveal=useCallback((delay:number)=>{clearTimers();openTimer.current=window.setTimeout(()=>{const anchors=[...document.querySelectorAll<HTMLElement>(".bv-regional-action")].filter(item=>item.offsetParent!==null);if(!anchors.length)return;const boxes=anchors.map(item=>item.getBoundingClientRect()),anchorLeft=Math.min(...boxes.map(box=>box.left)),bottom=Math.max(...boxes.map(box=>box.bottom));const next=getColumns().filter(column=>column.items.length);if(!next.length)return;const width=Math.min(next.length*220,window.innerWidth-24),left=Math.max(12,Math.min(anchorLeft,window.innerWidth-width-12));setColumns(next);setPosition({left,top:bottom+6});setOpen(true)},delay)},[getColumns]);
    const show=useCallback(()=>reveal(180),[reveal]);
    const hide=useCallback(()=>{if(openTimer.current)window.clearTimeout(openTimer.current);closeTimer.current=window.setTimeout(()=>setOpen(false),280)},[]);
    useEffect(()=>{const attached=new Map<HTMLElement,()=>void>();const bind=()=>{for(const anchor of document.querySelectorAll<HTMLElement>(".bv-regional-action")){if(attached.has(anchor))continue;const enter=()=>show(),leave=()=>hide(),focus=()=>show();anchor.addEventListener("pointerenter",enter);anchor.addEventListener("pointerleave",leave);anchor.addEventListener("focus",focus);const dispose=()=>{anchor.removeEventListener("pointerenter",enter);anchor.removeEventListener("pointerleave",leave);anchor.removeEventListener("focus",focus)};attached.set(anchor,dispose)}};bind();const observer=new MutationObserver(bind);observer.observe(document.body,{childList:true,subtree:true});return()=>{observer.disconnect();attached.forEach(dispose=>dispose());clearTimers()}},[hide,show]);
    useEffect(()=>{if(!open)return;const close=(event:KeyboardEvent)=>{if(event.key==="Escape")setOpen(false)};window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close)},[open]);
    useEffect(()=>{const toggle=()=>open?setOpen(false):reveal(0);window.addEventListener(BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT,toggle);return()=>window.removeEventListener(BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT,toggle)},[open,reveal]);
    if(!open||!columns.length)return null;
    return createPortal(<div ref={menu} className="bv-toolbar-window-launcher bv-ui bv-density-compact" style={{left:position.left,top:position.top,"--bv-launcher-columns":columns.length} as React.CSSProperties} role="dialog" aria-label="BV window launcher" onPointerEnter={clearTimers} onPointerLeave={hide}>{columns.map(column=><section key={column.id}><h3>{column.label}</h3><div>{column.items.map(item=><Button key={item.id} intent="ghost" disabled={item.disabled} onClick={()=>{setOpen(false);item.onSelect()}}><span>{item.label}</span>{item.meta&&<small>{item.meta}</small>}</Button>)}</div></section>)}</div>,document.body);
}

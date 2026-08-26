import React, { createContext, useContext, type ReactNode } from "react";

export type UiCaptureSource={id:string;title:string;element:HTMLElement;rootGraph:any};
const sources=new Map<string,UiCaptureSource>(),listeners=new Set<()=>void>();
let captureApp:any=null,sequence=0;
export const CaptureOwnerContext=createContext<string|undefined>(undefined);
export const useCaptureOwner=()=>useContext(CaptureOwnerContext);
export const nextCaptureId=()=>`bv-window-${++sequence}`;
export const configureCaptureApp=(app:any)=>{captureApp=app};
export const registerUiCaptureSource=(id:string,title:string,element:HTMLElement)=>{sources.set(id,{id,title,element,rootGraph:captureApp?.graph});listeners.forEach(listener=>listener());return()=>{sources.delete(id);listeners.forEach(listener=>listener())}};
export const listUiCaptureSources=()=>[...sources.values()].filter(source=>source.element.isConnected&&!source.element.hidden);
export const getUiCaptureSource=(id:string)=>listUiCaptureSources().find(source=>source.id===id);
export const subscribeUiCaptureSources=(listener:()=>void)=>{listeners.add(listener);return()=>listeners.delete(listener)};
export function CaptureOwner({id,children}:{id:string;children:ReactNode}){return <CaptureOwnerContext.Provider value={id}>{children}</CaptureOwnerContext.Provider>}

import React, { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Actions, Layout, Model, TabNode, type Action, type IJsonModel } from "flexlayout-react";
import { BV_LAYOUT_SESSION_CHANGED_EVENT, clearSessionLayoutDraft, getSessionLayoutDraft, missingLayoutPanels, setSessionLayoutDraft, type BvLayoutStatus } from "./layoutProfiles";
import { showBvToast } from "./toastStore";

export const BV_FLEXLAYOUT_LIBRARY="flexlayout-react@0.10.5";
export type BvDockPanel = { id:string; layoutId?:string; title:string; content:ReactNode; weight:number; minWidth?:number };

const DockPanelContent=createContext<ReadonlyMap<string,ReactNode>>(new Map());
function LiveDockPanel({id}:{id:string}){const content=useContext(DockPanelContent);return <>{content.get(id)??null}</>}

function defaultLayout(panels:BvDockPanel[]):IJsonModel{return{global:{tabEnableClose:false,tabEnablePopout:false,tabEnablePopoutIcon:false,tabEnablePopoutFloatIcon:true,tabSetMinWidth:180,tabSetMinHeight:130},borders:[],layout:{type:"row",children:panels.map(panel=>({type:"tabset",weight:panel.weight,minWidth:panel.minWidth,children:[{type:"tab",id:panel.layoutId??panel.id,name:panel.title,component:panel.id,enablePopoutFloatIcon:true}]}))}}}
const structuralActions=new Set<string>([Actions.MOVE_NODE,Actions.DELETE_TAB,Actions.DELETE_TABSET,Actions.RENAME_TAB]);
const statusForAction=(action:Action):BvLayoutStatus=>structuralActions.has(action.type)?"modified":"adjusted";
export function resetBvDockLayout(storageId:string){clearSessionLayoutDraft(storageId)}

export default function BvDockLayout({storageId,panels,resetSignal=0,defaultModel,onStatus}:{storageId:string;panels:BvDockPanel[];resetSignal?:number;defaultModel?:IJsonModel;onStatus?:(status:BvLayoutStatus)=>void}){
    const signature=JSON.stringify({panels:panels.map(panel=>`${panel.layoutId??panel.id}:${panel.weight}`),defaultModel}),fallback=useMemo(()=>defaultModel??defaultLayout(panels),[signature]);
    const [model,setModel]=useState(()=>Model.fromJson((getSessionLayoutDraft(storageId)?.layout as IJsonModel|undefined)??fallback));
    const content=useMemo(()=>new Map(panels.map(panel=>[panel.id,panel.content])),[panels]);
    useEffect(()=>{const draft=getSessionLayoutDraft(storageId),missing=draft?missingLayoutPanels(draft.layout,panels.map(panel=>panel.layoutId??panel.id)):[];setModel(Model.fromJson((draft?.layout as IJsonModel|undefined)??fallback));onStatus?.(draft?.status??"saved");if(missing.length)showBvToast({id:`bv-layout-missing:${storageId}`,title:"Layout has new panels",message:`${missing.length} registered panel${missing.length===1?" is":"s are"} missing from this saved layout.`,tone:"info",duration:0,actionLabel:"Use Factory layout",onAction:()=>{resetBvDockLayout(storageId);setModel(Model.fromJson(fallback));onStatus?.("saved")}})},[fallback,signature,storageId]);
    useEffect(()=>{if(resetSignal){resetBvDockLayout(storageId);setModel(Model.fromJson(fallback));onStatus?.("saved")}},[fallback,resetSignal,storageId]);
    useEffect(()=>{const load=(event:Event)=>{if((event as CustomEvent).detail?.key!==storageId)return;const draft=getSessionLayoutDraft(storageId);if(draft){setModel(Model.fromJson(draft.layout as IJsonModel));onStatus?.(draft.status)}};window.addEventListener(BV_LAYOUT_SESSION_CHANGED_EVENT,load);return()=>window.removeEventListener(BV_LAYOUT_SESSION_CHANGED_EVENT,load)},[onStatus,storageId]);
    const guard=(action:Action)=>action.type===Actions.POPOUT_TAB&&action.data.type==="float"&&model.getNodeById(action.data.node)?.getLayoutId()!==Model.MAIN_LAYOUT_ID?undefined:action;
    return <DockPanelContent.Provider value={content}><div className="bv-ui-dock flexlayout__theme_dark"><Layout model={model} factory={(node:TabNode)=><LiveDockPanel id={node.getComponent()??""}/>} constrainFloatPanels onAction={guard} onModelChange={(next,action)=>{setModel(next);const draft=getSessionLayoutDraft(storageId),status=draft?.status==="modified"?"modified":statusForAction(action);setSessionLayoutDraft(storageId,next.toJson(),status,draft?.profileId,false);onStatus?.(status)}}/></div></DockPanelContent.Provider>;
}

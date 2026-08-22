import React, { useEffect, useMemo, useState, type ReactNode } from "react";
import { Actions, Layout, Model, TabNode, type Action, type IJsonModel } from "flexlayout-react";

const LIBRARY = "flexlayout-react@0.10.5";
const PREFIX = "bv-nodepack:dock-layout:v1:";
export type BvDockPanel = { id:string; title:string; content:ReactNode; weight:number; minWidth?:number };

function defaultLayout(panels:BvDockPanel[]):IJsonModel {
    return { global:{ tabEnableClose:false, tabEnablePopout:false, tabEnablePopoutIcon:false, tabEnablePopoutFloatIcon:true, tabSetMinWidth:180, tabSetMinHeight:130 }, borders:[], layout:{ type:"row", children:panels.map(panel => ({ type:"tabset", weight:panel.weight, minWidth:panel.minWidth, children:[{ type:"tab", id:panel.id, name:panel.title, component:panel.id, enablePopoutFloatIcon:true }] })) } };
}
function loadModel(storageId:string, signature:string, fallback:IJsonModel) {
    try {
        const stored = localStorage.getItem(`${PREFIX}${storageId}`), envelope = stored ? JSON.parse(stored) : null;
        if (envelope?.schemaVersion !== 1 || envelope?.library !== LIBRARY || envelope?.panels !== signature) throw new Error("Unsupported layout state");
        return Model.fromJson(envelope.layout);
    } catch { return Model.fromJson(fallback); }
}
export function resetBvDockLayout(storageId:string) { try { localStorage.removeItem(`${PREFIX}${storageId}`); } catch {} }

export default function BvDockLayout({ storageId, panels, resetSignal=0, defaultModel }:{ storageId:string; panels:BvDockPanel[]; resetSignal?:number; defaultModel?:IJsonModel }) {
    const signature = JSON.stringify({ panels:panels.map(panel => `${panel.id}:${panel.weight}`), defaultModel });
    const fallback = useMemo(() => defaultModel ?? defaultLayout(panels), [signature]);
    const [model, setModel] = useState(() => loadModel(storageId, signature, fallback));
    const content = useMemo(() => new Map(panels.map(panel => [panel.id, panel.content])), [panels]);
    useEffect(() => setModel(loadModel(storageId, signature, fallback)), [fallback, signature, storageId]);
    useEffect(() => { if (resetSignal) { resetBvDockLayout(storageId); setModel(Model.fromJson(fallback)); } }, [fallback, resetSignal, storageId]);
    const guard = (action:Action) => {
        if (action.type === Actions.POPOUT_TAB && action.data.type === "float" && model.getNodeById(action.data.node)?.getLayoutId() !== Model.MAIN_LAYOUT_ID) return undefined;
        return action;
    };
    return <div className="bv-ui-dock flexlayout__theme_dark"><Layout model={model} factory={(node:TabNode) => content.get(node.getComponent() ?? "") ?? null} constrainFloatPanels onAction={guard} onModelChange={next => { setModel(next); try { localStorage.setItem(`${PREFIX}${storageId}`, JSON.stringify({ schemaVersion:1, library:LIBRARY, panels:signature, layout:next.toJson() })); } catch {} }}/></div>;
}

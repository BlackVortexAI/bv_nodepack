import * as React from "react";
import { FC, useEffect, useMemo, useRef, useState } from "react";
import { getApp } from "../../appHelper";
import { collectAllGroups } from "../../util/control/collector";
import { BVControl, BVControlConfig, CONFIG_CHANGED_EVENT, readConfig, writeConfig } from "../../util/control/configHandler";
import { findActiveControlConflicts } from "../../util/control/controlCenterModel.js";
import BVControlRowComponent from "./BVControlRowComponent";
import { Badge, Button, SortableList, ToggleField, type SortableItem } from "../../ui/components";
import { useBvHistory, useBvHistoryShortcuts } from "../../ui/history";

function id() {
    return globalThis.crypto?.randomUUID?.() ?? `bv-control-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const BVControlComponent: FC = () => {
    const initialConfig = useMemo<BVControlConfig>(() => {
        const current = readConfig();
        const available = new Set(collectAllGroups(getApp()).map((group) => group.id));
        return {
            ...current,
            controls: current.controls.map((control) => ({
                ...control,
                assignments: control.assignments.map((assignment) => ({ ...assignment, unresolved: !available.has(assignment.groupId) })),
            })),
        };
    },[]);
    const history=useBvHistory(initialConfig),config=history.value,setConfig=(next:BVControlConfig)=>history.commit(next);
    useBvHistoryShortcuts(history);
    useEffect(()=>{const syncEnabled=(event:Event)=>{const incoming=(event as CustomEvent<BVControlConfig>).detail,enabled=new Map(incoming.controls.map(control=>[control.id,control.enabled])),next={...config,controls:config.controls.map(control=>enabled.has(control.id)?{...control,enabled:enabled.get(control.id)!}:control)};if(JSON.stringify(next)!==JSON.stringify(config))history.replace(next)};window.addEventListener(CONFIG_CHANGED_EVENT,syncEnabled);return()=>window.removeEventListener(CONFIG_CHANGED_EVENT,syncEnabled)},[config,history.replace]);
    const groups = useMemo(() => collectAllGroups(getApp()), [config]);
    const conflicts = useMemo(() => findActiveControlConflicts(config), [config]);
    const initialized=useRef(false);
    useEffect(()=>{if(!initialized.current){initialized.current=true;return}const timer=window.setTimeout(()=>{const names=config.controls.map(control=>control.name.trim());if(names.some(name=>!name)||new Set(names).size!==names.length)return;const available=new Set(groups.map(group=>group.id));writeConfig({...config,controls:config.controls.map(control=>({...control,name:control.name.trim(),assignments:control.assignments.map(assignment=>({...assignment,unresolved:!available.has(assignment.groupId)}))}))})},250);return()=>window.clearTimeout(timer)},[config,groups]);
    const updateControl = (index: number, control: BVControl | null) => {
        setConfig({ ...config, controls: control ? config.controls.map((item, itemIndex) => itemIndex === index ? control : item) : config.controls.filter((_, itemIndex) => itemIndex !== index) });
    };
    const addControl = () => {
        let name = "New Control";
        let suffix = 2;
        while (config.controls.some((control) => control.name === name)) name = `New Control ${suffix++}`;
        setConfig({ ...config, controls: [...config.controls, { id: id(), name, enabled: true, assignments: [] }] });
    };
    const items:SortableItem[]=config.controls.map((control,index)=>({id:control.id,title:control.name||"Unnamed control",description:`${control.assignments.length} assignment${control.assignments.length===1?"":"s"}`,content:<BVControlRowComponent control={control} groups={groups} conflicts={conflicts} onChange={(value)=>updateControl(index,value)}/>}));
    return <div className="bv-control-editor">
        <section className="bv-control-editor-settings">
            <div><strong>Release behavior</strong><span>Choose whether controls become active again when restrictions are released.</span></div>
            <ToggleField label="Force active after releasing restrictions" value={config.forceActive} trueLabel="Force active" falseLabel="Keep current state" onValue={forceActive=>setConfig({...config,forceActive})}/>
        </section>
        <div className="bv-controls"><SortableList items={items} onReorder={ordered=>setConfig({...config,controls:ordered.map(item=>config.controls.find(control=>control.id===item.id)!).filter(Boolean)})} onRemove={controlId=>setConfig({...config,controls:config.controls.filter(control=>control.id!==controlId)})}/></div>
        <footer className="bv-control-editor-footer bv-ui-inline-footer"><Badge tone="success" dot>Autosaved</Badge><Button intent="ghost" disabled={!history.canUndo} onClick={history.undo}>Undo</Button><Button intent="ghost" disabled={!history.canRedo} onClick={history.redo}>Redo</Button><Button onClick={addControl}>Add Control</Button></footer>
    </div>;
};

export default BVControlComponent;

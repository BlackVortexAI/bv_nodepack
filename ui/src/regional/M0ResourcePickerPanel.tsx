import React from "react";
import { ResourcePicker, ResourcePickerCollector, ToggleField } from "../ui/components";

export function M0ResourcePickerPanel({collectors,collectorId,resourceId,resolved,debugVisible,onCollector,onResource,onDebug}:{collectors:ResourcePickerCollector[];collectorId:string;resourceId:string;resolved:boolean;debugVisible:boolean;onCollector:(id:string)=>void;onResource:(id:string)=>void;onDebug:(visible:boolean)=>void}){
    return <div className="bv-m0-picker-panel">
        <ToggleField label="Hidden link debug" value={debugVisible} trueLabel="Visible" falseLabel="Hidden" onValue={onDebug}/>
        <ResourcePicker collectors={collectors} collectorId={collectorId} resourceId={resourceId} resolved={resolved} onCollector={onCollector} onResource={onResource}/>
    </div>;
}

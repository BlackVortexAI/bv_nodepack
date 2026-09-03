import React from "../../ui/node_modules/react/index.js";
import { ResourcePicker, ResourcePickerCollector, ToggleField } from "../../ui/src/ui/components";

export function M0ResourcePickerPanel({collectors,collectorId,resourceId,resolved,debugVisible,onSelection,onDebug}:{collectors:ResourcePickerCollector[];collectorId:string;resourceId:string;resolved:boolean;debugVisible:boolean;onSelection:(collectorId:string,resourceId:string)=>void;onDebug:(visible:boolean)=>void}){
    return <div className="bv-m0-picker-panel">
        <ToggleField label="Hidden link debug" value={debugVisible} trueLabel="Visible" falseLabel="Hidden" onValue={onDebug}/>
        <ResourcePicker collectors={collectors} collectorId={collectorId} resourceId={resourceId} resolved={resolved} onSelection={onSelection}/>
    </div>;
}

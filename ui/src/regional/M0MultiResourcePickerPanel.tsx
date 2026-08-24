import React from "react";
import { Button, ResourcePicker, ResourcePickerCollector, ToggleField } from "../ui/components";

export type M0ResourceBinding={binding_id:string;collector_id:string;resource_id:string;resolved:boolean};

export function M0MultiResourcePickerPanel({collectors,bindings,debugVisible,onBinding,onAdd,onRemove,onDebug}:{
    collectors:ResourcePickerCollector[];bindings:M0ResourceBinding[];debugVisible:boolean;
    onBinding:(index:number,collectorId:string,resourceId:string)=>void;onAdd:()=>void;onRemove:(index:number)=>void;onDebug:(visible:boolean)=>void;
}){
    return <div className="bv-m0-picker-panel bv-m0-multi-picker">
        <ToggleField label="Native fan-in debug" value={debugVisible} trueLabel="Dashed links" falseLabel="Hidden" onValue={onDebug}/>
        {bindings.map((binding,index)=><section className="bv-m0-binding" key={binding.binding_id}>
            <header><strong>Binding {index+1}</strong><Button type="button" iconOnly icon="×" onClick={()=>onRemove(index)} aria-label={`Remove binding ${index+1}`}/></header>
            <ResourcePicker collectors={collectors} collectorId={binding.collector_id} resourceId={binding.resource_id} resolved={binding.resolved}
                onSelection={(collectorId,resourceId)=>onBinding(index,collectorId,resourceId)}/>
        </section>)}
        <Button type="button" className="bv-m0-add-binding" disabled={bindings.length>=20} onClick={onAdd}>Add collector binding</Button>
    </div>;
}

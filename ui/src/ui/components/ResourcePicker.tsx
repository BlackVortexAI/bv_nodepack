import React from "react";
import { SelectField } from "./forms";

export type ResourcePickerCollector = { id:string; label:string; resources:Array<{id:string;label:string}> };
export type ResourcePickerOption={value:string;collectorId:string;resourceId:string;label:string};

const selectionValue=(collectorId:string,resourceId:string)=>JSON.stringify([collectorId,resourceId]);

export function resourcePickerOptions(collectors:ResourcePickerCollector[]):ResourcePickerOption[]{
    const labels=new Map<string,number>();
    for(const collector of collectors)for(const resource of collector.resources)labels.set(resource.label,(labels.get(resource.label)??0)+1);
    return collectors.flatMap(collector=>collector.resources.map(resource=>({
        value:selectionValue(collector.id,resource.id),collectorId:collector.id,resourceId:resource.id,
        label:(labels.get(resource.label)??0)>1?`${resource.label} · ${collector.label}`:resource.label,
    })));
}

export function ResourcePicker({collectors,collectorId,resourceId,resolved=true,onSelection,label="Resource",emptyLabel="Select resource"}:{collectors:ResourcePickerCollector[];collectorId:string;resourceId:string;resolved?:boolean;onSelection:(collectorId:string,resourceId:string)=>void;label?:string;emptyLabel?:string}) {
    const collector=collectors.find(item=>item.id===collectorId),resource=collector?.resources.find(item=>item.id===resourceId);
    const selected=Boolean(collectorId||resourceId),unresolved=selected&&(!resolved||!collector||!resource);
    const options=resourcePickerOptions(collectors),value=selected?selectionValue(collectorId,resourceId):"";
    const visibleOptions=unresolved&&!options.some(option=>option.value===value)?[{value,label:`Unresolved · ${resourceId||collectorId}`},...options]:options;
    return <div className={`bv-resource-picker ${unresolved?"is-unresolved":""}`}>
        <SelectField label={label} value={value} options={[{value:"",label:emptyLabel},...visibleOptions]} onValue={next=>{if(!next){onSelection("","");return;}const option=options.find(candidate=>candidate.value===next);if(option)onSelection(option.collectorId,option.resourceId);}}/>
    </div>;
}

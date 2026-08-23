import React from "react";

export type ResourcePickerCollector = { id:string; label:string; resources:Array<{id:string;label:string}> };

export function ResourcePicker({collectors,collectorId,resourceId,resolved=true,onCollector,onResource}:{collectors:ResourcePickerCollector[];collectorId:string;resourceId:string;resolved?:boolean;onCollector:(id:string)=>void;onResource:(id:string)=>void}) {
    const collector=collectors.find(item=>item.id===collectorId),resource=collector?.resources.find(item=>item.id===resourceId);
    const unresolved=!resolved||!collector||!resource;
    return <div className={`bv-resource-picker ${unresolved?"is-unresolved":""}`}>
        <div className="bv-resource-picker-summary">{!unresolved&&collector&&resource?`${collector.label} / ${resource.label}`:"Unresolved resource selection"}</div>
        <label>Collector<select aria-label="Collector" value={collectorId} onChange={event=>onCollector(event.target.value)}><option value="">Select collector</option>{collectors.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Resource<select aria-label="Resource" value={resourceId} onChange={event=>onResource(event.target.value)}><option value="">Select resource</option>{collector?.resources.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>;
}

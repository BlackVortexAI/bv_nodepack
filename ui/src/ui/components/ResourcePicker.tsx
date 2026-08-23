import React from "react";
import { FieldGrid, SelectField } from "./forms";

export type ResourcePickerCollector = { id:string; label:string; resources:Array<{id:string;label:string}> };

export function ResourcePicker({collectors,collectorId,resourceId,resolved=true,onCollector,onResource}:{collectors:ResourcePickerCollector[];collectorId:string;resourceId:string;resolved?:boolean;onCollector:(id:string)=>void;onResource:(id:string)=>void}) {
    const collector=collectors.find(item=>item.id===collectorId),resource=collector?.resources.find(item=>item.id===resourceId);
    const selected=Boolean(collectorId||resourceId),unresolved=selected&&(!resolved||!collector||!resource);
    return <div className={`bv-resource-picker ${unresolved?"is-unresolved":""}`}>
        <FieldGrid minimum={130}><SelectField label="Collector" value={collectorId} options={[{value:"",label:"Select collector"},...collectors.map(item=>({value:item.id,label:item.label}))]} onValue={onCollector}/><SelectField label="Resource" value={resourceId} disabled={!collector} options={[{value:"",label:"Select resource"},...(collector?.resources??[]).map(item=>({value:item.id,label:item.label}))]} onValue={onResource}/></FieldGrid>
    </div>;
}

import { BvSelect } from "../ui/controls";

export type DetailerResourceCollector={id:string;label:string;resources:Array<{id:string;label:string}>};

const key=(collectorId:string,resourceId:string)=>JSON.stringify([collectorId,resourceId]);

export function detailerResourceOptions(collectors:DetailerResourceCollector[]){
    const counts=new Map<string,number>();
    for(const collector of collectors)for(const resource of collector.resources)counts.set(resource.label,(counts.get(resource.label)??0)+1);
    return collectors.flatMap(collector=>collector.resources.map(resource=>({
        value:key(collector.id,resource.id),collectorId:collector.id,resourceId:resource.id,
        label:(counts.get(resource.label)??0)>1?`${resource.label} · ${collector.label}`:resource.label,
    })));
}

export function DetailerResourcePicker({collectors,collectorId,resourceId,onValue,label="Detector"}:{collectors:DetailerResourceCollector[];collectorId:string;resourceId:string;onValue:(collectorId:string,resourceId:string)=>void;label?:string}){
    const options=detailerResourceOptions(collectors),value=collectorId&&resourceId?key(collectorId,resourceId):"";
    const unresolved=Boolean(value&&!options.some(option=>option.value===value));
    return <BvSelect label={label} value={value} onChange={next=>{if(!next){onValue("","");return;}try{const [nextCollector,nextResource]=JSON.parse(next);onValue(String(nextCollector),String(nextResource));}catch{}}}>
        <option value="">No detector · use composed region mask</option>
        {unresolved&&<option value={value}>Unresolved detector · {resourceId}</option>}
        {options.map(option=><option key={option.value} value={option.value}>{option.label}</option>)}
    </BvSelect>;
}

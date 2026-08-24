import { ResourcePicker, type ResourcePickerCollector } from "../ui/components";
import { defaultConditioning, defaultDetection, parseDetailerPlanConfig, serializeDetailerPlanConfig, type DetailerPlanConfig, type DetailerPlanRegion } from "./detailerPlanConfig";
import { detailerV3Catalog, scheduleDetailerPromptV3Reconcile } from "./detailerV3Graph";

const widget=(node:any,name:string)=>node?.widgets?.find((item:any)=>item.name===name);
export const emptyDetailerEasyConfig=():DetailerPlanConfig=>({version:1,jobs:[]});
export const readDetailerEasyConfig=(node:any,regions:DetailerPlanRegion[])=>parseDetailerPlanConfig(widget(node,"detailer_v3_config_json")?.value,regions,detailerV3Catalog(node));

export function reconcileDetailerEasyConfig(config:DetailerPlanConfig,regions:DetailerPlanRegion[]){
    const eligible=regions.filter(region=>region.enabled!==false&&(region.usage==="detailer"||region.usage==="both"));
    const byRegion=new Map(config.jobs.filter(job=>job.region_ids.length===1).map(job=>[job.region_ids[0],job]));
    const jobs=eligible.map(region=>byRegion.get(region.id)??({id:crypto.randomUUID(),region_ids:[region.id],primary_region_id:region.id,mask_composition:"union" as const,prompt_composition:"context" as const,conditioning:defaultConditioning(),detector_assignments:[]}));
    return {...config,jobs};
}

export function writeDetailerEasyConfig(node:any,config:DetailerPlanConfig){
    const item=widget(node,"detailer_v3_config_json");if(!item)return config;
    const value=serializeDetailerPlanConfig(config);if(String(item.value??"")!==value){item.value=value;item.callback?.(value);node.setDirtyCanvas?.(true,true);}
    scheduleDetailerPromptV3Reconcile(node);return config;
}

export function DetailerEasyRegionPicker({node,config,regionId,collectors,onConfig}:{node:any;config:DetailerPlanConfig;regionId:string;collectors:ResourcePickerCollector[];onConfig:(config:DetailerPlanConfig)=>void}){
    const job=config.jobs.find(item=>item.region_ids.length===1&&item.region_ids[0]===regionId),assignment=job?.detector_assignments[0];
    if(!job)return null;
    return <ResourcePicker label="Detailer detector" emptyLabel="No detector · use composed region mask" collectors={collectors} collectorId={assignment?.source.collector_id??""} resourceId={assignment?.source.resource_id??""} onSelection={(collectorId,resourceId)=>{
        const next={...config,jobs:config.jobs.map(item=>item.id!==job.id?item:{...item,detector_assignments:collectorId&&resourceId?[{id:assignment?.id??crypto.randomUUID(),source:{collector_id:collectorId,resource_id:resourceId},options:assignment?.options??defaultDetection()}]:[]})};
        onConfig(writeDetailerEasyConfig(node,next));
    }}/>;
}

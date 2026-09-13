/** Region ownership comes from the Regional Prompt widget, never from a catalog.
 * Disconnected resources and disabled regions are not evidence of deletion. */
export type RegionalJob={id:string;region_ids:string[];scope?:string;primary_region_id?:string;[key:string]:any};
export type RegionalJobConfig={version:1;jobs:RegionalJob[]};
export type RegionalJobs=Partial<Record<'lut_v3_config_json'|'detailer_v3_config_json',RegionalJobConfig>>;
type Document={document_id:string;regions:Array<{id:string}>};
export const regionalJobKeys=['lut_v3_config_json','detailer_v3_config_json'] as const;
export function parseRegionalJobConfig(raw:unknown):RegionalJobConfig{
    const value=typeof raw==='string'?JSON.parse(raw):structuredClone(raw);
    if(!value||value.version!==1||!Array.isArray(value.jobs)||value.jobs.some((job:any)=>!job||typeof job.id!=='string'||!Array.isArray(job.region_ids)||job.region_ids.some((id:any)=>typeof id!=='string')))throw new Error('Invalid regional job configuration');
    return value;
}
export function reconcileRegionalJobs<T extends RegionalJobConfig>(config:T,document:Document):T{
    const ids=new Set(document.regions.map(region=>region.id));
    return {...config,jobs:config.jobs.flatMap(job=>{
        if(job.scope==='global')return[job];
        const remaining=job.region_ids.filter(id=>ids.has(id));
        if(remaining.length===job.region_ids.length)return[job];
        if(!remaining.length)return[];
        return[{...job,region_ids:remaining,...(job.primary_region_id&&!remaining.includes(job.primary_region_id)?{primary_region_id:remaining[0]}:{})}];
    })};
}
export function readRegionalJobs(node:any):RegionalJobs{
    const result:RegionalJobs={};
    for(const key of regionalJobKeys){const widget=node?.widgets?.find((item:any)=>item.name===key);if(widget&&String(widget.value??'').trim())result[key]=parseRegionalJobConfig(widget.value);}
    return result;
}
export function regionalJobCandidates(node:any,document:Document,jobs=readRegionalJobs(node)){
    return regionalJobKeys.flatMap(key=>{
        const target=node?.widgets?.find((item:any)=>item.name===key),config=jobs[key];
        if(!target||!config)return[];
        const value=JSON.stringify(reconcileRegionalJobs(config,document));
        return String(target.value)===value?[]:[{target,value}];
    });
}
export function restoreRegionalJobs(current:RegionalJobs,before:Document,restored:Document,snapshot:RegionalJobs={}):RegionalJobs{
    const old=new Set(before.document_id===restored.document_id?before.regions.map(region=>region.id):[]);
    const added=new Set(restored.regions.map(region=>region.id).filter(id=>!old.has(id)));
    const result=structuredClone(current);
    for(const key of regionalJobKeys){
        const config=result[key];if(!config)continue;
        const saved=snapshot[key]?.jobs??[];
        for(const job of saved){
            if(job.scope==='global')continue;
            const revived=job.region_ids.filter(id=>added.has(id));if(!revived.length)continue;
            const found=config.jobs.find(item=>item.id===job.id);
            if(found){
                for(const id of revived)if(!found.region_ids.includes(id)){
                    const following=new Set(job.region_ids.slice(job.region_ids.indexOf(id)+1));
                    const index=found.region_ids.findIndex(item=>following.has(item));
                    found.region_ids.splice(index<0?found.region_ids.length:index,0,id);
                }
                // Preserve a later primary choice; restore only the deletion fallback.
                const previousSurvivors=job.region_ids.filter(id=>old.has(id));
                if(job.primary_region_id&&added.has(job.primary_region_id)&&found.primary_region_id===previousSurvivors[0])found.primary_region_id=job.primary_region_id;
            }else{
                const following=new Set(saved.slice(saved.indexOf(job)+1).map(item=>item.id));
                const index=config.jobs.findIndex(item=>following.has(item.id));
                config.jobs.splice(index<0?config.jobs.length:index,0,{...structuredClone(job),region_ids:revived,...(job.primary_region_id&&!revived.includes(job.primary_region_id)?{primary_region_id:revived[0]}:{})});
            }
        }
        result[key]=reconcileRegionalJobs(config,restored);
    }
    return result;
}

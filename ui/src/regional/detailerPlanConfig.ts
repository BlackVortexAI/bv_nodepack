export type DetailerPlanRegion = { id: string; name: string; priority?: number; enabled?: boolean; usage?: "generation" | "detailer" | "both" };
export type DetailerConditioning = { global_influence: number; background_influence: number; primary_region_influence: number; context_region_influence: number };
export type DetailerDetection = { roi_padding: number; threshold: number; dilation: number; crop_factor: number; drop_size: number; query?: string; labels?: string[] };
export type DetailerAssignment = { id:string; source:{collector_id:string;resource_id:string}; options:DetailerDetection };
export type DetailerPlanJob = { id:string; region_ids: string[]; primary_region_id: string; mask_composition: "union" | "intersection" | "subtract"; prompt_composition: "primary" | "context"; conditioning: DetailerConditioning; detector_assignments:DetailerAssignment[] };
export type DetailerPlanConfig = { version: 1; jobs: DetailerPlanJob[] };
export type DetailerCollectorChoice={id:string;label:string;resources:Array<{id:string;label:string}>};
const finite = (value: unknown, fallback: number, min: number, max: number) => { const number = Number(value); return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback; };
export const defaultConditioning = (): DetailerConditioning => ({ global_influence: 1, background_influence: 0.35, primary_region_influence: 1, context_region_influence: 1 });
export const defaultDetection = (): DetailerDetection => ({ roi_padding: 0.15, threshold: 0.5, dilation: 0, crop_factor: 1.5, drop_size: 10 });
export const eligibleDetailerRegions = (regions: DetailerPlanRegion[]) => regions.filter(region => region.enabled !== false && (region.usage === "detailer" || region.usage === "both")).sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0));
export const defaultDetailerPlan = (regions: DetailerPlanRegion[]): DetailerPlanConfig => ({ version: 1, jobs: eligibleDetailerRegions(regions).map(region => ({ id:crypto.randomUUID(),region_ids: [region.id], primary_region_id: region.id, mask_composition: "union", prompt_composition: "context", conditioning: defaultConditioning(), detector_assignments:[] })) });
export const parseDetailerPlanConfig = (value: unknown, regions: DetailerPlanRegion[],collectors:DetailerCollectorChoice[]=[]): DetailerPlanConfig => {
    const available = new Set(eligibleDetailerRegions(regions).map(region => region.id)); let parsed: any;
    try { parsed = String(value ?? "").trim() ? JSON.parse(String(value)) : defaultDetailerPlan(regions); } catch { parsed = defaultDetailerPlan(regions); }
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs.flatMap((job: any) => {
        const ids = Array.isArray(job?.region_ids) ? [...new Set<string>(job.region_ids.map(String).filter((id: string) => available.has(id)))] : [];
        if (!ids.length) return [];
        const conditioning = job.conditioning ?? {},legacyDetector=job.detector??{},canonical=Array.isArray(job.detector_assignments)?job.detector_assignments.slice(0,1):[],legacyId=String(job.detector_id??"").trim(),matches=collectors.flatMap(collector=>collector.resources.filter(resource=>resource.id===legacyId).map(resource=>({collector,resource}))),assignments=canonical.length?canonical:(legacyId?[{id:crypto.randomUUID(),source:{collector_id:matches.length===1?matches[0].collector.id:"",resource_id:legacyId},options:legacyDetector}]:[]);
        return [{ id:String(job.id??"").trim()||crypto.randomUUID(),region_ids: ids, primary_region_id: ids.includes(String(job.primary_region_id)) ? String(job.primary_region_id) : ids[0], mask_composition: ["union", "intersection", "subtract"].includes(job.mask_composition) ? job.mask_composition : "union", prompt_composition: job.prompt_composition === "primary" ? "primary" : "context",
            conditioning: { global_influence: finite(conditioning.global_influence, 1, 0, 2), background_influence: finite(conditioning.background_influence, 0.35, 0, 2), primary_region_influence: finite(conditioning.primary_region_influence, 1, 0, 2), context_region_influence: finite(conditioning.context_region_influence, 1, 0, 2) },
            detector_assignments:assignments.map((entry:any)=>{const detector=entry.options??{};return{id:String(entry.id??"").trim()||crypto.randomUUID(),source:{collector_id:String(entry.source?.collector_id??""),resource_id:String(entry.source?.resource_id??"")},options:{ roi_padding: finite(detector.roi_padding, 0.15, 0, 2), threshold: finite(detector.threshold, 0.5, 0, 1), dilation: Math.round(finite(detector.dilation, 0, -512, 512)), crop_factor: finite(detector.crop_factor, 1.5, 1, 20), drop_size: Math.round(finite(detector.drop_size, 10, 1, 8192)), ...(String(detector.query ?? "").trim() ? { query: String(detector.query).trim() } : {}), ...(Array.isArray(detector.labels) ? { labels: detector.labels.map(String).map((item: string) => item.trim()).filter(Boolean) } : {}) }}}),
        } as DetailerPlanJob];
    }) : [];
    return { version: 1, jobs };
};
export const serializeDetailerPlanConfig = (config: DetailerPlanConfig) => JSON.stringify(config);

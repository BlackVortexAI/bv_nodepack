export const DETAILER_UI_NODES = new Set([
    "BV Regional Detailer Mask",
    "BV Regional Detailer Plan",
    "BV Detailer Loop Job Resolver",
    "BV Detector Binding",
    "BV Detector Registry",
    "BV Detailer Loop Detect to SEGS (Impact)",
    "BV Detailer Loop Start",
    "BV Detailer Loop End",
]);

const COMMON_LABELS: Record<string, string> = {
    regional: "regional prompt",
    detailer_plan: "detailer plan",
    job_index: "job index",
    job: "detailer job",
    job_id: "job ID",
    job_name: "job name",
    job_count: "job count",
    detector_id: "detector ID",
    detector_count: "detector count",
    detector_registry: "detector registry",
    detector_query: "detector query",
    detector_labels: "detector labels",
    bbox_detector: "BBOX detector",
    segm_detector: "segmentation detector",
    sam_model: "SAM model",
    has_bbox: "has BBOX",
    has_segmentation: "has segmentation",
    has_sam: "has SAM",
    basic_pipe: "basic pipe",
    positive: "positive conditioning",
    negative: "negative conditioning",
    positive_text: "positive text",
    negative_text: "negative text",
    positive_weighted_text: "positive weighted text",
    negative_weighted_text: "negative weighted text",
    global_influence: "global influence",
    background_influence: "background influence",
    primary_region_influence: "primary region influence",
    context_regions_json: "context regions",
    roi_padding: "ROI padding",
    roi_x: "ROI x",
    roi_y: "ROI y",
    roi_width: "ROI width",
    roi_height: "ROI height",
    crop_factor: "crop factor",
    drop_size: "drop size",
    effective_mask: "effective mask",
    flow_to_loop_end: "flow to loop end",
    last_job_index: "last job index",
    final_image: "final image",
    current_image: "current image",
    processed_image: "processed image",
};

const NODE_LABELS: Record<string, Record<string, string>> = {
    "BV Regional Detailer Mask": { image: "source image", mask: "region mask", summary: "detailer summary" },
    "BV Regional Detailer Plan": { plan_summary: "plan summary" },
    "BV Detailer Loop Detect to SEGS (Impact)": { segs: "SEGS" },
};

export const detailerUiLabel = (nodeName: string, name: string): string =>
    NODE_LABELS[nodeName]?.[name]
    ?? COMMON_LABELS[name]
    ?? name.split("_").join(" ");

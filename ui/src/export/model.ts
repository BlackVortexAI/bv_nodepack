export type ExportBackground = "transparent" | "bv-grid" | "comfyui";
export type ExportScale = 1 | 2 | 3;
export type GraphExportScope = "graph" | "selection";

export type ExportRect = { left:number; top:number; right:number; bottom:number; width:number; height:number };
export type ExportOptions = {
    source?: GraphExportScope | `ui:${string}`;
    background?: ExportBackground;
    scale?: ExportScale;
    padding?: number;
    embedWorkflow?: boolean;
    filename?: string;
};

export type ExportResult = { blob:Blob; filename:string; width:number; height:number };

const finite=(value:unknown,fallback:number)=>Number.isFinite(Number(value))?Number(value):fallback;
export const normalizeExportOptions=(value:ExportOptions={}):Required<Omit<ExportOptions,"filename">>&Pick<ExportOptions,"filename">=>({
    source:value.source??"graph",
    background:value.background??"transparent",
    scale:([1,2,3] as number[]).includes(finite(value.scale,2))?finite(value.scale,2) as ExportScale:2,
    padding:Math.max(0,Math.min(256,Math.round(finite(value.padding,32)))),
    embedWorkflow:value.embedWorkflow!==false,
    filename:value.filename,
});

export const rectFromItems=(items:Array<{left:number;top:number;right:number;bottom:number}>,padding=0):ExportRect|null=>{
    if(!items.length)return null;
    const left=Math.min(...items.map(item=>item.left))-padding,top=Math.min(...items.map(item=>item.top))-padding;
    const right=Math.max(...items.map(item=>item.right))+padding,bottom=Math.max(...items.map(item=>item.bottom))+padding;
    return {left,top,right,bottom,width:right-left,height:bottom-top};
};

export const safeFilename=(value:string,fallback="workflow")=>{
    const normalized=value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"").replace(/-+/g,"-");
    return normalized||fallback;
};

export const suggestedFilename=(workflowName:string,source:string,subgraphName?:string)=>{
    const base=safeFilename(workflowName.replace(/\.json$/i,""));
    if(source.startsWith("ui:"))return `${base}--${safeFilename(source.slice(3),"bv-ui")}.png`;
    if(subgraphName)return `${base}--${safeFilename(subgraphName,"subgraph")}--graph.png`;
    return `${base}--${source==="selection"?"selection":"graph"}.png`;
};

export const assertCanvasSize=(width:number,height:number,maxEdge=16384,maxPixels=120_000_000)=>{
    if(width<1||height<1)throw new Error("The export source has no visible bounds.");
    if(width>maxEdge||height>maxEdge||width*height>maxPixels)throw new Error(`Export size ${width} × ${height}px exceeds the safe canvas limit. Reduce scale, padding, or scope.`);
};

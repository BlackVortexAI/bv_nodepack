import { installM0CanvasVisibility } from "../regional/m0VisualProjection";
import { assertCanvasSize, normalizeExportOptions, rectFromItems, type ExportOptions, type ExportRect, type ExportResult } from "./model";
import { embedWorkflow } from "./pngMetadata";

type GraphSubject={graph:any;rootGraph:any;uiCanvas:any;nodes:any[];graphItems:any[];groups:any[];selectedNodes:Set<any>;selectedGroups:Set<any>;isSubgraph:boolean;subgraphName?:string};

const itemRect=(item:any):ExportRect|null=>{
    const bounds=typeof item?.getBounding==="function"?item.getBounding():item?.bounding??item?.boundingRect;
    const pos=item?.pos??item?._pos,size=item?.size??item?._size;
    const source=bounds?.length>=4?bounds:pos?.length>=2&&size?.length>=2?[pos[0],pos[1],size[0],size[1]]:null;
    if(!source||source.some((value:unknown)=>!Number.isFinite(Number(value))))return null;
    const left=Number(source[0]),top=Number(source[1]),right=left+Number(source[2]),bottom=top+Number(source[3]);
    return {left,top,right,bottom,width:right-left,height:bottom-top};
};

export function resolveGraphSubject(app:any):GraphSubject{
    const uiCanvas=app?.canvas,rootGraph=app?.graph??uiCanvas?.graph,graph=uiCanvas?.getCurrentGraph?.()??uiCanvas?.graph??rootGraph;
    if(!uiCanvas||!graph||!rootGraph)throw new Error("The active ComfyUI graph is not available.");
    const nodes=[...(graph._nodes??graph.nodes??[])],groups=[...(graph._groups??graph.groups??[])],selection=new Set<any>(uiCanvas.selectedItems??Object.values(uiCanvas.selected_nodes??{})),isSubgraph=graph!==rootGraph;
    const graphItems=isSubgraph?[...nodes,graph.inputNode,graph.outputNode].filter(Boolean):nodes;
    return {graph,rootGraph,uiCanvas,nodes,graphItems,groups,selectedNodes:new Set(nodes.filter(node=>selection.has(node))),selectedGroups:new Set(groups.filter(group=>selection.has(group))),isSubgraph,subgraphName:graph.name??graph.title};
}

export function graphExportBounds(subject:GraphSubject,scope:"graph"|"selection",padding:number):ExportRect{
    const nodes=scope==="selection"?[...subject.selectedNodes]:subject.graphItems,groups=scope==="selection"?[...subject.selectedGroups]:subject.groups;
    if(scope==="selection"&&!nodes.length&&!groups.length)throw new Error("Selection export requires at least one selected node or group.");
    const rects=[...nodes,...groups].map(itemRect).filter((item):item is ExportRect=>!!item),bounds=rectFromItems(rects,padding);
    if(!bounds)throw new Error("The export source has no visible nodes or groups.");
    return bounds;
}

const copyRenderSettings=(source:any,target:any)=>{
    const keys=["link_color","link_shadow_color","link_brightness","default_link_color","link_type","render_connections_border","render_connections_shadows","render_curved_connections","use_slot_types_default_colors","use_slot_types_color","NODE_WIDGET_COLOR","NODE_TEXT_COLOR","NODE_DEFAULT_COLOR","NODE_TITLE_COLOR","NODE_TEXT_SIZE","NODE_SLOT_RGB","grid_size","background_image","show_grid","bgcolor","background_color"];
    for(const key of keys)if(source[key]!==undefined)try{target[key]=source[key]}catch{}
};
const assignRenderSettings=(target:any,values:Record<string,unknown>)=>{for(const [key,value] of Object.entries(values))try{target[key]=value}catch{}};

const setArea=(target:any,values:number[])=>target&&typeof target.set==="function"?(target.set(values),target):new Float32Array(values);
const configure=(canvas:any,bounds:ExportRect,width:number,height:number,scale:number)=>{
    canvas.ds.scale=scale;canvas.ds.offset=[-bounds.left,-bounds.top];
    canvas.visible_area=setArea(canvas.visible_area,[bounds.left,bounds.top,bounds.width,bounds.height]);
    canvas.last_drawn_area=setArea(canvas.last_drawn_area,[bounds.left,bounds.top,bounds.width,bounds.height]);
    canvas.viewport=setArea(canvas.viewport,[0,0,width,height]);
    canvas.dirty_canvas=true;canvas.dirty_bg=true;
};

const canvasBlob=(canvas:HTMLCanvasElement)=>new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error("Browser failed to encode the PNG.")),"image/png"));

const visiblePreviewImages=(nodes:any[])=>nodes.flatMap(node=>Array.isArray(node?.imgs)?node.imgs:[]).filter((image:any)=>image instanceof HTMLImageElement&&Boolean(image.currentSrc||image.src));
export async function awaitPreviewImages(nodes:any[]){
    const failures:string[]=[];
    await Promise.all(visiblePreviewImages(nodes).map(async(image:HTMLImageElement)=>{try{if(!image.complete)await new Promise<void>((resolve,reject)=>{const timeout=window.setTimeout(()=>reject(new Error("image load timed out")),8000),done=(callback:()=>void)=>{window.clearTimeout(timeout);callback()};image.addEventListener("load",()=>done(resolve),{once:true});image.addEventListener("error",()=>done(()=>reject(new Error("load failed"))),{once:true});});await image.decode?.();}catch{failures.push(image.currentSrc||image.src);}}));
    if(failures.length)throw new Error(`${failures.length} visible node preview image${failures.length===1?"":"s"} could not be decoded.`);
}

const drawBvGrid=(ctx:CanvasRenderingContext2D,width:number,height:number,scale:number)=>{
    ctx.fillStyle="#0f1217";ctx.fillRect(0,0,width,height);ctx.strokeStyle="rgba(35,48,68,.333)";ctx.lineWidth=scale;
    const step=28*scale,half=ctx.lineWidth/2;ctx.beginPath();
    for(let x=half;x<=width;x+=step){ctx.moveTo(x,0);ctx.lineTo(x,height)}
    for(let y=half;y<=height;y+=step){ctx.moveTo(0,y);ctx.lineTo(width,y)}ctx.stroke();
};

const installSelectionFilter=(canvas:any,subject:GraphSubject,scope:string)=>{
    if(scope!=="selection")return()=>{};
    const nodes=subject.selectedNodes,groups=subject.selectedGroups,renderLink=canvas.renderLink,drawNode=canvas.drawNode,drawGroups=canvas.drawGroups;
    canvas.drawNode=function(node:any,...args:any[]){if(nodes.has(node))return drawNode.call(this,node,...args)};
    canvas.renderLink=function(...args:any[]){const link=args[3],origin=this.graph?.getNodeById?.(link?.origin_id),target=this.graph?.getNodeById?.(link?.target_id);if(nodes.has(origin)&&nodes.has(target))return renderLink.apply(this,args)};
    if(typeof drawGroups==="function")canvas.drawGroups=function(...args:any[]){const graph=this.graph,original=graph?._groups;if(graph&&Array.isArray(original))graph._groups=original.filter((group:any)=>groups.has(group));try{return drawGroups.apply(this,args)}finally{if(graph)graph._groups=original}};
    return()=>{canvas.drawNode=drawNode;canvas.renderLink=renderLink;if(drawGroups)canvas.drawGroups=drawGroups};
};

const suppressTransientState=(canvas:any)=>{
    const selectedItems=canvas.selectedItems,selectedNodes=canvas.selected_nodes,highlight=canvas.highlighted_links,over=canvas.node_over;
    try{canvas.selectedItems=new Set();canvas.selected_nodes={};canvas.highlighted_links={};canvas.node_over=null;}catch{}
    return()=>{try{canvas.selectedItems=selectedItems;canvas.selected_nodes=selectedNodes;canvas.highlighted_links=highlight;canvas.node_over=over;}catch{}};
};

export const createOffscreenGraphCanvas=(CanvasCtor:any,canvas:HTMLCanvasElement,graph:any,initialGraph:any=graph)=>{
    const offscreen=new CanvasCtor(canvas,initialGraph);
    try{
        offscreen.stopRendering?.();
        if(offscreen.graph!==graph){if(typeof offscreen.setGraph==="function")offscreen.setGraph(graph);else graph?.attachCanvas?.(offscreen)}
        return offscreen;
    }catch(error){
        try{graph?.detachCanvas?.(offscreen)}catch{}
        try{if(initialGraph!==graph)initialGraph?.detachCanvas?.(offscreen)}catch{}
        try{offscreen.stopRendering?.();offscreen.setCanvas?.(null);offscreen.unbind_events?.()}catch{}
        throw error;
    }
};

export const disposeOffscreenGraphCanvas=(offscreen:any)=>{
    const graph=offscreen?.graph;
    try{offscreen.stopRendering?.()}catch{}
    try{if(typeof offscreen.setGraph==="function")offscreen.setGraph(null);else graph?.detachCanvas?.(offscreen)}catch{}
    try{if(offscreen?.graph===graph)graph?.detachCanvas?.(offscreen)}catch{}
    try{offscreen.setCanvas?.(null);offscreen.unbind_events?.()}catch{}
};

export async function captureGraph(app:any,raw:ExportOptions={}):Promise<ExportResult>{
    const options=normalizeExportOptions(raw),scope=options.source==="selection"?"selection":"graph",subject=resolveGraphSubject(app),bounds=graphExportBounds(subject,scope,options.padding),width=Math.ceil(bounds.width*options.scale),height=Math.ceil(bounds.height*options.scale);
    assertCanvasSize(width,height);await awaitPreviewImages(scope==="selection"?[...subject.selectedNodes]:subject.nodes);
    const foreground=document.createElement("canvas");foreground.width=width;foreground.height=height;
    const CanvasCtor=subject.uiCanvas.constructor??(window as any).LGraphCanvas??(window as any).LiteGraph?.LGraphCanvas;
    if(!CanvasCtor)throw new Error("ComfyUI LiteGraph canvas constructor is unavailable.");
    const offscreen=createOffscreenGraphCanvas(CanvasCtor,foreground,subject.graph,subject.rootGraph);let restoreFilter=()=>{},restoreTransient=()=>{};
    try{
        offscreen.canvas=foreground;offscreen.ctx=foreground.getContext("2d");copyRenderSettings(subject.uiCanvas,offscreen);
        offscreen.resize?.(width,height);foreground.width=width;foreground.height=height;offscreen.canvas=foreground;offscreen.ctx=foreground.getContext("2d");
        if(!offscreen.bgcanvas)offscreen.bgcanvas=document.createElement("canvas");offscreen.bgcanvas.width=width;offscreen.bgcanvas.height=height;offscreen.bgctx=offscreen.bgcanvas.getContext("2d");
        configure(offscreen,bounds,width,height,options.scale);assignRenderSettings(offscreen,{high_quality:true,low_quality:false,render_shadows:true,render_canvas_border:false,render_canvas_info:false,show_info:false,__bvExportTimeSeconds:.55});
        if(options.background==="comfyui")assignRenderSettings(offscreen,{render_background:true,clear_background:true,always_render_background:true});else assignRenderSettings(offscreen,{render_background:true,clear_background:true,always_render_background:true,show_grid:false,background_image:null,bgcolor:"rgba(0,0,0,0)",background_color:"rgba(0,0,0,0)",clear_background_color:"rgba(0,0,0,0)"});
        installM0CanvasVisibility(offscreen);restoreFilter=installSelectionFilter(offscreen,subject,scope);restoreTransient=suppressTransientState(offscreen);
        offscreen.draw(true,true);await new Promise(resolve=>requestAnimationFrame(resolve));configure(offscreen,bounds,width,height,options.scale);offscreen.draw(true,true);
        const output=document.createElement("canvas");output.width=width;output.height=height;const ctx=output.getContext("2d");if(!ctx)throw new Error("PNG composition context is unavailable.");
        if(options.background==="bv-grid")drawBvGrid(ctx,width,height,options.scale);ctx.drawImage(offscreen.bgcanvas,0,0);ctx.drawImage(foreground,0,0);
        let blob=await canvasBlob(output);if(options.embedWorkflow)blob=await embedWorkflow(blob,JSON.stringify(subject.rootGraph.serialize()));
        const workflowName=String(app?.workflowManager?.activeWorkflow?.filename??app?.workflowManager?.activeWorkflow?.name??"workflow");
        const {suggestedFilename}=await import("./model");return {blob,filename:options.filename??suggestedFilename(workflowName,scope,subject.isSubgraph?subject.subgraphName:undefined),width,height};
    }finally{restoreTransient();restoreFilter();disposeOffscreenGraphCanvas(offscreen)}
}

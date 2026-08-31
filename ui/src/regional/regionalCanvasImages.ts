export const REGIONAL_CANVAS_IMAGES_SCHEMA="bv.regional.canvas-images";
export const REGIONAL_CANVAS_IMAGES_VERSION=1;
export const LAST_SENT_IMAGE_SELECTION="last-sent-image";

export type RegionalCanvasSourceKind="regional-image-send"|"regional-image-save"|"regional-prompt-canvas";
export type RegionalCanvasImageDescriptor={index:number;filename:string;subfolder:string;type:string};
export type RegionalCanvasImagePublication={
    schema:typeof REGIONAL_CANVAS_IMAGES_SCHEMA;
    version:typeof REGIONAL_CANVAS_IMAGES_VERSION;
    document_id:string;
    source:{node_id:string;kind:RegionalCanvasSourceKind};
    batch_id:string;
    images:RegionalCanvasImageDescriptor[];
};
export type RegionalCanvasImageItem=RegionalCanvasImageDescriptor&{
    id:string;documentId:string;sourceId:string;sourceKind:RegionalCanvasSourceKind;batchId:string;sequence:number;
};
type SourceBatch={documentId:string;sourceId:string;sourceKind:RegionalCanvasSourceKind;batchId:string;sequence:number;images:RegionalCanvasImageItem[]};
type WorkflowCatalog={sequence:number;sources:Map<string,SourceBatch>};
export type RegionalCanvasImageCatalog={scopes:Map<unknown,WorkflowCatalog>};

const kinds=new Set<RegionalCanvasSourceKind>(["regional-image-send","regional-image-save","regional-prompt-canvas"]);
const clean=(value:unknown)=>typeof value==="string"?value.trim():"";
const integer=(value:unknown)=>typeof value==="number"&&Number.isInteger(value)&&value>=0?value:null;
export const regionalCanvasSourceKey=(sourceId:string,sourceKind:RegionalCanvasSourceKind)=>JSON.stringify([sourceKind,sourceId]);
export const regionalCanvasImageId=(sourceId:string,sourceKind:RegionalCanvasSourceKind,index:number)=>JSON.stringify([sourceKind,sourceId,index]);
export const emptyRegionalCanvasImageCatalog=():RegionalCanvasImageCatalog=>({scopes:new Map()});
export function regionalCanvasSelectionsForScope(selections:WeakMap<object,Map<string,string>>,scope:object){let current=selections.get(scope);if(!current){current=new Map();selections.set(scope,current)}return current}
export const regionalCanvasSelectionForDocument=(selections:ReadonlyMap<string,string>,documentId:string)=>selections.get(documentId)??LAST_SENT_IMAGE_SELECTION;
export function rememberRegionalCanvasSelection(selections:Map<string,string>,documentId:string,selection:string){selections.set(documentId,selection);return selection}

export function parseRegionalCanvasImagePublication(value:unknown):RegionalCanvasImagePublication|null{
    if(!value||typeof value!=="object")return null;
    const input=value as any,source=input.source,documentId=clean(input.document_id),nodeId=clean(source?.node_id),kind=clean(source?.kind) as RegionalCanvasSourceKind,batchId=clean(input.batch_id);
    if(input.schema!==REGIONAL_CANVAS_IMAGES_SCHEMA||input.version!==REGIONAL_CANVAS_IMAGES_VERSION||!documentId||!nodeId||!kinds.has(kind)||!batchId||!Array.isArray(input.images))return null;
    const images:RegionalCanvasImageDescriptor[]=[];
    for(const raw of input.images){const index=integer(raw?.index),filename=clean(raw?.filename),type=clean(raw?.type);if(index===null||!filename||!type)return null;images.push({index,filename,type,subfolder:clean(raw?.subfolder)})}
    if(new Set(images.map(image=>image.index)).size!==images.length)return null;
    return{schema:REGIONAL_CANVAS_IMAGES_SCHEMA,version:REGIONAL_CANVAS_IMAGES_VERSION,document_id:documentId,source:{node_id:nodeId,kind},batch_id:batchId,images};
}

export function ingestRegionalCanvasImagePublication(catalog:RegionalCanvasImageCatalog,scope:unknown,value:unknown,eventNodeId?:unknown):RegionalCanvasImageCatalog{
    const publication=parseRegionalCanvasImagePublication(value),executedNode=clean(eventNodeId);
    if(!publication||(executedNode&&publication.source.node_id!==executedNode))return catalog;
    const current=catalog.scopes.get(scope)??{sequence:0,sources:new Map()},sourceKey=regionalCanvasSourceKey(publication.source.node_id,publication.source.kind);
    const sequence=current.sequence+1;
    const images=publication.images.map(image=>({...image,id:regionalCanvasImageId(publication.source.node_id,publication.source.kind,image.index),documentId:publication.document_id,sourceId:publication.source.node_id,sourceKind:publication.source.kind,batchId:publication.batch_id,sequence}));
    const sources=new Map(current.sources);sources.set(sourceKey,{documentId:publication.document_id,sourceId:publication.source.node_id,sourceKind:publication.source.kind,batchId:publication.batch_id,sequence,images});
    const scopes=new Map(catalog.scopes);scopes.set(scope,{sequence,sources});return{scopes};
}

export function regionalCanvasImagesForDocument(catalog:RegionalCanvasImageCatalog,scope:unknown,documentId:string):RegionalCanvasImageItem[]{
    return[...(catalog.scopes.get(scope)?.sources.values()??[])].filter(batch=>batch.documentId===documentId).sort((left,right)=>left.sequence-right.sequence).flatMap(batch=>batch.images);
}

export function resolveRegionalCanvasImage(catalog:RegionalCanvasImageCatalog,scope:unknown,documentId:string,selection:string):RegionalCanvasImageItem|null{
    const images=regionalCanvasImagesForDocument(catalog,scope,documentId);
    if(selection===LAST_SENT_IMAGE_SELECTION)return images.length?images[images.length-1]:null;
    return images.find(image=>image.id===selection)??null;
}

export function regionalCanvasImageUrl(image:RegionalCanvasImageItem|null,apiURL:(path:string)=>string):string|undefined{
    if(!image)return undefined;
    const query=new URLSearchParams({filename:image.filename,type:image.type,subfolder:image.subfolder});
    return apiURL(`/view?${query}`);
}

export function pruneRegionalCanvasImageCatalog(catalog:RegionalCanvasImageCatalog,scope:unknown,keep:(sourceId:string,kind:RegionalCanvasSourceKind,documentId:string)=>boolean):RegionalCanvasImageCatalog{
    const current=catalog.scopes.get(scope);if(!current)return catalog;
    const sources=new Map([...current.sources].filter(([,batch])=>keep(batch.sourceId,batch.sourceKind,batch.documentId)));
    if(sources.size===current.sources.size)return catalog;
    const scopes=new Map(catalog.scopes);scopes.set(scope,{...current,sources});return{scopes};
}

export function clearRegionalCanvasImageScope(catalog:RegionalCanvasImageCatalog,scope:unknown):RegionalCanvasImageCatalog{
    if(!catalog.scopes.has(scope))return catalog;const scopes=new Map(catalog.scopes);scopes.delete(scope);return{scopes};
}

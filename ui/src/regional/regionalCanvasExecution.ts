import{parseRegionalCanvasImagePublication,type RegionalCanvasImagePublication,type RegionalCanvasSourceKind}from"./regionalCanvasImages";

type ApiLike={queuePrompt:(...args:any[])=>Promise<any>;addEventListener:(type:string,callback:(event:any)=>void)=>void;removeEventListener:(type:string,callback:(event:any)=>void)=>void};
type ExecutionSubscriber=(event:any,scope:unknown)=>void;
type PendingQueue={scope:unknown};
type Tracker={original:ApiLike["queuePrompt"];wrapped:ApiLike["queuePrompt"];origins:Map<string,unknown>;pending:PendingQueue[];subscribers:Set<ExecutionSubscriber>;listeners:Record<string,(event:any)=>void>};
const trackers=new WeakMap<object,Tracker>();

export function subscribeRegionalCanvasExecutions(api:ApiLike,scopeAtQueue:()=>unknown,subscriber:ExecutionSubscriber){
    let tracker=trackers.get(api as object);
    if(!tracker){
        const origins=new Map<string,unknown>(),pending:PendingQueue[]=[],subscribers=new Set<ExecutionSubscriber>(),original=api.queuePrompt.bind(api);
        const wrapped=async(...args:any[])=>{const token={scope:scopeAtQueue()};pending.push(token);try{const response=await original(...args),promptId=String(response?.prompt_id??"").trim();if(promptId)origins.set(promptId,token.scope);return response}finally{const index=pending.indexOf(token);if(index>=0)pending.splice(index,1)}};
        const start=(event:any)=>{const promptId=String(event?.detail?.prompt_id??"").trim();if(promptId&&!origins.has(promptId)&&pending.length)origins.set(promptId,pending.shift()!.scope)};
        const dispatch=(event:any)=>{const promptId=String(event?.detail?.prompt_id??"").trim(),scope=origins.get(promptId);if(!promptId||scope===undefined)return;for(const callback of subscribers)callback(event,scope)};
        const finish=(event:any)=>{dispatch(event);const promptId=String(event?.detail?.prompt_id??"").trim();if(promptId)origins.delete(promptId)};
        const listeners={execution_start:start,executed:dispatch,execution_cached:dispatch,execution_success:finish,execution_error:finish,execution_interrupted:finish};
        api.queuePrompt=wrapped;for(const[type,listener]of Object.entries(listeners))api.addEventListener(type,listener);
        tracker={original,wrapped,origins,pending,subscribers,listeners};trackers.set(api as object,tracker);
    }
    tracker.subscribers.add(subscriber);
    return()=>{tracker!.subscribers.delete(subscriber)};
}

export function findNodeByExecutionId(root:any,executionId:unknown):any|null{
    const ids=String(executionId??"").split(":").filter(Boolean);if(!ids.length)return null;
    let graph=root,node:any=null;
    for(let index=0;index<ids.length;index++){
        node=(graph?._nodes??graph?.nodes??[]).find((candidate:any)=>String(candidate?.id)===ids[index])??null;
        if(!node)return null;
        if(index<ids.length-1){graph=node.subgraph??(()=>{try{return node.getSubgraph?.()}catch{return null}})();if(!graph)return null}
    }
    return node;
}

const nodeType=(node:any)=>String(node?.comfyClass??node?.type??"");
const expectedNodeType=(kind:RegionalCanvasSourceKind)=>kind==="regional-image-send"?"BV Regional Image Send":kind==="regional-image-save"?"BV Regional Image Save":"BV Regional Prompt";
const widgetValue=(node:any,name:string)=>node?.widgets?.find((widget:any)=>widget?.name===name)?.value;
function currentDocumentTarget(node:any,kind:RegionalCanvasSourceKind){
    if(kind!=="regional-prompt-canvas")return String(widgetValue(node,"document_id")??"").trim();
    if(node?.inputs?.find((slot:any)=>slot?.name==="canvas_image")?.link==null)return"";
    try{const raw=widgetValue(node,"regional_json"),document=typeof raw==="string"?JSON.parse(raw):raw;return String(document?.document_id??"").trim()}catch{return""}
}

export function regionalCanvasSourceIsCurrent(root:any,sourceId:string,kind:RegionalCanvasSourceKind,documentId:string){
    const node=findNodeByExecutionId(root,sourceId);
    return nodeType(node)===expectedNodeType(kind)&&currentDocumentTarget(node,kind)===documentId;
}

export function currentRegionalCanvasPublication(root:any,value:unknown,eventNodeId:unknown):RegionalCanvasImagePublication|null{
    const publication=parseRegionalCanvasImagePublication(value),nodeId=String(eventNodeId??"").trim();
    if(!publication||publication.source.node_id!==nodeId)return null;
    return regionalCanvasSourceIsCurrent(root,publication.source.node_id,publication.source.kind,publication.document_id)?publication:null;
}

export function regionalCanvasExecutionOutputs(event:any,nodeOutputs:Record<string,any>|Map<string,any>|undefined){
    const detail=event?.detail??{};
    if(event?.type==="executed")return[{nodeId:detail.node,output:detail.output}];
    if(event?.type!=="execution_cached")return[];
    return(detail.nodes??[]).map((nodeId:unknown)=>({nodeId,output:nodeOutputs instanceof Map?nodeOutputs.get(String(nodeId)):nodeOutputs?.[String(nodeId)]}));
}

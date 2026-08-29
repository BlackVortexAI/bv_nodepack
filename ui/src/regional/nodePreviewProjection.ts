import { LEGACY_DEBUG_VISIBILITY_EVENT, legacyDebugVisible } from "./legacyPorts.js";
import { hasNodePresentationPolicy, resolveNodePresentation } from "./nodePresentation.js";

type PreviewRow = Readonly<{label:string;kind?:"button"|"value"}>;
type PreviewPolicy = Readonly<{
    actions?:readonly string[];
    rows?:readonly PreviewRow[];
    hideWidgets?:readonly string[];
    hidePrefixes?:readonly string[];
}>;
type PreviewDocument = Pick<Document,"createElement">;

const POLICIES:Record<string,PreviewPolicy>={
    "BV Control Center":{actions:["Configure Control Center"],hideWidgets:["bv_control_config_json"]},
    "BV LUT Registry":{actions:["Configure LUT Registry"],hideWidgets:["config_json"]},
    "BV LoRA Registry":{actions:["Open LoRA Registry"],hideWidgets:["config_json"]},
    "BV Regional LUT Plan":{actions:["Connect a BV Regional Prompt"],hideWidgets:["config_json"],hidePrefixes:["resource_provider"]},
    "BV Detector Registry":{actions:["Configure Detector Registry"],hideWidgets:["config_json"],hidePrefixes:["resource_provider"]},
    "BV Regional Detailer Plan":{actions:["Connect a BV Regional Prompt"],hideWidgets:["config_json"],hidePrefixes:["resource_provider"]},
    "BV Seed":{actions:["🎲 Randomize Each Time","🎲 New Fixed Random","♻️ (Use Last Queued Seed)"]},
    "BV Pipe":{hidePrefixes:["v_","out_"]},
    "BV Smart Pipe":{actions:["Configure Smart Pipe"],hideWidgets:["bv_smart_pipe_schema_json","bv_smart_pipe_route_json"],hidePrefixes:["v_","out_"]},
    "BV Named LoRA Stack":{hideWidgets:["stack_id"]},
    "BV LoRA Stack Collector":{hideWidgets:["collector_id"],hidePrefixes:["resource_provider"]},
    "BV Regional Select":{rows:[{label:"region · Select after connecting Regional",kind:"value"}],hideWidgets:["region"]},
    "BV Regional Deconstructor":{rows:[{label:"region · Select after connecting Regional",kind:"value"}],hideWidgets:["region"]},
    "BV Regional Detailer Mask":{rows:[{label:"region · Select after connecting Regional",kind:"value"}],hideWidgets:["region","context_regions_json"]},
    "BV Regional Image Send":{rows:[{label:"target_editor · Select a Regional Prompt",kind:"value"}],hideWidgets:["document_id"]},
    "BV Regional Image Save":{rows:[{label:"target_editor · Select a Regional Prompt",kind:"value"}],hideWidgets:["document_id"]},
    "BV Remote LLM Provider":{actions:["Configure API Key"]},
    "BV Dynamic Combo":{rows:[{label:"value · option_a",kind:"value"}]},
    "BV Prompt AST Debug":{rows:[{label:"AST preview available after execution",kind:"value"}]},
    "BV Text Log Writer":{rows:[{label:"Preview available after execution",kind:"value"}],hideWidgets:["text"]},
    "BV Subgraph Divider":{rows:[{label:"Divider",kind:"value"}],hideWidgets:["thickness","padding","alpha","_"]},
    "BV Subgraph Heading":{rows:[{label:"Heading",kind:"value"}],hideWidgets:["value","_"]},
    "BV Subgraph Spacer":{rows:[{label:"Spacer",kind:"value"}],hideWidgets:["height","scale","_"]},
};

const LEGACY_LORA_CONSUMERS=["BV Regional Native Conditioning","BV Regional SDXL Attention","BV Regional Z-Image Attention","BV Regional FLUX.2 Klein 9B Attention","BV Regional Krea 2 Attention","BV Regional Anima Conditioning"];
for(const name of LEGACY_LORA_CONSUMERS)POLICIES[name]={hideWidgets:["lora_registry","lora_bindings"]};

export function nodePreviewPolicy(nodeType:string):PreviewPolicy|undefined{
    if(hasNodePresentationPolicy(nodeType))return{actions:resolveNodePresentation(nodeType,{ports:[],widgets:[]},{surface:"ghost",legacyDebug:false}).actions};
    return POLICIES[nodeType];
}

const BUTTON_CLASS="relative inline-flex h-6 w-full items-center justify-center gap-2 whitespace-nowrap rounded-sm border-0 bg-component-node-widget-background p-2 text-xs font-medium text-base-foreground";

type PreviewElement={row:any;direction:string};
export function previewRowName(row:any){
    const label=row?.querySelector?.('[data-testid="widget-layout-field-label"]')??row?.querySelector?.("span");
    return String(label?.textContent??row?.textContent??"").trim().split(/\s+/)[0]??"";
}
function previewRows(preview:any,body:any):PreviewElement[]{
    const result:PreviewElement[]=[],seen=new Map<any,PreviewElement>(),add=(row:any,direction="")=>{if(!row)return;const current=seen.get(row);if(current){if(direction&&!current.direction)current.direction=direction;return}const item={row,direction};seen.set(row,item);result.push(item)};
    for(const row of body.querySelectorAll?.('[data-testid="node-widget"]')??[])add(row);
    for(const row of body.querySelectorAll?.('.lg-slot--input, .lg-slot--output')??[])add(row,row.classList?.contains?.("lg-slot--input")?"input":"output");
    for(const row of preview.querySelectorAll?.('[data-bv-preview-port]')??[])add(row,String(row.dataset?.bvPreviewPort??row.getAttribute?.("data-bv-preview-port")??""));
    const card=preview.closest?.('[data-testid="node-preview-card"]');
    for(const heading of card?.querySelectorAll?.("h4")??[]){const direction=String(heading.textContent??"").trim().toLowerCase();if(direction!=="inputs"&&direction!=="outputs")continue;for(const row of heading.parentElement?.children??[])if(row!==heading)add(row,direction.slice(0,-1));}
    return result;
}
const matchesPolicy=(row:any,policy:PreviewPolicy)=>{const text=String(row.textContent??"").trim();return (policy.hideWidgets??[]).some(name=>text.startsWith(name))||(policy.hidePrefixes??[]).some(prefix=>text.startsWith(prefix))};
export function syncPreviewDetailSections(preview:any){
    const card=preview?.closest?.('[data-testid="node-preview-card"]');
    for(const heading of card?.querySelectorAll?.("h4")??[]){
        const direction=String(heading.textContent??"").trim().toLowerCase();
        if(direction!=="inputs"&&direction!=="outputs")continue;
        const section=heading.parentElement;
        const rows=[...(section?.children??[])].filter(row=>row!==heading);
        const hasVisibleRow=rows.some((row:any)=>!row.hidden&&row.style?.display!=="none");
        if(section){section.hidden=!hasVisibleRow;section.style.display=hasVisibleRow?"":"none";}
    }
}
function projectRows(preview:any,body:any,policy:PreviewPolicy){
    const rows=previewRows(preview,body),candidates=rows.filter(({row})=>matchesPolicy(row,policy));
    const nodeType=String(preview?.getAttribute?.("data-node-id")??preview?.dataset?.nodeId??"").replace(/^preview-/,"");
    if(hasNodePresentationPolicy(nodeType)){
        const ports=rows.filter(item=>item.direction).map(item=>({direction:item.direction as "input"|"output",name:previewRowName(item.row),connected:false}));
        const widgets=rows.filter(item=>!item.direction).map(item=>({name:previewRowName(item.row)}));
        const plan=resolveNodePresentation(nodeType,{ports,widgets},{surface:"ghost",legacyDebug:legacyDebugVisible()});
        let portIndex=0,widgetIndex=0;
        for(const item of rows){
            const projected=item.direction?plan.ports[portIndex++]:plan.widgets[widgetIndex++];
            item.row.hidden=!projected.visible;
            item.row.style.display=projected.visible?"":"none";
        }
        syncPreviewDetailSections(preview);
        return;
    }
    const keep=new Set<any>();
    if(!legacyDebugVisible())for(const direction of["input","output"]){const ports=rows.filter(row=>row.direction===direction);if(ports.length&&ports.every(item=>candidates.includes(item)))keep.add(ports[0].row);}
    for(const {row} of candidates){const hidden=!legacyDebugVisible()&&!keep.has(row);row.hidden=hidden;row.style.display=hidden?"none":"";}
}

export function applyNodePreviewProjection(preview:any,ownerDocument:PreviewDocument=document):boolean{
    const nodeType=String(preview?.getAttribute?.("data-node-id")??preview?.dataset?.nodeId??"").replace(/^preview-/,"");
    const policy=nodePreviewPolicy(nodeType);
    if(!policy)return false;
    const body=preview.querySelector?.(`[data-testid="node-body-preview-${nodeType}"]`);
    if(!body)return false;
    projectRows(preview,body,policy);
    if(preview?.dataset?.bvPreviewProjected===nodeType)return true;
    const projectedRows=[...(policy.rows??[]),...(policy.actions??[]).map(label=>({label,kind:"button" as const}))];
    if(!projectedRows.length){preview.dataset.bvPreviewProjected=nodeType;return true}
    const actions=ownerDocument.createElement("div");
    actions.dataset.bvPreviewActions=nodeType;
    actions.className="lg-node-widgets grid grid-cols-[min-content_minmax(80px,min-content)_minmax(125px,1fr)] gap-y-1 pointer-events-none";
    for(const projected of projectedRows){
        const row=ownerDocument.createElement("div");
        row.className="lg-node-widget group col-span-full grid grid-cols-subgrid items-stretch pr-3";
        const slot=ownerDocument.createElement("div");
        slot.className="z-10 flex w-3 items-stretch";
        const content=ownerDocument.createElement("div");
        content.className="col-span-2 flex flex-col gap-1";
        const widget=ownerDocument.createElement("div");
        widget.className=projected.kind==="button"?BUTTON_CLASS:`${BUTTON_CLASS} justify-between font-normal`;
        widget.setAttribute("aria-hidden","true");
        widget.textContent=projected.label;
        content.append(widget);
        row.append(slot,content);
        actions.append(row);
    }
    body.append(actions);
    preview.dataset.bvPreviewProjected=nodeType;
    return true;
}

export function previewTargetsForMutationRoot(root:{closest?:(selector:string)=>any}){
    const direct=root.closest?.('[data-node-id^="preview-"]');
    const card=root.closest?.('[data-testid="node-preview-card"]');
    const fromCard=card?.querySelector?.('[data-node-id^="preview-"]');
    return [...new Set([direct,fromCard].filter(Boolean))];
}

function projectTree(root:ParentNode,ownerDocument:PreviewDocument){
    if(root instanceof HTMLElement){
        const targets=previewTargetsForMutationRoot(root);
        for(const preview of targets)applyNodePreviewProjection(preview,ownerDocument);
    }
    if(root instanceof HTMLElement&&root.matches('[data-node-id^="preview-"]'))applyNodePreviewProjection(root,ownerDocument);
    root.querySelectorAll?.<HTMLElement>('[data-node-id^="preview-"]').forEach(preview=>applyNodePreviewProjection(preview,ownerDocument));
}

let observer:MutationObserver|undefined;
export function installNodePreviewProjection(ownerDocument:Document=document){
    if(observer||!ownerDocument.body)return;
    projectTree(ownerDocument.body,ownerDocument);
    observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(node=>{
        if(node instanceof HTMLElement)projectTree(node,ownerDocument);
    })));
    observer.observe(ownerDocument.body,{childList:true,subtree:true});
    window.addEventListener(LEGACY_DEBUG_VISIBILITY_EVENT,()=>projectTree(ownerDocument.body,ownerDocument));
}

// PROTOTYPE — THROW AWAY. Tests code-defined titlebar anchor geometry without touching ComfyUI graph state.

export type CanaryVariant="A"|"B"|"C";
export type CanaryDirection="input"|"output";
export type Point=Readonly<{x:number;y:number}>;
export type Rect=Readonly<{x:number;y:number;width:number;height:number}>;

export type CanaryNode=Readonly<{
    id:number;
    type:"BV LUT Registry"|"BV Regional LUT Plan";
    x:number;
    y:number;
    width:number;
    height:number;
    titleHeight:number;
}>;

type CanarySlotBase=Readonly<{
    name:"resource_provider"|"resource_provider_1";
    type:"BV_RUNTIME_RESOURCE_PROVIDER";
    direction:CanaryDirection;
    index:number;
}>;

export type CanaryOutputSlot=CanarySlotBase&Readonly<{
    direction:"output";
    links:readonly number[]|null;
}>;

export type CanaryInputSlot=CanarySlotBase&Readonly<{
    direction:"input";
    link:number|null;
}>;

export type CanarySlot=CanaryOutputSlot|CanaryInputSlot;

export type CanaryLink=Readonly<{
    id:number;
    type:"BV_RUNTIME_RESOURCE_PROVIDER";
    origin_id:number;
    origin_slot:number;
    target_id:number;
    target_slot:number;
}>;

export type CanaryFixture=Readonly<{
    registry:CanaryNode;
    registryOutput:CanaryOutputSlot;
    consumer:CanaryNode;
    consumerInput:CanaryInputSlot;
    link:CanaryLink|null;
}>;

export type CanaryProviderPosition="first"|"middle"|"last";
export type CanaryCanonicalInput=Readonly<{name:string;type:string;link:number|null;titlebarProvider?:boolean}>;
export type CanaryCanonicalOutput=Readonly<{name:string;type:string;links:readonly number[]|null;titlebarProvider?:boolean}>;
export type CanaryCanonicalWidget=Readonly<{name:string;type:string;value:string}>;
export type CanarySlotOrderFixture=Readonly<{
    inputs:readonly CanaryCanonicalInput[];
    outputs:readonly CanaryCanonicalOutput[];
    widgets:readonly CanaryCanonicalWidget[];
    links:readonly CanaryLink[];
}>;

type CanaryBodyRow<TSlot>=Readonly<{slot:TSlot;canonicalSlotIndex:number;visualRowIndex:number}>;
type CanaryTitlebarSlot<TSlot>=Readonly<{slot:TSlot;canonicalSlotIndex:number;titlebarVisualOrdinal:number}>;
type CanaryProjectedSlot<TSlot>=Readonly<{slot:TSlot;canonicalSlotIndex:number;placement:"body"|"title";visualOrdinal:number|null}>;

function projectCanonicalDirection<TSlot extends{titlebarProvider?:boolean}>(slots:readonly TSlot[]){
    let nextVisualOrdinal=0,nextTitlebarVisualOrdinal=0;
    const projectedSlots:CanaryProjectedSlot<TSlot>[]=slots.map((slot,canonicalSlotIndex)=>slot.titlebarProvider
        ?{slot,canonicalSlotIndex,placement:"title",visualOrdinal:null}
        :{slot,canonicalSlotIndex,placement:"body",visualOrdinal:nextVisualOrdinal++});
    const bodyRows:CanaryBodyRow<TSlot>[]=projectedSlots.filter(item=>item.placement==="body").map(item=>({slot:item.slot,canonicalSlotIndex:item.canonicalSlotIndex,visualRowIndex:item.visualOrdinal!}));
    const titlebarSlots:CanaryTitlebarSlot<TSlot>[]=projectedSlots.filter(item=>item.placement==="title").map(item=>({slot:item.slot,canonicalSlotIndex:item.canonicalSlotIndex,titlebarVisualOrdinal:nextTitlebarVisualOrdinal++}));
    return{projectedSlots,bodyRows,titlebarSlots,bodyRowCount:bodyRows.length} as const;
}

export function projectCanonicalNodeRows(fixture:CanarySlotOrderFixture){
    const inputs=projectCanonicalDirection(fixture.inputs),outputs=projectCanonicalDirection(fixture.outputs),widgetStartRow=Math.max(inputs.bodyRowCount,outputs.bodyRowCount);
    const widgets=fixture.widgets.map((widget,canonicalWidgetIndex)=>({widget,canonicalWidgetIndex,visualRowIndex:widgetStartRow+canonicalWidgetIndex}));
    return{inputs,outputs,widgets,widgetStartRow} as const;
}

function insertProvider<T>(publicSlots:readonly T[],provider:T,position:CanaryProviderPosition):readonly T[]{
    if(position==="first")return[provider,...publicSlots];
    if(position==="middle")return[publicSlots[0],provider,...publicSlots.slice(1)];
    return[...publicSlots,provider];
}

export function createSlotOrderFixture(direction:CanaryDirection,position:CanaryProviderPosition,linked:boolean):CanarySlotOrderFixture{
    const providerIndex=position==="first"?0:position==="middle"?1:2,linkId=7301;
    const publicInputs:readonly CanaryCanonicalInput[]=[{name:"regional_prompt",type:"BV_REGIONAL",link:null},{name:"mask",type:"MASK",link:null}];
    const publicOutputs:readonly CanaryCanonicalOutput[]=[{name:"lut_count",type:"INT",links:null},{name:"registry_summary",type:"STRING",links:null}];
    const providerInput:CanaryCanonicalInput={name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:linked?linkId:null,titlebarProvider:true};
    const providerOutput:CanaryCanonicalOutput={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:linked?[linkId]:[],titlebarProvider:true};
    const inputs=direction==="input"?insertProvider(publicInputs,providerInput,position):publicInputs;
    const outputs=direction==="output"?insertProvider(publicOutputs,providerOutput,position):publicOutputs;
    const links:CanaryLink[]=linked?[{id:linkId,type:"BV_RUNTIME_RESOURCE_PROVIDER",origin_id:301,origin_slot:direction==="output"?providerIndex:0,target_id:302,target_slot:direction==="input"?providerIndex:0}]:[];
    return{inputs,outputs,widgets:[{name:"config_json",type:"text",value:"{}"}],links};
}

export type CanaryProjection=Readonly<{
    variant:CanaryVariant;
    direction:CanaryDirection;
    canonicalSlotIndex:number;
    localAnchor:Point;
    anchor:Point;
    renderedEndpoint:Point;
    expectedHitbox:Rect;
}>;

export const CANARY_VARIANTS:ReadonlyArray<Readonly<{key:CanaryVariant;name:string;description:string}>>=[
    {key:"A",name:"Title midline",description:"Ports sit on the left and right edges at the visual centre of the titlebar."},
    {key:"B",name:"Body seam",description:"Ports sit where the titlebar meets the node body."},
    {key:"C",name:"Top rail",description:"Ports sit on the upper titlebar edge, furthest away from body rows."},
];

export function createTitlebarProviderPortFixture(linked=true):CanaryFixture{
    const link:CanaryLink|null=linked?{id:9001,type:"BV_RUNTIME_RESOURCE_PROVIDER",origin_id:101,origin_slot:2,target_id:202,target_slot:1}:null;
    return{
        registry:{id:101,type:"BV LUT Registry",x:80,y:180,width:240,height:150,titleHeight:30},
        registryOutput:{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",direction:"output",index:2,links:linked?[9001]:[]},
        consumer:{id:202,type:"BV Regional LUT Plan",x:560,y:145,width:280,height:190,titleHeight:30},
        consumerInput:{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",direction:"input",index:1,link:linked?9001:null},
        link,
    };
}

function variantLocalY(titleHeight:number,variant:CanaryVariant){
    if(variant==="A")return-titleHeight/2;
    if(variant==="B")return 0;
    return-titleHeight;
}

export function projectLocalTitlebarProviderPort(node:Pick<CanaryNode,"width"|"titleHeight">,slot:CanarySlot,variant:CanaryVariant):Point{
    return{x:slot.direction==="input"?0:node.width,y:variantLocalY(node.titleHeight,variant)};
}

export function toWorldPoint(node:Pick<CanaryNode,"x"|"y">,point:Point):Point{
    return{x:node.x+point.x,y:node.y+point.y};
}

export function projectTitlebarProviderPort(node:CanaryNode,slot:CanarySlot,variant:CanaryVariant):CanaryProjection{
    const localAnchor=projectLocalTitlebarProviderPort(node,slot,variant),anchor=toWorldPoint(node,localAnchor);
    const hitSize=Math.min(20,node.titleHeight);
    return{
        variant,
        direction:slot.direction,
        canonicalSlotIndex:slot.index,
        localAnchor,
        anchor,
        renderedEndpoint:{...anchor},
        expectedHitbox:{x:anchor.x-hitSize/2,y:anchor.y-hitSize/2,width:hitSize,height:hitSize},
    };
}

export function createTitlebarProviderPortEvidence(variant:CanaryVariant,fixture=createTitlebarProviderPortFixture()){
    const output=projectTitlebarProviderPort(fixture.registry,fixture.registryOutput,variant);
    const input=projectTitlebarProviderPort(fixture.consumer,fixture.consumerInput,variant);
    return{variant,output,input,link:fixture.link?{...fixture.link}:null,nodeSizes:{registry:[fixture.registry.width,fixture.registry.height],consumer:[fixture.consumer.width,fixture.consumer.height]}} as const;
}

function center(rect:Rect):Point{return{x:rect.x+rect.width/2,y:rect.y+rect.height/2}}
function equalPoint(a:Point,b:Point){return a.x===b.x&&a.y===b.y}

export function verifyTitlebarProviderPortEvidence(evidence:ReturnType<typeof createTitlebarProviderPortEvidence>){
    const projections=[evidence.output,evidence.input];
    return{
        endpointMatchesAnchor:projections.every(item=>equalPoint(item.anchor,item.renderedEndpoint)),
        expectedHitboxCentersAnchor:projections.every(item=>equalPoint(item.anchor,center(item.expectedHitbox))),
        canonicalSlotIndicesPreserved:!evidence.link||(evidence.output.canonicalSlotIndex===evidence.link.origin_slot&&evidence.input.canonicalSlotIndex===evidence.link.target_slot),
    } as const;
}

function svgNode(node:CanaryNode,label:string,anchor:Point,direction:CanaryDirection){
    const titleY=node.y-node.titleHeight;
    const port=`<circle class="hitbox" cx="${anchor.x}" cy="${anchor.y}" r="10"/><circle class="port port-${direction}" cx="${anchor.x}" cy="${anchor.y}" r="6"/>`;
    return`<g><rect class="node-title" x="${node.x}" y="${titleY}" width="${node.width}" height="${node.titleHeight}" rx="10"/><rect class="node-body" x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}"/><text class="node-label" x="${node.x+18}" y="${titleY+20}">${label}</text><rect class="widget" x="${node.x+16}" y="${node.y+34}" width="${node.width-32}" height="28"/><rect class="widget" x="${node.x+16}" y="${node.y+74}" width="${node.width-32}" height="28"/>${port}</g>`;
}

function linkPath(from:Point,to:Point){const span=Math.max(80,(to.x-from.x)*.45);return`M ${from.x} ${from.y} C ${from.x+span} ${from.y}, ${to.x-span} ${to.y}, ${to.x} ${to.y}`}

export function renderTitlebarProviderPortCanary(root:HTMLElement,variant:CanaryVariant){
    const fixture=createTitlebarProviderPortFixture(),evidence=createTitlebarProviderPortEvidence(variant,fixture),verification=verifyTitlebarProviderPortEvidence(evidence),meta=CANARY_VARIANTS.find(item=>item.key===variant)!;
    root.innerHTML=`<main><header><span class="prototype-badge">THROWAWAY PROTOTYPE</span><h1>Titlebar provider-port canary</h1><p><strong>${variant} — ${meta.name}</strong> · ${meta.description}</p></header><svg viewBox="0 75 920 300" role="img" aria-label="Registry and consumer connected through projected titlebar ports"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20"/></pattern></defs><rect class="grid" x="0" y="75" width="920" height="300"/><path class="provider-link" d="${linkPath(evidence.output.anchor,evidence.input.anchor)}"/>${svgNode(fixture.registry,"BV LUT Registry",evidence.output.anchor,"output")}${svgNode(fixture.consumer,"BV Regional LUT Plan",evidence.input.anchor,"input")}</svg><section class="evidence"><h2>Full relevant state</h2><pre>${JSON.stringify({question:"Can code-defined provider anchors leave and enter through node titlebars without reserving body rows?",scope:"Pure geometry only; not native ComfyUI hit-testing, drag, Nodes 2.0, serialization or runtime evidence.",evidence,verification},null,2)}</pre></section></main>`;
}

export function installTitlebarProviderPortCanary(root:HTMLElement){
    const readVariant=()=>{const candidate=new URLSearchParams(location.search).get("variant")?.toUpperCase();return CANARY_VARIANTS.some(item=>item.key===candidate)?candidate as CanaryVariant:"A"};
    let variant=readVariant();
    const render=()=>{
        renderTitlebarProviderPortCanary(root,variant);
        const selected=CANARY_VARIANTS.find(item=>item.key===variant)!;
        const nav=document.createElement("nav");nav.className="switcher";nav.setAttribute("aria-label","Prototype variants");
        nav.innerHTML=`<button type="button" data-step="-1" aria-label="Previous variant">←</button><strong>${selected.key} — ${selected.name}</strong><button type="button" data-step="1" aria-label="Next variant">→</button>`;
        const cycle=(step:number)=>{const index=CANARY_VARIANTS.findIndex(item=>item.key===variant);variant=CANARY_VARIANTS[(index+step+CANARY_VARIANTS.length)%CANARY_VARIANTS.length].key;const url=new URL(location.href);url.searchParams.set("variant",variant);history.replaceState({},"",url);render()};
        nav.querySelectorAll<HTMLButtonElement>("button").forEach(button=>button.addEventListener("click",()=>cycle(Number(button.dataset.step))));
        root.append(nav);
    };
    window.addEventListener("keydown",event=>{if(event.target instanceof HTMLElement&&event.target.matches("input,textarea,[contenteditable=true]"))return;if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();const index=CANARY_VARIANTS.findIndex(item=>item.key===variant),step=event.key==="ArrowRight"?1:-1;variant=CANARY_VARIANTS[(index+step+CANARY_VARIANTS.length)%CANARY_VARIANTS.length].key;const url=new URL(location.href);url.searchParams.set("variant",variant);history.replaceState({},"",url);render()}});
    render();
}

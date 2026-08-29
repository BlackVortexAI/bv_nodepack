export type PresentationSurface="classic"|"ghost"|"nodes2";
export type PresentationRole="public"|"legacy"|"internalState"|"provider"|"dynamicReserve"|"nativeAction";

/**
 * Central contract for every BV node/widget presentation mutation.
 *
 * New UI must use the shared BV UI pack. New code must not hide, resize,
 * replace, reorder or project ComfyUI nodes/widgets directly outside the
 * central presentation modules. The entries below document the pre-existing
 * adapters that still have to touch a ComfyUI-specific lifecycle seam. They
 * are exceptions to be retired or absorbed here, not examples to copy.
 *
 * Full invariants, ownership rules and adapter rationale:
 * docs/design/node-presentation.md
 */
export type PresentationException=Readonly<{
    id:string;
    implementation:readonly string[];
    reason:string;
    centralizationPath:string;
}>;

export const PRESENTATION_EXCEPTIONS:readonly PresentationException[]=[
    {
        id:"react-node-dom-widget-host",
        implementation:["ui/src/regional/reactNodeWidgetHost.tsx"],
        reason:"ComfyUI owns the DOM-widget lifecycle and exposes it through addDOMWidget, whose mount, configure, measurement and removal timing differs from normal BV managed windows.",
        centralizationPath:"All BV inline React node widgets use this host; feature views provide only React content and domain callbacks while lifecycle, DOM ownership and presentation remain centralized here.",
    },
    {
        id:"regional-prompt-bootstrap-measurement",
        implementation:["ui/src/regional/portProjection.ts#installRegionalPromptCreationLayout"],
        reason:"ComfyUI measures the backend definition before the Regional Prompt instance has its projected provider markers and action widgets.",
        centralizationPath:"Keep this lifecycle adapter until the central presentation inventory can run before the first ComfyUI measurement.",
    },
    {
        id:"m0-runtime-resource-projection",
        implementation:["ui/src/regional/m0ResourceSpike.tsx"],
        reason:"The M0 collector and consumers create graph-bound provider slots and DOM pickers dynamically, before the normal policy inventory is complete.",
        centralizationPath:"Move its local widget hiding and slot flags behind central widget/port projection helpers before extending M0.",
    },
    {
        id:"control-center-dynamic-widgets",
        implementation:["ui/src/components/control/bv_control_center.ts"],
        reason:"Control toggles and the conflict-status row are generated from runtime configuration and must be reconciled in a stable order.",
        centralizationPath:"Keep dynamic widget creation local; move all hiding, sizing and ordering primitives into the central manipulation library.",
    },
    {
        id:"subgraph-promoted-widget-proxies",
        implementation:["js/bv_subgraph_ui_projection.js","js/bv_subgraph_nodes2_projection.js","js/bv_subgraph_layout.js"],
        reason:"Promoted Subgraph widgets are ComfyUI-owned proxy objects that are recreated asynchronously and differ between Classic and Nodes 2.0.",
        centralizationPath:"Keep the lifecycle adapter separate, but route shared visibility and sizing decisions through this module and the presentation bridge.",
    },
    {
        id:"dynamic-pipe-slot-structure",
        implementation:["js/bv_pipe_shared.js","js/bv_smart_pipe.js","js/bv_smart_pipe_merge.js"],
        reason:"Pipe nodes add, remove and relabel structural graph slots from their runtime schema; this is domain behavior, not merely visual projection.",
        centralizationPath:"Structural slot ownership remains local; every visual hide, compact or resize operation must use the central presentation bridge.",
    },
    {
        id:"seed-action-projection",
        implementation:["js/bv_seed.js"],
        reason:"Seed actions are semantic controls that also project through promoted Subgraph widgets and therefore require a source/host adapter.",
        centralizationPath:"Keep seed state transitions local and route widget construction, sizing and host projection through shared presentation primitives.",
    },
    {
        id:"execution-result-preview-widgets",
        implementation:["js/bv_prompt_debug.js"],
        reason:"Prompt AST Debug and Text Log Writer expose read-only multiline content populated only by execution callbacks.",
        centralizationPath:"Keep execution data handling local; create and style preview widgets exclusively through the shared BV UI/presentation helpers.",
    },
] as const;

export type PresentationPort=Readonly<{
    direction:"input"|"output";
    name:string;
    connected?:boolean;
    sticky?:boolean;
}>;
export type PresentationWidget=Readonly<{name:string}>;
export type PresentationInventory=Readonly<{
    ports:readonly PresentationPort[];
    widgets:readonly PresentationWidget[];
}>;
export type PresentationContext=Readonly<{
    surface:PresentationSurface;
    legacyDebug:boolean;
}>;

type Matcher=Readonly<{role:PresentationRole;names?:readonly string[];prefixes?:readonly string[];directions?:readonly ("input"|"output")[]}>;
type NodePresentationPolicy=Readonly<{
    ports?:readonly Matcher[];
    widgets?:readonly Matcher[];
    actions?:readonly string[];
}>;

export const REGIONAL_LORA_CONSUMER_NODE_TYPES=[
    "BV Regional Native Conditioning",
    "BV Regional SDXL Attention",
    "BV Regional Z-Image Attention",
    "BV Regional FLUX.2 Klein 9B Attention",
    "BV Regional Krea 2 Attention",
    "BV Regional Anima Conditioning",
] as const;

const REGIONAL_LORA_CONSUMER_POLICY:NodePresentationPolicy={
    ports:[{role:"legacy",names:["lora_registry","lora_bindings"]}],
};

const POLICIES:Readonly<Record<string,NodePresentationPolicy>>={
    ...Object.fromEntries(REGIONAL_LORA_CONSUMER_NODE_TYPES.map(nodeType=>[nodeType,REGIONAL_LORA_CONSUMER_POLICY])),
    "BV Control Center":{
        widgets:[{role:"internalState",names:["bv_control_config_json"]}],
        actions:["Configure Control Center"],
    },
    "BV Regional Prompt":{
        ports:[
            {role:"legacy",names:["lora_bindings"]},
            {role:"provider",names:["resource_provider"],prefixes:["resource_provider_","detailer_resource_provider_","lut_resource_provider_"]},
        ],
        widgets:[
            {role:"internalState",names:["regional_json","lora_bindings_json","lora_v3_config_json","detailer_v3_config_json","lut_v3_config_json"]},
        ],
        actions:["Open Regional Editor","Quick Edit Prompts"],
    },
    "BV Regional LoRA":{
        ports:[
            {role:"provider",prefixes:["resource_provider_"]},
        ],
        widgets:[
            {role:"internalState",names:["operation","config_json"]},
        ],
        actions:["Open LoRA Editor"],
    },
    "BV Regional Detailer Plan":{
        ports:[
            {role:"legacy",names:["detector_registry"]},
            {role:"provider",names:["resource_provider"],prefixes:["resource_provider_"]},
        ],
        widgets:[{role:"internalState",names:["config_json"]}],
        actions:["Connect a BV Regional Prompt"],
    },
    "BV Regional LUT Plan":{
        ports:[{role:"provider",names:["resource_provider"],prefixes:["resource_provider_"]}],
        widgets:[{role:"internalState",names:["config_json"]}],
        actions:["Connect a BV Regional Prompt"],
    },
    "BV LUT Loop Start":{
        ports:[{role:"provider",names:["resource_provider"],prefixes:["resource_provider_"]}],
    },
    "BV LUT Registry":{
        ports:[{role:"provider",names:["resource_provider"]}],
        widgets:[{role:"internalState",names:["config_json"]}],
        actions:["Configure LUT Registry"],
    },
    "BV LoRA Registry":{
        ports:[{role:"provider",names:["resource_provider"]}],
        widgets:[{role:"internalState",names:["config_json"]},{role:"nativeAction",names:["open_lora_registry"]}],
        actions:["Open LoRA Registry"],
    },
    "BV LoRA Stack Collector":{
        ports:[{role:"provider",names:["resource_provider"],directions:["output"]}],
        widgets:[{role:"internalState",names:["collector_id"]}],
    },
    "BV Named LoRA Stack":{
        widgets:[{role:"internalState",names:["stack_id"]}],
    },
    "BV Detector Registry":{
        ports:[
            {role:"dynamicReserve",prefixes:["external_detector_"]},
            {role:"provider",names:["resource_provider"]},
        ],
        widgets:[{role:"internalState",names:["config_json"]}],
        actions:["Configure Detector Registry"],
    },
    "BV Smart Pipe Merge":{
        ports:[
            {role:"dynamicReserve",prefixes:["pipe_","out_"]},
        ],
        widgets:[
            {role:"internalState",names:["bv_smart_pipe_merge_json"]},
        ],
        actions:["Configure Pipe Merge"],
    },
    "BV Smart Pipe":{
        ports:[
            {role:"dynamicReserve",prefixes:["v_","out_"]},
        ],
        widgets:[
            {role:"internalState",names:["bv_smart_pipe_schema_json","bv_smart_pipe_route_json"]},
        ],
        actions:["Configure Smart Pipe"],
    },
    "BV Pipe":{
        ports:[
            {role:"dynamicReserve",prefixes:["v_","out_"]},
        ],
    },
};

export const hasNodePresentationPolicy=(nodeType:string)=>Object.prototype.hasOwnProperty.call(POLICIES,nodeType);

const matches=(item:PresentationPort|PresentationWidget,matcher:Matcher)=>
    (!matcher.directions||("direction" in item&&matcher.directions.includes(item.direction)))&&
    (matcher.names?.includes(item.name)||(matcher.prefixes??[]).some(prefix=>item.name.startsWith(prefix)));
const roleOf=(item:PresentationPort|PresentationWidget,matchers:readonly Matcher[]|undefined):PresentationRole=>matchers?.find(matcher=>matches(item,matcher))?.role??"public";
const visible=(role:PresentationRole,item:PresentationPort|PresentationWidget,context:PresentationContext)=>{
    if(role==="public")return true;
    if(role==="legacy")return context.legacyDebug||("connected" in item&&item.connected===true);
    if(role==="dynamicReserve")return context.surface!=="ghost";
    if(role==="nativeAction")return context.surface!=="ghost";
    return false;
};

export function resolveNodePresentation(nodeType:string,inventory:PresentationInventory,context:PresentationContext){
    const policy=POLICIES[nodeType]??{};
    const portMatchers=context.surface==="ghost"?[...(policy.ports??[]),...(policy.widgets??[])]:policy.ports;
    return{
        ports:inventory.ports.map(port=>{const role=roleOf(port,portMatchers);return{...port,role,visible:visible(role,port,context)}}),
        widgets:inventory.widgets.map(widget=>{const role=roleOf(widget,policy.widgets);return{...widget,role,visible:visible(role,widget,context)}}),
        actions:[...(policy.actions??[])],
    };
}

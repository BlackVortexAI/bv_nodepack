export type PresentationSurface="classic"|"ghost"|"nodes2";
export type PresentationRole="public"|"legacy"|"internalState"|"provider"|"dynamicReserve";

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

type Matcher=Readonly<{role:PresentationRole;names?:readonly string[];prefixes?:readonly string[]}>;
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
            {role:"provider",names:["resource_provider"],prefixes:["resource_provider_"]},
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
    "BV LoRA Stack Collector":{
        ports:[{role:"provider",names:["resource_provider"]}],
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

const matches=(name:string,matcher:Matcher)=>matcher.names?.includes(name)||(matcher.prefixes??[]).some(prefix=>name.startsWith(prefix));
const roleOf=(name:string,matchers:readonly Matcher[]|undefined):PresentationRole=>matchers?.find(matcher=>matches(name,matcher))?.role??"public";
const visible=(role:PresentationRole,item:PresentationPort|PresentationWidget,context:PresentationContext)=>{
    if(role==="public")return true;
    if(role==="legacy")return context.legacyDebug||("connected" in item&&item.connected===true);
    if(role==="dynamicReserve")return context.surface!=="ghost";
    return false;
};

export function resolveNodePresentation(nodeType:string,inventory:PresentationInventory,context:PresentationContext){
    const policy=POLICIES[nodeType]??{};
    const portMatchers=context.surface==="ghost"?[...(policy.ports??[]),...(policy.widgets??[])]:policy.ports;
    return{
        ports:inventory.ports.map(port=>{const role=roleOf(port.name,portMatchers);return{...port,role,visible:visible(role,port,context)}}),
        widgets:inventory.widgets.map(widget=>{const role=roleOf(widget.name,policy.widgets);return{...widget,role,visible:visible(role,widget,context)}}),
        actions:[...(policy.actions??[])],
    };
}

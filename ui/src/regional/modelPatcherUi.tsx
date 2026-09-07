import {createElement,useEffect,useReducer} from "react";
import {Callout,SelectField,SortableList,UiDensity} from "../ui";
import {parseModelPatcherConfig,type ModelPatcherConfig} from "./modelPatcherConfig";
import {strictLoraRegistryConfig} from "./loraRegistryConfig";
import {workflowRegistries} from "./registryDgFamilies";
import {reconcileRegistryFamily} from "./registryDgReconcile";
import {installRegistryDgLifecycle} from "./registryDgLifecycle";
import {scheduleDgUpgrade} from "./dgRouting";
import {LORA_V3_INVENTORY_CHANGED_EVENT} from "./loraV3Inventory";
import {installReactNodeWidgetHost,refreshReactNodeWidget} from "./reactNodeWidgetHost";

const widget=(node:any)=>node.widgets?.find((item:any)=>item.name==="config_json");
const read=(node:any)=>parseModelPatcherConfig(widget(node)?.value??'{"version":1,"collector_ids":[]}');
export function prepareModelPatcher(node:any){
    reconcileRegistryFamily(node,"basis",read(node).collector_ids.map(id=>({kind:"lora",id})),index=>`base_resource_provider_${index+1}`,20);
}
function PatcherView({node,save}:{node:any;save:(value:ModelPatcherConfig)=>void}){
    const [,refresh]=useReducer(value=>value+1,0);
    useEffect(()=>{const changed=()=>{scheduleDgUpgrade(node,prepareModelPatcher);refresh()};window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,changed);return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,changed)},[node]);
    let config:ModelPatcherConfig;
    try{config=read(node)}catch(error){return <Callout tone="danger" title="Invalid Model Patcher configuration">{String(error)}</Callout>}
    const registries=workflowRegistries(node,"lora").flatMap(source=>{
        const stored=strictLoraRegistryConfig(widget(source)?.value);
        return stored?[{id:stored.registry_id,label:`LoRA Registry · #${source.id}`,stacks:stored.stacks.filter(stack=>stack.role==="basis")}]:[];
    });
    const unique=registries.filter(item=>registries.filter(other=>other.id===item.id).length===1);
    return <UiDensity density="compact"><div className="bv-ui-stack">
        <SelectField label="Add basis Registry" value="" disabled={config.collector_ids.length>=20} options={[{value:"",label:"Choose a Registry…"},...unique.filter(item=>!config.collector_ids.includes(item.id)).map(item=>({value:item.id,label:item.label}))]} onValue={id=>{if(id)save({...config,collector_ids:[...config.collector_ids,id]})}}/>
        <SortableList items={config.collector_ids.map(id=>{const registry=unique.find(item=>item.id===id);return {id,label:registry?.label??"Missing or ambiguous Registry",title:registry?.label??"Missing or ambiguous Registry",description:registry?registry.stacks.map(stack=>`${stack.name}${stack.enabled?"":" (off)"}`).join(", ")||"No basis stacks — passthrough":"Reconnect or remove this selection"}})} onReorder={items=>save({...config,collector_ids:items.map(item=>item.id)})} onRemove={id=>save({...config,collector_ids:config.collector_ids.filter(item=>item!==id)})}/>
        {!config.collector_ids.length&&<span>No basis patches — inputs pass through.</span>}
    </div></UiDensity>;
}
export function installModelPatcherUi(nodeType:any,nodeData:any,graphOwner:(node:any)=>any){
    const prepare=(node:any)=>{node.__bvConcreteGraph=graphOwner(node);prepareModelPatcher(node)};
    installRegistryDgLifecycle(nodeType,prepare);
    const spec={id:"bv-model-patcher",name:"model_patcher_widget",minHeight:84,maxHeight:300,overflow:"auto" as const,render:(node:any)=>createElement(PatcherView,{node,save:(config:ModelPatcherConfig)=>{
        const stored=widget(node);if(!stored)return;
        node.graph?.beforeChange?.();try{stored.value=JSON.stringify(config);stored.callback?.(stored.value);prepare(node)}finally{node.graph?.afterChange?.()}refreshReactNodeWidget(node,nodeData.name,spec);
    }})};
    installReactNodeWidgetHost(nodeType,nodeData.name,spec);
}

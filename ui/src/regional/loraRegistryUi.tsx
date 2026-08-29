import{createElement}from"react";
import{LoraRegistryNodeWidget}from"./LoraRegistryView";
import{bootstrapLoraCatalog}from"./loraCatalogClient";
import{freshenLoraRegistryIdentities,needsFreshLoraRegistryId,parseLoraRegistryConfig,serializeLoraRegistryConfig,shouldPersistNormalizedLoraConfig,strictLoraRegistryConfig}from"./loraRegistryConfig";
import{openLoraCatalogLibraryDialog,openLoraRegistryDialog}from"./loraRegistryDialog";
import{installReactNodeWidgetHost,refreshReactNodeWidget}from"./reactNodeWidgetHost";
import{installLoraRegistryInventorySource,storeLoraRegistryInventory}from"./loraV3Inventory";
import{bindLoraV3Graph,loraV3GraphOf}from"./loraV3Graph";

const SPEC_ID="bv-lora-registry";
const configWidget=(node:any)=>node.widgets?.find((widget:any)=>widget.name==="config_json");
const registries=(node:any)=>{const graph=loraV3GraphOf(node);return((graph?._nodes??graph?.nodes??[]) as any[]).filter(candidate=>(loraV3GraphOf(candidate)??bindLoraV3Graph(candidate,graph))===graph&&String(candidate.type??candidate.comfyClass)==="BV LoRA Registry").map(candidate=>({nodeId:String(candidate.id),registryId:strictLoraRegistryConfig(configWidget(candidate)?.value)?.registry_id??""}))};
export function installLoraRegistryUi(nodeType:any,nodeData:any,api:any,graphOwner:(node:any)=>any=(node:any)=>node?.graph){
    bootstrapLoraCatalog(api);
    installLoraRegistryInventorySource(nodeType,node=>bindLoraV3Graph(node,graphOwner(node)));
    let spec:any;
    const state=(node:any)=>{bindLoraV3Graph(node,graphOwner(node));const hidden=configWidget(node);if(!hidden)return null;const store=(value:string)=>storeLoraRegistryInventory(node,hidden,value,()=>refreshReactNodeWidget(node,nodeData.name,spec));return{hidden,store}},open=(node:any)=>{const current=state(node);if(current)openLoraRegistryDialog(api,current.hidden.value,current.store,`lora-registry:${String(node.id)}`)},openLibrary=(node:any,stackId:string)=>{const current=state(node);if(current)openLoraCatalogLibraryDialog(api,()=>configWidget(node)?.value,stackId,current.store,`lora-library:${String(node.id)}`)};
    spec={id:SPEC_ID,name:"lora_registry_widget",minHeight:72,maxHeight:420,overflow:"auto",nativeActions:[{id:"open-registry",name:"open_lora_registry",label:"Open LoRA Registry",invoke:open}],render:(node:any)=>{
        const hidden=configWidget(node);if(!hidden)return null;
        const raw=hidden.value,strict=strictLoraRegistryConfig(raw);let config=strict??parseLoraRegistryConfig(raw),serialized=serializeLoraRegistryConfig(config);
        if(needsFreshLoraRegistryId(String(node.id),config.registry_id,registries(node))){
            const previous=config,copy=freshenLoraRegistryIdentities(config);node.__bvLoraCollectorIdRemap={[previous.registry_id]:copy.registry_id};node.__bvLoraResourceIdRemap=Object.fromEntries(previous.stacks.map((stack,index)=>[stack.id,copy.stacks[index].id]));config=copy;serialized=serializeLoraRegistryConfig(copy);
        }
        if(shouldPersistNormalizedLoraConfig(raw,strict)&&String(hidden.value??"")!==serialized){hidden.value=serialized;hidden.callback?.(serialized)}
        const current=state(node);if(!current)return null;
        return createElement(LoraRegistryNodeWidget,{stored:hidden.value,onStored:current.store,onOpenLibrary:(stackId:string)=>openLibrary(node,stackId)});
    }};
    installReactNodeWidgetHost(nodeType,nodeData.name,spec);
}

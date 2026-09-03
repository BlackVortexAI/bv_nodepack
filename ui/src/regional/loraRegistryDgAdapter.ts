// Opt-in Registry pilot. Domain collector/resource identities stay in LoRA config;
// this map owns only the transport binding of a numbered consumer input.
import { connectedDgSender, dgSenderIdentity, reconcileDgTopology, registerDgAdapter, releaseDgReceiverChannel } from "./dgRouting";
import { freshenLoraRegistryIdentities, strictLoraRegistryConfig } from "./loraRegistryConfig";
import { allowedRegistryFamilies, enableRegistryFamily, registryChannelFamily, registryFamilyEnabled, registryKindAllowed, registrySourceKind, workflowRegistries, type RegistrySourceKind } from "./registryDgFamilies";
import { prepareCompositeRegistryClipboard } from "./registryDgClipboard";

const nodeClass=(node:any)=>String(node?.comfyClass??node?.type??"");
const selections=(node:any):Record<string,string>=>node?.properties?.bvLoraDgSelections??{};
export const isLoraRegistry=(node:any)=>nodeClass(node)==="BV LoRA Registry";
export const isRegistryDgPilot=(node:any)=>node?.properties?.bvRegistryDgVersion===1||node?.properties?.bvRegistryDgPilot===true||Object.keys(selections(node)).length>0;
const isConsumer=(node:any)=>["BV Regional Prompt","BV Regional LoRA"].includes(nodeClass(node));
export function activateNewRegistryDgConsumer(node:any){if(isConsumer(node)){node.properties??={};node.properties.bvRegistryDgVersion=1}for(const family of allowedRegistryFamilies(node))enableRegistryFamily(node,family)}
/** Native configure merges properties before its callback; remove constructor defaults
 * absent from the serialized snapshot, without touching links or the snapshot itself. */
export function restoreRegistryDgActivation(node:any,data:any){
    if((!isConsumer(node)&&!allowedRegistryFamilies(node).length)||!data||typeof data!=="object")return;
    node.properties??={};
    for(const key of ["bvRegistryDgVersion","bvRegistryDgPilot","bvLoraDgSelections","bvRegistryDgFamilies","bvRegistryDgSelections","bvRegistryDgSourceKinds"]){
        if(Object.prototype.hasOwnProperty.call(data.properties??{},key))node.properties[key]=structuredClone(data.properties[key]);
        else delete node.properties[key];
    }
}
const owns=(node:any,name:string)=>Object.prototype.hasOwnProperty.call(selections(node),name);
const write=(node:any,id:string,channel="")=>{node.properties??={};node.properties.bvLoraDgSelections??={};node.properties.bvLoraDgSelections[channel]=id};
const compositeSelections=(node:any):Record<string,string>=>node?.properties?.bvRegistryDgSelections??{};
const compositeOwns=(node:any,name:string)=>{const family=registryChannelFamily(node,name);return !!family&&registryFamilyEnabled(node,family)&&Object.prototype.hasOwnProperty.call(compositeSelections(node),name)};
export const hasRegistryDgFamilies=(node:any)=>isConsumer(node)&&isRegistryDgPilot(node)||allowedRegistryFamilies(node).some(family=>registryFamilyEnabled(node,family));
function compositeChannels(node:any){
    if(Object.keys(selections(node)).some(name=>Object.prototype.hasOwnProperty.call(compositeSelections(node),name)))throw new Error("DG Registry channel has two owners");
    return [...(isConsumer(node)&&isRegistryDgPilot(node)?Object.keys(selections(node)).filter(name=>/^resource_provider_([1-9]|1\d|20)$/.test(name)):[]),...Object.keys(compositeSelections(node)).filter(name=>compositeOwns(node,name))].map(name=>({id:name,inputName:name}));
}
const readComposite=(node:any,channel="")=>compositeOwns(node,channel)?compositeSelections(node)[channel]??"":selections(node)[channel]??"";
const writeComposite=(node:any,id:string,channel="")=>{if(registryChannelFamily(node,channel)){node.properties??={};node.properties.bvRegistryDgSelections??={};node.properties.bvRegistryDgSelections[channel]=id}else write(node,id,channel)};

const configKey=(node:any)=>nodeClass(node)==="BV Regional Prompt"?"lora_v3_config_json":"config_json";
const configIndex=(node:any)=>isLoraRegistry(node)?0:nodeClass(node)==="BV Regional Prompt"?2:1;
const copiedConfig=(node:any)=>node.widgets_values_named?.[configKey(node)]??(Array.isArray(node.widgets_values)?node.widgets_values[configIndex(node)]:node.widgets_values?.[configKey(node)]);
function writeCopiedConfig(node:any,value:string){
    if(Array.isArray(node.widgets_values))node.widgets_values[configIndex(node)]=value;
    else node.widgets_values={...node.widgets_values,[configKey(node)]:value};
    if(node.widgets_values_named)node.widgets_values_named[configKey(node)]=value;
}
function prepareRegistryClipboard(nodes:any[]){
    const references=new Set(nodes.filter(node=>isConsumer(node)&&isRegistryDgPilot(node)).flatMap(node=>Object.values(selections(node))));
    const copied=nodes.filter(node=>isLoraRegistry(node)&&(node.properties?.bvRegistryDgPilotSource===true||references.has(node.properties?.bvDgSenderId)));
    const remap=new Map<string,{id:string;resources:Map<string,string>}>();
    for(const node of copied){
        const previous=strictLoraRegistryConfig(copiedConfig(node));if(!previous)throw new Error("DG Registry clipboard: invalid copied Registry config");
        if(remap.has(previous.registry_id)||nodes.filter(isLoraRegistry).filter(candidate=>strictLoraRegistryConfig(copiedConfig(candidate))?.registry_id===previous.registry_id).length>1)throw new Error("DG Registry clipboard: ambiguous copied domain identity");
        const next=freshenLoraRegistryIdentities(previous);
        remap.set(previous.registry_id,{id:next.registry_id,resources:new Map(previous.stacks.map((stack,index)=>[stack.id,next.stacks[index].id]))});
        writeCopiedConfig(node,JSON.stringify(next));
    }
    if(!remap.size)return;
    for(const node of nodes.filter(isConsumer)){
        const raw=copiedConfig(node);if(raw==null)continue;
        const config=typeof raw==="string"?JSON.parse(raw):structuredClone(raw);let changed=false;
        for(const entry of [...(config.entries??[]),...(config.steps??[]).flatMap((step:any)=>step.entries??[])]){
            if(entry?.source?.kind!=="external")continue;
            const next=remap.get(entry.source.collector_id);if(!next)continue;
            const resource=next.resources.get(entry.source.resource_id);if(!resource)throw new Error("DG Registry clipboard: unknown copied resource identity");
            entry.source={...entry.source,collector_id:next.id,resource_id:resource};changed=true;
        }
        if(changed)writeCopiedConfig(node,JSON.stringify(config));
    }
}

registerDgAdapter({
    id:"lora-registry-pilot",isSender:node=>registrySourceKind(node)!==null,isReceiver:hasRegistryDgFamilies,
    receiverChannels:compositeChannels,
    canSelectSender:(receiver,sender,channel)=>{const family=registryChannelFamily(receiver,channel);return family?registryKindAllowed(family,registrySourceKind(sender))&&receiver.properties?.bvRegistryDgSourceKinds?.[channel]===registrySourceKind(sender):isLoraRegistry(sender)},
    readSelection:readComposite,writeSelection:writeComposite,
    readSerializedSelection:readComposite,writeSerializedSelection:writeComposite,
    prepareClipboard:nodes=>{prepareRegistryClipboard(nodes);prepareCompositeRegistryClipboard(nodes)},
});

export const ownsCompositeRegistryInput=compositeOwns;
export function connectCompositeRegistryInput(node:any,name:string,sender:any,source:RegistrySourceKind){
    const family=registryChannelFamily(node,name);
    if(!family||!registryFamilyEnabled(node,family)||!registryKindAllowed(family,source)||registrySourceKind(sender)!==source)return false;
    const id=dgSenderIdentity(sender);if(!id)return false;
    sender.properties.bvRegistryDgSource=true;
    node.properties.bvRegistryDgSourceKinds??={};node.properties.bvRegistryDgSourceKinds[name]=source;
    writeComposite(node,id,name);return reconcileDgTopology(node,name);
}
export function releaseCompositeRegistryInput(node:any,name:string){
    if(!compositeOwns(node,name))return true;
    if(!releaseDgReceiverChannel(node,name))return false;
    delete node.properties.bvRegistryDgSelections[name];delete node.properties.bvRegistryDgSourceKinds?.[name];return true;
}

export const ownsRegistryDgInput=(node:any,name:string)=>isRegistryDgPilot(node)&&owns(node,name);
export const linkedRegistryDgSender=(node:any,name:string)=>ownsRegistryDgInput(node,name)?connectedDgSender(node,name):null;
export function connectRegistryDgInput(node:any,name:string,sender:any){
    if(!isConsumer(node)||!isRegistryDgPilot(node)||!isLoraRegistry(sender))return false;
    const id=dgSenderIdentity(sender);if(!id)return false;
    sender.properties.bvRegistryDgPilotSource=true;
    write(node,id,name);return reconcileDgTopology(node,name);
}
export function releaseRegistryDgInput(node:any,name:string){
    if(!ownsRegistryDgInput(node,name))return true;
    if(!releaseDgReceiverChannel(node,name))return false;
    delete node.properties.bvLoraDgSelections[name];return true;
}

/** Only Registries cross scopes. Legacy/manual Collectors remain local. */
export function nestedLoraRegistries(node:any){
    if(!isRegistryDgPilot(node))return [];
    return workflowRegistries(node,"lora");
}

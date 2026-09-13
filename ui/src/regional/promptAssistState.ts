import {parseDocument, type RegionalDocument} from "./model";
import type {ReferenceMention} from "../completion/referenceMentions";
import {DEFAULT_ASSIST_SYSTEM,assistPreset,type AssistPresetId} from "./promptAssistPresets";
export {DEFAULT_ASSIST_SYSTEM} from "./promptAssistPresets";

export const ASSIST_PROPERTY = "bv_prompt_assist_v1";
export const ASSIST_EVENT = "bv-prompt-assist-changed";
export const ASSIST_DOCUMENT_EVENT = "bv-prompt-assist-document-changed";
export type AssistConfig = {version:1;enabled:boolean;translate:boolean;improve:boolean;language:string;system_prompt:string;profile_id:string;model:string;prompt_preset?:AssistPresetId};
export type AssistNode = {inputs?:Array<{name:string;link?:unknown}>;properties?:Record<string,unknown>;widgets?:Array<{name:string;value:unknown;callback?:(value:unknown)=>void}>;graph?:{change?:()=>void;setDirtyCanvas?:(a:boolean,b:boolean)=>void}};
export type Polarity = "positive" | "negative";
export const defaultAssistConfig = ():AssistConfig => ({version:1,enabled:false,translate:true,improve:true,language:"English",system_prompt:DEFAULT_ASSIST_SYSTEM,profile_id:"",model:""});
export function readAssistConfig(node:AssistNode|null|undefined):AssistConfig {
    const defaults=defaultAssistConfig(),value=node?.properties?.[ASSIST_PROPERTY];
    if(!value||typeof value!=="object"||Array.isArray(value))return defaults;
    const raw=value as Record<string,unknown>;
    for(const key of ["enabled","translate","improve"] as const)if(typeof raw[key]==="boolean")defaults[key]=raw[key];
    for(const [key,limit] of [["language",80],["system_prompt",8192],["profile_id",100],["model",200]] as const)if(typeof raw[key]==="string")defaults[key]=raw[key].slice(0,limit);
    defaults.prompt_preset=typeof raw.prompt_preset==="string"&&assistPreset(raw.prompt_preset)?raw.prompt_preset as AssistPresetId:defaults.system_prompt===DEFAULT_ASSIST_SYSTEM?"general":"custom";
    if(raw.prompt_preset==="custom")defaults.prompt_preset="custom";
    return defaults;
}
function dispatch(name:string,detail:unknown){if(typeof window!=="undefined")window.dispatchEvent(new CustomEvent(name,{detail}));}
export function writeAssistConfig(node:AssistNode,config:AssistConfig){
    node.properties??={};
    const clean=readAssistConfig({properties:{[ASSIST_PROPERTY]:config}});
    node.properties[ASSIST_PROPERTY]=clean;
    node.graph?.change?.();node.graph?.setDirtyCanvas?.(true,true);dispatch(ASSIST_EVENT,{node});
    return clean;
}
export function assistPair(document:RegionalDocument,target:string){
    if(target==="global"||target==="background")return document.prompts[target];
    const pair=document.regions.find(region=>region.id===target)?.prompts;
    if(!pair)throw new Error("This prompt target no longer exists.");
    return pair;
}
export type AssistSnapshot={documentId:string;target:string;polarity:Polarity;text:string;mentions:ReferenceMention[];nativeNode?:AssistNode;nativeWidget?:NonNullable<AssistNode["widgets"]>[number]};
export const NATIVE_TEXT_TARGET="native-text";
export function captureAssistField(node:AssistNode,target:string,polarity:Polarity):AssistSnapshot {
    if(target===NATIVE_TEXT_TARGET){
        if(node.inputs?.some(input=>input.name==="text"&&input.link!=null))throw new Error("Disconnect the text input to edit the local text.");
        const widget=node.widgets?.find(item=>item.name==="text");
        if(!widget||typeof widget.value!=="string")throw new Error("Native text field is unavailable.");
        return {documentId:NATIVE_TEXT_TARGET,target,polarity,text:widget.value,mentions:[],nativeNode:node,nativeWidget:widget};
    }
    const document=parseDocument(node.widgets?.find(widget=>widget.name==="regional_json")?.value),pair=assistPair(document,target);
    return {documentId:document.document_id,target,polarity,text:pair[`${polarity}_source`],mentions:structuredClone(pair.references?.[polarity]??[])};
}
export function replaceAssistField(node:AssistNode,expected:AssistSnapshot,text:string,mentions:ReferenceMention[]):AssistSnapshot {
    if(expected.target===NATIVE_TEXT_TARGET){
        const current=captureAssistField(node,expected.target,expected.polarity);
        if(expected.nativeNode!==node||expected.nativeWidget!==current.nativeWidget||current.text!==expected.text)throw new Error("Text changed while working. Your newer text was kept.");
        if(typeof text!=="string"||text.length>32768)throw new Error("Invalid writing assistance result.");
        const widget=current.nativeWidget!;
        widget.value=text;widget.callback?.(text);
        node.graph?.change?.();node.graph?.setDirtyCanvas?.(true,true);
        return captureAssistField(node,expected.target,expected.polarity);
    }
    const widget=node.widgets?.find(item=>item.name==="regional_json");
    if(!widget)throw new Error("Prompt node is no longer available.");
    const before=parseDocument(widget.value),pair=assistPair(before,expected.target),current=captureAssistField(node,expected.target,expected.polarity);
    if(current.documentId!==expected.documentId||current.text!==expected.text||JSON.stringify(current.mentions)!==JSON.stringify(expected.mentions))throw new Error("Prompt changed while working. Your newer text was kept.");
    const next=structuredClone(before),nextPair=assistPair(next,expected.target);
    nextPair[`${expected.polarity}_source`]=text;
    if(pair.references||mentions.length)nextPair.references={...pair.references,[expected.polarity]:structuredClone(mentions)};
    if(typeof text!=="string"||!text.trim()||text.length>32768)throw new Error("Invalid writing assistance result.");
    maskAssistReferences(text,mentions);
    // Keep the existing document normalization; backend validates BV markup.
    parseDocument(next);
    widget.value=JSON.stringify(next);widget.callback?.(widget.value);
    node.graph?.change?.();node.graph?.setDirtyCanvas?.(true,true);
    dispatch(ASSIST_DOCUMENT_EVENT,{node,before,next});
    return captureAssistField(node,expected.target,expected.polarity);
}
export function maskAssistReferences(text:string,mentions:ReferenceMention[]){
    if(/__BVREF\d+__/.test(text))throw new Error("Prompt contains reserved reference markers.");
    let cursor=0,masked="";
    const ordered=[...mentions].sort((a,b)=>a.start-b.start);
    ordered.forEach((mention,index)=>{
        if(!Number.isInteger(mention.start)||!Number.isInteger(mention.end)||mention.start<cursor||mention.end<=mention.start||text.slice(mention.start,mention.end)!==mention.label)throw new Error("A reference binding is invalid. Reinsert it before improving this field.");
        masked+=text.slice(cursor,mention.start)+`__BVREF${index}__`;cursor=mention.end;
    });
    return {text:masked+text.slice(cursor),mentions:ordered};
}
export function restoreAssistReferences(text:string,mentions:ReferenceMention[]){
    const expected=mentions.map((_,i)=>`__BVREF${i}__`),actual=text.match(/__BVREF\d+__/g)??[];
    if(JSON.stringify(expected)!==JSON.stringify(actual))throw new Error("Response changed reference bindings; original prompt kept.");
    const restored:ReferenceMention[]=[];
    let cursor=0,result="";
    expected.forEach((token,index)=>{const start=text.indexOf(token,cursor);result+=text.slice(cursor,start);restored.push({...mentions[index],start:result.length,end:result.length+mentions[index].label.length});result+=mentions[index].label;cursor=start+token.length;});
    return {text:result+text.slice(cursor),mentions:restored};
}

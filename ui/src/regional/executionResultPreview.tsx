import React from"react";
import{ReadonlyTextBlock}from"../ui/components";
import{installReactNodeWidgetHost,reactNodeWidgetsRemoved,refreshReactNodeWidget,type ReactNodeWidgetSpec}from"./reactNodeWidgetHost";

type PreviewState={text:string;typeName?:string;truncated:boolean};
export type ExecutionResultPreviewSpec=Readonly<{id:string;widgetName:string;messageKey:string;placeholder:string;minHeight?:number;maxHeight?:number}>;

const stateKey=Symbol("bvExecutionResultPreview");
const state=(node:any):PreviewState=>node[stateKey]??={text:"",truncated:false};
const first=(value:any)=>Array.isArray(value)?value[0]:value;

export function installExecutionResultPreview(nodeType:any,nodeTypeName:string,spec:ExecutionResultPreviewSpec){
    const widgetSpec:ReactNodeWidgetSpec={
        id:spec.id,name:spec.widgetName,minHeight:spec.minHeight??120,maxHeight:spec.maxHeight??360,overflow:"auto",
        render:node=>{const current=state(node);return <ReadonlyTextBlock text={current.text} typeName={current.typeName} truncated={current.truncated} placeholder={spec.placeholder}/>},
    };
    installReactNodeWidgetHost(nodeType,nodeTypeName,widgetSpec);
    const configured=nodeType.prototype.onConfigure,executed=nodeType.prototype.onExecuted,removed=nodeType.prototype.onRemoved;
    nodeType.prototype.onConfigure=function(){delete this[stateKey];return configured?.apply(this,arguments)};
    nodeType.prototype.onExecuted=function(message:any){
        const result=executed?.apply(this,arguments),raw=first(message?.[spec.messageKey]);
        if(typeof raw!=="string"||reactNodeWidgetsRemoved(this))return result;
        this[stateKey]={text:raw,typeName:typeof first(message?.type_name)==="string"?first(message.type_name):undefined,truncated:Boolean(first(message?.truncated))};
        refreshReactNodeWidget(this,nodeTypeName,widgetSpec);return result;
    };
    nodeType.prototype.onRemoved=function(){const result=removed?.apply(this,arguments);delete this[stateKey];return result};
    return widgetSpec;
}

export function executionResultPreviewState(node:any){return state(node)}

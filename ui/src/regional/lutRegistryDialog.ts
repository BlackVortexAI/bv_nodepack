import{createElement}from"react";
import{mountBvView}from"../ui";
import{LutRegistryDialogView}from"./LutRegistryDialogView";
export async function openLutRegistryDialog(api:any,stored:unknown,save:(value:string)=>void,windowKey:string,nodes:Array<{id:string;label:string}>,onNavigate:(id:string,replace:boolean)=>void,currentNode?:any){const response=await fetch(api.apiURL("/bv_nodepack/luts/models"));if(!response.ok)throw new Error(`LUT catalog failed: ${response.status}`);const catalog=await response.json();mountBvView(close=>createElement(LutRegistryDialogView,{catalog,stored,save,close,nodeId:windowKey.split(":").slice(1).join(":"),nodes,onNavigate,currentNode}),{key:windowKey})}

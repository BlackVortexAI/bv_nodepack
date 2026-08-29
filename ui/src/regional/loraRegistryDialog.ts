import{createElement}from"react";
import{mountBvView}from"../ui";
import{LoraCatalogLibraryLoader,LoraRegistryDialogLoader}from"./LoraRegistryView";

export function openLoraRegistryDialog(api:any,stored:unknown,save:(value:string)=>void,windowKey:string){
    mountBvView(close=>createElement(LoraRegistryDialogLoader,{api,stored,save,close}),{key:windowKey});
}

export function openLoraCatalogLibraryDialog(api:any,readStored:()=>unknown,targetStackId:string,save:(value:string)=>void,windowKey:string){
    mountBvView(close=>createElement(LoraCatalogLibraryLoader,{api,readStored,targetStackId,save,close}),{key:windowKey});
}

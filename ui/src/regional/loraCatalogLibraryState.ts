import{defaultLoraBrowserFilters,type LoraBrowserFilters}from"./loraCatalogBrowserModel";

export type LoraCatalogLibraryState={filters:LoraBrowserFilters;view:"list"|"grid";expanded:string[];selectedName:string};

const MAX_STATES=32,states=new Map<string,LoraCatalogLibraryState>();
const facet=(value:unknown)=>Array.isArray(value)?value.filter(item=>typeof item==="string"&&item.trim()).map(item=>item.trim()):typeof value==="string"&&value.trim()?[value.trim()]:[];
const clone=(value:LoraCatalogLibraryState):LoraCatalogLibraryState=>({filters:{query:String(value.filters?.query??""),directory:String(value.filters?.directory??""),baseModel:facet(value.filters?.baseModel),tag:facet(value.filters?.tag),type:facet(value.filters?.type),category:facet(value.filters?.category),author:facet(value.filters?.author)},view:value.view==="list"?"list":"grid",expanded:Array.isArray(value.expanded)?[...value.expanded]:[""],selectedName:String(value.selectedName??"")});
const fresh=():LoraCatalogLibraryState=>({filters:defaultLoraBrowserFilters(),view:"grid",expanded:[""],selectedName:""});

export function readLoraCatalogLibraryState(key:string):LoraCatalogLibraryState{return clone(states.get(key)??fresh())}
export function writeLoraCatalogLibraryState(key:string,value:LoraCatalogLibraryState){
    states.delete(key);states.set(key,clone(value));
    while(states.size>MAX_STATES)states.delete(states.keys().next().value as string);
}
export function clearLoraCatalogLibraryState(key?:string){if(key===undefined)states.clear();else states.delete(key)}

import assert from "node:assert/strict";
import test from "node:test";
import {buildLoraBrowserModel,defaultLoraBrowserFilters} from "../ui/src/regional/loraCatalogBrowserModel.ts";

const item=(name,overrides={})=>({name,display_name:name.split("/").at(-1),base_model:"Anima",tags:[],trigger_words:[],author:"",description:"",size:1,preview_url:null,preview_safe:false,metadata_sources:[],type:"LORA",category:"Uncategorized",directory:name.includes("/")?name.slice(0,name.lastIndexOf("/")):"",...overrides});

test("LoRA browser model derives a relative directory tree and local facets",()=>{
  const items=[
    item("Anima/Characters/hero.safetensors",{tags:["anime","character"],category:"character",author:"Mina"}),
    item("Anima/Styles/ink.safetensors",{tags:["anime","style"],category:"style"}),
    item("Flux/Lighting/rim.safetensors",{base_model:"Flux",tags:["portrait"],category:"lighting"}),
  ];
  const model=buildLoraBrowserModel(items,defaultLoraBrowserFilters());
  assert.deepEqual(model.directories.map(node=>node.id),["","Anima","Flux"]);
  assert.deepEqual(model.directories[1].children.map(node=>node.id),["Anima/Characters","Anima/Styles"]);
  assert.deepEqual(model.facets.baseModels,["Anima","Flux"]);
  assert.deepEqual(model.facets.tags,["anime","character","portrait","style"]);
  assert.deepEqual(model.facets.categories,["character","lighting","style"]);
});

test("LoRA browser model combines search, directory and local metadata filters",()=>{
  const items=[
    item("Anima/Characters/hero.safetensors",{display_name:"Hero",tags:["anime"],category:"character",author:"Mina"}),
    item("Anima/Styles/ink.safetensors",{display_name:"Ink",tags:["anime","style"],category:"style"}),
    item("Flux/Styles/photo.safetensors",{display_name:"Photo",base_model:"Flux",tags:["portrait"],category:"style"}),
  ];
  const filters={...defaultLoraBrowserFilters(),query:"mina hero",directory:"Anima/Characters",baseModel:["Anima"],tag:["anime"],type:["LORA"],category:["character"],author:["Mina"]};
  assert.deepEqual(buildLoraBrowserModel(items,filters).items.map(entry=>entry.name),["Anima/Characters/hero.safetensors"]);
  assert.deepEqual(buildLoraBrowserModel(items,{...filters,query:"missing"}).items,[]);
});

test("LoRA facets are OR within a facet and AND across facet groups",()=>{
  const items=[
    item("Anima/Characters/hero.safetensors",{display_name:"Hero",base_model:"Anima",tags:["character"],category:"character",author:"Mina"}),
    item("Flux/Styles/ink.safetensors",{display_name:"Ink",base_model:"Flux",tags:["style"],category:"style",author:"Mina"}),
    item("SDXL/Characters/villain.safetensors",{display_name:"Villain",base_model:"SDXL",tags:["character"],category:"character",author:"Kai"}),
  ];
  const filters={...defaultLoraBrowserFilters(),baseModel:["Anima","Flux"],tag:["character","style"],author:["Mina"]};
  assert.deepEqual(buildLoraBrowserModel(items,filters).items.map(entry=>entry.name),["Anima/Characters/hero.safetensors","Flux/Styles/ink.safetensors"]);
  assert.deepEqual(buildLoraBrowserModel(items,{...filters,tag:[]}).items.map(entry=>entry.name),["Anima/Characters/hero.safetensors","Flux/Styles/ink.safetensors"]);
});

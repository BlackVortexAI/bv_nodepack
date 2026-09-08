import test from 'node:test';
import assert from 'node:assert/strict';
import React from '../ui/node_modules/react/index.js';
import {renderToStaticMarkup} from '../ui/node_modules/react-dom/server.node.js';

import {loraCatalogClient} from '../ui/src/regional/loraCatalogClient.ts';
import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry} from '../ui/src/regional/loraRegistryConfig.ts';
import {getMaturePreviewVisibility,setMaturePreviewVisibility} from '../ui/src/ui/preferences.ts';

test('real registry node preview obeys shared mature preference in both directions',async()=>{
 const previousReact=globalThis.React;globalThis.React=React;const previousWindow=globalThis.window;globalThis.window={addEventListener(){},removeEventListener(){},innerWidth:1200,innerHeight:900};
 const {LoraRegistryNodeView}=await import('../ui/src/regional/LoraRegistryNodeView.tsx');
 const previousFetch=globalThis.fetch,previousMature=getMaturePreviewVisibility();
 const item={name:'portrait.safetensors',display_name:'Portrait',base_model:'Krea',tags:[],trigger_words:[],author:'',description:'',size:1,preview_url:'/local-preview.jpg',preview_safe:false,metadata_sources:[],type:'LoRA',category:'',directory:''};
 const config=emptyLoraRegistryConfig(),stack=newLoraRegistryStack();stack.entries.push(newLoraRegistryEntry(item.name));config.stacks.push(stack);
 try{
  globalThis.fetch=async()=>({ok:true,json:async()=>({schema:'bv.lora_catalog',version:1,items:[item]})});
  await loraCatalogClient.reload({apiURL:p=>p});
  for(const allowed of [false,true,false]){
   setMaturePreviewVisibility(allowed,false);
   const markup=renderToStaticMarkup(React.createElement(LoraRegistryNodeView,{stored:JSON.stringify(config),onStored(){},onOpenLibrary(){}}));
   const anchor=markup.match(/<span class="bv-hover-preview-anchor"[^>]*>/)?.[0];
   assert.ok(anchor,'actual shared HoverPreview rendered');
   assert.equal(anchor.includes('tabindex="0"'),allowed,`mature preference ${allowed} controls preview availability`);
  }
 }finally{globalThis.React=previousReact;globalThis.window=previousWindow;globalThis.fetch=previousFetch;setMaturePreviewVisibility(previousMature,false);loraCatalogClient.invalidate();}
});

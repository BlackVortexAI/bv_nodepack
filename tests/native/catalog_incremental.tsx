import React from 'react';
import {createRoot} from 'react-dom/client';
import {applyBvTheme} from '../../ui/src/ui/theme';
import {LoraCatalogLibraryWindow} from '../../ui/src/regional/LoraCatalogLibraryWindow';
import {emptyLoraRegistryConfig} from '../../ui/src/regional/loraRegistryConfig';
import {IncrementalResourceList} from '../../ui/src/ui/components/data';
applyBvTheme();
const root=createRoot(document.querySelector('#mount')!),cfg=emptyLoraRegistryConfig();
const items=Array.from({length:236},(_,i)=>({name:`synthetic-${String(i).padStart(3,'0')}.safetensors`,display_name:`Synthetic ${i}`,base_model:'Unknown',type:'LoRA',category:'Test',author:'Synthetic',tags:[],trigger_words:[],description:'Synthetic only',preview_url:null,preview_safe:false,compatibility:{status:'unknown',family:null,reason:'Synthetic target',target_model:'unknown'},civitai_url:null}));
const render=()=>root.render(new URLSearchParams(location.search).has('minimal')?<div style={{width:1200,height:600}}><IncrementalResourceList items={items} itemKey={item=>item.name} mode="grid" empty={null} renderItem={item=><article className="bv-resource-result" style={{height:80}}>{item.name}</article>}/></div>:<LoraCatalogLibraryWindow catalog={{schema:'bv.lora_catalog',version:1,items} as any} stacks={cfg.stacks} targetStackId={cfg.stacks[0].id} stateKey="incremental-236-synthetic" onTargetStack={()=>{}} onAdd={()=>true} onClose={()=>root.render(null)}/>);
const wait=async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));await new Promise(r=>setTimeout(r,120))};
document.querySelector('#regression')!.addEventListener('click',async()=>{
 const checks:{name:string,pass:boolean,detail?:unknown}[]=[],check=(name:string,pass:unknown,detail?:unknown)=>checks.push({name,pass:Boolean(pass),detail});
 const grid=()=>document.querySelector('.bv-resource-grid') as HTMLElement,count=()=>document.querySelectorAll('.bv-resource-result').length;
 const drain=async(target:number)=>{let iterations=0;while(count()<target&&iterations++<40){const before=count(),element=grid();element.scrollTop=element.scrollHeight;element.dispatchEvent(new Event('scroll'));for(let attempt=0;attempt<10&&count()===before;attempt++)await wait();await wait();if(count()===before)break}return{count:count(),iterations}};
 const query=async(text:string)=>{const input=document.querySelector<HTMLInputElement>('input[aria-label="Search resources"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));await wait()};
 root.render(null);await wait();render();await wait();
 try{
 check('large initial viewport fills automatically',grid().clientHeight>0&&grid().scrollHeight>grid().clientHeight,{count:count(),client:grid().clientHeight,scroll:grid().scrollHeight});
 check('initial render remains incremental',count()<236,{count:count()});
 const full=await drain(236);check('scroll reaches all236 without Load button',full.count===236,full);
 await query('synthetic-1');check('search resets and automatically fills matching100',grid().clientHeight>0&&grid().scrollHeight>grid().clientHeight&&count()<100,{count:count()});const filtered=await drain(100);check('filtered scroll reaches all100 matches',filtered.count===100&&Array.from(document.querySelectorAll('.bv-resource-result')).every(el=>el.textContent?.includes('synthetic-1')),filtered);
 await query('');check('clearing filter restores236 matching status',document.querySelector('.bv-ui-window-status')?.textContent?.includes('236')||document.querySelector('.bv-incremental-resource-list footer')?.textContent?.includes('236'));
 const shell=document.querySelector('.bv-managed-window')!;shell.dispatchEvent(new CustomEvent('bv-ui-set-window-state',{detail:{mode:'floating',geometry:{x:16,y:16,width:700,height:500}}}));await wait();await query('synthetic-0');const small=await drain(100);check('small resized catalog scroll reaches100 without Load',small.count===100,small);
 await query('');shell.dispatchEvent(new CustomEvent('bv-ui-set-window-state',{detail:{mode:'floating',geometry:{x:16,y:16,width:1600,height:1050}}}));await wait();check('enlarging window refills underfilled viewport',grid().scrollHeight>grid().clientHeight||count()===236,{count:count(),client:grid().clientHeight,scroll:grid().scrollHeight});const final=await drain(236);check('resized cleared catalog reaches all236',final.count===236,final);
 }catch(error){check('fixture completes',false,String(error))}
 document.querySelector('#result')!.textContent=JSON.stringify({total:checks.length,passed:checks.filter(c=>c.pass).length,checks},null,2);
});
document.querySelector('#probe')!.addEventListener('click',async()=>{const count=()=>document.querySelectorAll('.bv-resource-result').length,before=count();document.querySelector('.bv-resource-grid')?.dispatchEvent(new Event('scroll',{bubbles:false}));await wait();const after=count();await wait();document.querySelector('#result')!.textContent=JSON.stringify({probe:'one scroll event on actual grid',before,after,stable:count()},null,2)});
document.querySelector('#run')!.addEventListener('click',async()=>{
 const runs=[];for(let i=0;i<2;i++){root.render(null);await wait();render();await wait();const grid=document.querySelector('.bv-resource-grid') as HTMLElement;const region=document.querySelector('.bv-incremental-resource-list') as HTMLElement;const count=document.querySelectorAll('.bv-resource-result').length;runs.push({pass:grid.clientHeight>0&&(grid.scrollHeight>grid.clientHeight||count===items.length),count,total:items.length,grid:{client:grid?.clientHeight,scroll:grid?.scrollHeight,overflow:getComputedStyle(grid).overflowY},region:{client:region?.clientHeight,scroll:region?.scrollHeight},footer:region?.querySelector('footer')?.textContent})}
 document.querySelector('#result')!.textContent=JSON.stringify({pass:runs.every(r=>r.pass),runs},null,2);
});

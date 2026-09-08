import React from 'react';
import {createRoot} from 'react-dom/client';
import {applyBvTheme} from '../../ui/src/ui/theme';
import {registryUxNative} from './registry_ux_native';
import {LoraRegistryDialogView} from '../../ui/src/regional/LoraRegistryView';
import {LoraCatalogLibraryWindow} from '../../ui/src/regional/LoraCatalogLibraryWindow';
import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry,parseLoraRegistryConfig,serializeLoraRegistryConfig} from '../../ui/src/regional/loraRegistryConfig';
applyBvTheme();
const wait=()=>new Promise(r=>setTimeout(r,120));
const mount=document.querySelector('#mount')!,root=createRoot(mount),result=document.querySelector('#result')!;
const initial=emptyLoraRegistryConfig();const normal=newLoraRegistryStack('Synthetic style');normal.entries.push(newLoraRegistryEntry('synthetic.safetensors'));initial.stacks.push(normal);
const catalog:any={schema:'bv.lora_catalog',version:1,items:[{name:'synthetic-new.safetensors',display_name:'Synthetic new LoRA',base_model:'Unknown',type:'LoRA',category:'Test',author:'Synthetic',tags:[],trigger_words:[],description:'Test only',preview_url:null,preview_safe:false,compatibility:{status:'unknown',family:null,reason:'No target model',target_model:'unknown'},civitai_url:null}]};
let stored=serializeLoraRegistryConfig(initial),saves=0;
const cfg=()=>parseLoraRegistryConfig(stored);
const buttons=(name:string)=>Array.from(document.querySelectorAll<HTMLButtonElement>('button')).filter(b=>b.textContent?.trim()===name);
const click=async(name:string)=>{buttons(name)[0]?.click();await wait()};
const save=(value:string)=>{stored=value;saves++;localStorage.setItem('bv-registry-ux-synthetic',value)};
const open=()=>root.render(<LoraRegistryDialogView stored={stored} catalog={catalog} save={save} readStored={()=>stored} close={()=>root.render(null)}/>);
document.querySelector('#open')!.addEventListener('click',open);
const checks:{name:string;pass:boolean;detail?:unknown}[]=[];
const check=(name:string,pass:unknown,detail?:unknown)=>checks.push({name,pass:Boolean(pass),detail});
const report=()=>{result.textContent=JSON.stringify({total:checks.length,passed:checks.filter(c=>c.pass).length,failures:checks.filter(c=>!c.pass),measurements:checks.filter(c=>c.detail),saves},null,2);(globalThis as any).__registryUxResult={checks,stored}};
const mode=new URLSearchParams(location.search).get('mode');
if(mode==='catalog'){
 root.render(<LoraCatalogLibraryWindow catalog={{...catalog,items:Array.from({length:12},(_,i)=>({...catalog.items[0],name:`synthetic-layout-${i}.safetensors`,display_name:`Synthetic layout ${i}`}))}} stacks={initial.stacks} stateKey="isolated-catalog-ux" targetStackId={normal.id} onTargetStack={()=>{}} onAdd={()=>true} onClose={()=>root.render(null)}/>);
 setTimeout(()=>{const box=document.querySelector('[role="dialog"]')!.getBoundingClientRect(),grid=document.querySelector('.bv-resource-grid')!,detail=document.querySelector('.bv-resource-detail')!;const data={width:box.width,height:box.height,left:box.left,top:box.top,right:box.right,bottom:box.bottom,viewport:[innerWidth,innerHeight],columns:getComputedStyle(grid).gridTemplateColumns,detailWidth:detail.getBoundingClientRect().width,detailDisplay:getComputedStyle(detail).display};parent.postMessage({registryUxCatalog:data},location.origin);result.textContent=JSON.stringify(data)},600);
}else if(mode==='layout'){
 const measurements:any[]=[];(async()=>{for(const [width,height] of [[2000,1200],[640,480]]){const frame=document.createElement('iframe');frame.width=String(width);frame.height=String(height);frame.src=location.pathname+'?mode=catalog';document.body.appendChild(frame);const data:any=await new Promise(resolve=>{const listener=(event:MessageEvent)=>{if(event.source===frame.contentWindow&&event.data?.registryUxCatalog){window.removeEventListener('message',listener);resolve(event.data.registryUxCatalog)}};window.addEventListener('message',listener)});measurements.push(data);frame.remove()}result.textContent=JSON.stringify(measurements,null,2)})();
}else document.querySelector('#run')!.addEventListener('click',async()=>{
 checks.length=0;stored=serializeLoraRegistryConfig(initial);saves=0;root.render(null);await wait();await registryUxNative(check,document.querySelector('#nodes')!);open();await wait();
 try{
 check('no explicit Save registry button',buttons('Save registry').length===0);
 await click('Add named stack');check('add stack autosaves immediately',cfg().stacks.length===3);
 const input=Array.from(document.querySelectorAll<HTMLInputElement>('input')).find(el=>el.value==='LoRA Stack 3');
 if(input){Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Renamed synthetic');input.dispatchEvent(new Event('input',{bubbles:true}));await wait()}
 check('rename autosaves',cfg().stacks.some(s=>s.name==='Renamed synthetic'));
 const strength=document.querySelector<HTMLInputElement>('input[aria-label="Synthetic style group strength"]');strength?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await wait();
 check('strength increment autosaves',cfg().stacks.find(s=>s.name==='Synthetic style')?.entries[0]?.model_strength===1.05);
 await click('More');await click('Undo');check('undo persists previous strength',cfg().stacks.find(s=>s.name==='Synthetic style')?.entries[0]?.model_strength===1);
 await click('More');await click('Redo');check('redo persists strength again',cfg().stacks.find(s=>s.name==='Synthetic style')?.entries[0]?.model_strength===1.05);
 root.render(null);await wait();open();await wait();check('close reopen retains renamed stack and strength',Array.from(document.querySelectorAll<HTMLInputElement>('input')).some(el=>el.value==='Renamed synthetic')&&cfg().stacks.find(s=>s.name==='Synthetic style')?.entries[0]?.model_strength===1.05);
 const peer=cfg();peer.stacks[0].enabled=true;stored=serializeLoraRegistryConfig(peer);open();await wait();
 check('external Global switch visibly syncs in open dialog',document.querySelector('[role="switch"]')?.getAttribute('aria-checked')==='true');
 await click('More');await click('Undo');check('undo does not restore obsolete peer Global flag',cfg().stacks[0].enabled===true);
 const latePeer=cfg();latePeer.stacks[0].enabled=false;stored=serializeLoraRegistryConfig(latePeer);
 document.querySelector<HTMLInputElement>('input[aria-label="Synthetic style group strength"]')?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));await wait();
 check('next edit preserves a peer change before rerender',cfg().stacks[0].enabled===false);
 buttons('＋ Add LoRA')[1]?.click();await wait();await click('Add');check('catalog add autosaves new entry',cfg().stacks.find(s=>s.name==='Synthetic style')?.entries.some(e=>e.lora_name==='synthetic-new.safetensors'));
 const library=document.querySelector('[role="dialog"][aria-label^="Add LoRA"]');Array.from(library?.querySelectorAll<HTMLButtonElement>('button')??[]).find(b=>b.textContent==='Close')?.click();await wait();
 const typed=document.querySelector<HTMLInputElement>('input[aria-label="Synthetic style group strength"]');
 if(typed){typed.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(typed,'2');typed.dispatchEvent(new Event('input',{bubbles:true}));await wait();typed.blur();document.querySelector<HTMLButtonElement>('[role="dialog"][aria-label="LoRA Registry"] button[aria-label="Close window"]')?.click()}
 await wait();check('typed strength blur immediately followed by Close persists',cfg().stacks.find(s=>s.name==='Synthetic style')?.entries.every(e=>e.model_strength===2));
 open();await wait();check('reopening after real Close shows persisted typed strength',document.querySelector<HTMLInputElement>('input[aria-label="Synthetic style group strength"]')?.value==='2');
 root.render(null);await wait();
 for(const [width,height] of [[2000,1200],[640,480]]){
  const frame=document.createElement('iframe');frame.width=String(width);frame.height=String(height);frame.src=location.pathname+'?mode=catalog';document.body.appendChild(frame);
  const data:any=await new Promise(resolve=>{const listener=(e:MessageEvent)=>{if(e.source===frame.contentWindow&&e.data?.registryUxCatalog){window.removeEventListener('message',listener);resolve(e.data.registryUxCatalog)}};window.addEventListener('message',listener)});
  check(`catalog ${width}x${height} is viewport bounded`,data.left>=0&&data.top>=0&&data.right<=width&&data.bottom<=height,data);
  if(width===2000)check('catalog large viewport starts 1600x1050',data.width===1600&&Math.abs(data.height-1050)<=2,data);
  frame.remove();
 }
 }catch(error){check('fixture completes',false,String(error))}finally{report();open()}
});

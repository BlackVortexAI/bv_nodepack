import React from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {MediaPreview} from '../../ui/src/ui/components/MediaPreview';
import {LoraRegistryNodeView} from '../../ui/src/regional/LoraRegistryNodeView';
import {loraCatalogClient} from '../../ui/src/regional/loraCatalogClient';
import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry} from '../../ui/src/regional/loraRegistryConfig';
import {setMaturePreviewVisibility} from '../../ui/src/ui/preferences';
const result=document.querySelector('#result')!;
const button=document.querySelector<HTMLButtonElement>('#run')!;
button.onclick=async()=>{
 const report:any={status:'running',checks:[]};const check=(name:string,value:unknown)=>{report.checks.push({name,pass:!!value});if(!value)throw Error(name)};
 const wait=(ms=80)=>new Promise(r=>setTimeout(r,ms));const container=document.querySelector('#mount')!;const root=createRoot(container);
 const previousFetch=window.fetch;
 try{
  window.fetch=async()=>({ok:true,json:async()=>({schema:'bv.lora_catalog',version:1,items:[{name:'fixture.safetensors',display_name:'Synthetic video preview',base_model:'test',tags:[],trigger_words:[],author:'',description:'',size:1,preview_url:'data:video/mp4;base64,AAAA',preview_media_type:'video',preview_safe:false,metadata_sources:[],type:'LoRA',category:'',directory:''}]})}) as Response;
  await loraCatalogClient.reload({apiURL:p=>p});window.fetch=previousFetch;
  const config=emptyLoraRegistryConfig(),stack=newLoraRegistryStack();stack.entries.push(newLoraRegistryEntry('fixture.safetensors'));config.stacks.push(stack);
  setMaturePreviewVisibility(false,false);root.render(<LoraRegistryNodeView stored={JSON.stringify(config)} onStored={()=>{}} onOpenLibrary={()=>{}}/>);await wait();
  const anchor=()=>container.querySelector<HTMLElement>('.bv-hover-preview-anchor')!;
  check('unsafe preview initially not focusable',anchor().getAttribute('tabindex')===null);
  setMaturePreviewVisibility(true,false);await wait();check('mounted real node responds to Mature on',anchor().tabIndex===0);
  anchor().focus();await wait(550);const video=document.querySelector<HTMLVideoElement>('.bv-hover-preview video');
  check('actual shared hover renders video or explicit decode failure',document.querySelector('.bv-hover-preview') && (video || document.querySelector('.bv-media-preview-error')) && document.querySelector('.bv-hover-preview img')===null);
  if(video) check('hover video is muted looping and inline',video.muted&&video.loop&&video.playsInline);
  setMaturePreviewVisibility(false,false);await wait();check('Mature off removes open video',!document.querySelector('.bv-hover-preview video'));
  check('Mature off removes focus eligibility',anchor().getAttribute('tabindex')===null);
  setMaturePreviewVisibility(true,false);await wait();anchor().blur();anchor().focus();await wait(30);root.unmount();await wait(550);
  check('unmount cancels pending hover and removes media',!document.querySelector('.bv-hover-preview'));
  const mediaRoot=createRoot(container);
  const renderMedia=(src:string,active=false)=>flushSync(()=>mediaRoot.render(<MediaPreview src={src} mediaType="video" label="Synthetic" active={active}/>));
  renderMedia('data:video/mp4;base64,AAAA');
  const card=container.querySelector('video')!;
  check('card video stays metadata-only without autoplay',card.preload==='metadata'&&!card.autoplay&&!!container.querySelector('.bv-media-preview-badge'));
  renderMedia('data:video/mp4;base64,AAAA',true);
  const active=container.querySelector('video')!;
  check('active video attributes are muted inline looping autoplay',active.muted&&active.loop&&active.playsInline&&active.autoplay);
  flushSync(()=>active.dispatchEvent(new Event('error')));
  check('media error is visible and removes failed video',!!container.querySelector('.bv-media-preview-error')&&!container.querySelector('video'));
  renderMedia('data:video/mp4;base64,BBBB');check('source B resets error',!!container.querySelector('video'));
  renderMedia('data:video/mp4;base64,AAAA');check('return to source A resets error',!!container.querySelector('video'));
  mediaRoot.unmount();check('media unmount removes video',!container.querySelector('video'));
  report.status='passed';report.mediaBoundary='synthetic invalid video URI tests DOM/lifecycle; decoding/playback not claimed';
 }catch(error){report.status='failed';report.error=String(error);report.stack=(error as Error).stack;try{root.unmount()}catch{}}
 finally{window.fetch=previousFetch;setMaturePreviewVisibility(false,false);loraCatalogClient.invalidate();}
 result.textContent=JSON.stringify(report,null,2);(window as any).__loraPreviewResult=report;
};button.disabled=false;result.textContent='Ready';

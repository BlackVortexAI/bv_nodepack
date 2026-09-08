import React from 'react';
import {nativeGlobalLoraChecks} from './global_lora_graph';
import {loraRegistryResources} from '../../ui/src/regional/loraV3Graph';
import {LoraV3ScopePicker} from '../../ui/src/regional/LoraV3ResourcePickerPanel';
import {LoraCatalogLibraryWindow} from '../../ui/src/regional/LoraCatalogLibraryWindow';
import {LoraRegistrySourcesPanel} from '../../ui/src/regional/LoraRegistrySourcesPanel';
import {emptyLoraV3Config} from '../../ui/src/regional/loraV3Config';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {LoraRegistryNodeView} from '../../ui/src/regional/LoraRegistryNodeView';
import {emptyLoraRegistryConfig,newLoraRegistryStack,parseLoraRegistryConfig,serializeLoraRegistryConfig,newLoraRegistryEntry} from '../../ui/src/regional/loraRegistryConfig';
const result=document.querySelector('#result')!;
const button=document.querySelector<HTMLButtonElement>('#run')!;
button.onclick=async()=>{
 const report:any={status:'running',checks:[],boundary:'Real browser DOM, production BVUI; no Comfy queue or GPU'};
 const check=(name:string,pass:unknown)=>report.checks.push({name,pass:!!pass});
 const mount=document.querySelector('#mount')!;const root=createRoot(mount);
 try{
 let config=emptyLoraRegistryConfig();
 const globals=()=>config.stacks.filter((s:any)=>s.role==='global');
 check('new registry has exactly one automatic global stack',globals().length===1);
 check('automatic global starts empty',globals().length===1&&globals()[0].entries.length===0);
 const render=()=>flushSync(()=>root.render(<LoraRegistryNodeView stored={serializeLoraRegistryConfig(config)} onStored={value=>{config=parseLoraRegistryConfig(value);render()}} onOpenLibrary={()=>{}}/>));
 render();
 check('node displays explicit automatic global label',mount.textContent?.includes('Global · Automatically applied'));
 check('node explains additive regional behavior',mount.textContent?.includes('Applied to the entire generation. Regional stacks are added on top.'));
 const toggle=mount.querySelector<HTMLButtonElement>('[role="switch"]');
 if(toggle&&globals().length){toggle.click();check('native click disables global stack',!globals()[0].enabled);toggle.click();check('native click enables global stack',globals()[0].enabled)}
 else check('global switch exists',false);
 config.stacks.push(newLoraRegistryStack('Regional costume'));
 if(globals()[0])globals()[0].entries.push(newLoraRegistryEntry('synthetic.safetensors'),newLoraRegistryEntry('synthetic.safetensors'));
 const before=serializeLoraRegistryConfig(config);
 for(let i=0;i<3;i++)config=parseLoraRegistryConfig(serializeLoraRegistryConfig(config));
 render();check('three serialization reloads preserve exact inventory',serializeLoraRegistryConfig(config)===before);
 check('reload retains deliberate duplicate occurrences',globals()[0]?.entries.length===2&&globals()[0]?.entries[0].id!==globals()[0]?.entries[1].id);
 check('normal stack remains displayed',mount.textContent?.includes('Regional costume'));
  if(globals()[0]){
  const entries=mount.querySelectorAll<HTMLButtonElement>('[role="switch"][aria-label="synthetic"]');
  entries[0]?.click();check('individual entry disable preserves intentional duplicate',globals()[0].entries[0].enabled===false&&globals()[0].entries[1].enabled===true);
 }
 const regional=config.stacks.find(s=>s.name==='Regional costume')!;
 const resources=loraRegistryResources({comfyClass:'BV LoRA Registry',widgets:[{name:'config_json',value:serializeLoraRegistryConfig(config)}]})??[];
 for(const target of [{scope:'global' as const},{scope:'region' as const,document_id:'fixture-document',region_id:'fixture-region'}]){
  flushSync(()=>root.render(<LoraV3ScopePicker collectors={[{id:config.registry_id,label:'Registry',resources}]} config={{version:3,entries:[{id:'fixture-entry',source:{kind:'external',collector_id:config.registry_id,resource_id:regional.id},targets:[target]}]}} target={target} resolved onSelection={()=>{}} onAdd={()=>{}} onRemove={()=>{}}/>));
  flushSync(()=>mount.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')?.click());
  const choices=Array.from(document.querySelectorAll('[role="option"]')).map(o=>o.textContent);
  check(`${target.scope} prompt actual picker keeps regional choice`,choices.includes('Regional costume'));
  check(`${target.scope} prompt actual picker excludes automatic Global`,!choices.some(label=>label?.includes('Global')));
  flushSync(()=>root.render(null));
 }
 const item:any={name:'fixture.safetensors',display_name:'Synthetic multipass LoRA',base_model:'Krea 2',tags:[],trigger_words:[],author:'',description:'Synthetic local fixture',size:1,preview_url:null,preview_safe:true,metadata_sources:[],type:'LoRA',category:'',directory:'',civitai_url:'https://civitai.com/models/123?modelVersionId=456',compatibility:{status:'multipass',family:'krea2',reason:'Global time layers require regional multipass.',target_model:'unknown'}};
 let added:any=null;
 const library=(value:any)=>flushSync(()=>root.render(<LoraCatalogLibraryWindow catalog={{schema:'bv.lora_catalog',version:1,items:[value]}} stacks={config.stacks} stateKey={crypto.randomUUID()} targetStackId={regional.id} onTargetStack={()=>{}} onAdd={(name,target)=>{added={name,target};return true}} onClose={()=>{}}/>));
 library(item);
 check('catalog explicitly offers regional multipass',mount.textContent?.includes('Multipass'));
 check('catalog target model remains honestly Unknown',mount.textContent?.includes('Exact target-model compatibility is checked at execution.'));
 const link=mount.querySelector<HTMLAnchorElement>('a');
 check('catalog uses exact supplied Civitai URL',link?.href===item.civitai_url&&link.rel.includes('noopener'));
 flushSync(()=>Array.from(mount.querySelectorAll('button')).find(b=>b.textContent==='Add')?.click());
 check('multipass Add preserves regional target and never silently moves Global',added?.target===regional.id&&added?.name===item.name);
 for(const url of ['javascript:alert(1)','https://civitai.com.evil.test/models/123','https://evil.test/models/123']){
  flushSync(()=>root.render(null));library({...item,civitai_url:url,compatibility:{status:'unknown'}});
  check(`catalog rejects untrusted link ${url}`,!mount.querySelector('a'));
  check('unknown compatibility is visible',mount.textContent?.includes('Not checked'));
 }
 flushSync(()=>root.render(null));
 await nativeGlobalLoraChecks(check,(node,id)=>{
  let selected:any=emptyLoraV3Config();
  const renderSources=()=>flushSync(()=>root.render(<LoraRegistrySourcesPanel node={node} config={selected} onConfig={value=>{selected=value;renderSources()}}/>));
  renderSources();
  check('Registry source panel explains automatic Global with optional regional stacks',mount.textContent?.includes('Connected Registries apply their Global LoRAs automatically.'));
  flushSync(()=>mount.querySelector<HTMLButtonElement>('[aria-label="Connect LoRA Registry"]')?.click());
  const option=Array.from(document.querySelectorAll<HTMLButtonElement>('[role="option"]')).find(el=>el.textContent?.includes('Synthetic Registry'));
  check('actual Registry selector offers global-only Registry',!!option);
  flushSync(()=>option?.click());
  if(!selected.registry_ids?.includes(id))report.providerDiagnostic={selected,expected:id,text:mount.textContent};
  check('actual Registry selector click persists dependency without manual entries',selected.registry_ids?.includes(id)&&selected.entries.length===0);
  flushSync(()=>root.render(null));
 });
 report.status=report.checks.every((c:any)=>c.pass)?'passed':'failed';
 }catch(error){report.status='failed';report.error=String(error);report.stack=(error as Error).stack}
 finally{root.unmount()}
 result.textContent=JSON.stringify({...report,total:report.checks.length,passed:report.checks.filter((c:any)=>c.pass).length,checks:report.checks.filter((c:any)=>!c.pass)},null,2);(window as any).__globalLoraResult=report;
};button.disabled=false;result.textContent='Ready';

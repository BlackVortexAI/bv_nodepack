import React from 'react';
import {runExclusiveGraphChecks} from './exclusive_global_graph_checks';
import {runVisibleRegistryChecks} from './exclusive_global_visible';
import {GlobalLoraApplyControl} from '../../ui/src/regional/GlobalLoraApplyControl';
import {readNodeLoraV3Config} from '../../ui/src/regional/loraV3Ui';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import OptionsPanel from '../../ui/src/regional/OptionsPanel';
import {applyBvTheme} from '../../ui/src/ui/theme';
applyBvTheme();
const root=createRoot(document.querySelector('#mount')!);
const props:any={mode:'document',region:null,layer:null,bounds:null,canvas:{width:1024,height:1024},globalPrompts:{positive:'Synthetic global scene',negative:''},backgroundPrompts:{positive:'',negative:''},negativeMode:'auto',onNegativeMode:()=>{},onGlobalPrompts:()=>{},onBackgroundPrompts:()=>{},onRegion:()=>{},automaticRegionColor:null,onLayerBounds:()=>{},onBrushSetting:()=>{},promptSections:{global:true,background:false,region:false},onPromptSection:()=>{},loraBindings:{schema:'bv.regional.lora_bindings',version:1,document_id:'fixture',global_stack_id:null,regions:{}},loraStacks:[],onGlobalLoraStack:()=>{},onRegionLoraStack:()=>{},referenceChoices:[],globalTools:[],regionTools:[],onGlobalTools:()=>{},onRegionTools:()=>{}};
flushSync(()=>root.render(<OptionsPanel {...props}/>));
document.querySelector<HTMLButtonElement>('#run')!.onclick=async()=>{
 const checks:any[]=[];const check=(name:string,pass:unknown)=>checks.push({name,pass:!!pass});const report:any={status:'running',checks,boundary:'Production OptionsPanel/control/registry store and provider reconciliation; detached native graphs and synthetic DOM widget bridge'};
 try{
 await runVisibleRegistryChecks(check,document.querySelector<HTMLElement>('#nodes')!);
 await runExclusiveGraphChecks(check,async(first,second)=>{
  let configs=[readNodeLoraV3Config(first),readNodeLoraV3Config(second)];const before=JSON.stringify(configs[0].entries);
  const render=()=>flushSync(()=>root.render(<div style={{display:'flex',gap:20}}>{[first,second].map((node,index)=><section key={index} data-editor={index} style={{width:380}}><OptionsPanel {...props} globalLoraApplyControl={<GlobalLoraApplyControl node={node} config={configs[index]} onConfig={next=>{configs[index]=next;render()}}/>}/></section>)}</div>));
  render();const editors=Array.from(document.querySelectorAll<HTMLElement>('[data-editor]'));
  const control=(index:number)=>editors[index].querySelector<HTMLInputElement>('input[type="checkbox"][aria-label="Globalen Stack anwenden"]')??Array.from(editors[index].querySelectorAll<HTMLInputElement>('input[type="checkbox"]')).find(el=>el.closest('label')?.textContent?.includes('Globalen Stack anwenden'));
  check('both editors default to checked Global application',control(0)?.checked&&control(1)?.checked);
  const label=Array.from(editors[0].querySelectorAll('label')).find(el=>el.textContent?.includes('Globalen Stack anwenden')),global=Array.from(editors[0].querySelectorAll('button')).find(el=>el.textContent==='Global');
  check('compact checkbox appears directly above Global prompt',label&&global&&!!(label.compareDocumentPosition(global)&Node.DOCUMENT_POSITION_FOLLOWING)&&label.getBoundingClientRect().bottom<=global.getBoundingClientRect().top+2&&global.getBoundingClientRect().top-label.getBoundingClientRect().bottom<35);
  check('editor has no Registry source names or IDs or SourcesPanel',editors.every(el=>!el.textContent?.includes('LoRA Registry connections')&&!el.textContent?.includes('Connect LoRA Registry')&&!el.textContent?.includes('Visible Registry')));
  control(0)?.click();await new Promise(r=>setTimeout(r,80));
  check('real checkbox changes only first editor optout',configs[0].apply_global===false&&configs[1].apply_global!==false&&!control(0)?.checked&&control(1)?.checked);
  check('real checkbox preserves manual stack entries',JSON.stringify(configs[0].entries)===before);
 });
 report.status=checks.every(c=>c.pass)?'passed':'failed';
 }catch(error){report.status='failed';report.error=String(error);report.stack=(error as Error).stack}
 report.total=checks.length;report.passed=checks.filter(c=>c.pass).length;report.checks=checks.filter(c=>!c.pass);document.querySelector('#result')!.textContent=JSON.stringify(report,null,2);
};

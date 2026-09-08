import {exclusiveNativeRuntime} from './exclusive_global_native';
import {installLoraRegistryUi} from '../../ui/src/regional/loraRegistryUi';
import {emptyLoraRegistryConfig,serializeLoraRegistryConfig,parseLoraRegistryConfig,freshenLoraRegistryIdentities} from '../../ui/src/regional/loraRegistryConfig';
export async function runVisibleRegistryChecks(check:(name:string,pass:unknown)=>void,mount:HTMLElement){
 const {LGraphNode,LiteGraph,createGraph}=await exclusiveNativeRuntime();
 class Registry extends LGraphNode{
  constructor(){super('Visible Registry');this.comfyClass='BV LoRA Registry';this.serialize_widgets=true;const cfg=emptyLoraRegistryConfig();cfg.stacks.find(s=>s.role==='global')!.enabled=false;this.addWidget('text','config_json',serializeLoraRegistryConfig(cfg),()=>{})}
  addDOMWidget(name:string,_type:string,host:HTMLElement,options:any){const section=document.createElement('section');section.dataset.fixtureNode=String(this.id);section.appendChild(host);mount.appendChild(section);return this.addWidget('text',name,'',()=>{},options)}
 }
 const savedFetch=window.fetch;window.fetch=async()=>({ok:true,json:async()=>({schema:'bv.lora_catalog',version:1,items:[]})} as Response);
 try{
 installLoraRegistryUi(Registry,{name:'BV LoRA Registry'},{apiURL:(p:string)=>p});LiteGraph.registerNodeType('BV LoRA Registry',Registry);
 const graph=createGraph(),a=LiteGraph.createNode('BV LoRA Registry'),b=LiteGraph.createNode('BV LoRA Registry');graph.add(a);graph.add(b);await new Promise(r=>setTimeout(r,150));
 const state=(node:any)=>parseLoraRegistryConfig(node.widgets.find((w:any)=>w.name==='config_json').value).stacks.find(s=>s.role==='global')!.enabled;
 const switches=()=>Array.from(mount.querySelectorAll<HTMLButtonElement>('[role="switch"][aria-label="Global stack"]'));
 check('both production native Registry views visibly mounted',switches().length===2);
 switches()[0]?.click();await new Promise(r=>setTimeout(r,80));check('first visible switch activation shows checked state',switches()[0]?.getAttribute('aria-checked')==='true'&&state(a));
 switches()[1]?.click();await new Promise(r=>setTimeout(r,80));check('peer visible switch refreshes after exclusive activation',switches()[0]?.getAttribute('aria-checked')==='false'&&switches()[1]?.getAttribute('aria-checked')==='true'&&!state(a)&&state(b));
 const copy=LiteGraph.createNode('BV LoRA Registry');copy.widgets.find((w:any)=>w.name==='config_json').value=serializeLoraRegistryConfig(freshenLoraRegistryIdentities(parseLoraRegistryConfig(b.widgets.find((w:any)=>w.name==='config_json').value)));graph.add(copy);await new Promise(r=>setTimeout(r,100));
 check('copied active Registry shows explicit visible conflict',mount.textContent?.includes('Multiple active Global Registries')&&state(copy)&&state(b));
 switches()[2]?.click();await new Promise(r=>setTimeout(r,60));switches()[2]?.click();await new Promise(r=>setTimeout(r,80));
 check('explicit conflict resolution refreshes all visible switches',switches()[0]?.getAttribute('aria-checked')==='false'&&switches()[1]?.getAttribute('aria-checked')==='false'&&switches()[2]?.getAttribute('aria-checked')==='true');
 check('resolved conflict removes warning from all Registry views',!mount.textContent?.includes('Multiple active Global Registries'));
 graph.remove(a);graph.remove(b);graph.remove(copy);await Promise.resolve();check('Registry removal disposes visible React hosts',mount.querySelectorAll('[data-bv-node-widget]').length===0);
 }finally{window.fetch=savedFetch;mount.replaceChildren()}
}

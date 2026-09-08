import {exclusiveNativeRuntime} from './exclusive_global_native';
import {installLoraRegistryUi} from '../../ui/src/regional/loraRegistryUi';
import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry,parseLoraRegistryConfig,serializeLoraRegistryConfig} from '../../ui/src/regional/loraRegistryConfig';
import {storeLoraRegistryInventory} from '../../ui/src/regional/loraV3Inventory';
import {configurePresentationSizeLifecycle} from '../../ui/src/regional/presentationSize';
const wait=()=>new Promise(r=>setTimeout(r,180));
export async function registryUxNative(check:(name:string,pass:unknown,detail?:unknown)=>void,mount:HTMLElement){
 const {LGraphNode,LiteGraph,createGraph}=await exclusiveNativeRuntime();
 let resizing:any=null;configurePresentationSizeLifecycle({isUserResizing:node=>node===resizing});
 class Registry extends LGraphNode{
  fixtureHost?:HTMLElement;
  constructor(){super('Synthetic Registry');this.comfyClass='BV LoRA Registry';this.serialize_widgets=true;this.size=[360,180];this.addWidget('text','config_json',serializeLoraRegistryConfig(emptyLoraRegistryConfig()),()=>{})}
  addDOMWidget(name:string,_type:string,host:HTMLElement,options:any){this.fixtureHost=host;host.style.width=`${this.size[0]}px`;mount.appendChild(host);const widget=this.addWidget('text',name,'',()=>{},options);widget.computeSize=(width:number)=>[width,options.getMinHeight()];widget.element=host;return widget}
  setSize(size:any){const value=super.setSize(size);if(this.fixtureHost){this.fixtureHost.style.width=`${this.size[0]}px`;this.fixtureHost.style.height=`${Math.max(72,this.size[1]-70)}px`}return value}
 }
 const previous=window.fetch;window.fetch=async()=>({ok:true,json:async()=>({schema:'bv.lora_catalog',version:1,items:[]})} as Response);
 try{
  installLoraRegistryUi(Registry,{name:'BV LoRA Registry'},{apiURL:(path:string)=>path});LiteGraph.registerNodeType('BV LoRA Registry',Registry);
  const graph=createGraph(),node=LiteGraph.createNode('BV LoRA Registry');graph.add(node);await wait();const originalHeight=node.size[1];
  const widget=node.widgets.find((w:any)=>w.name==='config_json');const content=()=>node.fixtureHost.querySelector('.bv-react-node-widget-content') as HTMLElement;
  const stored=parseLoraRegistryConfig(widget.value);stored.stacks[0].entries.push(...Array.from({length:3},(_,i)=>newLoraRegistryEntry(`global-${i}.safetensors`)));const stack=newLoraRegistryStack('Regional style');stack.entries.push(...Array.from({length:5},(_,i)=>newLoraRegistryEntry(`regional-${i}.safetensors`)));stored.stacks.push(stack);
  const write=()=>storeLoraRegistryInventory(node,widget,serializeLoraRegistryConfig(stored),()=>{});
  write();await wait();const grown=node.size[1];
  check('native Registry grows when two stacks gain entries',grown>originalHeight,{originalHeight,grown});
  check('automatic total node height remains approximately 440 cap',grown>=350&&grown<=460,{grown,widgetMin:node.widgets.find((w:any)=>w.name==='lora_registry_widget').options.getMinHeight()});
  check('content over cap scrolls instead of unbounded growth',content().scrollHeight>content().clientHeight,{scroll:content().scrollHeight,client:content().clientHeight});
  const resize=(width:number,height:number)=>{resizing=node;node.setSize([width,height]);resizing=null};
  resize(520,300);stored.stacks[1].entries.push(newLoraRegistryEntry('extra.safetensors'));write();await wait();
  check('manual smaller height and explicit width survive content refresh',node.size[0]===520&&node.size[1]===300,{size:[...node.size]});
  resize(560,700);stored.stacks[1].entries.pop();write();await wait();
  check('manual larger height above automatic cap is retained',node.size[0]===560&&node.size[1]===700,{size:[...node.size]});
  check('manual larger node exposes more content than automatic cap',content().clientHeight>340,{client:content().clientHeight,scroll:content().scrollHeight});
  const snapshot=graph.serialize();graph.configure(snapshot);await wait();const restored=graph.getNodeById(node.id);check('manual height and width survive native save reload',restored.size[0]===560&&restored.size[1]===700,{size:[...restored.size]});
  graph.clear();await wait();
 }finally{window.fetch=previous;configurePresentationSizeLifecycle({});mount.replaceChildren()}
}

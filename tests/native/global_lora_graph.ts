import {emptyLoraRegistryConfig,newLoraRegistryStack,newLoraRegistryEntry,parseLoraRegistryConfig,serializeLoraRegistryConfig} from '../../ui/src/regional/loraRegistryConfig';
import {loraRegistryResources,linkedLocalLoraCollectors} from '../../ui/src/regional/loraV3Graph';
import {commitLoraV3Config,readNodeLoraV3Config,installLoraV3ConsumerSlot} from '../../ui/src/regional/loraV3Ui';
import {activateDgReceiver} from '../../ui/src/regional/dgRouting';
import {app as detachedApp} from './global_lora_app';
export async function nativeGlobalLoraChecks(check:(name:string,pass:unknown)=>void,onProvider?:(node:any,id:string)=>void){
 const vueUrl='/native/assets/vendor-vue-core-BZZQdWHo.js',nativeUrl='/native/assets/settingStore-CwkLtSKP.js';
 const vue:any=await import(/* @vite-ignore */vueUrl);const app=vue.g({render(){return null}});app.use(vue.l());
 const native:any=await import(/* @vite-ignore */nativeUrl);
 const values:any[]=Object.values(native),LGraph=values.find(v=>typeof v==='function'&&v.name==='LGraph'),LGraphNode=values.find(v=>typeof v==='function'&&v.name==='LGraphNode'),LiteGraph=values.find(v=>v&&typeof v.registerNodeType==='function'&&typeof v.createNode==='function'),SubgraphNode=values.find(v=>typeof v==='function'&&v.prototype?.isSubgraphNode?.());
 check('actual native graph and subgraph available',LGraph&&LGraphNode&&SubgraphNode&&LiteGraph);
 const contract=await(await fetch('/repo/.tmp/native-conditioning-contract.json')).json();
 check('actual backend retains positive0 negative1 and appends patched_model2',JSON.stringify(contract.return_names)===JSON.stringify(['positive','negative','patched_model']));
 check('actual backend optional MODEL follows legacy registry and bindings',JSON.stringify(Object.keys(contract.inputs.optional))===JSON.stringify(['lora_registry','lora_bindings','model']));
 const createGraph=()=>{const g=new LGraph();g.events.addEventListener('subgraph-created',(event:any)=>{const sub=event.detail.subgraph;class Bound extends SubgraphNode{constructor(){super(g,sub,{id:-1,type:sub.id,pos:[0,0],size:[200,100],flags:{},order:0,mode:0})}}LiteGraph.registerNodeType(sub.id,Bound)});return g};
 class Registry extends LGraphNode{
  constructor(){super('Synthetic Registry');this.comfyClass='BV LoRA Registry';this.serialize_widgets=true;this.addWidget('text','config_json',serializeLoraRegistryConfig(emptyLoraRegistryConfig()),()=>{});this.addOutput('fixture','STRING')}
  onConfigure(){this.widgets[0].value=serializeLoraRegistryConfig(parseLoraRegistryConfig(this.widgets[0].value))}
 }
 class Consumer extends LGraphNode{constructor(){super('Synthetic Consumer');this.addInput('fixture','STRING')}}
 LiteGraph.registerNodeType('BV Test Global Registry',Registry);LiteGraph.registerNodeType('BV Test Global Consumer',Consumer);
 let graph=createGraph();const registry=LiteGraph.createNode('BV Test Global Registry'),consumer=LiteGraph.createNode('BV Test Global Consumer');graph.add(registry);graph.add(consumer);registry.connect(0,consumer,0);
 const config=emptyLoraRegistryConfig(),global=config.stacks.find((s:any)=>s.role==='global'),regional=newLoraRegistryStack('Regional costume');config.stacks.push(regional);
 if(global)global.entries.push(newLoraRegistryEntry('fixture.safetensors'),newLoraRegistryEntry('fixture.safetensors'));
 registry.widgets[0].value=serializeLoraRegistryConfig(config);const stable=(value:any):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);const canonical=stable(config);
 const inspect=(node:any,label:string)=>{const parsed=parseLoraRegistryConfig(node.widgets[0].value);check(`${label}: exact inventory and occurrence IDs survive`,stable(parsed)===canonical);check(`${label}: exactly one global`,parsed.stacks.filter((s:any)=>s.role==='global').length===1);check(`${label}: picker exposes normal stack only`,JSON.stringify(loraRegistryResources(node)?.map(r=>r.id))===JSON.stringify([regional.id]));check(`${label}: native output object retained`,typeof node.outputs[0].toJSON==='function')};
 inspect(registry,'root');const rid=registry.id;
 const reload=()=>{const saved=JSON.parse(JSON.stringify(graph.serialize()));graph=createGraph();graph.configure(saved)};
 for(let i=0;i<3;i++){reload();inspect(graph.getNodeById(rid),`root reload ${i}`)}
 let current=graph.getNodeById(rid);const converted=graph.convertToSubgraph(new Set([current]));let host=converted.node;const hid=host.id;
 const copyData=JSON.parse(JSON.stringify(host.serialize()));copyData.id=-1;for(const p of copyData.outputs??[])p.links=null;for(const p of copyData.inputs??[])p.link=null;const copy=new SubgraphNode(graph,host.subgraph,copyData);graph.add(copy);const cid=copy.id;
 for(let i=0;i<3;i++){reload();host=graph.getNodeById(hid);const second=graph.getNodeById(cid);check(`shared reload ${i}: both hosts share exact definition`,host.subgraph===second.subgraph);inspect(host.subgraph._nodes.find((n:any)=>n.type==='BV Test Global Registry'),`shared reload ${i}`)}
 const nested=graph.convertToSubgraph(new Set([graph.getNodeById(hid)]));const nid=nested.node.id;
 for(let i=0;i<3;i++){reload();const outer=graph.getNodeById(nid),inner=outer.subgraph._nodes.find((n:any)=>n.isSubgraphNode?.());inspect(inner.subgraph._nodes.find((n:any)=>n.type==='BV Test Global Registry'),`nested reload ${i}`)}
 const outer=graph.getNodeById(nid),inner=outer.subgraph._nodes.find((n:any)=>n.isSubgraphNode?.()),reg=inner.subgraph._nodes.find((n:any)=>n.type==='BV Test Global Registry');
 const before=reg.outputs[0];reg.disconnectOutput(0);check('disconnect preserves native output identity',reg.outputs[0]===before);const savedReg=JSON.parse(JSON.stringify(reg.serialize()));inner.subgraph.remove(reg);const restored=LiteGraph.createNode('BV Test Global Registry');inner.subgraph.add(restored);restored.configure(savedReg);inspect(restored,'remove and readd');
 let legacy=true;
 class Conditioning extends LGraphNode{constructor(){super('Native Conditioning contract fixture');for(const [name,spec] of Object.entries({...contract.inputs.required,...contract.inputs.optional}) as any){if(typeof spec[0]==='string'&&!['FLOAT','INT','STRING','BOOLEAN'].includes(spec[0])&&(!legacy||name!=='model'))this.addInput(name,spec[0])}contract.return_names.forEach((name:string,i:number)=>{if(!legacy||i<2)this.addOutput(name,contract.return_types[i])})}}
 class Sink extends LGraphNode{constructor(){super('Sampler contract fixture');this.addInput('positive','CONDITIONING');this.addInput('negative','CONDITIONING');this.addInput('model','MODEL')}}
 LiteGraph.registerNodeType('BV Test Native Conditioning',Conditioning);LiteGraph.registerNodeType('BV Test Sampler',Sink);
 graph=createGraph();const conditioning=LiteGraph.createNode('BV Test Native Conditioning'),sink=LiteGraph.createNode('BV Test Sampler');graph.add(conditioning);graph.add(sink);conditioning.connect(0,sink,0);conditioning.connect(1,sink,1);
 const conditioningId=conditioning.id,sinkId=sink.id;legacy=false;reload();
 const upgraded=graph.getNodeById(conditioningId);check('native old snapshot retains legacy input order and appended MODEL',JSON.stringify(upgraded.inputs.map((p:any)=>p.name))===JSON.stringify(['regional','clip','lora_registry','lora_bindings','model']));
 check('native old snapshot retains original output names and MODEL tail',JSON.stringify(upgraded.outputs.map((p:any)=>p.name))===JSON.stringify(contract.return_names));upgraded.connect(2,graph.getNodeById(sinkId),2);
 const inspectConditioning=(node:any,label:string)=>{check(`${label}: output order remains backend order`,JSON.stringify(node.outputs.map((p:any)=>p.name))===JSON.stringify(contract.return_names));check(`${label}: MODEL input stays after existing ports`,node.inputs[4]?.name==='model'&&node.inputs[2]?.name==='lora_registry'&&node.inputs[3]?.name==='lora_bindings');check(`${label}: output slots are native instances`,node.outputs.every((p:any)=>typeof p.toJSON==='function'));const owner=node.graph;for(let i=0;i<3;i++){const id=node.outputs[i].links?.[0],link=owner._links?.get(id)??owner.links?.get?.(id);check(`${label}: linked backend output ${i} retained`,link?.origin_slot===i)}};
 for(let i=0;i<3;i++){reload();inspectConditioning(graph.getNodeById(conditioningId),`conditioning root reload ${i}`)}
 const convertedCondition=graph.convertToSubgraph(new Set([graph.getNodeById(conditioningId)])),conditionHostId=convertedCondition.node.id;
 for(let i=0;i<3;i++){reload();inspectConditioning(graph.getNodeById(conditionHostId).subgraph._nodes.find((n:any)=>n.type==='BV Test Native Conditioning'),`conditioning nested reload ${i}`)}
 class Writer extends LGraphNode{constructor(){super('Automatic Global consumer fixture');this.comfyClass='BV Regional LoRA';this.serialize_widgets=true;this.properties.bvRegistryDgVersion=1;this.addWidget('text','config_json','{"version":3,"entries":[]}',()=>{})}}
 LiteGraph.registerNodeType('BV Test Automatic Writer',Writer);
 graph=createGraph();detachedApp.graph=graph;const automatic=LiteGraph.createNode('BV Test Global Registry'),writer=LiteGraph.createNode('BV Test Automatic Writer');graph.add(automatic);graph.add(writer);activateDgReceiver(writer);
 const autoConfig=emptyLoraRegistryConfig(),autoRegistryId=autoConfig.registry_id;automatic.widgets[0].value=serializeLoraRegistryConfig(autoConfig);
 onProvider?.(writer,autoRegistryId);
 const selection:any={version:3,entries:[],steps:[],registry_ids:[autoRegistryId]};commitLoraV3Config(writer,selection);await new Promise(r=>setTimeout(r,120));
 check('auto-only registry selection survives actual production config parser',JSON.stringify((readNodeLoraV3Config(writer) as any).registry_ids)===JSON.stringify([autoRegistryId]));
 check('production reconciliation links auto-only Registry without manual entries',linkedLocalLoraCollectors(writer).includes(automatic));
 const automaticId=automatic.id,writerId=writer.id;
 for(let i=0;i<3;i++){reload();detachedApp.graph=graph;const w=graph.getNodeById(writerId);activateDgReceiver(w);installLoraV3ConsumerSlot(w);await new Promise(r=>setTimeout(r,120));check(`auto-only reload ${i}: production reconciliation preserves Registry link`,linkedLocalLoraCollectors(w).includes(graph.getNodeById(automaticId)));check(`auto-only reload ${i}: no manual stack selection invented`,readNodeLoraV3Config(w).entries.length===0);check(`auto-only reload ${i}: registry ID preserved`,JSON.stringify((readNodeLoraV3Config(w) as any).registry_ids)===JSON.stringify([autoRegistryId]));}
}

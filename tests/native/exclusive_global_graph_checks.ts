import {emptyLoraRegistryConfig,parseLoraRegistryConfig,serializeLoraRegistryConfig,freshenLoraRegistryIdentities,newLoraRegistryStack} from '../../ui/src/regional/loraRegistryConfig';
import {commitLoraV3Config,readNodeLoraV3Config,installLoraV3ConsumerSlot} from '../../ui/src/regional/loraV3Ui';
import {linkedLocalLoraCollectors} from '../../ui/src/regional/loraV3Graph';
import {activateDgReceiver} from '../../ui/src/regional/dgRouting';
import {app} from './global_lora_app';
import {workflowGlobalLoraSelection} from '../../ui/src/regional/loraGlobalRegistry';
import {storeLoraRegistryInventory,installLoraRegistryInventorySource} from '../../ui/src/regional/loraV3Inventory';
import {exclusiveNativeRuntime} from './exclusive_global_native';
export async function runExclusiveGraphChecks(check:(name:string,pass:unknown)=>void,onEditors?:(first:any,second:any)=>Promise<void>){
 const {LGraphNode,LiteGraph,SubgraphNode,createGraph}=await exclusiveNativeRuntime();
 class Registry extends LGraphNode{constructor(){super('Exclusive Registry fixture');this.comfyClass='BV LoRA Registry';this.serialize_widgets=true;const config=emptyLoraRegistryConfig();config.stacks.find(s=>s.role==='global')!.enabled=false;this.addWidget('text','config_json',serializeLoraRegistryConfig(config),()=>{});}}
 installLoraRegistryInventorySource(Registry);
 LiteGraph.registerNodeType('BV Test Exclusive Registry',Registry);
 let graph=createGraph();const a=LiteGraph.createNode('BV Test Exclusive Registry'),b=LiteGraph.createNode('BV Test Exclusive Registry');graph.add(a);graph.add(b);const aid=a.id,bid=b.id;
 const set=(node:any,enabled:boolean)=>{const config=parseLoraRegistryConfig(node.widgets[0].value);config.stacks.find(s=>s.role==='global')!.enabled=enabled;storeLoraRegistryInventory(node,node.widgets[0],serializeLoraRegistryConfig(config),()=>{})};
 const read=(node:any)=>parseLoraRegistryConfig(node.widgets[0].value).stacks.find(s=>s.role==='global')!.enabled;
 const reload=async()=>{const saved=JSON.parse(JSON.stringify(graph.serialize()));graph=createGraph();graph.configure(saved);await Promise.resolve();};
 set(a,true);check('root explicit first switch selects one global',workflowGlobalLoraSelection(a).active.length===1&&read(a)&&!read(b));
 set(b,true);check('root explicit second switch deactivates first',workflowGlobalLoraSelection(b).active.length===1&&!read(a)&&read(b));
 for(let i=0;i<3;i++){await reload();check(`root reload ${i} retains exclusive choice`,!read(graph.getNodeById(aid))&&read(graph.getNodeById(bid))&&!workflowGlobalLoraSelection(graph.getNodeById(aid)).conflict)}
 const conversion=graph.convertToSubgraph(new Set([graph.getNodeById(bid)]));const hid=conversion.node.id;
 const inner=()=>graph.getNodeById(hid).subgraph._nodes.find((n:any)=>n.comfyClass==='BV LoRA Registry');
 set(graph.getNodeById(aid),true);check('root switch disables nested active registry',!read(inner())&&read(graph.getNodeById(aid)));
 set(inner(),true);check('nested switch disables root active registry',read(inner())&&!read(graph.getNodeById(aid)));
 const data=JSON.parse(JSON.stringify(graph.getNodeById(hid).serialize()));data.id=-1;const shared=new SubgraphNode(graph,graph.getNodeById(hid).subgraph,data);graph.add(shared);const sid=shared.id;
 check('two shared hosts do not create false active Registry conflict',!workflowGlobalLoraSelection(inner()).conflict&&workflowGlobalLoraSelection(inner()).active.length===1);
 for(let i=0;i<3;i++){await reload();check(`nested/shared reload ${i} retains exclusive choice`,read(inner())&&!read(graph.getNodeById(aid))&&!workflowGlobalLoraSelection(inner()).conflict);check(`nested/shared reload ${i} retains shared definition`,graph.getNodeById(hid).subgraph===graph.getNodeById(sid).subgraph)}
 const copied=LiteGraph.createNode('BV Test Exclusive Registry');copied.widgets[0].value=serializeLoraRegistryConfig(freshenLoraRegistryIdentities(parseLoraRegistryConfig(inner().widgets[0].value)));graph.add(copied);
 check('copying active Registry reports conflict without silent winner',workflowGlobalLoraSelection(copied).conflict&&read(copied)&&read(inner()));
 const copyId=copied.id;await reload();check('copy conflict survives save/reload instead of arbitrary repair',workflowGlobalLoraSelection(graph.getNodeById(copyId)).conflict);
 set(graph.getNodeById(copyId),false);set(graph.getNodeById(copyId),true);
 check('explicit copied Registry switch resolves conflict exclusively',read(graph.getNodeById(copyId))&&!read(inner())&&!workflowGlobalLoraSelection(inner()).conflict);
 set(graph.getNodeById(copyId),false);check('disabling last Global allows zero active Registry',workflowGlobalLoraSelection(inner()).active.length===0);
 graph.remove(graph.getNodeById(copyId));check('removal preserves remaining Registry disabled state',!read(inner())&&!read(graph.getNodeById(aid)));
 class Writer extends LGraphNode{constructor(){super('Regional editor fixture');this.comfyClass='BV Regional Prompt';this.serialize_widgets=true;this.properties.bvRegistryDgVersion=1;this.addWidget('text','lora_v3_config_json','{"version":3,"entries":[],"steps":[]}',()=>{})}}
 LiteGraph.registerNodeType('BV Test Exclusive Writer',Writer);app.graph=graph;
 const first=LiteGraph.createNode('BV Test Exclusive Writer'),second=LiteGraph.createNode('BV Test Exclusive Writer');graph.add(first);graph.add(second);activateDgReceiver(first);activateDgReceiver(second);
 const manualRegistry=inner(),manualConfig=parseLoraRegistryConfig(manualRegistry.widgets[0].value),manualStack=newLoraRegistryStack('Manual regional');manualConfig.stacks.push(manualStack);manualRegistry.widgets[0].value=serializeLoraRegistryConfig(manualConfig);
 const config:any={version:3,entries:[{id:crypto.randomUUID(),source:{kind:'external',collector_id:manualConfig.registry_id,resource_id:manualStack.id},targets:[{scope:'global'}]}],steps:[]};
 set(graph.getNodeById(aid),true);commitLoraV3Config(first,config);commitLoraV3Config(second,config);await new Promise(r=>setTimeout(r,120));
 check('both editors default-on discover workflow Global automatically',linkedLocalLoraCollectors(first).includes(graph.getNodeById(aid))&&linkedLocalLoraCollectors(second).includes(graph.getNodeById(aid)));
 await onEditors?.(first,second);
 commitLoraV3Config(first,{...config,apply_global:false});await new Promise(r=>setTimeout(r,120));
 check('one editor optout removes automatic provider only',!linkedLocalLoraCollectors(first).includes(graph.getNodeById(aid))&&linkedLocalLoraCollectors(first).includes(manualRegistry));
 check('other editor stays opted in independently',linkedLocalLoraCollectors(second).includes(graph.getNodeById(aid))&&readNodeLoraV3Config(second).apply_global!==false);
 const firstId=first.id,secondId=second.id;
 for(let i=0;i<3;i++){await reload();app.graph=graph;for(const id of[firstId,secondId]){activateDgReceiver(graph.getNodeById(id));installLoraV3ConsumerSlot(graph.getNodeById(id))}await new Promise(r=>setTimeout(r,120));const f=graph.getNodeById(firstId),s=graph.getNodeById(secondId);check(`editor reload ${i} preserves independent optout`,readNodeLoraV3Config(f).apply_global===false&&readNodeLoraV3Config(s).apply_global!==false);check(`editor reload ${i} preserves manual entry verbatim`,JSON.stringify(readNodeLoraV3Config(f).entries)===JSON.stringify(config.entries));check(`editor reload ${i} keeps correct provider links`,!linkedLocalLoraCollectors(f).includes(graph.getNodeById(aid))&&linkedLocalLoraCollectors(f).includes(inner())&&linkedLocalLoraCollectors(s).includes(graph.getNodeById(aid)));}
 const deletedId=crypto.randomUUID(),f=graph.getNodeById(firstId),s=graph.getNodeById(secondId);
 commitLoraV3Config(f,{...config,apply_global:false,registry_ids:[deletedId]});commitLoraV3Config(s,{version:3,entries:[],steps:[],apply_global:false,registry_ids:[deletedId]});await new Promise(r=>setTimeout(r,120));
 check('obsolete deleted Registry selector is removed from Prompt config',!(readNodeLoraV3Config(f).registry_ids??[]).length&&!(readNodeLoraV3Config(s).registry_ids??[]).length);
 check('obsolete selector migration clears dependencies without manual stacks',!linkedLocalLoraCollectors(s).some(Boolean));
 check('obsolete selector migration preserves genuine manual dependency',JSON.stringify(readNodeLoraV3Config(f).entries)===JSON.stringify(config.entries)&&linkedLocalLoraCollectors(f).includes(inner()));
}

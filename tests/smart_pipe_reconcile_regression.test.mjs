import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
let sequence=0;
async function subject(){
 const file=new URL('../js/bv_smart_pipe.js',import.meta.url);
 const key=`__smartPipeReconcileRegression${++sequence}`;
 globalThis[key]={registerExtension(){}};
 let source=await readFile(file,'utf8');
 source=source.replace('import { app } from "../../scripts/app.js";',`const app=globalThis.${key};`).replace(/from "(\.\/[^\"]+)"/g,(_,path)=>`from ${JSON.stringify(new URL(path,file).href)}`);
 source+='\nexport {reconcilePorts,remapSmartPipeOutputLinks};';
 return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
for(const executionId of ['7','12:7','12:45:7'])test(`serialized output names retain API ordinals in scope ${executionId}`,async()=>{
 const mod=await subject();
 const schema=[1,2,3,4,5,6].map(ordinal=>({id:`id-${ordinal}`,ordinal,name:`slot-${ordinal}`}));
 // Native serialization retains name but does not promise custom bvSlotId.
 const node={outputs:[{name:'pipe'},...[1,2,3,5,4,6].map(n=>({name:`out_${String(n).padStart(3,'0')}`,type:'STRING'}))]};
 const routing={descriptors:[{node,address:'test',executionId}],registry:{test:{projection:{resolvedSlots:schema}}}};
 const api={consumer:{class_type:'Consumer',inputs:{value:[executionId,4]}}};
 mod.remapSmartPipeOutputLinks(api,routing);
 assert.deepEqual(api.consumer.inputs.value,[executionId,5]);
});
function portNode(outputs=[]){
 return {inputs:[{name:'pipe',type:'BV_SMART_PIPE'}],outputs:[{name:'pipe',type:'BV_SMART_PIPE'},...outputs],
 addInput(name,type){const p={name,type,link:null};this.inputs.push(p);return p;},
 addOutput(name,type){const p={name,type,links:null};this.outputs.push(p);return p;},
 removeInput(index){this.inputs.splice(index,1);},removeOutput(index){this.outputs.splice(index,1);}};
}
const slot=(n)=>({id:`id-${n}`,ordinal:n,name:`slot-${n}`,type:'STRING',showInput:false,showOutput:true});
const output=(n)=>({name:`out_${String(n).padStart(3,'0')}`,bvSlotId:`id-${n}`,label:`slot-${n}`,localized_name:`slot-${n}`,type:'STRING',links:null});
test('reconcile removes multiple duplicate groups without shifted-index ghosts',async()=>{
 const mod=await subject(),node=portNode([output(1),output(1),output(2),output(2)]);
 mod.reconcilePorts(node,[slot(1),slot(2)]);
 assert.deepEqual(node.outputs.map(p=>p.name),['pipe','out_001','out_002']);
});
test('native slot prototype and identity survive presentation refresh',async()=>{
 class NativeSlot{constructor(){Object.assign(this,output(1));} serialize(){return {name:this.name,type:this.type,links:this.links};}}
 const original=new NativeSlot(),node=portNode([original]),mod=await subject();
 mod.reconcilePorts(node,[{...slot(1),name:'renamed'}]);
 assert.strictEqual(node.outputs[1],original);
 assert.equal(typeof node.outputs[1].serialize,'function');
 assert.equal(node.outputs[1].label,'renamed');
});
for(const linked of [false,true])test(`visibility/readd/reorder preserves surviving slots (linked=${linked})`,async()=>{
 const mod=await subject(),node=portNode([output(1),output(2),output(3)]);
 if(linked)node.outputs[3].links=[99];
 const survivor=node.outputs[3];
 mod.reconcilePorts(node,[slot(3),{...slot(2),showOutput:false},slot(1)]);
 assert.deepEqual(node.outputs.map(p=>p.name),['pipe','out_001','out_003']);
 assert.strictEqual(node.outputs.find(p=>p.bvSlotId==='id-3'),survivor);
 mod.reconcilePorts(node,[slot(1),slot(2),{...slot(3),name:'renamed'}]);
 assert.equal(node.outputs.filter(p=>p.bvSlotId==='id-2').length,1);
 assert.deepEqual(node.outputs.find(p=>p.bvSlotId==='id-3').links,linked?[99]:null);
 for(let i=0;i<3;i++){
  node.outputs=JSON.parse(JSON.stringify(node.outputs)).map(({bvSlotId,...serialized})=>serialized);
  mod.reconcilePorts(node,[slot(1),slot(2),{...slot(3),name:'renamed'}]);
  assert.equal(node.outputs.length,4);
  assert.equal(new Set(node.outputs.map(p=>p.name)).size,4);
  assert.equal(node.outputs.find(p=>p.name==='out_003').bvSlotId,'id-3');
 }
});
test('sparse saved Regional output at visual index three maps to backend five',async()=>{
 const mod=await subject(),schema=[1,2,3,4,5,6].map(slot);
 const node={outputs:[{name:'pipe'},output(1),output(2),output(5)].map(({bvSlotId,...serialized})=>serialized)};
 const routing={descriptors:[{node,address:'saved',executionId:'20:17'}],registry:{saved:{projection:{resolvedSlots:schema}}}};
 const api={'20:13':{class_type:'BV Krea2 Attention',inputs:{regional:['20:17',3]}}};
 mod.remapSmartPipeOutputLinks(api,routing);
 assert.deepEqual(api['20:13'].inputs.regional,['20:17',5]);
});
test('unresolvable serialized output identity fails before an API link can silently change meaning',async()=>{
 const mod=await subject(),node={outputs:[{name:'pipe'},{name:'ambiguous',type:'*'}]};
 const routing={descriptors:[{node,address:'unknown',executionId:'7'}],registry:{unknown:{projection:{resolvedSlots:[slot(3),slot(5)]}}}};
 const api={consumer:{class_type:'Consumer',inputs:{value:['7',1]}}};
 assert.throws(()=>mod.remapSmartPipeOutputLinks(api,routing));
});
for(const invalid of [-1,8,1.5,'3'])test(`invalid API output index ${JSON.stringify(invalid)} is rejected`,async()=>{
 const mod=await subject(),node={outputs:[{name:'pipe'},output(5)]};
 const routing={descriptors:[{node,address:'invalid',executionId:'7'}],registry:{invalid:{projection:{resolvedSlots:[slot(5)]}}}};
 const api={consumer:{class_type:'Consumer',inputs:{value:['7',invalid]}}};
 assert.throws(()=>mod.remapSmartPipeOutputLinks(api,routing));
});
test('saved conflicting identity rejects before changing either slot array',async()=>{
 const {restoreNativeSlotOrder}=await import('../js/bv_node_slots.js');
 const a={name:'v_001',bvSlotId:'a'},b={name:'v_002',bvSlotId:'b'},out=output(5);
 const node={inputs:[a,b],outputs:[out]},inputs=node.inputs,outputs=node.outputs;
 assert.throws(()=>restoreNativeSlotOrder(node,{inputs:[{...b},{...a}],outputs:[{...out,bvSlotId:'wrong'}]}),/Conflicting/);
 assert.strictEqual(node.inputs,inputs);assert.strictEqual(node.outputs,outputs);
 assert.deepEqual(node.inputs,[a,b]);assert.strictEqual(node.outputs[0],out);
});
test('connected duplicate survives with refreshed label when preceded by an unlinked duplicate',async()=>{
 const mod=await subject(),unused=output(1),used={...output(1),links:[42]},node=portNode([unused,used]);
 mod.reconcilePorts(node,[{...slot(1),name:'renamed-connected'}]);
 assert.equal(node.outputs.length,2);
 assert.strictEqual(node.outputs[1],used);
 assert.equal(used.label,'renamed-connected');
 assert.deepEqual(used.links,[42]);
});
test('configure transaction is nested, per-node, and clears after exceptions',async()=>{
 const {installNativeSlotConfigureTransaction,nativeSlotsAreConfiguring}=await import('../js/bv_node_slots.js');
 const events=[];
 class Node{configure(depth=0){events.push(nativeSlotsAreConfiguring(this));if(depth===1)this.configure(0);if(depth===2)throw Error('native failure');events.push(nativeSlotsAreConfiguring(this));}}
 installNativeSlotConfigureTransaction(Node);const node=new Node(),other=new Node();
 node.configure(1);assert.deepEqual(events,[true,true,true,true]);
 assert.equal(nativeSlotsAreConfiguring(node),false);assert.equal(nativeSlotsAreConfiguring(other),false);
 assert.throws(()=>node.configure(2),/native failure/);assert.equal(nativeSlotsAreConfiguring(node),false);
});
test('configure replay trims only an exact saved prefix and rejects ambiguous ordinary restores',async()=>{
 const {installNativeSlotConfigureTransaction,restoreNativeSlotOrder}=await import('../js/bv_node_slots.js');
 const saved={outputs:[{name:'pipe',links:null},{name:'out_005',links:[42],bvSlotId:'id-5'}]};
 class Replay{constructor(){this.outputs=[{name:'pipe',links:null},{name:'out_005',links:[42]},{name:'out_005',links:null}];}configure(data){restoreNativeSlotOrder(this,data);}}
 installNativeSlotConfigureTransaction(Replay);const replay=new Replay(),survivor=replay.outputs[1];replay.configure(saved);
 assert.equal(replay.outputs.length,2);assert.strictEqual(replay.outputs[1],survivor);assert.equal(survivor.bvSlotId,'id-5');
 const ordinary=new Replay();assert.throws(()=>restoreNativeSlotOrder(ordinary,saved),/Ambiguous/);assert.equal(ordinary.outputs.length,3);
 const invalid=new Replay();assert.throws(()=>invalid.configure({outputs:[{name:'out_005',links:[42]},{name:'out_005',links:null}]}));
});
test('removed connected identity retains its link and blocks API materialization',async()=>{
 const mod=await subject(),used={...output(5),links:[42]},node=portNode([output(1),used]);
 mod.reconcilePorts(node,[slot(1)]);
 const routing={descriptors:[{node,address:'removed',executionId:'7'}],registry:{removed:{projection:{resolvedSlots:[slot(1)]}}}};
 assert.throws(()=>mod.remapSmartPipeOutputLinks({consumer:{class_type:'Consumer',inputs:{value:['7',2]}}},routing));
 assert.strictEqual(node.outputs[2],used);assert.deepEqual(used.links,[42]);
});
test('empty saved port array removes constructor tails only during native configure',async()=>{
 const {installNativeSlotConfigureTransaction,restoreNativeSlotOrder}=await import('../js/bv_node_slots.js');
 class Node{constructor(){this.outputs=[output(1),output(2)];}configure(data){restoreNativeSlotOrder(this,data);}}
 installNativeSlotConfigureTransaction(Node);const node=new Node();node.configure({outputs:[]});assert.deepEqual(node.outputs,[]);
});

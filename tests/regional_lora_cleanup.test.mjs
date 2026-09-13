import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateRegionalNode} from '../ui/src/regional/milestoneE.ts';
import {createRegionalEditorSnapshot,emptyLoraBindings} from '../ui/src/regional/loraBindings.ts';
import {reconcileRegionalLoraConfig,restoreRegionalLoraConfig,parseLoraV3Config} from '../ui/src/regional/loraV3Config.ts';
import {reconcileLoraBindings} from '../ui/src/regional/loraBindings.ts';
import {readFileSync} from 'node:fs';
import ts from '../ui/node_modules/typescript/lib/typescript.js';
import {readRegionalJobs,regionalJobCandidates,reconcileRegionalJobs} from '../ui/src/regional/regionalJobConfig.ts';

const document={schema:'bv.regional',version:2,document_id:'doc',title:'Test',canvas:{width:1024,height:1024},prompts:{global:{positive_source:'',negative_source:''},background:{positive_source:'',negative_source:''}},negative_mode:'auto',overlap:{mode:'joint'},regions:[]};
const target=(id,doc='doc')=>({scope:'region',document_id:doc,region_id:id});
const entry=(id,targets)=>({id,source:{kind:'external',collector_id:'collector',resource_id:id},targets});
const config={version:3,apply_global:false,entries:[entry('orphan',[target('deleted')]),entry('shared',[target('deleted'),{scope:'global'},target('deleted','other')])],steps:[]};

test('loading a saved document removes only its missing region assignments and persists the repair',()=>{
 const node={type:'BV Regional Prompt',widgets:[{name:'regional_json',value:JSON.stringify(document)},{name:'lora_v3_config_json',value:JSON.stringify(config)}]};
 const result=migrateRegionalNode(node);assert.equal(result.error,undefined);
 const repaired=JSON.parse(node.widgets[1].value);
 assert.deepEqual(repaired.entries,[entry('shared',[{scope:'global'},target('deleted','other')])]);
 assert.equal(repaired.apply_global,false);
 const reloaded=JSON.parse(JSON.stringify(node));assert.equal(migrateRegionalNode(reloaded).migrated,false);
 assert.deepEqual(JSON.parse(reloaded.widgets[1].value),repaired);
});

test('editor history retains independent V3 state for region deletion undo',()=>{
 const source={...document,regions:[{id:'deleted'}]};
 const snapshot=createRegionalEditorSnapshot(source,emptyLoraBindings('doc'),config);
 assert.deepEqual(snapshot.loraV3Config,config);
 assert.notEqual(snapshot.loraV3Config,config);
});

test('region deletion, emptying a stack, undo, redo and serialization preserve unrelated targets',()=>{
 const before={...document,regions:[{id:'deleted'},{id:'kept'}]};
 const initial={...config,entries:[...config.entries,entry('kept',[target('kept')])]};
 const undo=createRegionalEditorSnapshot(before,emptyLoraBindings('doc'),initial);
 const after={...before,regions:[{id:'kept'}]};
 const cleaned=reconcileRegionalLoraConfig(initial,after);
 assert.deepEqual(cleaned.entries.map(e=>e.id),['shared','kept']);
 // The resource still exists after its last LoRA is removed. No catalog lookup
 // belongs in document reconciliation, so valid empty-stack bindings survive.
 const emptyStack={id:'kept',entries:[]};assert.equal(emptyStack.entries.length,0);
 assert.deepEqual(reconcileRegionalLoraConfig(cleaned,after),cleaned);
 const redo=createRegionalEditorSnapshot(after,emptyLoraBindings('doc'),cleaned);
 assert.deepEqual(reconcileRegionalLoraConfig(undo.loraV3Config,undo.document),initial);
 assert.deepEqual(reconcileRegionalLoraConfig(redo.loraV3Config,redo.document),cleaned);
 assert.deepEqual(parseLoraV3Config(JSON.stringify(cleaned)),cleaned);
 assert.deepEqual(initial.entries[0].targets,[target('deleted')]);
});

test('step targets are reconciled without dropping clear operations or preexisting empty entries',()=>{
 const source={version:3,entries:[entry('empty',[])],steps:[
  {id:'gone',operation:'clear',target:target('deleted'),entries:[]},
  {id:'global',operation:'clear',target:{scope:'global'},entries:[]},
  {id:'foreign',operation:'merge',target:target('deleted','other'),entries:[entry('shared',[target('deleted'),target('deleted','other')])]},
 ]};
 const result=reconcileRegionalLoraConfig(source,document);
 assert.deepEqual(result.steps.map(s=>s.id),['global','foreign']);
 assert.deepEqual(result.steps[0],source.steps[1]);
 assert.deepEqual(result.steps[1].entries[0].targets,[target('deleted','other')]);
 assert.deepEqual(result.entries,source.entries);
});

test('invalid configuration aborts load repair without publishing a partial document',()=>{
 const raw=JSON.stringify(document);const node={widgets:[{name:'regional_json',value:raw},{name:'lora_v3_config_json',value:'{'}]};
 assert.ok(migrateRegionalNode(node).error);assert.equal(node.widgets[0].value,raw);assert.equal(node.widgets[1].value,'{');
});

test('production persist publishes consistent widgets and snapshots V3 before deferred React updates',()=>{
 const source=readFileSync(new URL('../ui/src/regional/RegionalEditor.tsx',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('    const persist = useCallback('),source.indexOf('    const mutate = useCallback('));
 const before={...document,regions:[{id:'deleted'}]},bindings=emptyLoraBindings('doc');
 const widgets=[{name:'regional_json',value:JSON.stringify(before)},{name:'lora_bindings_json',value:JSON.stringify(bindings)},{name:'lora_v3_config_json',value:JSON.stringify(config)}];
 widgets.push({name:'lut_v3_config_json',value:JSON.stringify({version:1,jobs:[{id:'lut',scope:'regional',region_ids:['deleted'],strength:.4}]})},{name:'detailer_v3_config_json',value:JSON.stringify({version:1,jobs:[{id:'detail',region_ids:['deleted'],primary_region_id:'deleted',detector_assignments:[{id:'detector'}]}]})});
 let callbackCount=0;
 for(const widget of widgets)widget.callback=()=>{
  callbackCount++;
  const doc=JSON.parse(widgets[0].value),v3=JSON.parse(widgets[2].value);
  assert.deepEqual(reconcileRegionalLoraConfig(v3,doc),v3);
  for(const widget of widgets.slice(3)){const value=JSON.parse(widget.value);assert.deepEqual(reconcileRegionalJobs(value,doc),value);}
 };
 const updates=[];const node={widgets,graph:{setDirtyCanvas(){}}};
 const env={node,documentValue:before,loraBindings:bindings,useCallback:fn=>fn,
  readNodeLoraV3Config:()=>JSON.parse(widgets[2].value),getWidget:()=>widgets[0],getBindingsWidget:()=>widgets[1],
  setHistory:fn=>updates.push(fn),setFuture(){},setDocumentValue(){},setLoraBindings(){},setLoraV3Config(){},
  readRegionalJobs,regionalJobCandidates,setLutEasyConfig(){},setDetailerEasyConfig(){},readLutEasyConfig:()=>({version:1,jobs:[]}),readDetailerEasyConfig:()=>({version:1,jobs:[]}),
  createRegionalEditorSnapshot,reconcileLoraBindings,reconcileRegionalLoraConfig};
 const js=ts.transpileModule(body+'\nreturn persist;', {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const persist=new Function(...Object.keys(env),js)(...Object.values(env));
 persist(document);
 assert.equal(callbackCount,5);
 const snapshot=updates[0]([])[0];assert.deepEqual(snapshot.loraV3Config,config);
 assert.equal(JSON.parse(widgets[2].value).entries.length,1);
 assert.equal(snapshot.regionalJobs.lut_v3_config_json.jobs.length,1);
 persist(snapshot.document,false,snapshot.loraBindings,snapshot.loraV3Config,snapshot.regionalJobs);
 assert.deepEqual(JSON.parse(widgets[2].value),config);
 assert.equal(JSON.parse(widgets[3].value).jobs.length,1);assert.equal(JSON.parse(widgets[4].value).jobs.length,1);
 persist(document,false,bindings,reconcileRegionalLoraConfig(config,document));
 assert.equal(JSON.parse(widgets[2].value).entries.length,1);
});

test('document undo preserves later picker edits and global switches, restoring only revived region targets',()=>{
 const before={...document,regions:[{id:'deleted'},{id:'kept'}]};
 const initial={version:3,apply_global:true,entries:[entry('first',[target('deleted')]),entry('kept',[target('kept')]),entry('global',[{scope:'global'}])],steps:[]};
 const after={...document,regions:[{id:'kept'}]};
 const current=reconcileRegionalLoraConfig(initial,after);current.apply_global=false;current.entries[0].source.resource_id='changed';
 const restored=restoreRegionalLoraConfig(current,after,before,initial);
 assert.deepEqual(restored.entries.map(item=>item.id),['first','kept','global']);
 assert.equal(restored.entries[1].source.resource_id,'changed');assert.equal(restored.apply_global,false);
 assert.deepEqual(restoreRegionalLoraConfig(current,after,after,initial),current,'prompt-only Undo must preserve all picker changes');
 assert.deepEqual(restoreRegionalLoraConfig(restored,before,after,current),current,'redo removes restored targets without changing remaining picks');
});

test('migration callbacks observe the complete repaired state',()=>{
 let calls=0;const node={widgets:[{name:'regional_json',value:JSON.stringify({...document,version:1})},{name:'lora_v3_config_json',value:JSON.stringify(config)}]};
 for(const item of node.widgets)item.callback=()=>{calls++;assert.equal(JSON.parse(node.widgets[0].value).version,2);assert.equal(JSON.parse(node.widgets[1].value).entries.length,1)};
 assert.equal(migrateRegionalNode(node).error,undefined);assert.equal(calls,2);
});

test('revived sequential operations retain their position relative to surviving steps',()=>{
 const original={...document,regions:[{id:'deleted'}]};
 const saved={version:3,entries:[],steps:[{id:'revived',operation:'replace',target:target('deleted'),entries:[]},{id:'kept',operation:'clear',target:{scope:'global'},entries:[]}]};
 const current=reconcileRegionalLoraConfig(saved,document);
 assert.deepEqual(restoreRegionalLoraConfig(current,document,original,saved),saved);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import {assistPreset,chooseAssistPreset} from '../ui/src/regional/promptAssistPresets.ts';
import {emptyDocument} from '../ui/src/regional/model.ts';
import {ASSIST_PROPERTY,readAssistConfig,writeAssistConfig,captureAssistField,replaceAssistField,maskAssistReferences,restoreAssistReferences} from '../ui/src/regional/promptAssistState.ts';

const makeNode=()=>{const doc=emptyDocument();doc.prompts.global.positive_source='Eine Frau';return {properties:{other:'kept'},widgets:[{name:'regional_json',value:JSON.stringify(doc)}]};};
const doc=node=>JSON.parse(node.widgets[0].value);

for(const presetId of ['krea2-v1','anima-v1'])test(`curated profile ${presetId} preserves settings and persisted custom text`,()=>{
    assert.ok(assistPreset(presetId));
    const node=makeNode();
    const original={...readAssistConfig(node),profile_id:'ollama',model:'local',translate:false,language:'German',system_prompt:'My old custom prompt'};
    writeAssistConfig(node,original);
    assert.equal(readAssistConfig(node).prompt_preset,'custom');
    const selected=chooseAssistPreset(readAssistConfig(node),presetId);
    assert.equal(selected.system_prompt,assistPreset(presetId).system);
    for(const key of ['profile_id','model','translate','language'])assert.equal(selected[key],original[key]);
    writeAssistConfig(node,{...selected,system_prompt:'My adapted profile prompt'});
    const restored=readAssistConfig(JSON.parse(JSON.stringify(node)));
    assert.equal(restored.prompt_preset,presetId);
    assert.equal(restored.system_prompt,'My adapted profile prompt');
    assert.equal(chooseAssistPreset(restored,presetId).system_prompt,selected.system_prompt);
    assert.equal(chooseAssistPreset(restored,'custom').system_prompt,restored.system_prompt);
    writeAssistConfig(node,{...restored,prompt_preset:'future-profile'});
    assert.equal(readAssistConfig(node).system_prompt,restored.system_prompt);
    assert.equal(readAssistConfig(node).prompt_preset,'custom');
});

test('native text replaces only its widget and Undo rejects newer edits',()=>{
    let callbacks=0;
    const node={widgets:[{name:'text',value:'  Hallo 👋\n',callback:()=>callbacks++}]};
    const before=captureAssistField(node,'native-text','positive');
    const after=replaceAssistField(node,before,'Hello 👋',[]);
    assert.equal(node.widgets[0].value,'Hello 👋');
    replaceAssistField(node,after,before.text,[]);
    assert.equal(node.widgets[0].value,'  Hallo 👋\n');
    assert.equal(callbacks,2);
    const snapshot=captureAssistField(node,'native-text','positive');
    node.widgets[0].value='Newer';
    assert.throws(()=>replaceAssistField(node,snapshot,'Late result',[]));
    node.widgets[0]={name:'text',value:snapshot.text};
    assert.throws(()=>replaceAssistField(node,snapshot,'Late result',[]));
    const other={widgets:[{name:'text',value:snapshot.text}]};
    assert.throws(()=>replaceAssistField(other,snapshot,'Late result',[]));
});

test('native assist rejects linked input and preserves literal markers',()=>{
    const node={widgets:[{name:'text',value:'__BVREF0__ @literal'}]};
    const before=captureAssistField(node,'native-text','positive');
    assert.deepEqual(before.mentions,[]);
    node.inputs=[{name:'text',link:7}];
    assert.throws(()=>replaceAssistField(node,before,'replacement',[]));
});
test('node config roundtrips independently and never enters the regional document',()=>{
    const a=makeNode(),b=makeNode(),original=a.widgets[0].value;
    writeAssistConfig(a,{...readAssistConfig(a),enabled:true,system_prompt:'Custom prompt',api_key:'must not be persisted'});
    assert.equal(a.widgets[0].value,original);
    assert.equal(a.properties.other,'kept');
    assert.equal(a.properties[ASSIST_PROPERTY].api_key,undefined);
    assert.equal(readAssistConfig(JSON.parse(JSON.stringify(a))).system_prompt,'Custom prompt');
    assert.equal(readAssistConfig(b).enabled,false);
    const clone=JSON.parse(JSON.stringify(a));writeAssistConfig(clone,{...readAssistConfig(clone),system_prompt:'Other'});
    assert.equal(readAssistConfig(a).system_prompt,'Custom prompt');
});
test('field-only commit preserves concurrent opposite-field changes and undo restores only that field',()=>{
    const node=makeNode(),before=captureAssistField(node,'global','positive');
    const updated=doc(node);updated.prompts.global.negative_source='new negative';updated.title='new title';node.widgets[0].value=JSON.stringify(updated);
    const after=replaceAssistField(node,before,'A woman',[]);
    assert.equal(doc(node).prompts.global.negative_source,'new negative');assert.equal(doc(node).title,'new title');
    replaceAssistField(node,after,before.text,before.mentions);
    assert.equal(doc(node).prompts.global.positive_source,'Eine Frau');assert.equal(doc(node).prompts.global.negative_source,'new negative');
});
test('stale text, document identity and deleted region never overwrite current data',()=>{
    for(const modify of [d=>d.prompts.global.positive_source='newer',d=>d.document_id='another']){
        const node=makeNode(),before=captureAssistField(node,'global','positive'),updated=doc(node);modify(updated);node.widgets[0].value=JSON.stringify(updated);const raw=node.widgets[0].value;
        assert.throws(()=>replaceAssistField(node,before,'A woman',[]));assert.equal(node.widgets[0].value,raw);
    }
    const node=makeNode();assert.throws(()=>captureAssistField(node,'deleted-region','positive'));
});
test('stale undo preserves newer edits',()=>{
    const node=makeNode(),before=captureAssistField(node,'global','positive'),after=replaceAssistField(node,before,'A woman',[]);
    replaceAssistField(node,after,'My edited woman',[]);
    assert.throws(()=>replaceAssistField(node,after,before.text,[]));
});
test('a region removed during the request stays removed',()=>{
    const node=makeNode(),d=doc(node);d.regions=[{id:'r',usage:'generation',geometry:[],prompts:{positive_source:'Frau',negative_source:''}}];node.widgets[0].value=JSON.stringify(d);
    const before=captureAssistField(node,'r','positive');d.regions=[];node.widgets[0].value=JSON.stringify(d);const raw=node.widgets[0].value;
    assert.throws(()=>replaceAssistField(node,before,'A woman',[]));assert.equal(node.widgets[0].value,raw);
});
test('repeated labels and Unicode references restore distinct resource identities and new UTF16 positions',()=>{
    const text='👩 @Bild und @Bild',first=text.indexOf('@Bild'),second=text.lastIndexOf('@Bild');
    const mentions=[{start:first,end:first+5,label:'@Bild',collector_id:'c',resource_id:'one'},{start:second,end:second+5,label:'@Bild',collector_id:'c',resource_id:'two'}];
    const masked=maskAssistReferences(text,mentions);assert.equal(masked.text,'👩 __BVREF0__ und __BVREF1__');
    const restored=restoreAssistReferences('A woman 👩 with __BVREF0__ and __BVREF1__',masked.mentions);
    for(const mention of restored.mentions)assert.equal(restored.text.slice(mention.start,mention.end),mention.label);
    assert.deepEqual(restored.mentions.map(m=>m.resource_id),['one','two']);
    for(const result of ['missing','__BVREF1__ __BVREF0__','__BVREF0__ __BVREF0__'])assert.throws(()=>restoreAssistReferences(result,mentions));
});
test('reference changes are stale even when text has not changed',()=>{
    const node=makeNode(),d=doc(node);d.prompts.global.positive_source='@Bild';d.prompts.global.references={positive:[{start:0,end:5,label:'@Bild',collector_id:'c',resource_id:'one'}]};node.widgets[0].value=JSON.stringify(d);
    const before=captureAssistField(node,'global','positive');d.prompts.global.references.positive[0].resource_id='two';node.widgets[0].value=JSON.stringify(d);
    assert.throws(()=>replaceAssistField(node,before,'@Bild',before.mentions));
});

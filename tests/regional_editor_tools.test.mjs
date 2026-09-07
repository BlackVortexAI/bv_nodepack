import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleSegmentCount,toggleSegment} from '../ui/src/ui/components/segmentedModel.ts';
import {referenceRequest,insertReference,updateMentions} from '../ui/src/completion/referenceMentions.ts';
import {applyInteractiveFanIn,removeInteractiveFanIn} from '../ui/src/regional/interactiveFanIn.ts';

test('overflow reserves trigger space, restores order and keeps independent toggles',()=>{
    assert.equal(visibleSegmentCount([70,65,80],215,50),3);
    assert.equal(visibleSegmentCount([70,65,80],150,50),1);
    assert.equal(visibleSegmentCount([70,65,80],40,50),0);
    assert.deepEqual(toggleSegment(['generation'],'detailer',true),['generation','detailer']);
    assert.deepEqual(toggleSegment(['generation'],'generation',true),['generation']);
    assert.deepEqual(toggleSegment(['lora','lut'],'lora'),['lut']);
});

test('references insert by explicit choice without comma rules or interpreting literal @',()=>{
    const text='👩 woman @Im walks', request=referenceRequest(text,12);
    assert.equal(request.term,'im');
    const choice={collector_id:crypto.randomUUID(),resource_id:crypto.randomUUID(),label:'Image 1',origin:'Registry #4'};
    const next=insertReference(text,request,choice,[]);
    assert.equal(next.text,'👩 woman @Image 1 walks');
    assert.equal(next.text.slice(next.mentions[0].start,next.mentions[0].end),'@Image 1');
    assert.equal(referenceRequest('person@example.com',18),null);
    assert.deepEqual(updateMentions('@artist','@artist ',[]),[]);
    const shifted=updateMentions(next.text,'Hi '+next.text,next.mentions);
    assert.equal(shifted[0].start,next.mentions[0].start+3);
    assert.deepEqual(updateMentions(next.text,next.text.replace('@Image 1','@Image 2'),next.mentions),[]);
});

test('reference insertion cannot exceed the persisted mention limit',()=>{
 const mention={start:0,end:8,label:'@Image 1',collector_id:crypto.randomUUID(),resource_id:crypto.randomUUID()};
 const mentions=Array.from({length:100},(_,i)=>({...mention,start:i*9,end:i*9+8}));
 const text=Array(100).fill('@Image 1').join(' ')+' @';
 const next=insertReference(text,{start:text.length-1,end:text.length},{...mention,label:'Image 1',origin:'Registry'},mentions);
 assert.equal(next.text,text);assert.equal(next.mentions.length,100);
});

test('native fan-in floor prevents deferred compaction even after a later native callback',()=>{
 const group={min:0,max:100},node={inputs:[0,1,2].map(i=>({name:`media.media${i}`,__bvPresentationRole:'fanIn',link:null})),comfyDynamic:{autogrow:{media:group}}};
 const callback=()=>{};node.onConnectionsChange=callback;applyInteractiveFanIn(node);assert.equal(node.onConnectionsChange,callback);assert.equal(group.min,4);assert.equal(group.max,100);
 node.inputs.push({name:'media.media4',__bvPresentationRole:'fanIn',link:null});assert.equal(group.min,6);
 removeInteractiveFanIn(node);assert.equal(group.min,0);
});

test('all 100 occupied places leave no connection target and preserve the native maximum',()=>{
 const group={min:0,max:100,inputSpecs:[{isOptional:true}]};
 const node={inputs:Array.from({length:100},(_,i)=>({name:`media.media${i}`,__bvPresentationRole:'fanIn',link:i+1})),comfyDynamic:{autogrow:{media:group}}};
 applyInteractiveFanIn(node);assert.equal(group.min,101);assert.equal(group.max,100);assert.equal(node.onConnectInput(0),false);assert.equal(node.getInputOnPos([0,10]),undefined);removeInteractiveFanIn(node);assert.equal(group.min,0);
});

import {regionalActiveTools} from '../ui/src/regional/regionalToolState.ts';
test('shared editor tools infer legacy scopes and honor explicit off without modifying configuration',()=>{
 const region={id:'r'},document={document_id:'doc',regions:[region]},lora={entries:[{targets:[{scope:'global'}]},{targets:[{scope:'region',document_id:'doc',region_id:'r'}]}]},bindings={regions:{}},lut={jobs:[{scope:'regional',region_ids:['r','other']}]};
 const before=JSON.stringify({lora,bindings,lut});
 assert.deepEqual(regionalActiveTools(document,null,lora,bindings,lut),['lora']);
 assert.deepEqual(regionalActiveTools(document,region,lora,bindings,lut),['lora','lut']);
 region.tool_settings={lora:false,lut:false};assert.deepEqual(regionalActiveTools(document,region,lora,bindings,lut),[]);
 assert.deepEqual(regionalActiveTools(document,null,lora,bindings,lut),['lora']);
 region.tool_settings={lora:true,lut:true};assert.deepEqual(regionalActiveTools(document,region,lora,bindings,lut),['lora','lut']);
 assert.equal(JSON.stringify({lora,bindings,lut}),before);
});

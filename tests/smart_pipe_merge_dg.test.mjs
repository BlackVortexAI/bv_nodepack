import test from 'node:test';
import assert from 'node:assert/strict';
import {effectiveSmartPipeEdges} from '../js/bv_smart_pipe_routing.js';
import {instanceDgSegments} from '../ui/src/regional/instanceDgProjection.ts';
import {nextMergeSourceKey,normalizeMergeSources} from '../js/bv_smart_pipe_merge_model.js';

test('remove then add Merge source survives save normalization with sparse mixed keys',()=>{
 const sources=[{key:'pipe_002',mode:'wireless',address:'b'},{key:'pipe_007',mode:'wired',address:'wired'}];
 const before=JSON.stringify(sources);const added={key:nextMergeSourceKey(sources),mode:'wireless',address:'a'};
 assert.equal(added.key,'pipe_008');assert.deepEqual(normalizeMergeSources([...sources,added],new Set(['pipe_007'])),[...sources,added]);assert.equal(JSON.stringify(sources),before);
 assert.equal(nextMergeSourceKey([{key:'pipe_002'}]),'pipe_003');assert.equal(nextMergeSourceKey([]),'pipe_001');
});

const pipe=()=>({class_type:'BV Smart Pipe',inputs:{}});
test('Merge source allocator stays within the sixteen backend input names',()=>{
 const full=Array.from({length:16},(_,i)=>({key:`pipe_${String(i+1).padStart(3,'0')}`}));
 assert.equal(nextMergeSourceKey(full),null);
 assert.equal(nextMergeSourceKey(full.slice(1)),'pipe_001');
 assert.equal(nextMergeSourceKey([{key:'pipe_016'}]),'pipe_001');
 let sources=[];
 for(let i=0;i<80;i++){const key=nextMergeSourceKey(sources);assert.match(key,/^pipe_00[1-9]$|^pipe_01[0-6]$/);sources.push({key});if(sources.length===16)sources.shift();}
});
const merge=inputs=>({class_type:'BV Smart Pipe Merge',inputs});
test('Merge fan-in and downstream edges preserve channels, mixed physical ownership and prompt',()=>{
 const prompt={a:pipe(),b:pipe(),m:merge({pipe_001:['a',0],pipe_002:['b',0],value:['a',0],pipe_003:['b',1]}),m2:merge({pipe_001:['m',0]}),c:pipe()};prompt.c.inputs.pipe=['m2',0];
 const descriptors=Object.keys(prompt).map(id=>({executionId:id,address:id,kind:id.startsWith('m')?'merge':'pipe'}));
 const before=JSON.stringify(prompt);
 const edges=effectiveSmartPipeEdges(prompt,descriptors);
 assert.deepEqual(edges,[{source:'a',target:'m',targetInput:'pipe_001'},{source:'b',target:'m',targetInput:'pipe_002'},{source:'m',target:'m2',targetInput:'pipe_001'},{source:'m2',target:'c',targetInput:'pipe'}]);
 assert.deepEqual(effectiveSmartPipeEdges(prompt,descriptors,new Map([['m',new Set(['pipe_001'])]])),edges.slice(1));
 assert.equal(JSON.stringify(prompt),before);
 delete prompt.a;delete prompt.m.inputs.pipe_001;
 assert.deepEqual(effectiveSmartPipeEdges(prompt,descriptors),edges.slice(1));
 delete prompt.m;delete prompt.m2;delete prompt.c;
 assert.deepEqual(effectiveSmartPipeEdges(prompt,descriptors),[]);
});
test('shared deep Merge bindings retain concrete paths and final bypass source',()=>{
 const root={},shared={inputNode:{},outputNode:{}},deep={inputNode:{},outputNode:{}},sameNode={},a={},b={},h1={},h2={},child={};
 const bindings=new Map([['a',{node:a,hosts:[]}],['b',{node:b,hosts:[]}],...['one','two'].map((id,i)=>[id,{node:sameNode,hosts:[{id,node:i?h2:h1,graph:shared},{id:'deep',node:child,graph:deep}]}])]);
 const prompt={a:pipe(),b:pipe(),one:merge({pipe_001:['a',0]}),two:merge({pipe_001:['b',0]})};
 const descriptors=Object.keys(prompt).map(id=>({executionId:id,address:id,kind:['one','two'].includes(id)?'merge':'pipe'}));
 const edges=effectiveSmartPipeEdges(prompt,descriptors),segments=instanceDgSegments(root,edges,bindings);
 assert.deepEqual(segments.map(s=>s.path),[[],['one'],['one','deep'],[],['two'],['two','deep']]);
 assert.equal(segments[0].to.node,h1);assert.equal(segments[3].to.node,h2);
 prompt.two.inputs.pipe_001=['a',0];
 assert.equal(effectiveSmartPipeEdges(prompt,descriptors)[1].source,'a');
});

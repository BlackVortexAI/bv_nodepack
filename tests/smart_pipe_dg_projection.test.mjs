import test from 'node:test';
import assert from 'node:assert/strict';
import { effectiveSmartPipeEdges, materializeAddressedPipeLinks, materializeWirelessPipeLinks, prunePromptBranches, validateMaterializedPipeGraph } from '../js/bv_smart_pipe_routing.js';
import { instanceDgSegments, instanceDgAnchor, publishInstanceDgProjection, clearInstanceDgProjection } from '../ui/src/regional/instanceDgProjection.ts';
import { setLegacyDebugVisible } from '../ui/src/regional/legacyPorts.ts';

const pipe=(id,predecessor)=>({class_type:'BV Smart Pipe',inputs:{bv_smart_pipe_route_json:JSON.stringify({nodeId:id,name:id,mode:predecessor?'follow':'root',predecessorId:predecessor})}});
for(const addressed of [false,true])for(const mode of ['normal','bypass','mute','wired'])test(`DG reflects compiled ${addressed?'addressed':'local'} ${mode} edges without mutation`,()=>{
    const output={a:pipe('a'),c:pipe('c','b'),d:pipe('d')};
    if(mode==='normal'||mode==='wired')output.b=pipe('b','a');
    if(mode==='wired')output.c.inputs.pipe=['d',0];
    const descriptors=['a','b','c','d'].map(id=>({executionId:id,address:`root/${id}`,kind:'pipe'}));
    const state={prunedExecutionIds:new Set(),bypassedAddresses:new Set(mode==='bypass'?['root/b']:[]),mutedAddresses:new Set(mode==='mute'?['root/b']:[]),
        bypassedScopedNodeIds:new Set(mode==='bypass'?['\0b']:[]),mutedScopedNodeIds:new Set(mode==='mute'?['\0b']:[]),routesByScopedNodeId:new Map([['\0b',{predecessorId:'a'}]])};
    const wired=new Map(mode==='wired'?[['c',new Set(['pipe'])]]:[]);
    if(addressed)materializeAddressedPipeLinks(output,Object.fromEntries(descriptors.map(d=>[d.executionId,d.address])),{'root/b':{predecessorAddress:'root/a'},'root/c':{predecessorAddress:'root/b'}},state);
    materializeWirelessPipeLinks(output,state);prunePromptBranches(output,state.prunedExecutionIds);validateMaterializedPipeGraph(output);
    const before=JSON.stringify({output,descriptors});
    const edges=effectiveSmartPipeEdges(output,descriptors,wired);
    assert.deepEqual(edges.filter(e=>e.target==='root/c'),mode==='normal'?[{source:'root/b',target:'root/c',targetInput:'pipe'}]:mode==='bypass'?[{source:'root/a',target:'root/c',targetInput:'pipe'}]:[]);
    assert.equal(JSON.stringify({output,descriptors}),before);
});

test('same definition retains independent instance addresses even after execution ID renumbering',()=>{
    for(const ids of [['10:1','20:1'],['30:1','40:1']]){
        const sharedNode={};
        const descriptors=[{executionId:'a',address:'root/a',kind:'pipe'},{executionId:'b',address:'root/b',kind:'pipe'},...ids.map((executionId,i)=>({executionId,address:`root/h${i}/p`,kind:'pipe',node:sharedNode}))];
        const output={a:pipe('a'),b:pipe('b'),[ids[0]]:pipe('p'),[ids[1]]:pipe('p')};output[ids[0]].inputs.pipe=['a',0];output[ids[1]].inputs.pipe=['b',0];
        assert.deepEqual(effectiveSmartPipeEdges(output,descriptors),[{source:'root/a',target:'root/h0/p',targetInput:'pipe'},{source:'root/b',target:'root/h1/p',targetInput:'pipe'}]);
    }
});
const node=(x,y)=>({pos:[x,y],size:[200,100]});
const graph=()=>({inputNode:{slots:[{pos:[10,50]}]},outputNode:{slots:[{pos:[800,50]}]}});
test('deep sibling segments use concrete instance paths and live geometry, no graph writes',()=>{
    const root=graph(),shared=graph(),deep=graph(),a=node(40,100),b=node(300,200),h1=node(0,0),h2=node(500,0),hd=node(400,100);
    const bindings=new Map([['a',{node:a,hosts:[{id:'h1',node:h1,graph:shared}]}],['b',{node:b,hosts:[{id:'h2',node:h2,graph:shared},{id:'deep',node:hd,graph:deep}]}]]);
    const before=JSON.stringify([root,shared,deep,a,b,h1,h2,hd]);
    const segments=instanceDgSegments(root,[{source:'a',target:'b'}],bindings);
    assert.deepEqual(segments.map(s=>s.path),[['h1'],[],['h2'],['h2','deep']]);
    assert.equal(JSON.stringify([root,shared,deep,a,b,h1,h2,hd]),before);
    assert.deepEqual(instanceDgAnchor(segments[1].from),[200,-15]);h1.pos=[50,70];assert.deepEqual(instanceDgAnchor(segments[1].from),[250,55]);
    assert.deepEqual(instanceDgAnchor(segments[0].to),[800,30]);shared.outputNode.slots[0].pos=[900,80];assert.deepEqual(instanceDgAnchor(segments[0].to),[900,60]);
});
test('renderer honors debug and active instance, preserves original callback and clears snapshots',()=>{
    const root=graph(),shared=graph(),a=node(0,0),b=node(200,0),h1=node(0,100),h2=node(0,300);
    shared.rootGraph=root;
    const bindings=new Map([['a',{node:a,hosts:[]}],['b1',{node:b,hosts:[{id:'one',node:h1,graph:shared}]}],['b2',{node:b,hosts:[{id:'two',node:h2,graph:shared}]}]]);
    let calls=0,curves=0,path=['one'];const canvas={graph:shared,onDrawForeground(){calls++},setDirty(){}};
    const ctx=new Proxy({bezierCurveTo(){curves++}},{get:(o,k)=>o[k]??(()=>{})});
    publishInstanceDgProjection(canvas,root,[{source:'a',target:'b1'}],bindings,()=>path);
    setLegacyDebugVisible(false);canvas.onDrawForeground(ctx);assert.equal(curves,0);
    setLegacyDebugVisible(true);canvas.onDrawForeground(ctx);assert.equal(curves,1);
    path=['two'];canvas.onDrawForeground(ctx);assert.equal(curves,1);
    clearInstanceDgProjection(canvas);path=['one'];canvas.onDrawForeground(ctx);assert.equal(curves,1);assert.equal(calls,4);
    assert.equal(canvas.graph,shared);assert.equal(root.links,undefined);setLegacyDebugVisible(false);
});

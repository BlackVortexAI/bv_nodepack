import test from 'node:test';
import assert from 'node:assert/strict';
import { providerTitlebarAnchor } from '../ui/src/regional/providerProjectionGeometry.ts';
import { instanceDgAnchor } from '../ui/src/regional/instanceDgProjection.ts';

test('native width wins over stale classic rendering size after a renderer switch',()=>{
 const node={pos:[100,200],size:[400,180],flags:{collapsed:true},renderingSize:[120,0],width:180};
 assert.deepEqual(providerTitlebarAnchor(node,'output'),[280,185]);
});
test('Nodes 2 uses DOM measured size instead of classic collapsed cache',()=>{
 const node={pos:[100,200],size:[225,80],flags:{collapsed:true},width:120,_collapsed_width:120,__bvNodes2PresentationActive:true};
 assert.deepEqual(providerTitlebarAnchor(node,'output'),[325,185]);
});
test('global Vue surface controls unmanaged SmartPipe width and switches back',()=>{
 const previous=globalThis.LiteGraph;
 try{
  globalThis.LiteGraph={vueNodesMode:true};
  const node={pos:[100,200],size:[225,80],flags:{collapsed:true},width:120};
  assert.deepEqual(providerTitlebarAnchor(node,'output'),[325,185]);
  globalThis.LiteGraph.vueNodesMode=false;
  assert.deepEqual(providerTitlebarAnchor(node,'output'),[220,185]);
 }finally{if(previous===undefined)delete globalThis.LiteGraph;else globalThis.LiteGraph=previous;}
});

test('DG title anchor follows minimize, move and expand without changing native geometry',()=>{
    const node={pos:[100,200],size:[400,180],flags:{collapsed:false},_collapsed_width:120};
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[500,185]);
    node.flags.collapsed=true;
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[220,185]);
    assert.deepEqual(instanceDgAnchor({node,direction:'output'}),[220,185]);
    node.pos=[150,250];node._collapsed_width=180;
    const before=JSON.stringify(node);
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[330,235]);
    assert.deepEqual(providerTitlebarAnchor(node,'input'),[150,235]);
    assert.equal(JSON.stringify(node),before);
    node.flags.collapsed=false;
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[550,235]);
});

test('collapsed native width wins and missing measurements use native fallback',()=>{
    const node={pos:[10,50],size:[400,180],collapsed:true,width:160,_collapsed_width:120};
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[170,35]);
    node.width=NaN;node._collapsed_width=0;
    assert.deepEqual(providerTitlebarAnchor(node,'output'),[90,35]);
});

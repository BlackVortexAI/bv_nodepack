import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareDetectorCollectorV3} from '../ui/src/regional/detailerV3Graph.ts';

test('preparing a restored Detector Registry preserves its own domain identity',()=>{
 const oldWindow=globalThis.window;
 globalThis.window={dispatchEvent(){}};
 try {
  const value=JSON.stringify({schema:'bv.detector_registry_config',version:2,collector_id:'persisted-detector',detectors:[{id:'face',provider:'ultralytics',model_name:'bbox/face.pt'}]});
  let writes=0;
  const node={id:6,type:'BV Detector Registry',widgets:[{name:'config_json',value,callback(){writes++;}}],outputs:[{name:'resource_provider',type:'BV_RUNTIME_RESOURCE_PROVIDER'}]};
  const root={_nodes:[node]};node.graph=root;
  for(let i=0;i<3;i++)prepareDetectorCollectorV3(node,root);
  assert.equal(node.widgets[0].value,value,'restore must not mistake the registry itself for a duplicate');
  assert.equal(writes,0);
  assert.equal(node.__bvDetectorCollectorIdRemap,undefined);
 } finally {globalThis.window=oldWindow;}
});

test('a real nested duplicate gets a new ID without rewriting the original registry',()=>{
 const oldWindow=globalThis.window;globalThis.window={dispatchEvent(){}};
 try {
  const value=JSON.stringify({schema:'bv.detector_registry_config',version:2,collector_id:'original',detectors:[]});
  const make=()=>({type:'BV Detector Registry',widgets:[{name:'config_json',value}],outputs:[{name:'resource_provider',type:'BV_RUNTIME_RESOURCE_PROVIDER'}]});
  const original=make(),copy=make(),root={_nodes:[original]},child={rootGraph:root,_nodes:[copy]};
  root._nodes.push({subgraph:child});original.graph=root;copy.graph=child;
  prepareDetectorCollectorV3(copy,child);
  const copiedId=JSON.parse(copy.widgets[0].value).collector_id;
  assert.notEqual(copiedId,'original');assert.equal(original.widgets[0].value,value);
  assert.deepEqual(copy.__bvDetectorCollectorIdRemap,{original:copiedId});
  prepareDetectorCollectorV3(copy,child);prepareDetectorCollectorV3(original,root);
  assert.equal(JSON.parse(copy.widgets[0].value).collector_id,copiedId);
  assert.equal(original.widgets[0].value,value);
 } finally {globalThis.window=oldWindow;}
});

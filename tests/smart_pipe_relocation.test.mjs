import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneRouteRegistryPrefix,relocateRouteRegistry} from '../js/bv_smart_pipe_routing.js';

test('copy remaps internal Merge sources but preserves external sources and original order',()=>{
 const registry={'r/old/merge':{kind:'merge',sources:[{key:'pipe_001',mode:'wireless',address:'r/old/source'},{key:'pipe_002',mode:'wireless',address:'r/external'}],projection:{resolvedSlots:[{id:'value'}]}}};
 const before=structuredClone(registry);
 cloneRouteRegistryPrefix(registry,'r/old','r/new');
 assert.deepEqual(registry['r/new/merge'].sources.map(s=>s.address),['r/new/source','r/external']);
 assert.deepEqual(registry['r/old/merge'],before['r/old/merge']);
 assert.deepEqual(registry['r/new/merge'].sources.map(s=>s.key),['pipe_001','pipe_002']);
 assert.notEqual(registry['r/new/merge'].projection,registry['r/old/merge'].projection);
});

test('move rewrites destinations and incoming Pipe/Merge references atomically',()=>{
 const registry={'r/source':{projection:{resolvedSlots:[{id:'x'}]}},'r/receiver':{predecessorAddress:'r/source'},'r/merge':{kind:'merge',sources:[{key:'pipe_003',address:'r/source'},{key:'pipe_008',address:'r/external'}]}};
 const original=structuredClone(registry);
 const mapping=new Map([['r/source','r/host/source'],['r/receiver','r/host/receiver']]);
 const moved=relocateRouteRegistry(registry,mapping);
 assert.equal(moved['r/host/receiver'].predecessorAddress,'r/host/source');
 assert.deepEqual(moved['r/merge'].sources,[{key:'pipe_003',address:'r/host/source'},{key:'pipe_008',address:'r/external'}]);
 assert.deepEqual(registry,original);
 assert.deepEqual(relocateRouteRegistry(moved,new Map([...mapping].map(([a,b])=>[b,a]))),registry);
});

test('conflicting relocation never changes original registry',()=>{
 const registry={'r/a':{predecessorAddress:'r/x'},'r/b':{predecessorAddress:'r/y'}};
 const original=structuredClone(registry);
 assert.throws(()=>relocateRouteRegistry(registry,new Map([['r/a','r/b']])),/conflict/);
 assert.throws(()=>relocateRouteRegistry(registry,new Map([['r/a','r/c'],['r/b','r/c']])),/conflict/);
 assert.deepEqual(registry,original);
});

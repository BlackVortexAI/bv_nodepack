import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileReferenceRegistry, parseReferenceConfig, installReferenceRegistryLifecycle, freshenDuplicateReferenceRegistry } from '../ui/src/regional/referenceRegistryLifecycle.ts';
import { resolveNodePresentation } from '../ui/src/regional/nodePresentation.ts';
import { suppressInitialProjectedProviderDefinitions, reconcileDeferredPublicInputs } from '../ui/src/regional/portProjection.ts';
import { installM0CanvasVisibility, projectedProviderLink } from '../ui/src/regional/m0VisualProjection.ts';
import { installDgAnchorInteractionGuard } from '../ui/src/regional/dgRouting.ts';

const node=()=>({type:'BV Reference Registry',widgets:[{name:'config_json',value:''}],inputs:[0,1,2].map(i=>({name:`media.media${i}`,link:10+i}))});
const config=n=>parseReferenceConfig(n.widgets[0].value);

test('logical places survive source swaps and retain vacant slots',()=>{
    const n=node(),first=reconcileReferenceRegistry(n);
    n.inputs[1].link=null;
    const second=reconcileReferenceRegistry(n);
    assert.deepEqual(second.entries,[first.entries[0],first.entries[2]]);
    assert.deepEqual(second.places,first.places);
    n.inputs[1].link=99;
    assert.deepEqual(reconcileReferenceRegistry(n).entries,first.entries);
    n.inputs.push({name:'media.media3',link:100});
    const third=reconcileReferenceRegistry(n);
    assert.deepEqual(third.entries.slice(0,3),first.entries);
    assert.ok(!first.places.some(place=>place.id===third.entries[3].id));
});

test('input object replacement preserves place identity independent of native link numbers',()=>{
    const n=node(),first=reconcileReferenceRegistry(n);
    n.inputs=[{name:'media.media0',link:12},{name:'media.media1',link:10},{name:'media.media2',link:11}];
    assert.deepEqual(reconcileReferenceRegistry(n).entries,first.entries);
});

test('save/reload restores IDs even when native link numbers change',()=>{
    const n=node();reconcileReferenceRegistry(n);
    const restored=JSON.parse(JSON.stringify(n));restored.inputs.forEach(s=>s.link+=100);
    reconcileReferenceRegistry(restored,true);
    assert.deepEqual(config(restored),config(n));
});

test('disconnect/reconnect keeps its place; configure Undo restores its snapshot',()=>{
    const n=node(),before=reconcileReferenceRegistry(n),snapshot=JSON.parse(JSON.stringify(n));
    n.inputs[2].link=null;reconcileReferenceRegistry(n);
    n.inputs[2].link=123;const after=reconcileReferenceRegistry(n);
    assert.deepEqual(after.entries.slice(0,2),before.entries.slice(0,2));
    assert.equal(after.entries[2].id,before.entries[2].id);
    const undo=JSON.parse(JSON.stringify(snapshot));reconcileReferenceRegistry(undo,true);
    assert.deepEqual(config(undo),before);
});

test('clone freshens collector identity across concrete subgraphs, keeps scoped entry IDs',()=>{
    const source=node();reconcileReferenceRegistry(source);
    const clone=JSON.parse(JSON.stringify(source));
    const inner={_nodes:[]},root={_nodes:[{subgraph:inner},source]};source.graph=root;
    freshenDuplicateReferenceRegistry(source);
    inner._nodes.push(clone);clone.graph={rootGraph:root};
    freshenDuplicateReferenceRegistry(clone);
    assert.notEqual(config(clone).collector_id,config(source).collector_id);
    assert.deepEqual(config(clone).entries,config(source).entries);
    const before=config(source);freshenDuplicateReferenceRegistry(source);assert.deepEqual(config(source),before);
});

test('configure and immediate prompt serialization do not replace persisted identities',async()=>{
    class Native {constructor(){Object.assign(this,node())}onConfigure(){}onNodeCreated(){}}
    installReferenceRegistryLifecycle(Native);
    const n=new Native();n.onNodeCreated();await Promise.resolve();
    const before=config(n);
    n.onConfigure();
    const serialized=n.widgets[0].serializeValue();
    assert.deepEqual(JSON.parse(serialized),before);
    await Promise.resolve();assert.deepEqual(config(n),before);
});

test('history serialization never commits transient disconnected state',async()=>{
    class Native {constructor(){Object.assign(this,node())}onNodeCreated(){}}
    installReferenceRegistryLifecycle(Native);
    const n=new Native();n.onNodeCreated();await Promise.resolve();
    const before=config(n);
    n.inputs[1].link=null;
    const snapshot={widgets_values:[],widgets_values_named:{}};
    n.onSerialize(snapshot);
    assert.deepEqual(JSON.parse(n.widgets[0].serializeValue()),before);
    assert.deepEqual(JSON.parse(snapshot.widgets_values[0]),before);
    assert.deepEqual(JSON.parse(snapshot.widgets_values_named.config_json),before);
    assert.deepEqual(config(n),before);
});

test('native configure connection callbacks cannot open an identity transaction',async()=>{
    const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame=()=>1;globalThis.cancelAnimationFrame=()=>{};
    try{
        let begins=0;
        class Native{constructor(){Object.assign(this,node());this.graph={beforeChange(){begins++},afterChange(){}}}onNodeCreated(){}configure(snapshot){this.onConnectionsChange(1,0);this.widgets[0].value=snapshot;this.onConfigure({widgets_values:[snapshot]})}}
        installReferenceRegistryLifecycle(Native);
        const n=new Native();n.onNodeCreated();await Promise.resolve();const before=n.widgets[0].value;
        n.onConnectionsChange(1,0);assert.equal(begins,1);
        n.configure(before);await Promise.resolve();
        assert.equal(begins,1);assert.equal(n.widgets[0].value,before);
    }finally{globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel}
});

test('disconnect identity update is one balanced history transaction across registries',async()=>{
    const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame,frames=new Map();let serial=0,depth=0;
    globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial};
    globalThis.cancelAnimationFrame=id=>frames.delete(id);
    try{
        const snapshots=[],graph={beforeChange(){depth++},afterChange(){if(--depth===0)snapshots.push(nodes.map(config))}};
        class Native{constructor(){Object.assign(this,node());this.graph=graph}onNodeCreated(){}}
        installReferenceRegistryLifecycle(Native);
        const nodes=[new Native(),new Native()];nodes.forEach(n=>n.onNodeCreated());await Promise.resolve();
        const before=nodes.map(config);
        graph.beforeChange();
        for(const n of nodes){
            n.inputs[1].link=null;n.onConnectionsChange(1,1,false);

        }
        graph.afterChange();assert.equal(snapshots.length,0);
        await Promise.resolve();
        for(const [id,callback] of [...frames]){frames.delete(id);callback()}
        assert.equal(depth,0);assert.equal(snapshots.length,1);
        snapshots[0].forEach((value,index)=>assert.deepEqual(value.entries,[before[index].entries[0],before[index].entries[2]]));
    }finally{globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel}
});

test('pending transaction closes exactly once on configure, removal and callback failure',async()=>{
    const raf=globalThis.requestAnimationFrame,cancel=globalThis.cancelAnimationFrame,frames=new Map();let serial=0;
    globalThis.requestAnimationFrame=callback=>{frames.set(++serial,callback);return serial};
    globalThis.cancelAnimationFrame=id=>frames.delete(id);
    try{
        for(const termination of ['onConfigure','onRemoved','throw']){
            let depth=0,closed=0;
            class Native{constructor(){Object.assign(this,node());this.graph={beforeChange(){depth++},afterChange(){depth--;closed++}}}onNodeCreated(){}onConnectionsChange(){if(termination==='throw')throw Error('native failure')}}
            installReferenceRegistryLifecycle(Native);
            const n=new Native();n.onNodeCreated();await Promise.resolve();
            if(termination==='throw')assert.throws(()=>n.onConnectionsChange(1,1),/native failure/);
            else{n.onConnectionsChange(1,1);await Promise.resolve();n[termination]()}
            await Promise.resolve();
            assert.equal(depth,0);assert.equal(closed,1);assert.equal(frames.size,0);
        }
    }finally{globalThis.requestAnimationFrame=raf;globalThis.cancelAnimationFrame=cancel}
});


test('restore uses captured serialized identity even when native widget hydration writes stale value',async()=>{
    class Native{constructor(){Object.assign(this,node())}onNodeCreated(){}}
    installReferenceRegistryLifecycle(Native);
    const n=new Native();n.onNodeCreated();await Promise.resolve();
    const before=n.widgets[0].value;
    n.onConfigure({widgets_values:[before]});
    const stale=JSON.parse(before);stale.entries.splice(1,1);stale.entries[1].slot='media1';
    n.widgets[0].value=JSON.stringify(stale);
    await Promise.resolve();assert.equal(n.widgets[0].value,before);
});

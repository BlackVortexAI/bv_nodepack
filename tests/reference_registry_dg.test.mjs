import assert from 'node:assert/strict';
import test from 'node:test';
import {applyInteractiveFanIn,removeInteractiveFanIn} from '../ui/src/regional/interactiveFanIn.ts';
import {applyClassicNodePresentation} from '../ui/src/regional/classicNodePresentation.ts';
import {resolveNodePresentation} from '../ui/src/regional/nodePresentation.ts';
import {installNodePresentationLifecycle} from '../ui/src/regional/nodePresentationLifecycle.ts';
import {registryChannelFamily,registryKindAllowed,uniqueWorkflowRegistry} from '../ui/src/regional/registryDgFamilies.ts';
import {prepareDgClipboard} from '../ui/src/regional/dgRouting.ts';
import '../ui/src/regional/loraRegistryDgAdapter.ts';
import {parseReferenceSelection} from '../ui/src/regional/referenceRegistryGraph.ts';

test('one fan-in is visible on every surface and targets only free canonical inputs',()=>{
    const inputs=[0,1,2].map(index=>({name:`media.media${index}`,type:'IMAGE,AUDIO,VIDEO',link:index===2?null:index+1}));
    const original=()=>undefined,n={type:'BV Reference Registry',inputs,outputs:[],widgets:[],pos:[50,60],getInputOnPos:original,getConnectionPos(){return[1,2]}};
    for(const surface of ['classic','ghost','nodes2']){
        const plan=resolveNodePresentation(n.type,{ports:inputs.map(slot=>({...slot,direction:'input',connected:slot.link!=null})),widgets:[]},{surface,legacyDebug:false});
        assert.deepEqual(plan.ports.filter(slot=>slot.visible).map(slot=>slot.name),['media.media2']);
    }
    applyClassicNodePresentation(n,n.type);
    assert.equal(n.getInputOnPos([50,70]),inputs[2]);
    assert.deepEqual(inputs.map((_,index)=>n.getConnectionPos(true,index)),[[50,70],[50,70],[50,70]]);
    assert.equal(n.onConnectInput(0),false);assert.equal(n.onConnectInput(2),true);
    inputs[2].link=3;applyInteractiveFanIn(n);assert.equal(n.getInputOnPos([50,70]),undefined);
    n.flags={collapsed:true};assert.deepEqual(n.getConnectionPos(true,1),[50,45]);
    removeInteractiveFanIn(n);assert.equal(n.getInputOnPos,original);assert.ok(inputs.every(slot=>!Object.hasOwn(slot,'pos')));
});

test('explicit socketless schema survives native STRING widget creation',()=>{
    class Node{addWidget(type,name){return{name,options:{}}}addDOMWidget(name){return{name,options:{}}}}
    installNodePresentationLifecycle(Node,{name:'BV Reference Registry',input:{required:{config_json:['STRING',{socketless:true}],other:['STRING',{}]}}});
    const n=new Node();assert.equal(n.addDOMWidget('config_json').options.socketless,true);
    assert.equal(n.addWidget('text','config_json').options.socketless,true);
    assert.equal(n.addWidget('text','other').options.socketless,undefined);
});

test('reference family is isolated and uses collector IDs across concrete scopes',()=>{
    assert.equal(registryChannelFamily({type:'BV Regional Prompt'},'reference_resource_provider_20'),'reference');
    assert.equal(registryChannelFamily({type:'BV Regional Prompt'},'reference_resource_provider_21'),null);
    assert.equal(registryKindAllowed('reference','reference'),true);
    for(const kind of ['lora','lut','detector',null])assert.equal(registryKindAllowed('reference',kind),false);
    const id=crypto.randomUUID(),source={type:'BV Reference Registry',widgets:[{name:'config_json',value:JSON.stringify({collector_id:id})}]},root={_nodes:[source]},child={rootGraph:root,_nodes:[]};
    root._nodes.push({subgraph:child});const target={__bvConcreteGraph:child};
    assert.equal(uniqueWorkflowRegistry(target,'reference',id),source);
    child._nodes.push(structuredClone(source));assert.equal(uniqueWorkflowRegistry(target,'reference',id),null);
    assert.throws(()=>parseReferenceSelection({version:1,collector_ids:[id,id]}));
    assert.throws(()=>parseReferenceSelection({version:1,collector_ids:Array.from({length:21},()=>crypto.randomUUID())}));
});

test('registry and RP clipboard remap domain and DG transport without changing other families',()=>{
    const id=crypto.randomUUID(),resource=crypto.randomUUID(),config={schema:'bv.reference_registry_config',version:1,collector_id:id,entries:[{id:resource,slot:'media0'}]};
    const source={type:'BV Reference Registry',properties:{bvDgSenderId:'source',bvRegistryDgSource:true},widgets_values:[JSON.stringify(config)]};
    const selection=JSON.stringify({version:1,collector_ids:[id]}),old=['document','bindings','lora','detailer','lut'];
    const prompt={type:'BV Regional Prompt',properties:{bvRegistryDgFamilies:['reference'],bvRegistryDgSelections:{reference_resource_provider_1:'source'},bvRegistryDgSourceKinds:{reference_resource_provider_1:'reference'}},widgets_values:[...old,selection]};
    const copy=prepareDgClipboard({nodes:[source,prompt]}),next=JSON.parse(copy.nodes[0].widgets_values[0]);
    assert.notEqual(next.collector_id,id);assert.equal(next.entries[0].id,resource);
    assert.deepEqual(JSON.parse(copy.nodes[1].widgets_values[5]).collector_ids,[next.collector_id]);
    assert.deepEqual(copy.nodes[1].widgets_values.slice(0,5),old);
    assert.equal(copy.nodes[1].properties.bvRegistryDgSelections.reference_resource_provider_1,copy.nodes[0].properties.bvDgSenderId);
    assert.equal(prepareDgClipboard({nodes:[prompt]}).nodes[0].widgets_values[5],selection);
    assert.equal(source.widgets_values[0],JSON.stringify(config));
});

test('authoring-only copied references follow their copied registry without DG selection',()=>{
 const id=crypto.randomUUID(),resource=crypto.randomUUID(),place={id:resource,slot:'media0'};
 const registry={type:'BV Reference Registry',properties:{},widgets_values:[JSON.stringify({schema:'bv.reference_registry_config',version:1,collector_id:id,entries:[place],places:[place]})]};
 const document={prompts:{global:{positive_source:'@Image 1',references:{positive:[{start:0,end:8,label:'@Image 1',collector_id:id,resource_id:resource}]}}},regions:[]};
 const prompt={type:'BV Regional Prompt',properties:{},widgets_values:[JSON.stringify(document)]};
 const copy=prepareDgClipboard({nodes:[registry,prompt]});
 const next=JSON.parse(copy.nodes[0].widgets_values[0]);
 assert.notEqual(next.collector_id,id);
 assert.deepEqual(next.places,[place]);
 assert.equal(JSON.parse(copy.nodes[1].widgets_values[0]).prompts.global.references.positive[0].collector_id,next.collector_id);
 assert.equal(JSON.parse(prepareDgClipboard({nodes:[prompt]}).nodes[0].widgets_values[0]).prompts.global.references.positive[0].collector_id,id);
});

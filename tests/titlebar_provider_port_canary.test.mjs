import assert from"node:assert/strict";
import{readFileSync}from"node:fs";
import test from"node:test";
import{CANARY_VARIANTS,createSlotOrderFixture,createTitlebarProviderPortEvidence,createTitlebarProviderPortFixture,projectCanonicalNodeRows,projectTitlebarProviderPort,verifyTitlebarProviderPortEvidence}from"../ui/src/prototypes/titlebarProviderPortCanary.ts";

test("three variants project deterministic anchors while leaving fixture sizes untouched",()=>{
  const fixture=createTitlebarProviderPortFixture();
  const expectedY={A:[165,130],B:[180,145],C:[150,115]};
  assert.deepEqual(CANARY_VARIANTS.map(item=>item.key),["A","B","C"]);
  for(const variant of CANARY_VARIANTS.map(item=>item.key)){
    const evidence=createTitlebarProviderPortEvidence(variant,fixture);
    assert.deepEqual(evidence.output.anchor,{x:320,y:expectedY[variant][0]});
    assert.deepEqual(evidence.input.anchor,{x:560,y:expectedY[variant][1]});
    assert.deepEqual(evidence.output.localAnchor,{x:240,y:expectedY[variant][0]-180});
    assert.deepEqual(evidence.input.localAnchor,{x:0,y:expectedY[variant][1]-145});
    assert.deepEqual(evidence.nodeSizes,{registry:[240,150],consumer:[280,190]});
    assert.equal(evidence.output.canonicalSlotIndex,2);assert.equal(evidence.input.canonicalSlotIndex,1);
    assert.deepEqual(verifyTitlebarProviderPortEvidence(evidence),{endpointMatchesAnchor:true,expectedHitboxCentersAnchor:true,canonicalSlotIndicesPreserved:true});
  }
});

test("projection is inspect-only and preserves slot, link and object identity",()=>{
  const fixture=createTitlebarProviderPortFixture(),before=JSON.stringify(fixture),registry=fixture.registry,output=fixture.registryOutput,consumer=fixture.consumer,input=fixture.consumerInput,link=fixture.link;
  for(const variant of CANARY_VARIANTS.map(item=>item.key)){
    projectTitlebarProviderPort(registry,output,variant);
    projectTitlebarProviderPort(consumer,input,variant);
  }
  assert.equal(JSON.stringify(fixture),before);
  assert.equal(fixture.registry,registry);assert.equal(fixture.registryOutput,output);assert.equal(fixture.consumer,consumer);assert.equal(fixture.consumerInput,input);assert.equal(fixture.link,link);
  assert.deepEqual(fixture.registryOutput,{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",direction:"output",index:2,links:[9001]});
  assert.deepEqual(fixture.consumerInput,{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",direction:"input",index:1,link:9001});
  assert.deepEqual(fixture.link,{id:9001,type:"BV_RUNTIME_RESOURCE_PROVIDER",origin_id:101,origin_slot:2,target_id:202,target_slot:1});
});

test("unlinked provider slots use the same pure geometry without inventing a link",()=>{
  const fixture=createTitlebarProviderPortFixture(false),before=JSON.stringify(fixture);
  assert.deepEqual(fixture.registryOutput.links,[]);assert.equal(fixture.consumerInput.link,null);assert.equal(fixture.link,null);
  for(const variant of CANARY_VARIANTS.map(item=>item.key)){
    const evidence=createTitlebarProviderPortEvidence(variant,fixture);
    assert.equal(evidence.link,null);
    assert.deepEqual(verifyTitlebarProviderPortEvidence(evidence),{endpointMatchesAnchor:true,expectedHitboxCentersAnchor:true,canonicalSlotIndicesPreserved:true});
  }
  assert.equal(JSON.stringify(fixture),before);
});

test("provider slots keep canonical first middle or last indices while visual body rows compact",()=>{
  for(const direction of["input","output"]){
    for(const position of["first","middle","last"]){
      for(const linked of[false,true]){
        const fixture=createSlotOrderFixture(direction,position,linked),before=JSON.stringify(fixture),inputs=fixture.inputs,outputs=fixture.outputs,widgets=fixture.widgets,links=fixture.links,inputRefs=[...inputs],outputRefs=[...outputs],widgetRefs=[...widgets],linkRefs=[...links];
        const projection=projectCanonicalNodeRows(fixture),selected=direction==="input"?projection.inputs:projection.outputs,other=direction==="input"?projection.outputs:projection.inputs,canonical=direction==="input"?inputs:outputs,providerIndex={first:0,middle:1,last:2}[position],provider=canonical[providerIndex];

        assert.equal(JSON.stringify(fixture),before,`${direction}/${position}/${linked}: serializable fixture changed`);
        assert.equal(fixture.inputs,inputs);assert.equal(fixture.outputs,outputs);assert.equal(fixture.widgets,widgets);assert.equal(fixture.links,links);
        inputRefs.forEach((slot,index)=>assert.equal(fixture.inputs[index],slot));outputRefs.forEach((slot,index)=>assert.equal(fixture.outputs[index],slot));widgetRefs.forEach((widget,index)=>assert.equal(fixture.widgets[index],widget));linkRefs.forEach((link,index)=>assert.equal(fixture.links[index],link));

        assert.equal(selected.titlebarSlots.length,1);assert.equal(selected.titlebarSlots[0].slot,provider);assert.equal(selected.titlebarSlots[0].canonicalSlotIndex,providerIndex);assert.equal(selected.titlebarSlots[0].titlebarVisualOrdinal,0);
        assert.deepEqual(selected.bodyRows.map(row=>row.visualRowIndex),[0,1]);
        assert.deepEqual(selected.bodyRows.map(row=>row.canonicalSlotIndex),[0,1,2].filter(index=>index!==providerIndex));
        assert.deepEqual(selected.projectedSlots.map(item=>item.placement),[0,1,2].map(index=>index===providerIndex?"title":"body"));
        assert.deepEqual(selected.projectedSlots.map(item=>item.visualOrdinal),[0,1,2].map(index=>index===providerIndex?null:index-(index>providerIndex?1:0)));
        assert.equal(new Set(selected.bodyRows.map(row=>row.slot)).size,2);assert.equal(selected.bodyRows.some(row=>row.slot===provider),false);
        assert.equal(other.titlebarSlots.length,0);assert.deepEqual(other.bodyRows.map(row=>row.visualRowIndex),[0,1]);
        assert.equal(projection.widgetStartRow,2);assert.equal(projection.widgets.length,1);assert.equal(projection.widgets[0].widget,widgets[0]);assert.equal(projection.widgets[0].visualRowIndex,2);

        assert.equal(Object.hasOwn(provider,"hidden"),false);assert.equal(Object.hasOwn(provider,"label"),false);assert.equal(Object.hasOwn(provider,"localized_name"),false);assert.equal(Object.hasOwn(provider,"pos"),false);
        if(linked){assert.equal(links.length,1);assert.equal(direction==="input"?links[0].target_slot:links[0].origin_slot,providerIndex)}else assert.equal(links.length,0);
      }
    }
  }
});

test("multiple interleaved providers compact independently on both sides without touching link indices",()=>{
  const inputs=[{name:"image",type:"IMAGE",link:null},{name:"resource_provider_1",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:8101,titlebarProvider:true},{name:"resource_provider_2",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null,titlebarProvider:true},{name:"mask",type:"MASK",link:null}],outputs=[{name:"image",type:"IMAGE",links:null},{name:"resource_provider_a",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:null,titlebarProvider:true},{name:"resource_provider_b",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[8102],titlebarProvider:true},{name:"summary",type:"STRING",links:null}],widgets=[{name:"config_json",type:"text",value:"{}"}],links=[{id:8101,type:"BV_RUNTIME_RESOURCE_PROVIDER",origin_id:1,origin_slot:0,target_id:2,target_slot:1},{id:8102,type:"BV_RUNTIME_RESOURCE_PROVIDER",origin_id:2,origin_slot:2,target_id:3,target_slot:0}],fixture={inputs,outputs,widgets,links},before=JSON.stringify(fixture),inputRefs=[...inputs],outputRefs=[...outputs],linkRefs=[...links];
  const projection=projectCanonicalNodeRows(fixture);
  assert.deepEqual(projection.inputs.bodyRows.map(row=>[row.visualRowIndex,row.canonicalSlotIndex,row.slot.name]),[[0,0,"image"],[1,3,"mask"]]);
  assert.deepEqual(projection.outputs.bodyRows.map(row=>[row.visualRowIndex,row.canonicalSlotIndex,row.slot.name]),[[0,0,"image"],[1,3,"summary"]]);
  assert.deepEqual(projection.inputs.projectedSlots.map(item=>[item.placement,item.visualOrdinal]),[["body",0],["title",null],["title",null],["body",1]]);
  assert.deepEqual(projection.outputs.projectedSlots.map(item=>[item.placement,item.visualOrdinal]),[["body",0],["title",null],["title",null],["body",1]]);
  assert.deepEqual(projection.inputs.titlebarSlots.map(item=>[item.canonicalSlotIndex,item.titlebarVisualOrdinal]),[[1,0],[2,1]]);assert.deepEqual(projection.outputs.titlebarSlots.map(item=>[item.canonicalSlotIndex,item.titlebarVisualOrdinal]),[[1,0],[2,1]]);
  assert.equal(JSON.stringify(fixture),before);inputRefs.forEach((slot,index)=>assert.equal(inputs[index],slot));outputRefs.forEach((slot,index)=>assert.equal(outputs[index],slot));linkRefs.forEach((link,index)=>assert.equal(links[index],link));
  assert.deepEqual(links.map(link=>[link.origin_slot,link.target_slot]),[[0,1],[2,0]]);
});

test("asymmetric sides place widgets after the larger compacted body count",()=>{
  const inputs=[{name:"a",type:"A",link:null},{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",link:null,titlebarProvider:true},{name:"b",type:"B",link:null},{name:"c",type:"C",link:null}],outputs=[{name:"d",type:"D",links:null},{name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:[],titlebarProvider:true}],widgets=[{name:"w1",type:"text",value:"1"},{name:"w2",type:"text",value:"2"}],fixture={inputs,outputs,widgets,links:[]},before=JSON.stringify(fixture),widgetRefs=[...widgets];
  const projection=projectCanonicalNodeRows(fixture);
  assert.equal(projection.inputs.bodyRowCount,3);assert.equal(projection.outputs.bodyRowCount,1);assert.equal(projection.widgetStartRow,3);
  assert.deepEqual(projection.widgets.map(item=>[item.visualRowIndex,item.canonicalWidgetIndex,item.widget.name]),[[3,0,"w1"],[4,1,"w2"]]);
  widgetRefs.forEach((widget,index)=>assert.equal(widgets[index],widget));assert.equal(JSON.stringify(fixture),before);
});

test("unlinked output null and empty-array forms survive projection exactly",()=>{
  for(const linksValue of[null,[]]){
    const provider={name:"resource_provider",type:"BV_RUNTIME_RESOURCE_PROVIDER",links:linksValue,titlebarProvider:true},fixture={inputs:[],outputs:[{name:"before",type:"A",links:null},provider,{name:"after",type:"B",links:null}],widgets:[],links:[]},before=JSON.stringify(fixture);
    const projection=projectCanonicalNodeRows(fixture);
    assert.equal(projection.outputs.titlebarSlots[0].slot,provider);assert.equal(provider.links,linksValue);assert.equal(JSON.stringify(fixture),before);
  }
});

test("canary stays outside production entries and graph mutation APIs",()=>{
  const source=readFileSync(new URL("../ui/src/prototypes/titlebarProviderPortCanary.ts",import.meta.url),"utf8"),index=readFileSync(new URL("../ui/src/index.tsx",import.meta.url),"utf8"),showcase=readFileSync(new URL("../ui/src/showcase.tsx",import.meta.url),"utf8"),vite=readFileSync(new URL("../ui/vite.config.js",import.meta.url),"utf8");
  assert.doesNotMatch(index,/titlebarProviderPortCanary/);assert.doesNotMatch(showcase,/titlebarProviderPortCanary/);assert.doesNotMatch(vite,/titlebar-provider-port|titlebarProviderPortCanary/);
  for(const forbidden of["addInput(","addOutput(","removeInput(","removeOutput(","connect(","disconnectInput(","disconnectOutput(","graphToPrompt","onSerialize","onConfigure",".pos=",".splice(",".sort("])assert.equal(source.includes(forbidden),false,`forbidden prototype API: ${forbidden}`);
});

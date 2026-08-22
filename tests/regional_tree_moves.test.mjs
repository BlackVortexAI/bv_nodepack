import assert from "node:assert/strict";
import test from "node:test";
import { applyTreeMove } from "../ui/src/regional/treeMoves.ts";

const geometry = (id, layer, operation = "add") => ({ id, layer_id: layer, type:"rect", operation, enabled:true, authoring:{ name:layer, visible:true, locked:false }, x:0, y:0, width:.2, height:.2 });
const region = (id, items, locked = false) => ({ id, name:id, parent_region_id:null, enabled:true, usage:"generation", strength:1, priority:0, prompts:{positive_source:"",negative_source:""}, mask:{feather:0}, geometry:items, authoring:{visible:true,locked,color:"#fff"} });
const document = () => ({ schema:"bv.regional", version:2, document_id:"doc", title:"Doc", canvas:{width:100,height:100}, prompts:{global:{positive_source:"",negative_source:""},background:{positive_source:"",negative_source:""}}, negative_mode:"auto", overlap:{mode:"joint"}, regions:[region("a",[geometry("a1","la"),geometry("a2","la")]),region("b",[geometry("b1","lb")])] });

test("tree move transfers a complete layer between regions without changing its stable id", () => {
    const value=document();
    assert.equal(applyTreeMove(value,{source:{kind:"layer",regionId:"a",layerId:"la"},target:{kind:"region",regionId:"b"},position:"inside"},()=>"new"),true);
    assert.deepEqual(value.regions[0].geometry,[]);
    assert.deepEqual(value.regions[1].geometry.map(item=>[item.id,item.layer_id]),[["b1","lb"],["a1","la"],["a2","la"]]);
});

test("tree move can attach one operation to another layer while preserving its mask group", () => {
    const value=document();
    assert.equal(applyTreeMove(value,{source:{kind:"geometry",regionId:"a",layerId:"la",geometryId:"a1"},target:{kind:"layer",regionId:"b",layerId:"lb"},position:"inside"},()=>"new"),true);
    const moved=value.regions[1].geometry.at(-1);
    assert.deepEqual([moved.id,moved.layer_id,moved.mask_group_id],["a1","lb","la"]);
});

test("tree move creates a fresh independent layer when an operation is dropped on a region", () => {
    const value=document();
    assert.equal(applyTreeMove(value,{source:{kind:"geometry",regionId:"a",layerId:"la",geometryId:"a1"},target:{kind:"region",regionId:"b"},position:"inside"},()=>"fresh"),true);
    assert.deepEqual([value.regions[1].geometry.at(-1).id,value.regions[1].geometry.at(-1).layer_id],["a1","fresh"]);
});

test("tree move rejects locked targets without mutating the document", () => {
    const value=document(); value.regions[1].authoring.locked=true; const before=structuredClone(value);
    assert.equal(applyTreeMove(value,{source:{kind:"layer",regionId:"a",layerId:"la"},target:{kind:"region",regionId:"b"},position:"inside"},()=>"new"),false);
    assert.deepEqual(value,before);
});

test("tree move rejects removing the additive base from subtract operations", () => {
    const value=document(); value.regions[0].geometry=[geometry("base","la"),geometry("cut","la","subtract")]; const before=structuredClone(value);
    assert.equal(applyTreeMove(value,{source:{kind:"geometry",regionId:"a",layerId:"la",geometryId:"base"},target:{kind:"region",regionId:"b"},position:"inside"},()=>"fresh"),false);
    assert.deepEqual(value,before);
});

test("tree move rejects a standalone subtract layer", () => {
    const value=document(); value.regions[0].geometry=[geometry("base","la"),geometry("cut","la","subtract")]; const before=structuredClone(value);
    assert.equal(applyTreeMove(value,{source:{kind:"geometry",regionId:"a",layerId:"la",geometryId:"cut"},target:{kind:"region",regionId:"b"},position:"inside"},()=>"fresh"),false);
    assert.deepEqual(value,before);
});

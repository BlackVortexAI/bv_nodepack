import assert from"node:assert/strict";
import test from"node:test";
import{fitHoverPreviewSize,HOVER_PREVIEW_MAX_SIZE,numberScrubDelta,numberScrubValue,placeHoverPreview,reorderByStableId}from"../ui/src/ui/components/compactInteractions.ts";

test("number scrub math is horizontal, finite and clamped",()=>{
  assert.equal(numberScrubValue(1,20,.01,-5,5),1.2);
  assert.equal(numberScrubValue(4.95,20,.01,-5,5),5);
  assert.equal(numberScrubValue(-4.95,-20,.01,-5,5),-5);
  assert.equal(numberScrubValue(1,Number.NaN,.01,-5,5),1);
});

test("number scrub drag quantizes relative deltas without changing pixel sensitivity",()=>{
  assert.equal(numberScrubDelta(5,.01,.05),.05);
  assert.equal(numberScrubDelta(50,.01,.05),.5);
  assert.equal(numberScrubDelta(100,.01,.05),1);
  assert.equal(numberScrubDelta(-5,.01,.05),-.05);
  assert.equal(numberScrubDelta(4,.01,.05),.05);
  assert.equal(numberScrubValue(.13,5,.01,-5,5,.05),.18);
  assert.equal(numberScrubValue(4.98,5,.01,-5,5,.05),5);
});

test("stable-id reorder fails closed when gesture state is stale",()=>{
  const items=[{id:"a",value:1},{id:"b",value:2},{id:"c",value:3}];
  assert.deepEqual(reorderByStableId(items,"c","a","before").map(item=>item.id),["c","a","b"]);
  assert.equal(reorderByStableId(items,"missing","a","before"),items);
  assert.equal(reorderByStableId(items,"a","missing","after"),items);
});

test("hover preview placement stays inside every viewport edge",()=>{
  const size=HOVER_PREVIEW_MAX_SIZE,viewport={width:800,height:600};
  assert.deepEqual(placeHoverPreview({x:20,y:20},size,viewport),{left:36,top:8,width:240,height:320});
  const edge=placeHoverPreview({x:795,y:595},size,viewport);
  assert.ok(edge.left>=8&&edge.left+edge.width<=viewport.width-8);
  assert.ok(edge.top>=8&&edge.top+edge.height<=viewport.height-8);
});

test("hover preview preserves aspect ratio inside 240 by 320 bounds without upscaling",()=>{
  assert.deepEqual(HOVER_PREVIEW_MAX_SIZE,{width:240,height:320});
  assert.deepEqual(fitHoverPreviewSize({width:2016,height:1152}),{width:240,height:137});
  assert.deepEqual(fitHoverPreviewSize({width:832,height:1216}),{width:219,height:320});
  assert.deepEqual(fitHoverPreviewSize({width:1000,height:1000}),{width:240,height:240});
  assert.deepEqual(fitHoverPreviewSize({width:120,height:80}),{width:120,height:80});
  assert.deepEqual(fitHoverPreviewSize({width:400,height:2000}),{width:64,height:320});
});

test("hover preview placement clamps a portrait preview in a smaller viewport",()=>{
  const size=fitHoverPreviewSize({width:832,height:1216}),viewport={width:180,height:220},placed=placeHoverPreview({x:175,y:215},size,viewport);
  assert.deepEqual(placed,{left:19,top:8,width:140,height:204});
  assert.ok(placed.left+placed.width<=viewport.width-8);
  assert.ok(placed.top+placed.height<=viewport.height-8);
});

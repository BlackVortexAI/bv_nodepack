import assert from 'node:assert/strict';
import test from 'node:test';
import {visibleImageViewport,displayBitmapSize,coverSourceRect,paddedViewport} from '../ui/src/ui/viewportImage.ts';

test('camera image fit renders screen pixels and zoom selects original detail',()=>{
 const fit=visibleImageViewport(6000,4000,.1,0,0,600,400);
 assert.deepEqual(displayBitmapSize(fit.cssWidth,fit.cssHeight,2),{width:1200,height:800});
 assert.deepEqual(coverSourceRect(6000,4000,6000,4000,fit),{x:0,y:0,width:6000,height:4000});
 const zoom=visibleImageViewport(6000,4000,2,-3000,-2000,600,400);
 assert.deepEqual(coverSourceRect(6000,4000,6000,4000,zoom),{x:1500,y:1000,width:300,height:200});
});
test('visible world coordinates preserve normalized pointer mapping at all zooms',()=>{
 for(const zoom of [.02,.1,1,8]){
  const left=-16000*zoom*.3,top=-10000*zoom*.2;
  const view=visibleImageViewport(16000,10000,zoom,left,top,600,400);
  assert.ok(Math.abs((view.x+120/zoom)/16000-(120-left)/(16000*zoom))<1e-12);
  assert.ok(view.cssWidth<=600.000001 && view.cssHeight<=400.000001);
 }
});
test('display buffers obey pixel and side budgets including high DPR',()=>{
 for(const [w,h] of [[600,400],[5000,5000],[16000,10000],[100000,1],[1,100000]])for(const dpr of [1,2,4]){
  const size=displayBitmapSize(w,h,dpr);
  assert.ok(size.width*size.height<=8_000_000);
  assert.ok(size.width<=4096&&size.height<=4096);
 }
 assert.deepEqual(displayBitmapSize(0,100,2),{width:0,height:0});
});
test('offscreen images allocate no visible bitmap',()=>{
 for(const left of [-10000,10000]){
  const view=visibleImageViewport(5000,3000,1,left,0,600,400);
  assert.equal(view.width,0);
  assert.deepEqual(displayBitmapSize(view.cssWidth,view.cssHeight,2),{width:0,height:0});
 }
});
test('cover mapping retains top-left alignment and filters include a clamped halo',()=>{
 const view=visibleImageViewport(1000,1000,1,-200,-300,400,400);
 assert.deepEqual(coverSourceRect(2000,1000,1000,1000,view),{x:200,y:300,width:400,height:400});
 assert.deepEqual(paddedViewport(view,1000,1000,64),{x:136,y:236,width:528,height:528});
 assert.deepEqual(paddedViewport(view,1000,1000,1000),{x:0,y:0,width:1000,height:1000});
});

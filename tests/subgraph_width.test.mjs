import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
async function loadSeed(){
 const file=new URL('../js/bv_seed.js',import.meta.url);let source=await readFile(file,'utf8');
 source=source.replace('import { app } from "../../scripts/app.js";','const app={registerExtension(){}};').replace(/from "(\.\/[^\"]+)"/g,(_,path)=>`from ${JSON.stringify(new URL(path,file).href)}`);
 source+='\nexport {relayout};';return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
test('Seed content relayout preserves native measured user width while updating content height',async()=>{
 const {relayout}=await loadSeed();const node={size:[500,400],computeSize:()=>[210,180],expandToFitContent(){},setSize(size){this.size=[...size]},setDirtyCanvas(){}};
 relayout(node);assert.deepEqual(node.size,[500,180]);
});
test('Seed content relayout can grow a node for wider content',async()=>{
 const {relayout}=await loadSeed();const node={size:[200,100],computeSize:()=>[350,180],expandToFitContent(){},setSize(size){this.size=[...size]},setDirtyCanvas(){}};
 relayout(node);assert.deepEqual(node.size,[350,180]);
});
test('content resize follows a later intentional narrower width, not a historical maximum',async()=>{
 const {relayout}=await loadSeed();const node={size:[500,200],computeSize:()=>[210,200],setSize(size){this.size=[...size]},setDirtyCanvas(){}};
 relayout(node);node.setSize([320,200]);relayout(node);assert.deepEqual(node.size,[320,200]);
});
test('automatic bridge retains explicit user height and uses the current chosen width',async()=>{
 const {resizeNodeToContent}=await import('../js/bv_node_resize.js');
 const {presentationSize,setAutomaticPresentationSize,removePresentationSizeLifecycle}=await import('../ui/src/regional/presentationSize.ts');
 const previous=globalThis.__bvNodePresentationBridge;
 const node={size:[500,400],properties:{bvPresentationSizeVersion:1,bvPresentationUserHeight:400},computeSize:()=>[210,180],setSize(size){this.size=[...size]}};
 try{
  globalThis.__bvNodePresentationBridge={setAutomaticSize(n,size){return setAutomaticPresentationSize(n,presentationSize(n,size))}};
  resizeNodeToContent(node);assert.deepEqual(node.size,[500,400]);
  node.size=[320,400];resizeNodeToContent(node);assert.deepEqual(node.size,[320,400]);
  node.computeSize=()=>[600,180];resizeNodeToContent(node);assert.deepEqual(node.size,[600,400]);
 }finally{removePresentationSizeLifecycle(node);globalThis.__bvNodePresentationBridge=previous;}
});

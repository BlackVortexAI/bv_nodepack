import assert from "node:assert/strict";
import test from "node:test";
import {bootstrapLoraCatalog,createLoraCatalogClient} from "../ui/src/regional/loraCatalogClient.ts";

const catalog={schema:"bv.lora_catalog",version:1,items:[]};

test("local LoRA catalog client caches success and deduplicates in-flight loads",async()=>{
  let calls=0,resolveFetch;
  const client=createLoraCatalogClient(()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve})});
  const api={apiURL:path=>`local:${path}`},first=client.load(api),second=client.load(api);
  assert.equal(calls,1);resolveFetch({ok:true,json:async()=>catalog});
  assert.deepEqual(await first,catalog);assert.deepEqual(await second,catalog);
  assert.deepEqual(await client.load(api),catalog);assert.equal(calls,1);
});

test("local LoRA catalog client publishes one stable snapshot to passive node subscribers",async()=>{
  let calls=0,updates=0;
  const loaded={...catalog,items:[{name:"demo.safetensors",preview_url:"/preview",preview_safe:true}]};
  const client=createLoraCatalogClient(async()=>{calls++;return{ok:true,json:async()=>loaded}}),api={apiURL:path=>`local:${path}`};
  const empty=client.getSnapshot(),seen=[];
  const unsubscribe=client.subscribe(()=>{updates++;seen.push(client.getSnapshot())});
  assert.equal(empty,client.empty());
  await Promise.all([client.load(api),client.load(api)]);
  assert.equal(calls,1);assert.equal(updates,1);assert.equal(seen[0],client.getSnapshot());assert.equal(client.getSnapshot().items[0].preview_url,"/preview");
  await client.load(api);assert.equal(calls,1);assert.equal(updates,1);
  client.invalidate();assert.equal(updates,2);assert.equal(client.getSnapshot(),empty);
  client.invalidate();assert.equal(updates,2);
  unsubscribe();await client.load(api);assert.equal(calls,2);assert.equal(updates,2);
});

test("local LoRA catalog client does not permanently cache failures",async()=>{
  let calls=0,updates=0;
  const client=createLoraCatalogClient(async()=>{calls++;if(calls===1)throw new Error("offline");return{ok:true,json:async()=>catalog}}),api={apiURL:path=>`local:${path}`};
  const unsubscribe=client.subscribe(()=>updates++);
  await assert.rejects(client.load(api),/offline/);assert.equal(updates,0);assert.equal(client.getSnapshot(),client.empty());
  assert.deepEqual(await client.load(api),catalog);assert.equal(calls,2);assert.equal(updates,1);unsubscribe();
});

test("explicit reload bypasses cache, publishes fresh metadata and keeps last-known-good on failure",async()=>{
  let calls=0;
  const first={...catalog,items:[{name:"demo.safetensors",display_name:"Before",preview_url:"/preview?v=1"}]};
  const second={...catalog,items:[{name:"demo.safetensors",display_name:"After",preview_url:"/preview?v=2"}]};
  const client=createLoraCatalogClient(async()=>{calls++;if(calls===1)return{ok:true,json:async()=>first};if(calls===2)return{ok:true,json:async()=>second};throw new Error("scan failed")}),api={apiURL:path=>`local:${path}`};
  assert.deepEqual(await client.load(api),first);assert.equal(calls,1);
  assert.deepEqual(await client.reload(api),second);assert.equal(calls,2);assert.deepEqual(client.getSnapshot(),second);
  await assert.rejects(client.reload(api),/scan failed/);assert.equal(calls,3);assert.deepEqual(client.getSnapshot(),second);
});

test("parallel explicit reloads are singleflight",async()=>{
  let calls=0,resolveFetch;
  const client=createLoraCatalogClient(()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve})}),api={apiURL:path=>`local:${path}`};
  const first=client.reload(api),second=client.reload(api);assert.equal(calls,1);
  resolveFetch({ok:true,json:async()=>catalog});await Promise.all([first,second]);assert.equal(calls,1);
});

test("a slower initial load cannot replace a newer reload",async()=>{
  const pending=[];
  const client=createLoraCatalogClient(()=>new Promise(resolve=>pending.push(resolve))),api={apiURL:path=>`local:${path}`};
  const initial=client.load(api),refreshed=client.reload(api);
  const fresh={...catalog,items:[{name:"fresh.safetensors"}]},stale={...catalog,items:[{name:"stale.safetensors"}]};
  pending[1]({ok:true,json:async()=>fresh});assert.deepEqual(await refreshed,fresh);
  pending[0]({ok:true,json:async()=>stale});assert.deepEqual(await initial,fresh);assert.deepEqual(client.getSnapshot(),fresh);
});

test("a valid initial load becomes the shared fallback when a newer reload fails",async()=>{
  const pending=[];let updates=0;
  const client=createLoraCatalogClient(()=>new Promise((resolve,reject)=>pending.push({resolve,reject}))),api={apiURL:path=>`local:${path}`};
  client.subscribe(()=>updates++);
  const initial=client.load(api),refreshed=client.reload(api),fallback={...catalog,items:[{name:"fallback.safetensors"}]};
  pending[1].reject(new Error("reload failed"));await assert.rejects(refreshed,/reload failed/);
  pending[0].resolve({ok:true,json:async()=>fallback});assert.deepEqual(await initial,fallback);
  assert.deepEqual(client.getSnapshot(),fallback);assert.equal(updates,1);assert.deepEqual(await client.load(api),fallback);
});

test("LoRA catalog bootstrap is non-blocking, singleflight and handles startup failure",async()=>{
  let calls=0,resolveFetch;
  const client=createLoraCatalogClient(()=>{calls++;return new Promise(resolve=>{resolveFetch=resolve})}),api={apiURL:path=>`local:${path}`};
  assert.equal(bootstrapLoraCatalog(api,client),undefined);assert.equal(bootstrapLoraCatalog(api,client),undefined);assert.equal(calls,1);
  resolveFetch({ok:false,status:503,json:async()=>({})});await new Promise(resolve=>setTimeout(resolve,0));assert.equal(client.getSnapshot(),client.empty());
  bootstrapLoraCatalog(api,client);assert.equal(calls,2);resolveFetch({ok:true,json:async()=>catalog});await new Promise(resolve=>setTimeout(resolve,0));assert.deepEqual(client.getSnapshot(),catalog);
});

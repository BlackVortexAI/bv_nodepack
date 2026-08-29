import assert from "node:assert/strict";
import test from "node:test";
import {emptyLutRegistryConfig,parseLutRegistryConfig,serializeLutRegistryConfig} from "../ui/src/regional/lutRegistryConfig.ts";

globalThis.crypto ??= {randomUUID:()=>"11111111-1111-4111-8111-111111111111"};

test("LUT registry config owns one stable provider and several direct LUT entries",()=>{
  const config=emptyLutRegistryConfig();
  config.luts.push({id:"warm",lut_name:"Built-in: Warm Contrast"},{id:"cool",lut_name:"Built-in: Cool Graphite"});
  const parsed=parseLutRegistryConfig(serializeLutRegistryConfig(config));
  assert.match(parsed.collector_id,/^[0-9a-f-]{36}$/i);
  assert.deepEqual(parsed.luts,[{id:"warm",lut_name:"Built-in: Warm Contrast"},{id:"cool",lut_name:"Built-in: Cool Graphite"}]);
});

test("invalid and duplicate LUT entries are removed during normalization",()=>{
  const parsed=parseLutRegistryConfig(JSON.stringify({version:1,collector_id:"x",luts:[{id:"same",lut_name:"a"},{id:"same",lut_name:"b"},{id:"",lut_name:"c"}]}));
  assert.equal(parsed.luts.length,1);
  assert.equal(parsed.luts[0].lut_name,"a");
  assert.notEqual(parsed.collector_id,"x");
});

test("legacy disk separators become canonical without changing built-ins",()=>{
  const parsed=parseLutRegistryConfig({version:1,collector_id:"11111111-1111-4111-8111-111111111111",luts:[{id:"disk",lut_name:"downloaded\\Test.cube"},{id:"builtin",lut_name:"Built-in: Warm Contrast"}]});
  assert.deepEqual(parsed.luts,[{id:"disk",lut_name:"downloaded/Test.cube"},{id:"builtin",lut_name:"Built-in: Warm Contrast"}]);
});

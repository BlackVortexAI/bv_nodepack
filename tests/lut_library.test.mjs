import assert from "node:assert/strict";
import test from "node:test";

import { canonicalLutPath, createLutLibrary, mergeLutChoices } from "../ui/src/regional/lutLibrary.ts";

test("LUT library canonicalizes, deduplicates, snapshots, fans out, and unsubscribes",()=>{
  const library=createLutLibrary();
  const initial=library.getSnapshot();
  assert.equal(library.getSnapshot(),initial,"unchanged snapshots keep their identity");
  let first=0,second=0;
  const unsubscribeFirst=library.subscribe(()=>first++),unsubscribeSecond=library.subscribe(()=>second++);
  library.seed(["Built-in: Identity","Download more LUTs…","downloaded\\Existing.cube"]);
  assert.deepEqual(library.getSnapshot(),["downloaded/Existing.cube"]);
  assert.deepEqual([first,second],[1,1]);
  const seeded=library.getSnapshot();
  library.publish("downloaded/Existing.cube");
  assert.equal(library.getSnapshot(),seeded);assert.deepEqual([first,second],[1,1],"idempotent publish stays silent");
  assert.equal(library.publish("Built-in: Warm Contrast"),false);
  assert.equal(library.publish("Download more LUTs…"),false);
  assert.deepEqual([first,second],[1,1]);
  library.publish("downloaded/New.cube");assert.deepEqual([first,second],[2,2]);
  unsubscribeFirst();library.publish("downloaded/Later.cube");assert.deepEqual([first,second],[2,3]);
  unsubscribeSecond();
  assert.equal(canonicalLutPath(" downloaded\\New.cube "),"downloaded/New.cube");
  assert.deepEqual(mergeLutChoices(["Built-in: Identity","downloaded\\Existing.cube","Download more LUTs…"],library.getSnapshot()),["Built-in: Identity","downloaded/Existing.cube","downloaded/New.cube","downloaded/Later.cube","Download more LUTs…"]);
});

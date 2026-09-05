import assert from "node:assert/strict";
import test from "node:test";
import { selectedTextWithin } from "../ui/src/ui/windowSelection.ts";

const root={contains:node=>node?.owner==="inside"};
const node=owner=>({owner});
const selection=(text,startOwner="inside",endOwner="inside")=>({rangeCount:1,isCollapsed:false,toString:()=>text,getRangeAt:()=>({startContainer:node(startOwner),endContainer:node(endOwner)})});

test("selected text is snapshotted exactly only when both endpoints belong to the window",()=>{
  assert.equal(selectedTextWithin(root,selection("  alpha\nbeta  ")),"  alpha\nbeta  ");
  assert.equal(selectedTextWithin(root,selection("alpha","inside","outside")),null);
  assert.equal(selectedTextWithin(root,{...selection("alpha"),isCollapsed:true}),null);
  assert.equal(selectedTextWithin(root,{...selection("alpha"),rangeCount:0}),null);
  assert.equal(selectedTextWithin(root,selection("   ")),null);
});

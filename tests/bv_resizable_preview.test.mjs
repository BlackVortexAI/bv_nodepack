import assert from "node:assert/strict";
import test from "node:test";
import { clampPaneWidth, resizePaneFromPointer } from "../ui/src/ui/components/layout.tsx";

test("preview pane width preserves the directory and result minima",()=>{
  assert.equal(clampPaneWidth(600,{containerWidth:1160,leadingWidth:190,contentMinWidth:420,separatorWidth:8,min:210,max:620}),542);
  assert.equal(clampPaneWidth(100,{containerWidth:1160,leadingWidth:190,contentMinWidth:420,separatorWidth:8,min:210,max:620}),210);
  assert.equal(clampPaneWidth(Number.NaN,{containerWidth:900,leadingWidth:190,contentMinWidth:420,separatorWidth:8,min:210,max:620}),210);
});

test("dragging the left preview boundary left grows the trailing pane",()=>{
  assert.equal(resizePaneFromPointer(260,500,440,210,620),320);
  assert.equal(resizePaneFromPointer(260,500,900,210,620),210);
  assert.equal(resizePaneFromPointer(260,500,-100,210,620),620);
});

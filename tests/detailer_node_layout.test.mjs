import assert from "node:assert/strict";
import test from "node:test";
import {compactNodeToComputedHeight} from "../ui/src/regional/nodeLayout.ts";

test("node compaction does not preserve an oversized renderer height floor",()=>{
  const node={size:[320,250],computeSize(){return[300,Math.max(Number(this.size?.[1]??0),105)]},setSize(size){this.size=size}};
  compactNodeToComputedHeight(node);assert.deepEqual(node.size,[320,105]);
});

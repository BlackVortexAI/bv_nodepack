import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../js/bv_subgraph_layout.js", import.meta.url), "utf8");

test("subgraph presentation uses a stale-only Classic draw guard instead of draw-time mutation loops", () => {
  assert.match(source, /MutationObserver/);
  assert.match(source, /reconcileVisibleHosts/);
  assert.doesNotMatch(source, /onDrawBackground/);
  assert.match(source, /if \(isSubgraphProjectionStale\(this\)\)/);
  assert.match(source, /queueMicrotask\(\(\) =>/);
  assert.match(source, /queueMicrotask\(\(\) => \{[\s\S]*?projectSubgraphUIPresentation\(this\)/);
  assert.doesNotMatch(source, /\[50, 150, 400, 1000\]/);
  assert.match(source, /MAX_PROXY_STABILIZATION_FRAMES = 12/);
  assert.match(source, /stableFrames < 2 && remaining > 0/);
  assert.doesNotMatch(source, /requestAnimationFrame\(project\)/);
  const domReconciler = source.slice(source.indexOf("function reconcileVisibleHosts"), source.indexOf("function scheduleVisibleHostReconcile"));
  assert.match(domReconciler, /reconcileNodes2Graph/);
  assert.doesNotMatch(domReconciler, /attachGraph/);
});

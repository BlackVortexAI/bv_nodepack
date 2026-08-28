import assert from "node:assert/strict";
import test from "node:test";
import { markRegionalConsumer, refreshRegionalConsumers, regionalWorkflowRoot, scheduleRegionalConsumersRefresh } from "../ui/src/regional/regionalGraphSync.ts";

test("consumers already on the canvas refresh when a Regional Prompt is added later", () => {
  const calls = [];
  const sender = { id: 1 };
  const selector = { id: 2 };
  const graph = { _nodes: [sender, selector] };
  markRegionalConsumer(sender, () => calls.push("sender"));
  markRegionalConsumer(selector, () => calls.push("selector"));

  graph._nodes.push({ id: 3, comfyClass: "BV Regional Prompt" });
  assert.equal(refreshRegionalConsumers(graph), 2);
  assert.deepEqual(calls, ["sender", "selector"]);
});

test("refresh ignores detached consumers and isolates one broken consumer", () => {
  let refreshed = 0;
  const detached = {};
  const broken = {};
  const healthy = {};
  const graph = { _nodes: [broken, healthy] };
  markRegionalConsumer(detached, () => { refreshed += 100; });
  markRegionalConsumer(broken, () => { throw new Error("broken"); });
  markRegionalConsumer(healthy, () => { refreshed += 1; });

  assert.equal(refreshRegionalConsumers(graph), 1);
  assert.equal(refreshed, 1);
});

test("scheduled refresh observes the final graph state and coalesces one lifecycle turn", async () => {
  let refreshed = 0;
  const consumer = {};
  const graph = { _nodes: [consumer] };
  markRegionalConsumer(consumer, () => { refreshed++; });

  scheduleRegionalConsumersRefresh(graph);
  graph._nodes.push({ comfyClass: "BV Regional Prompt" });
  scheduleRegionalConsumersRefresh(graph);
  assert.equal(refreshed, 0);
  await Promise.resolve();
  assert.equal(refreshed, 1);
});

test("refresh traverses modern getter-only subgraph hosts", () => {
  let refreshed = 0;
  const consumer = {};
  markRegionalConsumer(consumer, () => { refreshed++; });
  const nested = { _nodes: [consumer] };
  const root = { _nodes: [{ getSubgraph: () => nested }] };
  assert.equal(refreshRegionalConsumers(root), 1);
  assert.equal(refreshed, 1);
});

test("workflow root is derived from the consumer instead of the visible canvas", () => {
  const root = { _nodes: [] };
  const nested = { _nodes: [], rootGraph: root };
  const foreignCanvas = { _nodes: [] };
  assert.equal(regionalWorkflowRoot({ graph: nested }, foreignCanvas), root);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  cloneRouteRegistryPrefix,
  detachedHostRouting,
  compareRoutingNumbers,
  crossScopeDescriptors,
  executionScope,
  logicalAddress,
  materializeAddressedPipeLinks,
  materializeSmartPipeMergeSources,
  materializeWirelessPipeLinks,
  parseLogicalAddress,
  preferredHostRoutingName,
  promptModeState,
  predecessorChoiceRoutes,
  prunePromptBranches,
  reconcileRouteRegistryDestinations,
  remapPromptOutputLinks,
  routingChoiceLabel,
  routingDisplayNumbers,
  uniqueHostName,
  uniqueRoutingName,
  routingCollisionOwner,
  validateMaterializedPipeGraph,
} from "../js/bv_smart_pipe_routing.js";

function pipe(name, nodeId, mode = "root", predecessorId = null, inputs = {}) {
  return {
    class_type: "BV Smart Pipe",
    inputs: {
      bv_smart_pipe_route_json: JSON.stringify({ version: 1, name, nodeId, mode, predecessorId }),
      ...inputs,
    },
  };
}

test("routing names receive deterministic human-readable suffixes", () => {
  assert.equal(uniqueRoutingName("Pipe", new Set(["Pipe", "Pipe_1"])), "Pipe_2");
});

test("an initialized pipe keeps its name when a copied newcomer collides", () => {
  const incumbent = { title: "Pipe", __bvLastRoutingTitle: "Pipe" };
  const newcomer = { title: "Pipe" };
  assert.equal(routingCollisionOwner(incumbent, newcomer), incumbent);
  assert.equal(routingCollisionOwner(newcomer, incumbent), incumbent);
});

test("execution scope follows the expanded subgraph instance path", () => {
  assert.equal(executionScope("12:45:7"), "12:45");
  assert.equal(executionScope("7"), "");
});

test("root-scope pipes are not repeated as cross-scope choices", () => {
  const own = { address: "root/self", hostPath: [] };
  const rootPeer = { address: "root/peer", hostPath: [] };
  const nestedPeer = { address: "root/host/peer", hostPath: ["host"] };
  assert.deepEqual(crossScopeDescriptors([own, rootPeer, nestedPeer], own), [nestedPeer]);
});

test("logical addresses survive numeric execution-id changes", () => {
  const address = logicalAddress("root/id", ["host one", "nested"], "pipe/id");
  assert.deepEqual(parseLogicalAddress(address), ["root/id", "host one", "nested", "pipe/id"]);
  assert.equal(uniqueHostName("Detailer", new Set(["Detailer"])), "Detailer_1");
});

test("copying a subgraph host clones its route subtree and remaps internal predecessors", () => {
  const registry = {
    "root/old/source": { predecessorAddress: "root/external" },
    "root/old/target": { predecessorAddress: "root/old/source", projection: { resolvedSlots: [{ id: "slot" }] } },
    "root/other/pipe": { predecessorAddress: "root/external" },
  };
  assert.equal(cloneRouteRegistryPrefix(registry, "root/old", "root/new"), 2);
  assert.equal(registry["root/new/source"].predecessorAddress, "root/external");
  assert.equal(registry["root/new/target"].predecessorAddress, "root/new/source");
  assert.notEqual(registry["root/new/target"].projection, registry["root/old/target"].projection);
  assert.equal(Object.keys(registry).length, 5);
});

test("deleted destinations are pruned after a grace period and restored by undo", () => {
  const registry = {
    "root/live": { predecessorAddress: "root/source" },
    "root/deleted": { predecessorAddress: "root/source" },
  };
  const state = { missingSince: new Map(), backups: new Map() };
  reconcileRouteRegistryDestinations(registry, new Set(["root/live"]), state, 100, 1000);
  assert.ok(registry["root/deleted"]);
  reconcileRouteRegistryDestinations(registry, new Set(["root/live"]), state, 1200, 1000);
  assert.equal(registry["root/deleted"], undefined);
  assert.ok(state.backups.has("root/deleted"));
  reconcileRouteRegistryDestinations(registry, new Set(["root/live", "root/deleted"]), state, 1300, 1000);
  assert.ok(registry["root/deleted"]);
  assert.equal(state.backups.has("root/deleted"), false);
});

test("nested subgraph addresses materialize through every host level", () => {
  const source = logicalAddress("root", ["outer", "inner"], "source");
  const target = logicalAddress("root", [], "target");
  const prompt = { "5:8:2": pipe("Nested", "source"), "9": pipe("Root", "target") };
  materializeAddressedPipeLinks(prompt, { "5:8:2": source, "9": target }, {
    [target]: { predecessorAddress: source },
  });
  assert.deepEqual(prompt["9"].inputs.pipe, ["5:8:2", 0]);
});

test("copied subgraph hosts detach shared routing metadata before UUID repair", () => {
  const shared = { id: "shared", name: "Subgraph" };
  const first = detachedHostRouting(shared);
  const second = detachedHostRouting(shared);
  second.id = "copy";
  assert.equal(shared.id, "shared");
  assert.equal(first.id, "shared");
  assert.equal(second.id, "copy");
});

test("subgraph definition renames replace stale host routing names", () => {
  assert.equal(preferredHostRoutingName({
    storedName: "New Subgraph_1",
    storedDefinitionName: "New Subgraph",
    title: "New Subgraph_1",
    definitionName: "Test123",
  }), "Test123");
  assert.equal(preferredHostRoutingName({
    storedName: "New Subgraph_1",
    title: "New Subgraph_1",
    definitionName: "Test123",
  }), "Test123");
});

test("intentional instance titles remain independent from unchanged definitions", () => {
  assert.equal(preferredHostRoutingName({
    storedName: "Face Detailer",
    storedDefinitionName: "Detailer",
    title: "Eye Detailer",
    lastAppliedTitle: "Face Detailer",
    definitionName: "Detailer",
  }), "Eye Detailer");
});

test("address registry materializes root to subgraph and instance to instance links", () => {
  const root = logicalAddress("root", [], "root-pipe");
  const first = logicalAddress("root", ["face"], "inner-pipe");
  const second = logicalAddress("root", ["eyes"], "inner-pipe");
  const prompt = {
    "7": pipe("Root", "root-pipe"),
    "12:4": pipe("Face", "inner-pipe"),
    "25:4": pipe("Eyes", "inner-pipe"),
  };
  materializeAddressedPipeLinks(prompt, { "7": root, "12:4": first, "25:4": second }, {
    [first]: { predecessorAddress: root },
    [second]: { predecessorAddress: first },
  });
  assert.deepEqual(prompt["12:4"].inputs.pipe, ["7", 0]);
  assert.deepEqual(prompt["25:4"].inputs.pipe, ["12:4", 0]);
});

test("address routing fails closed and physical links still win", () => {
  const first = logicalAddress("root", ["first"], "pipe");
  const second = logicalAddress("root", ["second"], "pipe");
  const prompt = {
    "10:1": pipe("First", "pipe"),
    "20:1": pipe("Second", "pipe", "root", null, { pipe: ["99", 0] }),
  };
  materializeAddressedPipeLinks(prompt, { "10:1": first, "20:1": second }, {
    [second]: { predecessorAddress: "root/missing/pipe" },
  });
  assert.deepEqual(prompt["20:1"].inputs.pipe, ["99", 0]);
  assert.throws(() => materializeAddressedPipeLinks(
    { "10:1": pipe("First", "pipe"), "20:1": pipe("Second", "pipe") },
    { "10:1": first, "20:1": second },
    { [second]: { predecessorAddress: "root/missing/pipe" } },
  ), /predecessor .*missing/);
});

test("a downstream wireless route skips a bypassed Smart Pipe and keeps the preceding values", () => {
  const base = logicalAddress("root", [], "base");
  const bypassed = logicalAddress("root", [], "bypassed");
  const downstream = logicalAddress("root", [], "downstream");
  const prompt = {
    "1": pipe("Base", "base"),
    "3": pipe("Downstream", "downstream"),
  };

  materializeAddressedPipeLinks(prompt, { "1": base, "3": downstream }, {
    [bypassed]: { predecessorAddress: base },
    [downstream]: { predecessorAddress: bypassed },
  }, { bypassedAddresses: new Set([bypassed]) });

  assert.deepEqual(prompt["3"].inputs.pipe, ["1", 0]);
});

test("a muted addressed predecessor prunes its dependent branch for this prompt only", () => {
  const base = logicalAddress("root", [], "base");
  const muted = logicalAddress("root", [], "muted");
  const downstream = logicalAddress("root", [], "downstream");
  const prompt = {
    "1": pipe("Base", "base"),
    "3": pipe("Downstream", "downstream"),
  };

  const modeState = { mutedAddresses: new Set([muted]), prunedExecutionIds: new Set() };
  materializeAddressedPipeLinks(prompt, { "1": base, "3": downstream }, {
    [muted]: { predecessorAddress: base },
    [downstream]: { predecessorAddress: muted },
  }, modeState);
  prunePromptBranches(prompt, modeState.prunedExecutionIds);
  assert.deepEqual(Object.keys(prompt), ["1"]);
});

test("hidden output gaps remap visible LiteGraph indexes to backend ordinals", () => {
  const prompt = {
    source: pipe("Source", "source"),
    consumer: { class_type: "Consumer", inputs: { value: ["source", 1], untouched: ["other", 0] } },
  };
  remapPromptOutputLinks(prompt, { source: { 0: 0, 1: 2 } });
  assert.deepEqual(prompt.consumer.inputs.value, ["source", 2]);
  assert.deepEqual(prompt.consumer.inputs.untouched, ["other", 0]);
});

test("the final compiler rejects cycles spanning registry and local routes", () => {
  const prompt = {
    "1": pipe("First", "first", "follow", "second"),
    "2": pipe("Second", "second"),
  };
  materializeAddressedPipeLinks(prompt, {
    "1": logicalAddress("scope", [], "first"),
    "2": logicalAddress("scope", [], "second"),
  }, {
    [logicalAddress("scope", [], "second")]: { predecessorAddress: logicalAddress("scope", [], "first") },
  });
  materializeWirelessPipeLinks(prompt);
  assert.throws(() => validateMaterializedPipeGraph(prompt), /wired and wireless connections/);
});

test("display numbers represent chain and position while forks remain unique", () => {
  const labels = routingDisplayNumbers([
    { nodeId: "base", name: "Base", mode: "root" },
    { nodeId: "lora", name: "LoRA", mode: "follow", predecessorId: "base" },
    { nodeId: "control", name: "Control", mode: "follow", predecessorId: "base" },
    { nodeId: "second", name: "Second", mode: "root" },
    { nodeId: "second-next", name: "Second Next", mode: "follow", predecessorId: "second" },
  ]);
  assert.equal(labels.get("base"), "1.1");
  assert.match(labels.get("lora"), /^1\.1\.[12]$/);
  assert.match(labels.get("control"), /^1\.1\.[12]$/);
  assert.notEqual(labels.get("lora"), labels.get("control"));
  assert.equal(labels.get("second"), "2.1");
  assert.equal(labels.get("second-next"), "2.2");
});

test("a merge starts a new tree after all of its source trees", () => {
  const labels = routingDisplayNumbers([
    { nodeId: "first", name: "Tree 1", mode: "root" },
    { nodeId: "second", name: "Tree 2", mode: "root" },
    { nodeId: "merge", name: "Merge", mode: "merge", sourceIds: ["first", "second"] },
    { nodeId: "after", name: "After Merge", mode: "follow", predecessorId: "merge" },
    { nodeId: "branch-a", name: "Branch A", mode: "follow", predecessorId: "after" },
    { nodeId: "branch-b", name: "Branch B", mode: "follow", predecessorId: "after" },
  ]);
  assert.equal(labels.get("first"), "1.1");
  assert.equal(labels.get("second"), "2.1");
  assert.equal(labels.get("merge"), "3.1");
  assert.equal(labels.get("after"), "3.2");
  assert.equal(labels.get("branch-a"), "3.2.1");
  assert.equal(labels.get("branch-b"), "3.2.2");
});

test("the destination tree does not consume a hidden number in its predecessor menu", () => {
  const routes = [
    { nodeId: "first", name: "Tree 1", mode: "root" },
    { nodeId: "second", name: "Tree 2", mode: "root" },
    { nodeId: "merge", name: "Merge", mode: "merge", sourceIds: ["first", "second"] },
    { nodeId: "current", name: "BV Smart Pipe", mode: "root" },
    { nodeId: "dependent", name: "Dependent", mode: "follow", predecessorId: "current" },
  ];
  const globalLabels = routingDisplayNumbers(routes);
  assert.equal(globalLabels.get("merge"), "3.1");
  assert.equal(globalLabels.get("current"), "4.1");
  const labels = routingDisplayNumbers(predecessorChoiceRoutes(routes, "current"));
  assert.equal(labels.has("current"), false);
  assert.equal(labels.has("dependent"), false);
  assert.equal(labels.get("first"), "1.1");
  assert.equal(labels.get("second"), "2.1");
  assert.equal(labels.get("merge"), "3.1");
});

test("multiple independent chains are numbered by chain before position", () => {
  const labels = routingDisplayNumbers([
    { nodeId: "dashboard-1", name: "Dashboard2_1", mode: "root" },
    { nodeId: "smart-1", name: "BV Smart Pipe_1", mode: "follow", predecessorId: "dashboard-1" },
    { nodeId: "pipe", name: "Pipe", mode: "follow", predecessorId: "smart-1" },
    { nodeId: "dashboard-2", name: "Dashboard2_2", mode: "root" },
    { nodeId: "dashboard-3", name: "Dashboard2_3", mode: "follow", predecessorId: "dashboard-2" },
  ]);
  assert.equal(labels.get("dashboard-1"), "1.1");
  assert.equal(labels.get("smart-1"), "1.2");
  assert.equal(labels.get("pipe"), "1.3");
  assert.equal(labels.get("dashboard-2"), "2.1");
  assert.equal(labels.get("dashboard-3"), "2.2");
});

test("dropdown labels indent children by their chain position", () => {
  assert.equal(routingChoiceLabel("1.1", "Root"), "1.1. Root");
  assert.equal(routingChoiceLabel("1.2", "Child"), "\u00a0\u00a0\u00a01.2. Child");
  assert.equal(routingChoiceLabel("1.3", "Grandchild"), "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a01.3. Grandchild");
  assert.equal(routingChoiceLabel("1.1.2", "Fork"), "\u00a0\u00a0\u00a01.1.2. Fork");
});

test("dropdown route numbers sort by chain, position and fork", () => {
  const numbers = ["1.3", "2.2", "1.1.2", "2.1", "1.1", "1.1.1"];
  assert.deepEqual(numbers.sort(compareRoutingNumbers), ["1.1", "1.1.1", "1.1.2", "1.3", "2.1", "2.2"]);
});

test("wireless predecessors become prompt-level pipe links", () => {
  const prompt = { "1": pipe("Base", "base"), "2": pipe("LoRA", "lora", "follow", "base") };
  materializeWirelessPipeLinks(prompt);
  assert.deepEqual(prompt["2"].inputs.pipe, ["1", 0]);
});

test("local wireless routing skips a bypassed Smart Pipe", () => {
  const prompt = {
    "1": pipe("Base", "base"),
    "3": pipe("Downstream", "downstream", "follow", "bypassed"),
  };
  materializeWirelessPipeLinks(prompt, {
    routesByScopedNodeId: new Map([
      ["\u0000bypassed", { name: "Bypassed", nodeId: "bypassed", mode: "follow", predecessorId: "base" }],
    ]),
    bypassedScopedNodeIds: new Set(["\u0000bypassed"]),
  });
  assert.deepEqual(prompt["3"].inputs.pipe, ["1", 0]);
});

test("local wireless routing skips a bypassed Smart Pipe whose predecessor is a Merge", () => {
  const prompt = {
    "2": { class_type: "BV Smart Pipe Merge", inputs: {} },
    "4": pipe("Downstream", "downstream", "follow", "bypassed"),
  };
  materializeWirelessPipeLinks(prompt, {
    routesByScopedNodeId: new Map([
      ["\u0000bypassed", { name: "After Merge", nodeId: "bypassed", mode: "root", predecessorId: null }],
    ]),
    bypassedScopedNodeIds: new Set(["\u0000bypassed"]),
    bypassPredecessorsByScopedNodeId: new Map([
      ["\u0000bypassed", { executionId: "2" }],
    ]),
  });
  assert.deepEqual(prompt["4"].inputs.pipe, ["2", 0]);
});

test("a muted local wireless predecessor prunes its dependent branch", () => {
  const prompt = {
    "1": pipe("Base", "base"),
    "3": pipe("Downstream", "downstream", "follow", "muted"),
  };
  const modeState = {
    routesByScopedNodeId: new Map([
      ["\u0000muted", { name: "Muted", nodeId: "muted", mode: "follow", predecessorId: "base" }],
    ]),
    mutedScopedNodeIds: new Set(["\u0000muted"]),
    prunedExecutionIds: new Set(),
  };
  materializeWirelessPipeLinks(prompt, modeState);
  prunePromptBranches(prompt, modeState.prunedExecutionIds);
  assert.deepEqual(Object.keys(prompt), ["1"]);
});

test("the same subgraph definition resolves independently per instance", () => {
  const prompt = {
    "10:1": pipe("Base", "base"), "10:2": pipe("Next", "next", "follow", "base"),
    "20:1": pipe("Base", "base"), "20:2": pipe("Next", "next", "follow", "base"),
  };
  materializeWirelessPipeLinks(prompt);
  assert.deepEqual(prompt["10:2"].inputs.pipe, ["10:1", 0]);
  assert.deepEqual(prompt["20:2"].inputs.pipe, ["20:1", 0]);
});

test("a physical pipe link wins over wireless metadata", () => {
  const prompt = { "1": pipe("Base", "base"), "2": pipe("Next", "next", "follow", "missing", { pipe: ["9", 0] }) };
  materializeWirelessPipeLinks(prompt);
  assert.deepEqual(prompt["2"].inputs.pipe, ["9", 0]);
});

test("merge sources materialize in configured order and preserve physical links", () => {
  const prompt = {
    "1": pipe("A", "a"),
    "2": pipe("B", "b"),
    "3": { class_type: "BV Smart Pipe Merge", inputs: { pipe_002: ["9", 0] } },
  };
  materializeSmartPipeMergeSources(prompt, { "1": "root/a", "2": "root/b", "3": "root/merge" }, {
    "root/merge": { kind: "merge", sources: [
      { key: "pipe_001", mode: "wireless", address: "root/a" },
      { key: "pipe_002", mode: "wireless", address: "root/b" },
    ] },
  });
  assert.deepEqual(prompt["3"].inputs.pipe_001, ["1", 0]);
  assert.deepEqual(prompt["3"].inputs.pipe_002, ["9", 0]);
});

test("a merge omits one muted source but keeps the remaining source", () => {
  const prompt = {
    "2": pipe("Active", "active"),
    "3": { class_type: "BV Smart Pipe Merge", inputs: {
      bv_smart_pipe_merge_json: JSON.stringify([
        { key: "pipe_001", mode: "wired", address: "root/muted" },
        { key: "pipe_002", mode: "wireless", address: "root/active" },
      ]),
      pipe_001: ["1", 0],
    } },
  };
  const modeState = { mutedAddresses: new Set(["root/muted"]), prunedExecutionIds: new Set() };
  materializeSmartPipeMergeSources(prompt, {
    "1": "root/muted", "2": "root/active", "3": "root/merge",
  }, {
    "root/merge": { kind: "merge", sources: [
      { key: "pipe_001", mode: "wired", address: "root/muted" },
      { key: "pipe_002", mode: "wireless", address: "root/active" },
    ] },
  }, modeState);
  assert.equal(prompt["3"].inputs.pipe_001, undefined);
  assert.deepEqual(prompt["3"].inputs.pipe_002, ["2", 0]);
  assert.deepEqual(JSON.parse(prompt["3"].inputs.bv_smart_pipe_merge_json).map((source) => source.key), ["pipe_002"]);
  assert.equal(modeState.prunedExecutionIds.size, 0);
});

test("a muted Merge is included in the prompt mute snapshot", () => {
  const state = promptModeState([
    { kind: "pipe", address: "root/pipe", executionId: "1", node: { mode: 0 } },
    { kind: "merge", address: "root/merge", executionId: "2", node: { mode: 2 } },
  ]);
  assert.deepEqual([...state.mutedAddresses], ["root/merge"]);
  assert.deepEqual([...state.prunedExecutionIds], ["2"]);
});

test("a pipe following a muted Merge is pruned instead of reporting a missing cross-scope predecessor", () => {
  const merge = "root/merge";
  const downstream = "root/downstream";
  const state = promptModeState([
    { kind: "merge", address: merge, executionId: "2", node: { mode: 2 } },
    { kind: "pipe", address: downstream, executionId: "3", node: { mode: 0 } },
  ]);
  const prompt = { "3": pipe("Downstream", "downstream") };
  materializeAddressedPipeLinks(prompt, { "2": merge, "3": downstream }, {
    [downstream]: { predecessorAddress: merge },
  }, state);
  prunePromptBranches(prompt, state.prunedExecutionIds);
  assert.deepEqual(prompt, {});
});

test("an all-muted merge and its dependent consumers are pruned only from the API prompt", () => {
  const prompt = {
    "3": { class_type: "BV Smart Pipe Merge", inputs: { pipe_001: ["1", 0] } },
    "4": pipe("After Merge", "after", "root", null, { pipe: ["3", 0] }),
    "5": { class_type: "Consumer", inputs: { value: ["4", 1] } },
    "6": { class_type: "Independent", inputs: {} },
  };
  const modeState = { mutedAddresses: new Set(["root/muted"]), prunedExecutionIds: new Set() };
  materializeSmartPipeMergeSources(prompt, { "1": "root/muted", "3": "root/merge" }, {
    "root/merge": { kind: "merge", sources: [
      { key: "pipe_001", mode: "wired", address: "root/muted" },
    ] },
  }, modeState);
  prunePromptBranches(prompt, modeState.prunedExecutionIds);
  assert.deepEqual(Object.keys(prompt), ["6"]);
});

test("merge source cycles are rejected together with ordinary pipe cycles", () => {
  const prompt = {
    "1": { class_type: "BV Smart Pipe Merge", inputs: { pipe_001: ["2", 0] } },
    "2": { class_type: "BV Smart Pipe Merge", inputs: { pipe_001: ["1", 0] } },
  };
  assert.throws(() => validateMaterializedPipeGraph(prompt), /Cycle/);
});

test("missing predecessors and cycles fail closed", () => {
  assert.throws(() => materializeWirelessPipeLinks({ "1": pipe("Next", "next", "follow", "missing") }), /predecessor is missing/);
  assert.throws(() => materializeWirelessPipeLinks({
    "1": pipe("A", "a", "follow", "b"),
    "2": pipe("B", "b", "follow", "a"),
  }), /cycle/);
});

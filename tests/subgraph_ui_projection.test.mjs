import test from "node:test";
import assert from "node:assert/strict";
import { projectSubgraphUIPresentation, synchronizeDynamicComboHost } from "../js/bv_subgraph_ui_projection.js";

test("promoted heading presentation is copied to the outer subgraph widget", () => {
  const draw = () => {};
  const computeSize = () => [240, 52];
  const sourceWidget = { name: "value", type: "BV_HEADING", draw, computeSize, __bvNode: { id: 7 } };
  const targetWidget = { name: "value", type: "text" };
  const sourceNode = { getWidgetFromSlot: () => sourceWidget };
  const hostInput = { name: "value", widgetId: "host:1:value", _subgraphSlot: { linkIds: [10] } };
  const host = {
    inputs: [hostInput],
    widgets: [targetWidget],
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: {} }) }) },
    getWidgetFromSlot: () => targetWidget,
    expandToFitContent() {},
    setDirtyCanvas() {},
  };

  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(targetWidget.type, "text");
  assert.equal(targetWidget.draw, draw);
  assert.equal(targetWidget.computeSize, computeSize);
  assert.equal(targetWidget.__bvNode, sourceWidget.__bvNode);
});

test("ordinary promoted widgets remain untouched", () => {
  const sourceWidget = { name: "seed", type: "number" };
  const targetWidget = { name: "seed", type: "number" };
  const sourceNode = { getWidgetFromSlot: () => sourceWidget };
  const host = {
    inputs: [{ widgetId: "host:1:seed", _subgraphSlot: { linkIds: [2] } }],
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: {} }) }) },
    getWidgetFromSlot: () => targetWidget,
  };
  assert.equal(projectSubgraphUIPresentation(host), 0);
});

test("presentation projects through a nested promoted subgraph widget", () => {
  const draw = () => {};
  const sourceWidget = { name: "value", type: "BV_DIVIDER", draw, computeSize: () => [220, 18] };
  const innerTarget = { name: "divider", type: "number" };
  const innerInput = { name: "divider", widgetId: "inner", _subgraphSlot: { linkIds: [1] } };
  const sourceNode = { getWidgetFromSlot: () => sourceWidget };
  const innerHost = {
    inputs: [innerInput], widgets: [innerTarget],
    isSubgraphNode: () => true,
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: {} }) }) },
    getWidgetFromSlot: () => innerTarget,
  };
  const outerTarget = { name: "divider", type: "number" };
  const outerHost = {
    inputs: [{ name: "divider", widgetId: "outer", _subgraphSlot: { linkIds: [2] } }],
    widgets: [outerTarget],
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: innerHost, input: innerInput }) }) },
    getWidgetFromSlot: () => outerTarget,
  };
  assert.equal(projectSubgraphUIPresentation(outerHost), 1);
  assert.equal(outerTarget.type, "number");
  assert.equal(outerTarget.draw, draw);
});

test("linked exposed heading creates one persistent editable host widget", () => {
  const draw = () => {};
  const sourceWidget = { name: "value", type: "BV_HEADING", value: "Title", draw };
  const sourceNode = {
    id: 9,
    properties: { bvLayoutId: "heading-id" },
    __bvPresentationWidget: sourceWidget,
    getWidgetFromSlot: () => null,
  };
  const input = { name: "text", _subgraphSlot: { linkIds: [3] } };
  const host = {
    inputs: [input], widgets: [], properties: {},
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: { name: "value" } }) }) },
    addWidget(type, name, value, callback, options) {
      const widget = { type, name, value, callback, options };
      this.widgets.push(widget);
      return widget;
    },
  };

  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets.length, 1);
  assert.equal(host.widgets[0].type, "text");
  assert.equal(host.widgets[0].draw, draw);
  host.widgets[0].callback("Changed");
  assert.equal(host.properties.bvSubgraphUIValues["heading-id:value"], "Changed");
});

test("linked exposed divider creates a non-editable custom host widget", () => {
  const sourceWidget = { type: "BV_DIVIDER", value: 2, draw: () => {} };
  const sourceNode = { id: 4, __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  const host = {
    inputs: [{ name: "divider", _subgraphSlot: { linkIds: [5] } }], widgets: [],
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: { name: "thickness" } }) }) },
    addCustomWidget(widget) { this.widgets.push(widget); return widget; },
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets[0].type, "BV_DIVIDER");
});

test("linked exposed spacer creates a non-editable custom host widget", () => {
  const sourceWidget = { type: "BV_SPACER", value: 24, draw: () => {}, computeSize: () => [220, 24] };
  const sourceNode = { id: 5, __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  const host = {
    inputs: [{ name: "space", _subgraphSlot: { linkIds: [6] } }], widgets: [],
    subgraph: { getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: { name: "height" } }) }) },
    addCustomWidget(widget) { this.widgets.push(widget); return widget; },
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets[0].type, "BV_SPACER");
  assert.deepEqual(host.widgets[0].computeSize(), [220, 24]);
});

test("projected spacer size follows the edited outer value", () => {
  const sourceWidget = { type: "BV_SPACER", value: 24, draw: () => {} };
  sourceWidget.computeSize = function () { return [220, sourceWidget.value]; };
  const targetWidget = { type: "number", value: 24 };
  const sourceNode = { id: 6, __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  let appliedSize;
  const host = {
    inputs: [{ name: "Spacer" }], widgets: [targetWidget], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "height" } }],
    getWidgetFromSlot: () => targetWidget,
    computeSize: () => [220, targetWidget.computeSize(220)[1] + 40],
    setSize: (size) => { appliedSize = size; },
  };
  projectSubgraphUIPresentation(host);
  targetWidget.callback(48);
  assert.deepEqual(targetWidget.computeSize(220), [220, 48]);
  assert.deepEqual(appliedSize, [220, 88]);
});

test("current ComfyUI host resolves presentation links from subgraph inputs", () => {
  const sourceWidget = { type: "BV_HEADING", value: "Heading", draw: () => {} };
  const sourceNode = {
    id: 150,
    properties: { bvLayoutId: "ad9ede0f-2e7f-4715-ae35-e5049b4a5bf7" },
    __bvPresentationWidget: sourceWidget,
    getWidgetFromSlot: () => null,
  };
  const host = {
    // Real host inputs no longer carry _subgraphSlot.
    inputs: [{ name: "value", type: "STRING" }],
    widgets: [], properties: {},
    subgraph: {
      // The actual definition slot owns linkIds instead.
      inputs: [{ id: "a33fdabf-bf71-49ce-a0ae-1ce8e0fb2889", name: "value", linkIds: [131] }],
      getLink: () => ({ resolve: () => ({ inputNode: sourceNode, input: { name: "value" } }) }),
    },
    addWidget(type, name, value, callback, options) {
      const widget = { type, name, value, callback, options };
      this.widgets.push(widget);
      return widget;
    },
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets.length, 1);
  assert.equal(host.widgets[0].value, "Heading");
});

test("current SubgraphNode resolver is authoritative for exposed presentation inputs", () => {
  const sourceWidget = { type: "BV_DIVIDER", value: 2, draw: () => {} };
  const sourceNode = { id: 77, __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  const host = {
    inputs: [{ name: "divider", type: "INT" }], widgets: [], properties: {},
    subgraph: {},
    resolveSubgraphInputLinks: (slot) => slot === 0
      ? [{ inputNode: sourceNode, input: { name: "thickness" } }]
      : [],
    addCustomWidget(widget) { this.widgets.push(widget); return widget; },
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets[0].type, "BV_DIVIDER");
});

test("projection supports modern getter-only widget types", () => {
  let drawArgs;
  const draw = (...args) => { drawArgs = args; };
  const sourceWidget = { type: "BV_HEADING", draw, computeSize: () => [220, 40] };
  const targetWidget = {
    get type() { return "text"; },
    y: 12,
    get height() { return 40; },
    drawWidget() {},
  };
  const sourceNode = { __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  const host = {
    inputs: [{ name: "value" }], widgets: [targetWidget],
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => targetWidget,
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(targetWidget.type, "text");
  assert.equal(targetWidget.draw, draw);
  targetWidget.drawWidget({}, { width: 300, showText: true });
  assert.equal(drawArgs[2], 300);
  assert.equal(drawArgs[3], 12);
  assert.deepEqual(targetWidget.computeLayoutSize(), { minWidth: 220, minHeight: 40 });
});

test("ComfyUI-owned slot proxy remains authoritative and keeps native editing", () => {
  const sourceDraw = () => {};
  const sourceWidget = { type: "BV_HEADING", value: "Visible", draw: sourceDraw };
  const nativeCallback = () => {};
  const detachedProxy = {
    get type() { return "text"; },
    value: "Visible",
    callback: nativeCallback,
    drawWidget() {},
  };
  const sourceNode = { __bvPresentationWidget: sourceWidget, getWidgetFromSlot: () => null };
  let appliedSize;
  const host = {
    inputs: [{ name: "value" }], widgets: [], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => detachedProxy,
    addWidget(type, name, value, callback, options) {
      const widget = { type, name, value, callback, options };
      this.widgets.push(widget);
      return widget;
    },
    computeSize: () => [240, 120],
    setSize: (size) => { appliedSize = size; },
  };
  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(host.widgets.length, 0);
  assert.equal(detachedProxy.draw, sourceDraw);
  assert.equal(detachedProxy.callback, nativeCallback);
  assert.equal(detachedProxy.__bvPresentationType, "BV_HEADING");
  assert.deepEqual(appliedSize, [240, 120]);
});

test("heading survives reload before its runtime widget marker is restored", () => {
  const sourceWidget = { type: "text", value: "Saved heading", draw: () => {} };
  const sourceNode = {
    comfyClass: "BV Subgraph Heading",
    getWidgetFromSlot: () => sourceWidget,
  };
  let callbackValue;
  const proxy = {
    get type() { return "text"; },
    value: "Saved heading",
    drawWidget() {},
    callback(value) { callbackValue = value; },
  };
  const host = {
    inputs: [{ name: "value" }], widgets: [], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => proxy,
  };

  assert.equal(projectSubgraphUIPresentation(host), 1);
  assert.equal(proxy.__bvPresentationType, "BV_HEADING");
  let promptCallback;
  proxy.onClick({
    e: {}, node: host,
    canvas: { prompt(_title, _value, callback) { promptCallback = callback; } },
  });
  promptCallback("Edited heading");
  assert.equal(proxy.value, "Edited heading");
  assert.equal(sourceWidget.value, "Edited heading");
  assert.equal(callbackValue, "Edited heading");
  assert.equal(host.properties.bvSubgraphUIValues["presentation:value"], "Edited heading");
  assert.equal(host.serialize_widgets, true);
});

test("projection is idempotent and repairs a proxy renderer reset", () => {
  const sourceWidget = { type: "text", value: "Heading", draw: () => {}, computeSize: () => [220, 40] };
  const sourceNode = { type: "BV Subgraph Heading", getWidgetFromSlot: () => sourceWidget };
  const proxy = { get type() { return "text"; }, drawWidget() {}, options: {} };
  let dirtyCalls = 0;
  const host = {
    inputs: [{ name: "value" }], widgets: [], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => proxy,
    setDirtyCanvas: () => { dirtyCalls++; },
  };

  projectSubgraphUIPresentation(host);
  const projectedRenderer = proxy.drawWidget;
  const dirtyAfterFirstProjection = dirtyCalls;
  projectSubgraphUIPresentation(host);
  assert.equal(proxy.drawWidget, projectedRenderer);
  assert.equal(dirtyCalls, dirtyAfterFirstProjection);

  proxy.drawWidget = function standardTextRenderer() {};
  projectSubgraphUIPresentation(host);
  assert.equal(proxy.drawWidget, projectedRenderer);
  assert.ok(dirtyCalls > dirtyAfterFirstProjection);
});

test("technical exposed names migrate through the official subgraph rename API", () => {
  const sourceWidget = { type: "text", draw: () => {} };
  const sourceNode = { type: "BV Subgraph Heading", getWidgetFromSlot: () => sourceWidget };
  const exposedInput = { id: "stable-slot-id", name: "value", linkIds: [9] };
  const existingHeader = { id: "other-slot", name: "Header", linkIds: [] };
  const hostInput = { name: "value", _subgraphSlot: exposedInput };
  const proxy = { type: "text", drawWidget() {}, options: {} };
  const renameCalls = [];
  const host = {
    inputs: [hostInput], widgets: [], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => proxy,
    subgraph: {
      inputs: [exposedInput, existingHeader],
      renameInput(input, name) {
        renameCalls.push({ id: input.id, name });
        input.name = name;
        hostInput.name = name;
      },
    },
  };

  projectSubgraphUIPresentation(host);
  assert.deepEqual(renameCalls, [{ id: "stable-slot-id", name: "Header_1" }]);
  assert.equal(exposedInput.id, "stable-slot-id");
  assert.deepEqual(exposedInput.linkIds, [9]);
  projectSubgraphUIPresentation(host);
  assert.equal(renameCalls.length, 1);
});

test("deliberately renamed presentation inputs remain untouched", () => {
  const sourceWidget = { type: "number", draw: () => {} };
  const sourceNode = { type: "BV Subgraph Spacer", getWidgetFromSlot: () => sourceWidget };
  const exposedInput = { id: "slot", name: "Layout gap", linkIds: [3] };
  let renamed = false;
  const host = {
    inputs: [{ name: "Layout gap", _subgraphSlot: exposedInput }], widgets: [], properties: {},
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "height" } }],
    getWidgetFromSlot: () => ({ type: "number", drawWidget() {}, options: {} }),
    subgraph: { inputs: [exposedInput], renameInput() { renamed = true; } },
  };

  projectSubgraphUIPresentation(host);
  assert.equal(renamed, false);
});

test("dynamic combo option changes propagate to exposed host proxies", () => {
  const sourceNode = { type: "BV Dynamic Combo" };
  let callbackValue;
  const proxy = {
    value: "option_a",
    options: { values: ["option_a", "option_b"] },
    callback(value) { callbackValue = value; },
  };
  const host = {
    inputs: [{ name: "value" }],
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => proxy,
  };

  assert.equal(synchronizeDynamicComboHost(host, sourceNode, ["low", "medium", "high"]), 1);
  assert.deepEqual(proxy.options.values, ["low", "medium", "high"]);
  assert.equal(proxy.value, "low");
  assert.equal(callbackValue, "low");
});

test("valid exposed dynamic combo selections survive option updates", () => {
  const sourceNode = { type: "BV Dynamic Combo" };
  let callbackCalled = false;
  const proxy = {
    value: "medium", options: {},
    callback() { callbackCalled = true; },
  };
  const host = {
    inputs: [{ name: "value" }],
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => proxy,
  };

  synchronizeDynamicComboHost(host, sourceNode, ["low", "medium", "high"]);
  assert.equal(proxy.value, "medium");
  assert.equal(callbackCalled, false);
});

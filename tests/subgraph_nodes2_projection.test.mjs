import test from "node:test";
import assert from "node:assert/strict";
import { projectSubgraphNodes2Presentation } from "../js/bv_subgraph_nodes2_projection.js";

class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.textContent = ""; }
  append(child) { child.parentElement = this; this.children.push(child); }
  replaceChildren(...children) { this.children = []; children.forEach((child) => this.append(child)); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this[`on${name}`] = callback; }
  querySelector(selector) {
    if (selector.includes("field-label")) return this.labelElement ?? null;
    if (selector.includes("bv-subgraph-projection")) return this.children.find((child) => child.dataset?.bvSubgraphProjection === "true") ?? null;
    return null;
  }
}

function fixture(type, value, height, inputName) {
  const nativeLabel = new Element(); nativeLabel.style.display = "grid";
  const nativeControl = new Element(); nativeControl.style.display = "flex";
  const row = new Element(); row.children = [nativeLabel, nativeControl]; row.labelElement = { textContent: inputName };
  const nodeElement = { querySelectorAll: () => [row] };
  const head = new Element("head");
  const document = {
    head,
    createElement: (tag) => new Element(tag),
    getElementById: () => null,
    querySelector: () => nodeElement,
  };
  const source = { type, value, draw() {}, computeSize: () => [220, height] };
  const sourceNode = { id: 1, __bvPresentationWidget: source, getWidgetFromSlot: () => null };
  const target = { name: inputName, value, onClick() {} };
  const host = {
    id: 9, size: [280, 500], inputs: [{ name: inputName }], widgets: [target],
    resolveSubgraphInputLinks: () => [{ inputNode: sourceNode, input: { name: "value" } }],
    getWidgetFromSlot: () => target,
  };
  return { document, host, row, nativeLabel, nativeControl };
}

test("Nodes 2.0 renders an exposed heading as presentation instead of a text field", () => {
  const { document, host, row, nativeLabel, nativeControl } = fixture("BV_HEADING", "Heading2", 34, "Header");
  assert.equal(projectSubgraphNodes2Presentation(host, document, {}), true);
  assert.equal(row.dataset.bvSubgraphPresentation, "heading");
  assert.equal(row.style.height, "34px");
  assert.equal(nativeLabel.style.display, "none");
  assert.equal(nativeControl.style.display, "none");
  const projection = row.querySelector('[data-bv-subgraph-projection="true"]');
  assert.equal(projection.children[0].tag, "button");
  assert.equal(projection.children[0].textContent, "Heading2");
});

test("Nodes 2.0 heading edits without depending on a Classic proxy click hook", () => {
  const { document, host, row } = fixture("BV_HEADING", "Heading2", 34, "Header");
  delete host.widgets[0].onClick;
  let promptCallback;
  projectSubgraphNodes2Presentation(host, document, { prompt(_title, _value, callback) { promptCallback = callback; } });
  row.querySelector('[data-bv-subgraph-projection="true"]').children[0].onclick({});
  promptCallback("Changed heading");
  assert.equal(host.widgets[0].value, "Changed heading");
});

test("Nodes 2.0 renders exposed spacer and divider without editable numeric controls", () => {
  for (const [type, kind, height] of [["BV_SPACER", "spacer", 65], ["BV_DIVIDER", "divider", 10]]) {
    const { document, host, row, nativeControl } = fixture(type, height, height, kind === "spacer" ? "Spacer" : "Divider");
    projectSubgraphNodes2Presentation(host, document, {});
    assert.equal(row.dataset.bvSubgraphPresentation, kind);
    assert.equal(row.style.height, `${height}px`);
    assert.equal(nativeControl.style.display, "none");
    const projection = row.querySelector('[data-bv-subgraph-projection="true"]');
    assert.equal(projection.children.length, kind === "divider" ? 1 : 0);
    assert.equal(projection.role, "button");
    if (kind === "divider") {
      assert.equal(projection.children[0].style.borderTopWidth, "10px");
      assert.equal(projection.children[0].style.marginInline, "10px");
      assert.equal(projection.children[0].style.opacity, "0.35");
    }
  }
});

test("Nodes 2.0 spacer and divider projections edit their exposed numeric value", () => {
  const { document, host, row } = fixture("BV_SPACER", 65, 65, "Spacer");
  let promptCallback;
  projectSubgraphNodes2Presentation(host, document, { prompt(_title, _value, callback) { promptCallback = callback; } });
  row.querySelector('[data-bv-subgraph-projection="true"]').onclick({});
  promptCallback("80");
  assert.equal(host.widgets[0].value, 80);
});

import { app } from "../../scripts/app.js";
import { isSubgraphHost, isSubgraphProjectionStale, projectSubgraphUIPresentation, resolveSubgraphWidgetPresentations, subgraphFor, synchronizeDynamicComboHost } from "./bv_subgraph_ui_projection.js";
import { projectSubgraphNodes2Presentation } from "./bv_subgraph_nodes2_projection.js";
import { projectSeedControls } from "./bv_seed.js";

const UI_CLASSES = new Set(["BV Subgraph Heading", "BV Subgraph Spacer", "BV Subgraph Divider", "BV Dynamic Combo"]);
let reconcileFrame = 0;
let domObserver;
const MAX_PROXY_STABILIZATION_FRAMES = 12;

function id() {
  return globalThis.crypto?.randomUUID?.() ?? `bv-layout-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureIdentity(node) {
  node.properties ??= {};
  const nodes = node.graph?._nodes || node.graph?.nodes || [];
  const duplicate = nodes.some((candidate) => candidate !== node && candidate.properties?.bvLayoutId === node.properties.bvLayoutId);
  if (!node.properties.bvLayoutId || duplicate) node.properties.bvLayoutId = id();
  if (!Number.isFinite(node.properties.bvLayoutOrder)) {
    const orders = nodes.map((candidate) => candidate.properties?.bvLayoutOrder).filter(Number.isFinite);
    node.properties.bvLayoutOrder = orders.length ? Math.max(...orders) + 1 : 0;
  }
}

function refreshHost(host) {
  const project = () => {
    projectSubgraphUIPresentation(host);
    projectSeedControls(host);
    projectSubgraphNodes2Presentation(host, document, app.canvas);
  };
  queueMicrotask(() => {
    let previousTargets = [];
    let stableFrames = 0;
    let remaining = MAX_PROXY_STABILIZATION_FRAMES;
    const stabilize = () => {
      project();
      const presentations = resolveSubgraphWidgetPresentations(host);
      const targets = presentations.map(({ target }) => target).filter(Boolean);
      const sameTargets = targets.length > 0
        && targets.length === previousTargets.length
        && targets.every((target, index) => target === previousTargets[index]);
      const projected = presentations.length > 0 && presentations.every(({ source, target, presentationType }) =>
        target?.__bvPresentationType === presentationType && target?.__bvProjectedFrom === source);
      stableFrames = sameTargets && projected ? stableFrames + 1 : 0;
      previousTargets = targets;
      remaining--;
      if (stableFrames < 2 && remaining > 0) requestAnimationFrame(stabilize);
    };
    requestAnimationFrame(stabilize);
  });
}

function attachHost(host) {
  if (!isSubgraphHost(host)) return;
  if (host.__bvSubgraphUIPresentationAttached) {
    refreshHost(host);
    return;
  }
  host.__bvSubgraphUIPresentationAttached = true;
  const refresh = () => refreshHost(host);
  const originalDrawForeground = host.onDrawForeground;
  host.onDrawForeground = function () {
    const result = originalDrawForeground?.apply(this, arguments);
    if (!this.__bvSubgraphProjectionRefreshPending) {
      if (isSubgraphProjectionStale(this)) {
        this.__bvSubgraphProjectionRefreshPending = true;
        queueMicrotask(() => {
          try {
            projectSubgraphUIPresentation(this);
          } finally {
            this.__bvSubgraphProjectionRefreshPending = false;
          }
        });
      }
    }
    return result;
  };
  for (const eventName of ["widget-promoted", "widget-demoted", "input-added", "removing-input", "configured"]) {
    subgraphFor(host)?.events?.addEventListener?.(eventName, refresh);
  }
  refreshHost(host);
}

function attachGraph(graph, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph._nodes || graph.nodes || []) {
    if (!isSubgraphHost(node)) continue;
    attachHost(node);
    attachGraph(subgraphFor(node), visited);
  }
}

function reconcileNodes2Graph(graph, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph._nodes || graph.nodes || []) {
    if (!isSubgraphHost(node)) continue;
    projectSubgraphNodes2Presentation(node, document, app.canvas);
    reconcileNodes2Graph(subgraphFor(node), visited);
  }
}

function reconcileVisibleHosts() {
  const graph = app.canvas?.graph;
  if (graph) reconcileNodes2Graph(graph);
}

function scheduleVisibleHostReconcile() {
  if (reconcileFrame) return;
  reconcileFrame = requestAnimationFrame(() => {
    reconcileFrame = 0;
    reconcileVisibleHosts();
  });
}

function synchronizeDynamicComboGraph(graph, sourceNode, values, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph._nodes || graph.nodes || []) {
    if (!isSubgraphHost(node)) continue;
    synchronizeDynamicComboHost(node, sourceNode, values);
    synchronizeDynamicComboGraph(subgraphFor(node), sourceNode, values, visited);
  }
}

app.registerExtension({
  name: "bv_nodepack.subgraph_layout_identity",
  async nodeCreated(node) {
    if (UI_CLASSES.has(node.comfyClass)) ensureIdentity(node);
    if (isSubgraphHost(node)) attachHost(node);
  },
  setup() {
    // setup() runs before app.graph is guaranteed to exist. Accessing the
    // throwing getter here aborts the extension and prevents every listener
    // below from being installed.
    app.canvas?.addEventListener?.("litegraph:set-graph", (event) => attachGraph((event.detail || event).newGraph));
    app.canvas?.addEventListener?.("subgraph-opened", (event) => {
      const detail = event.detail || event;
      attachHost(detail.fromNode);
      attachGraph(detail.subgraph);
    });
    window.addEventListener("bv-dynamic-combo-options-changed", (event) => {
      const { sourceNode, values } = event.detail || {};
      const rootGraph = sourceNode?.graph?.rootGraph;
      if (sourceNode && Array.isArray(values)) synchronizeDynamicComboGraph(rootGraph, sourceNode, values);
    });
    if (!domObserver && document.body) {
      domObserver = new MutationObserver(scheduleVisibleHostReconcile);
      domObserver.observe(document.body, { childList: true, subtree: true });
    }

    // Workflow tabs can replace the active graph without configuring it again.
    // Keep a small fallback around the official canvas method as well as the
    // event above so already-loaded tab graphs are projected immediately.
    const canvas = app.canvas;
    if (canvas?.setGraph && !canvas.__bvSubgraphSetGraphWrapped) {
      canvas.__bvSubgraphSetGraphWrapped = true;
      const originalSetGraph = canvas.setGraph;
      canvas.setGraph = function (graph) {
        const result = originalSetGraph.apply(this, arguments);
        attachGraph(graph);
        return result;
      };
    }
  },
  afterConfigureGraph() {
    attachGraph(app.graph);
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (!UI_CLASSES.has(nodeData.name)) return;
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure?.apply(this, arguments);
      ensureIdentity(this);
      return result;
    };
  },
});

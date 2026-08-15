import { app } from "../../scripts/app.js";
import { projectSubgraphUIPresentation, synchronizeDynamicComboHost } from "./bv_subgraph_ui_projection.js";

const UI_CLASSES = new Set(["BV Subgraph Heading", "BV Subgraph Spacer", "BV Subgraph Divider", "BV Dynamic Combo"]);

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
  const project = () => projectSubgraphUIPresentation(host);
  queueMicrotask(() => requestAnimationFrame(() => {
    project();
    // Subgraph proxy widgets are finalized one render pass after graph
    // configuration. Reapply to the authoritative proxies, not the temporary
    // objects present during nodeCreated/configure.
    requestAnimationFrame(project);
  }));
  // Workflow restore finalizes promoted proxies asynchronously after
  // afterConfigureGraph (and later than an ordinary widget edit). Use a bounded
  // stabilization window so the final proxy receives the presentation too.
  for (const delay of [50, 150, 400, 1000]) setTimeout(project, delay);
}

function attachHost(host) {
  const isSubgraphHost = host?.isSubgraphNode?.() || Boolean(host?.subgraph);
  if (!isSubgraphHost) return;
  if (host.onDrawBackground !== host.__bvSubgraphPresentationRenderGuard) {
    const originalDrawBackground = host.onDrawBackground;
    const renderGuard = function () {
      projectSubgraphUIPresentation(this);
      return originalDrawBackground?.apply(this, arguments);
    };
    host.__bvSubgraphPresentationRenderGuard = renderGuard;
    host.onDrawBackground = renderGuard;
  }
  if (host.__bvSubgraphUIPresentationAttached) {
    refreshHost(host);
    return;
  }
  host.__bvSubgraphUIPresentationAttached = true;
  const refresh = () => refreshHost(host);
  for (const eventName of ["widget-promoted", "widget-demoted", "input-added", "removing-input", "configured"]) {
    host.subgraph?.events?.addEventListener?.(eventName, refresh);
  }
  refreshHost(host);
}

function attachGraph(graph, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph._nodes || graph.nodes || []) {
    if (!node?.isSubgraphNode?.()) continue;
    attachHost(node);
    attachGraph(node.subgraph, visited);
  }
}

function synchronizeDynamicComboGraph(graph, sourceNode, values, visited = new Set()) {
  if (!graph || visited.has(graph)) return;
  visited.add(graph);
  for (const node of graph._nodes || graph.nodes || []) {
    if (!node?.isSubgraphNode?.()) continue;
    synchronizeDynamicComboHost(node, sourceNode, values);
    synchronizeDynamicComboGraph(node.subgraph, sourceNode, values, visited);
  }
}

app.registerExtension({
  name: "bv_nodepack.subgraph_layout_identity",
  async nodeCreated(node) {
    if (UI_CLASSES.has(node.comfyClass)) ensureIdentity(node);
    if (node?.isSubgraphNode?.()) attachHost(node);
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

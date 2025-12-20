// bv_pipe_shared.js
import { app } from "../../scripts/app.js";

export const MAX_SLOTS = 100;
export const RESOLVE_RETRIES = 10;
export const RESOLVE_DELAY_MS = 40;

export function defer(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getGraphFromNode(node) {
  return node?.graph || app.graph;
}

/**
 * Root graph capture:
 * Used for locating subgraph container nodes when the subgraph implementation
 * does not provide a direct parent pointer.
 */
const ROOT_GRAPH =
  window.__BV_PIPE_ROOT_GRAPH || (window.__BV_PIPE_ROOT_GRAPH = app.graph);

// Cache: innerGraph -> { parentNode, parentGraph }
const PARENT_CACHE = new WeakMap();

function getAllNodes(graph) {
  return graph?._nodes || graph?.nodes || [];
}

// ---------- parsing ----------

export function parseNames(raw) {
  return (raw || "")
    .replaceAll(",", "\n")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_SLOTS);
}

export function getConfigFromConfigNode(cfgNode) {
  const namesW = cfgNode.widgets?.find((w) => w.name === "names");
  const namesRaw = namesW?.value ?? "";
  const names = parseNames(namesRaw);
  return { namesRaw, names, count: names.length };
}

// ---------- subgraph parent discovery (robust) ----------

function isGraphLike(obj) {
  if (!obj || typeof obj !== "object") return false;
  const hasNodes = Array.isArray(obj._nodes) || Array.isArray(obj.nodes);
  const hasLinks = obj.links && typeof obj.links === "object";
  const hasGetNodeById = typeof obj.getNodeById === "function";
  return hasNodes && hasLinks && hasGetNodeById;
}

/**
 * Recursively collect any graph-like objects reachable from `root`.
 * This catches subgraph implementations that store inner graphs in node.properties.* etc.
 */
function collectGraphsDeep(root, maxDepth = 3) {
  const found = new Set();
  const seen = new Set();

  function walk(v, depth) {
    if (!v || depth > maxDepth) return;
    if (typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);

    if (isGraphLike(v)) found.add(v);

    if (Array.isArray(v)) {
      for (const x of v) walk(x, depth + 1);
      return;
    }

    for (const k of Object.keys(v)) {
      try {
        walk(v[k], depth + 1);
      } catch (e) {}
    }
  }

  walk(root, 0);
  return found;
}

function getInnerGraphFromNode(node) {
  const direct =
    node?.subgraph ||
    node?._subgraph ||
    node?.inner_graph ||
    node?.graph_inside ||
    node?.subgraph_graph ||
    node?.subgraphGraph ||
    null;

  if (direct && isGraphLike(direct)) return direct;

  // robust deep search inside node + properties
  const graphs = collectGraphsDeep({ node, props: node?.properties }, 3);
  for (const g of graphs) return g;

  return null;
}

function findParentByScanning(rootGraph, targetSubGraph) {
  const visitedGraphs = new Set();
  const queue = [rootGraph];

  while (queue.length) {
    const g = queue.shift();
    if (!g || visitedGraphs.has(g)) continue;
    visitedGraphs.add(g);

    for (const n of getAllNodes(g)) {
      const inner = getInnerGraphFromNode(n);
      if (inner) {
        if (inner === targetSubGraph) {
          return { parentNode: n, parentGraph: g };
        }
        queue.push(inner);
      }
    }
  }

  return null;
}

function getParentRefForSubGraph(subGraph) {
  if (!subGraph) return null;

  const cached = PARENT_CACHE.get(subGraph);
  if (cached) return cached;

  // Scan from both root and current active graph (safe)
  const candidates = [ROOT_GRAPH, app.graph].filter(Boolean);

  for (const start of candidates) {
    const found = findParentByScanning(start, subGraph);
    if (found) {
      PARENT_CACHE.set(subGraph, found);
      return found;
    }
  }

  return null;
}

// ---------- link helpers ----------

function getUpstreamByInput(node, inputIndex) {
  const graph = getGraphFromNode(node);
  const inp = node.inputs?.[inputIndex];
  if (!inp?.link) return null;

  const link = graph.links?.[inp.link];
  if (!link) return null;

  const originNode = graph.getNodeById(link.origin_id) || null;

  return {
    graph,
    link,
    originNode,
    originSlot: Number.isFinite(link.origin_slot) ? link.origin_slot : 0,
  };
}

/**
 * Jump from a subgraph "graph input" (origin_id negative, e.g. -10) to the parent graph origin node.
 * Uses:
 * - parent container node input named "pipe" if present (most robust)
 * - else index = subInputIndex
 * - else index = 0
 */
function jumpFromSubgraphGraphInputToParentOrigin(subGraph, subInputIndex) {
  const parentRef = getParentRefForSubGraph(subGraph);
  if (!parentRef) return null;

  const { parentNode, parentGraph } = parentRef;

  const parentInp =
    parentNode.inputs?.find((i) => i?.name === "pipe") ||
    parentNode.inputs?.[subInputIndex] ||
    parentNode.inputs?.[0];

  if (!parentInp?.link) return null;

  const parentLink = parentGraph.links?.[parentInp.link];
  if (!parentLink) return null;

  const origin = parentGraph.getNodeById(parentLink.origin_id);
  if (!origin) return null;

  return { node: origin, graph: parentGraph };
}

// ---------- config resolution ----------

export function resolveCfgByPipeLinksNoCache(node, visited = new Set()) {
  if (!node) return null;

  const g = getGraphFromNode(node);
  const vkey = `${String(g)}:${node.id}`;
  if (visited.has(vkey)) return null;
  visited.add(vkey);

  if (node.comfyClass === "BV Pipe Config") {
    return getConfigFromConfigNode(node);
  }

  // Follow pipe input[0] upstream
  const up = getUpstreamByInput(node, 0);
  if (!up) return null;

  // Normal case: origin exists in this graph
  if (up.originNode) {
    return resolveCfgByPipeLinksNoCache(up.originNode, visited);
  }

  // Subgraph graph-input case (origin_id negative -> no originNode)
  const jumped = jumpFromSubgraphGraphInputToParentOrigin(up.graph, up.originSlot);
  if (!jumped) return null;

  return resolveCfgByPipeLinksNoCache(jumped.node, visited);
}

export function getCfgFromNodeWithFallback(node) {
  return resolveCfgByPipeLinksNoCache(node) || node.__pipe_cfg || null;
}

// ---------- safe remove helpers (graph-aware) ----------

function removeInputSafely(node, index) {
  const graph = getGraphFromNode(node);
  const inp = node.inputs?.[index];
  if (!inp) return;

  const linkId = inp.link;
  if (linkId != null) {
    try { node.disconnectInput(index); } catch (e) {}
    if (graph.links?.[linkId]) {
      try { graph.removeLink(linkId); } catch (e) {}
    }
  }
  try { node.removeInput(index); } catch (e) {}
}

function removeOutputSafely(node, index) {
  const graph = getGraphFromNode(node);
  const out = node.outputs?.[index];
  if (!out) return;

  const links = out.links ? [...out.links] : [];
  if (links.length) {
    for (const linkId of links) {
      if (graph.links?.[linkId]) {
        try { graph.removeLink(linkId); } catch (e) {}
      }
    }
    try { node.disconnectOutput(index); } catch (e) {}
  }
  try { node.removeOutput(index); } catch (e) {}
}

// ---------- slot update ----------

function ensureInputs(pipeNode, count, labels) {
  const targetLen = 1 + count; // inputs[0] = pipe

  while ((pipeNode.inputs?.length || 0) > targetLen) {
    removeInputSafely(pipeNode, pipeNode.inputs.length - 1);
  }

  while ((pipeNode.inputs?.length || 0) < targetLen) {
    const slot = pipeNode.inputs.length; // 1..count
    const key = `v_${String(slot).padStart(3, "0")}`;
    const label = labels[slot - 1] ?? key;
    pipeNode.addInput(key, "*", { label, nameLocked: true });
  }

  for (let i = 1; i <= count; i++) {
    const inp = pipeNode.inputs?.[i];
    if (inp) inp.label = labels[i - 1] ?? inp.name;
  }
}

function ensureOutputs(pipeNode, count, labels) {
  const targetLen = 1 + count; // outputs[0] = pipe

  while ((pipeNode.outputs?.length || 0) > targetLen) {
    removeOutputSafely(pipeNode, pipeNode.outputs.length - 1);
  }

  while ((pipeNode.outputs?.length || 0) < targetLen) {
    const slot = pipeNode.outputs.length; // 1..count
    const key = `out_${String(slot).padStart(3, "0")}`;
    const label = labels[slot - 1] ?? key;
    pipeNode.addOutput(key, "*", { label, nameLocked: true });
  }

  for (let i = 1; i <= count; i++) {
    const out = pipeNode.outputs?.[i];
    if (out) out.label = labels[i - 1] ?? out.name;
  }
}

export function updatePipeNodeUI(pipeNode, cfg) {
  if (!cfg) return;

  const count = Math.max(0, Math.min(MAX_SLOTS, Number(cfg.count || 0)));
  const labels = (cfg.names || []).slice(0, count);

  pipeNode.__pipe_cfg = { namesRaw: cfg.namesRaw ?? "", names: labels, count };

  ensureInputs(pipeNode, count, labels);
  ensureOutputs(pipeNode, count, labels);

  try {
    if (pipeNode.computeSize) pipeNode.setSize(pipeNode.computeSize());
  } catch (e) {}

  pipeNode.setDirtyCanvas(true, true);
}

// ---------- propagation (same-graph) ----------

export function propagateFrom(startNode) {
  const graph = getGraphFromNode(startNode);
  const visited = new Set();
  const queue = [startNode];

  while (queue.length) {
    const cur = queue.shift();
    if (!cur || visited.has(cur.id)) continue;
    visited.add(cur.id);

    const cfg = getCfgFromNodeWithFallback(cur);

    const out0 = cur.outputs?.[0];
    const links = out0?.links ? [...out0.links] : [];
    if (!links.length) continue;

    for (const linkId of links) {
      const link = graph.links?.[linkId];
      if (!link) continue;

      const target = graph.getNodeById(link.target_id);
      if (!target) continue;

      if (cfg && target.comfyClass === "BV Pipe") {
        updatePipeNodeUI(target, cfg);
      }

      queue.push(target);
    }
  }
}

export async function refreshPipeNodeFromUpstream(pipeNode) {
  for (let attempt = 0; attempt < RESOLVE_RETRIES; attempt++) {
    const cfg = resolveCfgByPipeLinksNoCache(pipeNode);
    if (cfg) {
      updatePipeNodeUI(pipeNode, cfg);
      propagateFrom(pipeNode);
      return;
    }
    await sleep(RESOLVE_DELAY_MS);
  }
}

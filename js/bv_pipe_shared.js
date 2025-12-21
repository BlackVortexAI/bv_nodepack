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
 * used for scanning container/subgraphs when no parent pointers exist.
 */
const ROOT_GRAPH =
  window.__BV_PIPE_ROOT_GRAPH || (window.__BV_PIPE_ROOT_GRAPH = app.graph);

// Cache: innerGraph -> { parentNode, parentGraph }
const PARENT_CACHE = new WeakMap();

// GraphId cache (critical): graphs need stable unique IDs for visited keys
const GRAPH_ID = new WeakMap();
let GRAPH_ID_SEQ = 1;
function getGraphId(graph) {
  if (!graph || typeof graph !== "object") return 0;
  let id = GRAPH_ID.get(graph);
  if (!id) {
    id = GRAPH_ID_SEQ++;
    GRAPH_ID.set(graph, id);
  }
  return id;
}

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

// ---------- graph/subgraph utilities (exported global refresh uses these) ----------

export function isGraphLike(obj) {
  if (!obj || typeof obj !== "object") return false;
  const hasNodes = Array.isArray(obj._nodes) || Array.isArray(obj.nodes);
  const hasLinks = obj.links && typeof obj.links === "object";
  const hasGetNodeById = typeof obj.getNodeById === "function";
  return hasNodes && hasLinks && hasGetNodeById;
}

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
  if (!node) return null;

  // Skip BV nodes to avoid false positives from internal properties
  if (node.comfyClass === "BV Pipe" || node.comfyClass === "BV Pipe Config") {
    return null;
  }

  const direct =
    node.subgraph ||
    node._subgraph ||
    node.inner_graph ||
    node.graph_inside ||
    node.subgraph_graph ||
    node.subgraphGraph ||
    (typeof node.getInnerGraph === "function" ? node.getInnerGraph() : null);

  if (direct && isGraphLike(direct)) return direct;

  // Check properties or widgets that might hold a graph reference
  if (node.properties?.subgraph && isGraphLike(node.properties.subgraph)) return node.properties.subgraph;

  // Only perform deep search for nodes that are likely to be containers
  const possibleContainers = ["Subgraph", "Workflow", "Group", "GroupNode", "Subflow", "Recursive"];
  const isLikelyContainer = possibleContainers.some(c => node.comfyClass?.includes(c)) || node.getInnerGraph;

  if (isLikelyContainer) {
    const graphs = collectGraphsDeep({ node, props: node?.properties }, 3);
    for (const g of graphs) return g;
  }

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

/**
 * Exported: refresh ALL BV Pipe nodes across the whole workflow,
 * including nested subgraphs.
 */
export function refreshAllPipesEverywhere(startGraph) {
  const root = (startGraph && isGraphLike(startGraph)) ? startGraph : ROOT_GRAPH || app.graph;
  if (!root) return;

  const visitedGraphs = new Set();
  const queue = [root];

  while (queue.length) {
    const g = queue.shift();
    if (!g || visitedGraphs.has(g)) continue;
    visitedGraphs.add(g);

    const nodes = getAllNodes(g);

    // refresh BV Pipe in this graph
    for (const n of nodes) {
      if (n?.comfyClass === "BV Pipe") {
        refreshPipeNodeFromUpstream(n);
      }
    }

    // enqueue nested subgraphs
    for (const n of nodes) {
      const inner = getInnerGraphFromNode(n);
      if (inner && !visitedGraphs.has(inner)) queue.push(inner);
    }
  }
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

function jumpFromSubgraphGraphInputToParentOrigin(subGraph, subInputIndex) {
  const parentRef = getParentRefForSubGraph(subGraph);
  if (!parentRef) return null;

  const { parentNode, parentGraph } = parentRef;

  // Search for the input that corresponds to the given index or is named "pipe"
  const parentInp =
    parentNode.inputs?.find((i, idx) => i?.name === "pipe" || i?.label === "pipe" || idx === subInputIndex) ||
    parentNode.inputs?.[0];

  if (!parentInp?.link) return null;

  const parentLink = parentGraph.links?.[parentInp.link];
  if (!parentLink) return null;

  const origin = parentGraph.getNodeById(parentLink.origin_id);
  if (!origin) return null;

  return { node: origin, graph: parentGraph };
}

function jumpFromParentToSubgraphInput(parentNode, parentSlotIndex) {
  const innerGraph = getInnerGraphFromNode(parentNode);
  if (!innerGraph) return null;

  const allNodes = getAllNodes(innerGraph);
  const inputNodeClasses = [
    "SubgraphInput", "PrimitiveInput", "InputNode", "GraphInput", "Input", "GroupInput",
    "InternalInput", "ProxyInput", "CustomNodeInput", "WorkflowInput", "PipeInput", "SubflowInput"
  ];
  const inputNodes = allNodes.filter((n) => inputNodeClasses.includes(n.comfyClass) || n.comfyClass?.toLowerCase().includes("input"));

  // Try to find by property 'index' or widget value
  let targetNode = inputNodes.find(
    (n) => n.properties?.index === parentSlotIndex ||
           n.widgets?.find((w) => (w.name === "index" || w.name === "input_index") && w.value === parentSlotIndex)
  );

  // Fallback: try by name/label match
  if (!targetNode && parentNode.inputs?.[parentSlotIndex]) {
    const parentInpName = parentNode.inputs[parentSlotIndex].name?.toLowerCase();
    targetNode = inputNodes.find(n => n.title?.toLowerCase() === parentInpName || n.widgets?.find(w => w.name === "name" && w.value?.toLowerCase() === parentInpName));
  }

  if (!targetNode && parentSlotIndex === 0) {
    targetNode = inputNodes[0];
  }

  // Fallback: if we found NO input node but there are BV Pipes inside, maybe it's a direct mapping?
  if (!targetNode && inputNodes.length === 0) {
    const bvPipesInside = allNodes.filter(n => n.comfyClass === "BV Pipe");
    if (bvPipesInside.length === 1) {
       targetNode = bvPipesInside[0];
    }
  }

  return targetNode ? { node: targetNode, graph: innerGraph } : null;
}

function jumpFromSubgraphOutputToParent(subGraph, subOutputIndex, outputNode) {
  const parentRef = getParentRefForSubGraph(subGraph);
  if (!parentRef) return null;

  const { parentNode, parentGraph } = parentRef;

  let slotIdx = 0;

  if (outputNode && outputNode.properties && typeof outputNode.properties.index === "number") {
    slotIdx = outputNode.properties.index;
  } else if (outputNode && outputNode.widgets) {
    const indexW = outputNode.widgets.find(w => w.name === "index" || w.name === "output_index");
    if (indexW && typeof indexW.value === "number") {
      slotIdx = indexW.value;
    }
  } else {
    const allNodes = getAllNodes(subGraph);
    const outClasses = [
        "SubgraphOutput", "OutputNode", "GraphOutput", "Output", "GroupOutput",
        "InternalOutput", "ProxyOutput", "CustomNodeOutput", "WorkflowOutput", "PipeOutput", "SubflowOutput"
    ];
    const outputNodes = allNodes.filter(n => outClasses.includes(n.comfyClass) || n.comfyClass?.toLowerCase().includes("output")).sort((a, b) => a.id - b.id);
    const foundIdx = outputNodes.indexOf(outputNode);
    if (foundIdx !== -1) {
      slotIdx = foundIdx;
    } else {
      slotIdx = Number.isFinite(subOutputIndex) ? subOutputIndex : 0;
    }
  }

  return { node: parentNode, graph: parentGraph, slot: slotIdx };
}

function jumpFromParentToSubgraphOutputOrigin(parentNode, parentSlotIndex) {
  const innerGraph = getInnerGraphFromNode(parentNode);
  if (!innerGraph) return null;

  const allNodes = getAllNodes(innerGraph);
  const outClasses = [
    "SubgraphOutput", "OutputNode", "GraphOutput", "Output", "GroupOutput",
    "InternalOutput", "ProxyOutput", "CustomNodeOutput", "WorkflowOutput", "PipeOutput", "SubflowOutput"
  ];
  const outputNodes = allNodes.filter(n => outClasses.includes(n.comfyClass) || n.comfyClass?.toLowerCase().includes("output"));

  let targetNode = outputNodes.find(
    (n) => n.properties?.index === parentSlotIndex ||
           n.widgets?.find((w) => (w.name === "index" || w.name === "output_index") && w.value === parentSlotIndex)
  );

  // Fallback: try by name/label match
  if (!targetNode && parentNode.outputs?.[parentSlotIndex]) {
    const parentOutName = parentNode.outputs[parentSlotIndex].name?.toLowerCase();
    targetNode = outputNodes.find(n => n.title?.toLowerCase() === parentOutName || n.widgets?.find(w => w.name === "name" && w.value?.toLowerCase() === parentOutName));
  }

  if (!targetNode && parentSlotIndex === 0) {
    targetNode = outputNodes[0];
  }

  if (targetNode) {
    // We found the internal Output node, but we need to find what's connected to its INPUT (upstream)
    const up = getUpstreamByInput(targetNode, 0);
    if (up && up.originNode) {
        return { node: up.originNode, graph: innerGraph };
    }
  }

  return null;
}

function fallbackDirectMappedCfgFromInnerGraph(parentNode) {
  const innerGraph = getInnerGraphFromNode(parentNode);
  if (!innerGraph) return null;

  const nodes = getAllNodes(innerGraph);

  // Your observed case: subgraph contains ONLY the BV Pipe Config node
  if (nodes.length === 1 && nodes[0]?.comfyClass === "BV Pipe Config") {
    return { node: nodes[0], graph: innerGraph };
  }

  // Slightly more permissive fallback: if there is exactly one config node inside, use it
  const cfgNodes = nodes.filter(n => n?.comfyClass === "BV Pipe Config");
  if (cfgNodes.length === 1) {
    return { node: cfgNodes[0], graph: innerGraph };
  }

  return null;
}


// ---------- config resolution ----------

export function resolveCfgByPipeLinksNoCache(node, visited = new Set()) {
  if (!node) return null;

  const g = getGraphFromNode(node);
  const vkey = `${getGraphId(g)}:${node.id}`;
  if (visited.has(vkey)) return null;
  visited.add(vkey);

  if (node.comfyClass === "BV Pipe Config") {
    return getConfigFromConfigNode(node);
  }

  const up = getUpstreamByInput(node, 0);
  if (!up) {
    // Check if this node itself is inside a subgraph and might be a "direct mapped" input
    const parentRef = getParentRefForSubGraph(g);
    if (parentRef) {
       // If we are at the "entry" of a subgraph but found no link, try to look at the parent
       return resolveCfgByPipeLinksNoCache(parentRef.parentNode, visited);
    }
    return null;
  }

  if (up.originNode) {
  // If originNode is a Subgraph/container, jump into it to find the source of the config
  const inner = getInnerGraphFromNode(up.originNode);
  if (inner) {
    const jumped = jumpFromParentToSubgraphOutputOrigin(up.originNode, up.originSlot);
    if (jumped) {
      return resolveCfgByPipeLinksNoCache(jumped.node, visited);
    }

    // ✅ Fallback for "direct mapped" subgraphs (like your 1-node BV Pipe Config subgraph)
    const direct = fallbackDirectMappedCfgFromInnerGraph(up.originNode);
    if (direct) {
      return resolveCfgByPipeLinksNoCache(direct.node, visited);
    }
  }

  return resolveCfgByPipeLinksNoCache(up.originNode, visited);
}

  // subgraph graph-input case (origin_id negative -> no originNode)
  const jumped = jumpFromSubgraphGraphInputToParentOrigin(up.graph, up.originSlot);
  if (!jumped) {
    // Fallback: maybe the link just points outside the current graph scope?
    const parentRef = getParentRefForSubGraph(up.graph);
    if (parentRef) {
        return resolveCfgByPipeLinksNoCache(parentRef.parentNode, visited);
    }
    return null;
  }

  return resolveCfgByPipeLinksNoCache(jumped.node, visited);
}

export function getCfgFromNodeWithFallback(node) {
  return resolveCfgByPipeLinksNoCache(node) || node.__pipe_cfg || null;
}

// ---------- safe remove helpers ----------

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

// ---------- propagation (same-graph only) ----------

export function propagateFrom(startNode) {
  const visited = new Set();
  const startCfg = getCfgFromNodeWithFallback(startNode);
  const queue = [{ node: startNode, graph: getGraphFromNode(startNode), outputSlot: -1, cfg: startCfg }];

  while (queue.length) {
    const { node: cur, graph, outputSlot, cfg: curCfg } = queue.shift();
    if (!cur) continue;

    const vkey = `${getGraphId(graph)}:${cur.id}${outputSlot >= 0 ? ":" + outputSlot : ""}`;
    if (visited.has(vkey)) continue;
    visited.add(vkey);

    const cfg = curCfg || getCfgFromNodeWithFallback(cur);

    const slotsToProcess = outputSlot >= 0 ? [outputSlot] : [0];

    for (const slotIdx of slotsToProcess) {
      const out = cur.outputs?.[slotIdx];
      const links = out?.links ? [...out.links] : [];
      if (!links.length) continue;

      for (const linkId of links) {
        const link = graph.links?.[linkId];
        if (!link) continue;

        let target = graph.getNodeById(link.target_id);

        if (!target || target.comfyClass === "SubgraphOutput" || link.target_id < 0) {
          const jumped = jumpFromSubgraphOutputToParent(graph, link.origin_slot, target);
          if (jumped) {
            queue.push({ node: jumped.node, graph: jumped.graph, outputSlot: jumped.slot, cfg });
            continue;
          }
        }

        if (!target) continue;

        // If target is a subgraph node, jump into it
        const inner = getInnerGraphFromNode(target);
        if (inner) {
          const jumpedIn = jumpFromParentToSubgraphInput(target, link.target_slot);
          if (jumpedIn) {
            // CRITICAL FIX: Update the internal node immediately when jumping in
            if (cfg && jumpedIn.node.comfyClass === "BV Pipe") {
              updatePipeNodeUI(jumpedIn.node, cfg);
            }
            queue.push({ node: jumpedIn.node, graph: jumpedIn.graph, outputSlot: -1, cfg });
          }
        }

        if (cfg && target.comfyClass === "BV Pipe") {
          updatePipeNodeUI(target, cfg);
        }

        queue.push({ node: target, graph: graph, outputSlot: -1, cfg });
      }
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

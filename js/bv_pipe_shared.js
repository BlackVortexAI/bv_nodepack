// bv_pipe_shared.js
import { app } from "../../scripts/app.js";

export const MAX_SLOTS = 100;
export const RESOLVE_RETRIES = 8;
export const RESOLVE_DELAY_MS = 30;

export function defer(fn) {
  requestAnimationFrame(() => requestAnimationFrame(fn));
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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

function getPipeOriginNodeFromPipeNode(pipeNode) {
  const in0 = pipeNode.inputs?.[0];
  if (!in0?.link) return null;

  const link = app.graph.links?.[in0.link];
  if (!link) return null;

  return app.graph.getNodeById(link.origin_id) ?? null;
}

/**
 * Resolve config by following actual pipe links upstream (no cache).
 * Uses comfyClass keys from NODE_CLASS_MAPPINGS:
 * - "BV Pipe Config"
 * - "BV Pipe"
 */
export function resolveCfgByPipeLinksNoCache(node, visited = new Set()) {
  if (!node) return null;
  if (visited.has(node.id)) return null;
  visited.add(node.id);

  if (node.comfyClass === "BV Pipe Config") {
    return getConfigFromConfigNode(node);
  }

  if (node.comfyClass === "BV Pipe") {
    const origin = getPipeOriginNodeFromPipeNode(node);
    if (!origin) return null;
    return resolveCfgByPipeLinksNoCache(origin, visited);
  }

  return null;
}

export function getCfgFromNodeWithFallback(node, visited = new Set()) {
  if (!node) return null;
  if (visited.has(node.id)) return null;
  visited.add(node.id);

  if (node.comfyClass === "BV Pipe Config") {
    return getConfigFromConfigNode(node);
  }

  if (node.comfyClass === "BV Pipe") {
    const origin = getPipeOriginNodeFromPipeNode(node);
    if (origin) {
      const cfgUp = getCfgFromNodeWithFallback(origin, visited);
      if (cfgUp) return cfgUp;
    }
    return node.__pipe_cfg || null;
  }

  return null;
}

// ---------- safe remove helpers ----------

function removeInputSafely(node, index) {
  const inp = node.inputs?.[index];
  if (!inp) return;

  const linkId = inp.link;
  if (linkId != null) {
    try {
      node.disconnectInput(index);
    } catch (e) {}
    if (app.graph.links?.[linkId]) {
      try {
        app.graph.removeLink(linkId);
      } catch (e) {}
    }
  }

  try {
    node.removeInput(index);
  } catch (e) {}
}

function removeOutputSafely(node, index) {
  const out = node.outputs?.[index];
  if (!out) return;

  const links = out.links ? [...out.links] : [];
  if (links.length) {
    for (const linkId of links) {
      if (app.graph.links?.[linkId]) {
        try {
          app.graph.removeLink(linkId);
        } catch (e) {}
      }
    }
    try {
      node.disconnectOutput(index);
    } catch (e) {}
  }

  try {
    node.removeOutput(index);
  } catch (e) {}
}

// ---------- slot update ----------

function ensureInputs(pipeNode, count, labels) {
  const targetLen = 1 + count; // inputs[0] = pipe

  while ((pipeNode.inputs?.length || 0) > targetLen) {
    removeInputSafely(pipeNode, pipeNode.inputs.length - 1);
  }

  while ((pipeNode.inputs?.length || 0) < targetLen) {
    const slot = pipeNode.inputs.length; // 1..count
    const key = `v_${String(slot).padStart(3, "0")}`; // MUST match Python optional keys
    const label = labels[slot - 1] ?? key;

    // Keep internal socket name = v_###, only change label
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

  // cache fallback for disconnected state (NOT used for forced refresh)
  pipeNode.__pipe_cfg = { namesRaw: cfg.namesRaw ?? "", names: labels, count };

  ensureInputs(pipeNode, count, labels);
  ensureOutputs(pipeNode, count, labels);

  try {
    if (pipeNode.computeSize) pipeNode.setSize(pipeNode.computeSize());
  } catch (e) {}

  pipeNode.setDirtyCanvas(true, true);
}

// ---------- propagation ----------

export function propagateFrom(startNode) {
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
      const link = app.graph.links?.[linkId];
      if (!link) continue;

      const target = app.graph.getNodeById(link.target_id);
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

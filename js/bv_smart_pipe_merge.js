// Registered presentation exception: dynamic-pipe-slot-structure.
// See PRESENTATION_EXCEPTIONS in ui/src/regional/nodePresentation.ts.
import { app } from "../../scripts/app.js";
import { activeDescriptorFor, collectExpandedPipeAddresses, propagate } from "./bv_smart_pipe.js";
import {
  compactMergeNodeHeight,
  duplicateDynamicInputIndexes,
  hasMergeSource,
  normalizeMergeSources,
  SMART_PIPE_MERGE_DEFAULT_TITLE,
} from "./bv_smart_pipe_merge_model.js";

const NODE_CLASS = "BV Smart Pipe Merge";
const CONFIG_INPUT = "bv_smart_pipe_merge_json";
const ADD_SOURCE = "bv_add_pipe_source";
const MAX_SOURCES = 16;

function isMerge(node) {
  return node?.comfyClass === NODE_CLASS || node?.type === NODE_CLASS;
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `bv-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stateFor(node) {
  node.properties ??= {};
  const initialName = !node.title || ["Pipe", "Pipe Merge"].includes(node.title) ? SMART_PIPE_MERGE_DEFAULT_TITLE : node.title;
  node.properties.bvSmartPipeMerge ??= { version: 1, nodeId: newId(), name: initialName, sources: [] };
  const state = node.properties.bvSmartPipeMerge;
  state.name ??= initialName;
  state.sources ??= [];
  state.nextOrdinal ??= Math.max(0, ...state.sources.map((source) => Number.parseInt(source.key?.split("_")[1], 10) || 0)) + 1;
  return state;
}

function syncTitle(node) {
  const state = stateFor(node);
  if (node.__bvSmartPipeMergeAppliedTitle && node.title !== node.__bvSmartPipeMergeAppliedTitle && !["Pipe", "Pipe Merge"].includes(node.title)) {
    state.name = node.title;
  }
  node.title = state.name || SMART_PIPE_MERGE_DEFAULT_TITLE;
  node.__bvSmartPipeMergeAppliedTitle = node.title;
}

function activeSources(node, routing = collectExpandedPipeAddresses(app.graph)) {
  const state = stateFor(node);
  const widget = configWidget(node);
  if (!state.sources.length && typeof widget?.value === "string") {
    try {
      const persisted = JSON.parse(widget.value);
      if (Array.isArray(persisted)) state.sources = persisted;
    } catch {
      // Invalid hidden configuration is ignored and replaced on the next sync.
    }
  }
  const connectedWiredKeys = new Set(
    (node.inputs || [])
      .filter((input) => /^pipe_\d+$/.test(input.name || "") && input.link != null)
      .map((input) => input.name),
  );
  state.sources = normalizeMergeSources(state.sources, connectedWiredKeys);
  const descriptor = activeDescriptorFor(node, routing);
  if (!descriptor) return { sources: state.sources, descriptor: null, routing };
  routing.registry[descriptor.address] ??= { version: 1, kind: "merge", sources: structuredClone(state.sources) };
  const entry = routing.registry[descriptor.address];
  entry.kind = "merge";
  entry.sources ??= structuredClone(state.sources);
  entry.sources = normalizeMergeSources(entry.sources, connectedWiredKeys);
  state.sources = structuredClone(entry.sources);
  return { sources: entry.sources, descriptor, routing };
}

function ensureUniqueId(node) {
  const state = stateFor(node);
  const siblings = node.graph?._nodes || node.graph?.nodes || [];
  if (siblings.some((candidate) => candidate !== node && isMerge(candidate) && stateFor(candidate).nodeId === state.nodeId)) {
    state.nodeId = newId();
  }
}

function configWidget(node) {
  return node.widgets?.find((widget) => widget.name === CONFIG_INPUT);
}

function syncConfig(node) {
  const { sources } = activeSources(node);
  const widget = configWidget(node);
  if (widget) widget.value = JSON.stringify(sources);
}

function hideConfigWidget(node) {
  const widget = configWidget(node);
  if (!widget) return;
  widget.computeSize = () => [0, -4];
  widget.hidden = true;
}

function sourceInput(node, key) {
  return node.inputs?.find((input) => input.name === key);
}

function ensureAddSource(node) {
  let input = node.inputs?.find((slot) => slot.bvAddPipeSource || slot.name === ADD_SOURCE);
  if (!input) input = node.addInput(ADD_SOURCE, "BV_SMART_PIPE");
  input.name = ADD_SOURCE;
  input.label = "+ Add Pipe Source";
  input.type = "BV_SMART_PIPE";
  input.bvAddPipeSource = true;
}

function reconcileInputs(node) {
  syncTitle(node);
  for (const index of duplicateDynamicInputIndexes(node.inputs)) {
    const input = node.inputs[index];
    if (input?.link != null) node.graph?.removeLink?.(input.link);
    node.removeInput(index);
  }
  const { sources, descriptor, routing } = activeSources(node);
  const seenAddresses = new Set();
  for (let index = sources.length - 1; index >= 0; index--) {
    const source = sources[index];
    if (source.mode === "wired" && !source.address) {
      const input = sourceInput(node, source.key);
      const link = input?.link == null ? null : node.graph?.links?.get?.(input.link) ?? node.graph?.links?.[input.link];
      const originNode = link ? node.graph?.getNodeById?.(link.origin_id) : null;
      source.address = routing.descriptors.find((candidate) => candidate.node === originNode && (!descriptor || candidate.hostPath.join("/") === descriptor.hostPath.join("/")))?.address || null;
    }
    if (!source.address || !seenAddresses.has(source.address)) {
      if (source.address) seenAddresses.add(source.address);
      continue;
    }
    const input = sourceInput(node, source.key);
    if (input?.link != null) node.graph?.removeLink?.(input.link);
    sources.splice(index, 1);
  }
  const wired = new Set(sources.filter((source) => source.mode === "wired").map((source) => source.key));
  for (let index = (node.inputs?.length || 0) - 1; index >= 0; index--) {
    const input = node.inputs[index];
    if (input.name === CONFIG_INPUT || input.bvAddPipeSource || input.name === ADD_SOURCE) continue;
    if (/^pipe_\d+$/.test(input.name) && !wired.has(input.name) && input.link == null) node.removeInput(index);
  }
  for (const source of sources) {
    if (source.mode !== "wired") continue;
    let input = sourceInput(node, source.key);
    if (!input) input = node.addInput(source.key, "BV_SMART_PIPE");
    input.label = source.label || "Wired Pipe";
    input.type = "BV_SMART_PIPE";
  }
  ensureAddSource(node);
  syncConfig(node);
  const wiredCount = sources.filter((source) => source.mode === "wired").length;
  const presentation = globalThis.__bvNodePresentationBridge;
  if (presentation?.applyClassic) presentation.applyClassic(node, NODE_CLASS);
  else {
    hideConfigWidget(node);
    const next = [Math.max(280, node.size?.[0] || 0), compactMergeNodeHeight(wiredCount)];
    if (node.size?.[0] !== next[0] || node.size?.[1] !== next[1]) node.setSize?.(next);
  }
  node.setDirtyCanvas?.(true, true);
  for (const target of node.__bvSmartPipeTargets || []) propagate(target);
}

function convertAddSource(node, index, linkInfo) {
  const input = node.inputs?.[index];
  if (!input?.bvAddPipeSource && input?.name !== ADD_SOURCE) return false;
  const { sources } = activeSources(node);
  if (sources.length >= MAX_SOURCES) return false;
  const routing = collectExpandedPipeAddresses(app.graph);
  const destination = activeDescriptorFor(node, routing);
  const originNode = node.graph?.getNodeById?.(linkInfo?.origin_id);
  const origin = routing.descriptors.find((descriptor) => descriptor.node === originNode && (!destination || descriptor.hostPath.join("/") === destination.hostPath.join("/")));
  const candidate = { mode: "wired", address: origin?.address || null };
  if (hasMergeSource(sources, candidate)) {
    window.dispatchEvent(new CustomEvent("bv-show-toast", { detail: {
      title: "Merge source already exists",
      message: "This Smart Pipe is already configured as a wireless merge source. Remove the wireless source before connecting it physically.",
      tone: "warning",
      duration: 5000,
    } }));
    requestAnimationFrame(() => {
      const duplicateInput = node.inputs?.[index];
      if (duplicateInput?.link != null) node.graph?.removeLink?.(duplicateInput.link);
      reconcileInputs(node);
    });
    return true;
  }
  const state = stateFor(node);
  let ordinal = state.nextOrdinal;
  const used = new Set(sources.map((source) => source.key));
  while (used.has(`pipe_${String(ordinal).padStart(3, "0")}`)) ordinal++;
  const key = `pipe_${String(ordinal).padStart(3, "0")}`;
  state.nextOrdinal = ordinal + 1;
  input.name = key;
  input.label = `Wired ${sources.length + 1}`;
  input.bvAddPipeSource = false;
  sources.push({ key, mode: "wired", address: candidate.address, label: origin?.route?.name || input.label });
  requestAnimationFrame(() => reconcileInputs(node));
  return true;
}

function removeSource(node, source) {
  const { sources } = activeSources(node);
  const input = sourceInput(node, source.key);
  if (input?.link != null) node.graph?.removeLink?.(input.link);
  const index = node.inputs?.indexOf(input) ?? -1;
  if (index >= 0) node.removeInput(index);
  sources.splice(sources.indexOf(source), 1);
}

function openEditor(node) {
  window.dispatchEvent(new CustomEvent("bv-open-smart-pipe-editor", { detail: { node, kind: "merge" } }));
}
globalThis.__bvSmartPipeEditorBridge ??= {};
globalThis.__bvSmartPipeEditorBridge.merge = {
  read(node) {
    const routing = collectExpandedPipeAddresses(app.graph), current = activeDescriptorFor(node, routing), { sources } = activeSources(node, routing);
    const candidates = routing.descriptors.filter((descriptor) => descriptor.address !== current?.address && !hasMergeSource(sources, { address: descriptor.address })).map((descriptor) => ({ address: descriptor.address, label: `${descriptor.hostNames.length ? `${descriptor.hostNames.join(" › ")} › ` : ""}${descriptor.route.name || descriptor.node.title || "Pipe"}` }));
    return structuredClone({ sources, candidates });
  },
  save(node, draft) {
    const active = activeSources(node), state = stateFor(node);
    active.sources.splice(0, active.sources.length, ...structuredClone(draft.sources ?? []));
    state.sources = structuredClone(active.sources);
    reconcileInputs(node);
    node.graph?.setDirtyCanvas?.(true, true);
  },
};

function setupNode(node) {
  if (node.__bvSmartPipeMergeReady) return;
  node.__bvSmartPipeMergeReady = true;
  ensureUniqueId(node);
  const state = stateFor(node);
  node.title = state.name || SMART_PIPE_MERGE_DEFAULT_TITLE;
  node.__bvSmartPipeMergeAppliedTitle = node.title;
  const button = node.addWidget?.("button", "Configure Merge", null, () => openEditor(node), { serialize: false });
  if (button) button.label = "Configure Pipe Merge";
  const originalConnectionsChange = node.onConnectionsChange;
  node.onConnectionsChange = function (type, index, connected) {
    originalConnectionsChange?.apply(this, arguments);
    if (type === 1 && connected && convertAddSource(this, index, arguments[3])) return;
    requestAnimationFrame(() => reconcileInputs(this));
  };
  const originalRemoved = node.onRemoved;
  node.onRemoved = function () {
    globalThis.__bvNodePresentationBridge?.remove?.(this);
    return originalRemoved?.apply(this, arguments);
  };
  requestAnimationFrame(() => reconcileInputs(node));
}

app.registerExtension({
  name: "bv_nodepack.smart_pipe_merge",
  init() {
    const style = document.createElement("style");
    style.textContent = `.dom-widget:has(textarea[placeholder="${CONFIG_INPUT}"]) { display:none!important; }`;
    document.head.append(style);
  },
  async nodeCreated(node) {
    if (isMerge(node)) setupNode(node);
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure?.apply(this, arguments);
      setupNode(this);
      requestAnimationFrame(() => reconcileInputs(this));
      return result;
    };
    const originalMenu = nodeType.prototype.getExtraMenuOptions;
    nodeType.prototype.getExtraMenuOptions = function (_, options) {
      originalMenu?.apply(this, arguments);
      options.unshift({ content: "Configure Pipe Merge", callback: () => openEditor(this) });
    };
  },
});

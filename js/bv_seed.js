import { app } from "../../scripts/app.js";
import { applySeedAction, materializeSeedControl } from "./bv_seed_model.js";

const NODE_CLASS = "BV Seed";
const MIN_WIDTH = 300;
const BUTTON_HEIGHT = 26;
const BUTTON_GAP = 3;
const BUTTONS = [
  ["random-each", "🎲 Randomize Each Time"],
  ["new-fixed", "🎲 New Fixed Random"],
  ["use-last", "♻️ Use Last Queued Seed"],
];

function widget(node, name) {
  return node.widgets?.find((candidate) => candidate.name === name)
    ?? node.getWidgetFromSlot?.(node.inputs?.find((candidate) => candidate.name === name));
}

function removeGeneratedControls(node) {
  let removed = false;
  for (const candidate of [...(node.widgets || [])]) {
    if (candidate.name !== "control_after_generate" && candidate.name !== "mode") continue;
    node.removeWidget?.(candidate);
    candidate.inputEl?.remove?.();
    removed = true;
  }
  return removed;
}

function applyAction(owner, action, seedWidget, stateNode) {
  const next = applySeedAction(action, Number(seedWidget.value), stateNode.properties?.bvLastQueuedSeed);
  seedWidget.value = next;
  seedWidget.callback?.call(seedWidget, next);
  owner.setDirtyCanvas?.(true, true);
  owner.graph?.setDirtyCanvas?.(true, true);
}

function projectedButtonLabel(action, label, stateNode) {
  if (action !== "use-last") return label;
  const last = stateNode.properties?.bvLastQueuedSeed;
  return Number.isSafeInteger(last) ? `♻️ ${last}` : "♻️ (Use Last Queued Seed)";
}

function projectedButtonAction(localY, baseHeight) {
  const y = localY - baseHeight;
  if (y < 0) return null;
  const stride = BUTTON_HEIGHT + BUTTON_GAP;
  const row = Math.floor(y / stride);
  if (row < 0 || row >= BUTTONS.length || y - row * stride >= BUTTON_HEIGHT) return null;
  return BUTTONS[row][0];
}

function drawButtons(ctx, width, startY, stateNode) {
  ctx.save();
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let index = 0; index < BUTTONS.length; index++) {
    const [action, label] = BUTTONS[index];
    const y = startY + index * (BUTTON_HEIGHT + BUTTON_GAP);
    ctx.fillStyle = "#242424";
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(10, y + 1, Math.max(0, width - 20), BUTTON_HEIGHT - 2, 4);
    else ctx.rect(10, y + 1, Math.max(0, width - 20), BUTTON_HEIGHT - 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ddd";
    ctx.fillText(projectedButtonLabel(action, label, stateNode), width / 2, y + BUTTON_HEIGHT / 2);
  }
  ctx.restore();
}

function drawSeedValue(ctx, width, posY, height, value) {
  ctx.save();
  ctx.fillStyle = "#242424";
  ctx.strokeStyle = "#666";
  ctx.lineWidth = 1;
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(10, posY + 1, Math.max(0, width - 20), height - 2, height / 2);
  else ctx.rect(10, posY + 1, Math.max(0, width - 20), height - 2);
  ctx.fill();
  ctx.stroke();
  ctx.font = "13px Inter, system-ui, sans-serif";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#aaa";
  ctx.textAlign = "left";
  ctx.fillText("seed", 22, posY + height / 2);
  ctx.fillStyle = "#ddd";
  ctx.textAlign = "right";
  ctx.fillText(String(value ?? -1), width - 22, posY + height / 2);
  ctx.restore();
}

function patchSeedControl(owner, seedWidget, stateNode = owner) {
  if (!seedWidget) return false;
  if (seedWidget.__bvSeedControlOwner === owner && seedWidget.__bvSeedControlState === stateNode) return false;

  seedWidget.__bvSeedBaseDraw ??= seedWidget.draw;
  seedWidget.__bvSeedBaseDrawWidget ??= seedWidget.drawWidget;
  seedWidget.__bvSeedBaseComputeSize ??= seedWidget.computeSize;
  seedWidget.__bvSeedBaseComputeLayoutSize ??= seedWidget.computeLayoutSize;
  seedWidget.__bvSeedBaseMouse ??= seedWidget.mouse;
  seedWidget.__bvSeedBaseOnPointerDown ??= seedWidget.onPointerDown;
  const originalDraw = seedWidget.__bvSeedBaseDraw;
  const originalComputeSize = seedWidget.__bvSeedBaseComputeSize;
  const originalMouse = seedWidget.__bvSeedBaseMouse;
  const originalOnPointerDown = seedWidget.__bvSeedBaseOnPointerDown;
  const baseHeight = Math.max(24, originalComputeSize?.call(seedWidget, owner.size?.[0] ?? 220)?.[1] || 24);
  const controlsHeight = BUTTONS.length * BUTTON_HEIGHT + (BUTTONS.length - 1) * BUTTON_GAP;

  seedWidget.__bvSeedControlOwner = owner;
  seedWidget.__bvSeedControlState = stateNode;
  seedWidget.__bvSeedBaseHeight = baseHeight;
  seedWidget.computeSize = (width) => [Math.max(MIN_WIDTH, width || MIN_WIDTH), baseHeight + BUTTON_GAP + controlsHeight];
  seedWidget.computeLayoutSize = function () {
    const [minWidth, minHeight] = this.computeSize(this.width ?? owner.size?.[0] ?? MIN_WIDTH);
    return { minWidth, minHeight, maxHeight: minHeight };
  };
  seedWidget.draw = function (ctx, node, width, posY, _height, lowQuality) {
    this.__bvSeedDrawY = posY;
    drawSeedValue(ctx, width, posY, baseHeight, this.value);
    drawButtons(ctx, width, posY + baseHeight + BUTTON_GAP, stateNode);
  };
  seedWidget.mouse = function (event, pos, node) {
    const localY = (pos?.[1] ?? 0) - (this.__bvSeedDrawY ?? this.y ?? this.last_y ?? 0);
    const action = projectedButtonAction(localY, baseHeight + BUTTON_GAP);
    if (action && (event?.type === "pointerdown" || event?.type === "mousedown")) {
      if (action !== "use-last" || Number.isSafeInteger(stateNode.properties?.bvLastQueuedSeed)) {
        applyAction(owner, action, this, stateNode);
        return true;
      }
    }
    return originalMouse?.call(this, event, pos, node) ?? false;
  };
  seedWidget.onPointerDown = function (pointer, node) {
    const event = pointer?.eDown;
    const localY = Number(event?.canvasY) - Number(node?.pos?.[1] || 0)
      - (this.__bvSeedDrawY ?? this.y ?? this.last_y ?? 0);
    const action = projectedButtonAction(localY, baseHeight + BUTTON_GAP);
    if (!action || (action === "use-last" && !Number.isSafeInteger(stateNode.properties?.bvLastQueuedSeed))) {
      return originalOnPointerDown?.call(this, pointer, node) ?? false;
    }
    applyAction(owner, action, this, stateNode);
    return true;
  };
  return true;
}

function migrateExposedSeedName(host, input, inputIndex) {
  const slot = input?._subgraphSlot ?? host.subgraph?.inputs?.[inputIndex];
  if (!slot || typeof host.subgraph?.renameInput !== "function") return;
  const current = String(slot.name ?? input?.name ?? "");
  if (!/^seed_bv(?:_\d+)?$/.test(current)) return;
  const used = new Set((host.subgraph.inputs || [])
    .filter((candidate) => candidate !== slot)
    .map((candidate) => candidate?.name));
  let desired = "seed";
  for (let suffix = 1; used.has(desired); suffix++) desired = `seed_${suffix}`;
  host.subgraph.renameInput(slot, desired);
}

function relayout(node) {
  node.expandToFitContent?.();
  const size = node.computeSize?.();
  if (size) node.setSize?.(size);
  node.setDirtyCanvas?.(true, true);
}

function setupSeedNode(node) {
  node.properties ??= {};
  const removed = removeGeneratedControls(node);
  const patched = patchSeedControl(node, widget(node, "seed_bv"));
  if (removed || patched) relayout(node);
}

function resolvedConnections(host, input, index) {
  const direct = host.resolveSubgraphInputLinks?.(index) || [];
  if (direct.length) return direct;
  const slot = input?._subgraphSlot ?? host.subgraph?.inputs?.[index];
  return (slot?.linkIds || []).map((id) => host.subgraph?.getLink?.(id)?.resolve?.(host.subgraph)).filter(Boolean);
}

export function projectSeedControls(host) {
  let seedWidget = null;
  let sourceNode = null;
  for (const [index, input] of (host?.inputs || []).entries()) {
    const connection = resolvedConnections(host, input, index).find(({ inputNode, input: sourceInput }) =>
      (inputNode?.comfyClass === NODE_CLASS || inputNode?.type === NODE_CLASS) && sourceInput?.name === "seed_bv");
    if (!connection) continue;
    migrateExposedSeedName(host, input, index);
    seedWidget = host.getWidgetFromSlot?.(input);
    sourceNode = connection.inputNode;
    break;
  }
  if (!sourceNode || !seedWidget) return 0;
  host.properties ??= {};
  const removed = removeGeneratedControls(host);
  const patched = patchSeedControl(host, seedWidget, sourceNode);
  if (removed || patched) relayout(host);
  return 1;
}

function updateLastSeed(node, used) {
  node.properties ??= {};
  node.properties.bvLastQueuedSeed = used;
  node.setDirtyCanvas?.(true, true);
}

function installPromptMaterializer() {
  if (app.__bvSeedPromptMaterializer || typeof app.graphToPrompt !== "function") return;
  app.__bvSeedPromptMaterializer = true;
  const original = app.graphToPrompt;
  app.graphToPrompt = async function () {
    const result = await original.apply(this, arguments);
    for (const entry of Object.values(result?.output || {})) {
      if (entry?.class_type !== NODE_CLASS) continue;
      const resolved = materializeSeedControl(entry.inputs?.seed_bv);
      if (resolved == null) continue;
      entry.inputs.seed_bv = resolved;
      entry.inputs.seed = resolved;
    }
    return result;
  };
}

app.registerExtension({
  name: "bv_nodepack.seed",
  setup() {
    installPromptMaterializer();
  },
  async nodeCreated(node) {
    if (node.comfyClass === NODE_CLASS) setupSeedNode(node);
    if (node.isSubgraphNode?.()) queueMicrotask(() => projectSeedControls(node));
  },
  afterConfigureGraph() {
    for (const node of app.graph?._nodes || []) if (node.isSubgraphNode?.()) projectSeedControls(node);
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure?.apply(this, arguments);
      setupSeedNode(this);
      return result;
    };
    const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = originalConnectionsChange?.apply(this, arguments);
      setupSeedNode(this);
      return result;
    };
    const originalExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      const result = originalExecuted?.apply(this, arguments);
      const used = Number(Array.isArray(message?.last_seed) ? message.last_seed[0] : message?.last_seed);
      if (Number.isSafeInteger(used)) updateLastSeed(this, used);
      return result;
    };
  },
});

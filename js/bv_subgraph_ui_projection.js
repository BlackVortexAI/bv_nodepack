const PRESENTATION_TYPES = new Set(["BV_HEADING", "BV_SPACER", "BV_DIVIDER"]);
import { normalizeDynamicComboSelection } from "./bv_dynamic_combo_model.js";
const PRESENTATION_NODE_TYPES = new Map([
  ["BV Subgraph Heading", "BV_HEADING"],
  ["BV Subgraph Spacer", "BV_SPACER"],
  ["BV Subgraph Divider", "BV_DIVIDER"],
]);
const PRESENTATION_INPUT_NAMES = new Map([
  ["BV_HEADING", "Header"],
  ["BV_DIVIDER", "Divider"],
  ["BV_SPACER", "Spacer"],
]);

export function subgraphFor(node) {
  if (node?.subgraph) return node.subgraph;
  try { return node?.getSubgraph?.() ?? null; } catch { return null; }
}

export const isSubgraphHost = (node) => Boolean(node?.isSubgraphNode?.() || subgraphFor(node));

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function migratePresentationInputName(host, input, inputIndex, presentation) {
  const desiredBase = PRESENTATION_INPUT_NAMES.get(presentation.presentationType);
  const sourceName = presentation.sourceInput?.name;
  const subgraphInput = input?._subgraphSlot ?? host.subgraph?.inputs?.[inputIndex];
  if (!desiredBase || !sourceName || !subgraphInput || typeof host.subgraph?.renameInput !== "function") return;

  const currentName = String(subgraphInput.name ?? input?.name ?? "");
  // Preserve deliberate user names. ComfyUI-generated collision suffixes of
  // the original technical name still qualify for migration.
  const generatedName = new RegExp(`^${escapeRegExp(sourceName)}(?:_\\d+)?$`);
  if (!generatedName.test(currentName)) return;

  const usedNames = new Set((host.subgraph.inputs || [])
    .filter((candidate) => candidate !== subgraphInput)
    .map((candidate) => candidate?.name)
    .filter(Boolean));
  let desiredName = desiredBase;
  for (let suffix = 1; usedNames.has(desiredName); suffix++) desiredName = `${desiredBase}_${suffix}`;
  if (currentName !== desiredName) host.subgraph.renameInput(subgraphInput, desiredName);
}

function presentationTypeFor(sourceNode, widget) {
  const widgetType = widget?.__bvPresentationType ?? widget?.type;
  if (PRESENTATION_TYPES.has(widgetType)) return widgetType;
  return PRESENTATION_NODE_TYPES.get(sourceNode?.comfyClass)
    ?? PRESENTATION_NODE_TYPES.get(sourceNode?.type)
    ?? null;
}

function sourcePresentationFor(host, input, inputIndex) {
  const resolvedConnections = host.resolveSubgraphInputLinks?.(inputIndex) || [];
  for (const resolved of resolvedConnections) {
    const presentation = presentationFromResolved(resolved);
    if (presentation) return presentation;
  }

  // Legacy hosts attached the definition slot directly to the public input.
  // Current ComfyUI keeps it in the subgraph definition at the same index.
  const subgraphSlot = input?._subgraphSlot
    ?? host.subgraph?.inputs?.[inputIndex]
    ?? host.subgraph?.inputs?.find((slot) => slot?.name === input?.name);
  if (!subgraphSlot?.linkIds?.length) return null;
  for (const linkId of subgraphSlot.linkIds) {
    const link = host.subgraph?.getLink?.(linkId);
    const resolved = link?.resolve?.(host.subgraph);
    const presentation = presentationFromResolved(resolved);
    if (presentation) return presentation;
  }
  return null;
}

function resolvedInputConnections(host, input, inputIndex) {
  const resolved = [...(host.resolveSubgraphInputLinks?.(inputIndex) || [])];
  if (resolved.length) return resolved;
  const subgraphSlot = input?._subgraphSlot ?? host.subgraph?.inputs?.[inputIndex];
  for (const linkId of subgraphSlot?.linkIds || []) {
    const connection = host.subgraph?.getLink?.(linkId)?.resolve?.(host.subgraph);
    if (connection) resolved.push(connection);
  }
  return resolved;
}

export function synchronizeDynamicComboHost(host, sourceNode, values) {
  let synchronized = 0;
  for (const [inputIndex, input] of (host?.inputs || []).entries()) {
    const matchesSource = resolvedInputConnections(host, input, inputIndex)
      .some((connection) => connection?.inputNode === sourceNode && connection?.input?.name === "value");
    if (!matchesSource) continue;
    const target = host.getWidgetFromSlot?.(input);
    if (!target) continue;
    target.options ??= {};
    target.options.values = [...values];
    const normalized = normalizeDynamicComboSelection(target.value, values);
    if (normalized !== target.value) {
      target.value = normalized;
      target.callback?.(normalized);
    }
    host.setDirtyCanvas?.(true, true);
    host.graph?.setDirtyCanvas?.(true, true);
    synchronized++;
  }
  return synchronized;
}

function presentationFromResolved(resolved) {
  const sourceNode = resolved?.inputNode;
  const sourceInput = resolved?.input;
  if (!sourceNode || !sourceInput) return null;
  if (sourceNode.isSubgraphNode?.()) projectSubgraphUIPresentation(sourceNode);
  const widget = sourceNode.getWidgetFromSlot?.(sourceInput)
    || sourceNode.__bvPresentationWidget;
  const presentationType = presentationTypeFor(sourceNode, widget);
  return widget && presentationType
    ? { widget, sourceNode, sourceInput, presentationType }
    : null;
}

function presentationKey(sourceNode, sourceInput, input) {
  const identity = sourceNode?.properties?.bvLayoutId ?? sourceNode?.id ?? "presentation";
  return `${identity}:${sourceInput?.name ?? input?.name ?? "value"}`;
}

function reprojectAfterWidgetSync(host) {
  const nextFrame = globalThis.requestAnimationFrame ?? ((callback) => setTimeout(callback, 0));
  queueMicrotask(() => nextFrame(() => {
    projectSubgraphUIPresentation(host);
    nextFrame(() => projectSubgraphUIPresentation(host));
  }));
  setTimeout(() => projectSubgraphUIPresentation(host), 100);
}

function createProjectedWidget(host, input, source, key, presentationType) {
  host.properties ??= {};
  host.properties.bvSubgraphUIValues ??= {};
  const saved = host.properties.bvSubgraphUIValues[key];
  const initial = saved === undefined ? source.value : saved;
  host.properties.bvSubgraphUIValues[key] = initial;
  const callback = (value) => {
    host.properties.bvSubgraphUIValues[key] = value;
    host.setDirtyCanvas?.(true, true);
    host.graph?.setDirtyCanvas?.(true, true);
  };
  const editable = presentationType === "BV_HEADING";
  const descriptor = {
    name: input.name,
    type: editable ? "text" : source.type,
    value: initial,
    callback,
    options: { serialize: true },
  };
  const target = editable
    ? host.addWidget?.("text", input.name, initial, callback, descriptor.options)
    : host.addCustomWidget?.(descriptor);
  if (!target) return null;
  target.__bvSyntheticPresentation = true;
  target.__bvPresentationKey = key;
  return target;
}

function holdProjectedMethod(target, property, projected) {
  target.__bvProjectedMethodGuards ??= {};
  const existing = target.__bvProjectedMethodGuards[property];
  if (existing) {
    existing.projected = projected;
    return true;
  }
  const descriptor = Object.getOwnPropertyDescriptor(target, property);
  if (descriptor?.configurable === false) {
    try { target[property] = projected; } catch { return false; }
    return false;
  }
  const state = { projected, base: target[property] };
  try {
    Object.defineProperty(target, property, {
      configurable: true,
      enumerable: descriptor?.enumerable ?? true,
      get: () => state.projected,
      set: (value) => { if (value !== state.projected) state.base = value; },
    });
    target.__bvProjectedMethodGuards[property] = state;
    return true;
  } catch {
    target[property] = projected;
    return false;
  }
}

export function resolveSubgraphWidgetPresentations(host) {
  const presentations = [];
  for (const [inputIndex, input] of (host?.inputs || []).entries()) {
    const presentation = sourcePresentationFor(host, input, inputIndex);
    if (!presentation) continue;
    const key = presentationKey(presentation.sourceNode, presentation.sourceInput, input);
    const target = host.getWidgetFromSlot?.(input)
      || host.widgets?.find((widget) => widget.widgetId && widget.widgetId === input.widgetId)
      || host.widgets?.find((widget) => widget.__bvPresentationKey === key)
      || null;
    presentations.push({ ...presentation, source: presentation.widget, input, inputIndex, key, target });
  }
  return presentations;
}

function currentPresentationTarget(host, snapshot) {
  return host.getWidgetFromSlot?.(snapshot.input)
    || host.widgets?.find((widget) => widget.widgetId && widget.widgetId === snapshot.input?.widgetId)
    || host.widgets?.find((widget) => widget.__bvPresentationKey === snapshot.key)
    || null;
}

export function isSubgraphProjectionStale(host) {
  const snapshots = host?.__bvSubgraphProjectionSnapshot;
  if (!Array.isArray(snapshots) || snapshots.length === 0) return false;
  return snapshots.some((snapshot) => {
    const target = currentPresentationTarget(host, snapshot);
    return target !== snapshot.target
      || (snapshot.guardedDraw && target?.draw !== snapshot.draw)
      || (snapshot.guardedComputeSize && target?.computeSize !== snapshot.computeSize)
      || (snapshot.guardedDrawWidget && target?.drawWidget !== snapshot.drawWidget)
      || (snapshot.guardedComputeLayoutSize && target?.computeLayoutSize !== snapshot.computeLayoutSize)
      || target?.__bvPresentationType !== snapshot.presentationType
      || target?.__bvProjectedFrom !== snapshot.source;
  });
}

export function projectSubgraphUIPresentation(host, visited = new Set()) {
  if (!host || visited.has(host)) return 0;
  visited.add(host);
  let projected = 0;
  let changed = false;
  const projectionSnapshot = [];
  for (const presentation of resolveSubgraphWidgetPresentations(host)) {
    const { input, inputIndex } = presentation;
    const source = presentation.widget;
    const presentationType = presentation.presentationType;
    migratePresentationInputName(host, input, inputIndex, presentation);
    const key = presentationKey(presentation.sourceNode, presentation.sourceInput, input);
    const slotWidget = presentation.target;
    // Current ComfyUI owns promoted proxy widgets through the input slot. Such
    // a proxy may intentionally not be present in host.widgets; replacing it
    // with a synthetic widget makes ComfyUI remove the replacement during its
    // next synchronization pass and also loses the proxy's native editor.
    const target = slotWidget
      || host.widgets?.find((widget) => widget.widgetId && widget.widgetId === input.widgetId)
      || host.widgets?.find((widget) => widget.__bvPresentationKey === key)
      || createProjectedWidget(host, input, source, key, presentationType);
    if (!target) continue;
    // Modern ComfyUI widgets expose type as a getter-only property. Their
    // renderer already honours a custom draw/computeSize implementation, so
    // changing the type is both unnecessary and invalid.
    if (target.draw !== source.draw || !target.__bvProjectedMethodGuards?.draw) {
      holdProjectedMethod(target, "draw", source.draw);
      changed = true;
    }
    const projectedComputeSize = presentationType === "BV_SPACER" && typeof source.computeSize === "function"
      ? (target.__bvSpacerComputeSource === source.computeSize && target.__bvSpacerComputeSize)
        || function (width) {
          const previousValue = source.value;
          source.value = this.value;
          try {
            return source.computeSize.call(source, width);
          } finally {
            source.value = previousValue;
          }
        }
      : source.computeSize;
    if (presentationType === "BV_SPACER") {
      target.__bvSpacerComputeSource = source.computeSize;
      target.__bvSpacerComputeSize = projectedComputeSize;
      if (!target.__bvSpacerCallback || target.callback !== target.__bvSpacerCallback) {
        const originalCallback = target.callback;
        const spacerCallback = function (value) {
          this.value = value;
          const result = originalCallback?.apply(this, arguments);
          host.expandToFitContent?.();
          const computedSize = host.computeSize?.();
          if (computedSize) host.setSize?.(computedSize);
          host.setDirtyCanvas?.(true, true);
          host.graph?.setDirtyCanvas?.(true, true);
          return result;
        };
        target.callback = spacerCallback;
        target.__bvSpacerCallback = spacerCallback;
        changed = true;
      }
    }
    if (target.computeSize !== projectedComputeSize || !target.__bvProjectedMethodGuards?.computeSize) {
      holdProjectedMethod(target, "computeSize", projectedComputeSize);
      changed = true;
    }
    if (typeof target.drawWidget === "function" && typeof source.draw === "function") {
      if (target.drawWidget !== target.__bvProjectedDrawWidget || target.__bvProjectedDrawSource !== source.draw) {
        const projectedDrawWidget = target.__bvProjectedDrawSource === source.draw && target.__bvProjectedDrawWidget
          ? target.__bvProjectedDrawWidget
          : function (ctx, options = {}) {
              const width = options.width ?? this.width ?? host.size?.[0] ?? 220;
              const height = this.height ?? this.computeSize?.(width)?.[1] ?? 24;
              return source.draw.call(this, ctx, host, width, this.y ?? 0, height, !options.showText);
            };
        holdProjectedMethod(target, "drawWidget", projectedDrawWidget);
        target.__bvProjectedDrawWidget = projectedDrawWidget;
        target.__bvProjectedDrawSource = source.draw;
        changed = true;
      }
    }
    if (typeof source.computeSize === "function") {
      if (target.computeLayoutSize !== target.__bvProjectedLayout || target.__bvProjectedLayoutSource !== source.computeSize) {
        const projectedLayout = target.__bvProjectedLayoutSource === source.computeSize && target.__bvProjectedLayout
          ? target.__bvProjectedLayout
          : function () {
              const [minWidth, minHeight] = this.computeSize(this.width ?? host.size?.[0] ?? 220);
              return { minWidth, minHeight };
            };
        holdProjectedMethod(target, "computeLayoutSize", projectedLayout);
        target.__bvProjectedLayout = projectedLayout;
        target.__bvProjectedLayoutSource = source.computeSize;
        changed = true;
      }
    }
    if (target.__bvPresentationType !== presentationType) changed = true;
    target.__bvPresentationType = presentationType;
    target.__bvNode = source.__bvNode;
    target.__bvProjectedFrom = source;
    target.options ??= {};
    if (target.options.serialize !== true) {
      target.options.serialize = true;
      changed = true;
    }
    if (presentationType === "BV_HEADING") {
      if (target.onClick !== target.__bvHeadingEditor || target.__bvHeadingEditorKey !== key) {
        const headingEditor = function ({ e, node, canvas }) {
          canvas?.prompt?.(input.label || input.name || "Heading", String(this.value ?? ""), (value) => {
            this.value = String(value ?? "");
            host.properties ??= {};
            host.properties.bvSubgraphUIValues ??= {};
            host.properties.bvSubgraphUIValues[key] = this.value;
            this.callback?.(this.value, canvas, node, undefined, e);
            // The promoted proxy stores an instance value, while the internal
            // widget remains the definition fallback used after demotion.
            // Keep both aligned so disconnecting the exposure does not restore
            // the original default heading.
            source.value = this.value;
            presentation.sourceNode?.setDirtyCanvas?.(true, true);
            presentation.sourceNode?.graph?.setDirtyCanvas?.(true, true);
            host.setDirtyCanvas?.(true, true);
            host.graph?.setDirtyCanvas?.(true, true);
            reprojectAfterWidgetSync(host);
          }, e, false);
        };
        target.onClick = headingEditor;
        target.__bvHeadingEditor = headingEditor;
        target.__bvHeadingEditorKey = key;
        changed = true;
      }
    }
    host.serialize_widgets = true;
    projectionSnapshot.push({
      input,
      key,
      target,
      source,
      presentationType,
      draw: target.draw,
      computeSize: target.computeSize,
      drawWidget: target.drawWidget,
      computeLayoutSize: target.computeLayoutSize,
      guardedDraw: Boolean(target.__bvProjectedMethodGuards?.draw),
      guardedComputeSize: Boolean(target.__bvProjectedMethodGuards?.computeSize),
      guardedDrawWidget: Boolean(target.__bvProjectedMethodGuards?.drawWidget),
      guardedComputeLayoutSize: Boolean(target.__bvProjectedMethodGuards?.computeLayoutSize),
    });
    projected++;
  }
  host.__bvSubgraphProjectionSnapshot = projectionSnapshot;
  if (projected && changed) {
    const bridge = globalThis.__bvNodePresentationBridge;
    if (bridge?.applyClassicSubgraph) bridge.applyClassicSubgraph(host);
    else {
      host.expandToFitContent?.();
      const computedSize = host.computeSize?.();
      if (computedSize) host.setSize?.(computedSize);
    }
    host.setDirtyCanvas?.(true, true);
    host.graph?.setDirtyCanvas?.(true, true);
  }
  return projected;
}

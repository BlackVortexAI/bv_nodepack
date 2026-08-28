import { resolveSubgraphWidgetPresentations } from "./bv_subgraph_ui_projection.js";

const KIND = new Map([
  ["BV_HEADING", "heading"],
  ["BV_SPACER", "spacer"],
  ["BV_DIVIDER", "divider"],
]);

const escapeSelector = (value) => globalThis.CSS?.escape
  ? globalThis.CSS.escape(String(value))
  : String(value).replace(/["\\]/g, "\\$&");

function ensureStyles(ownerDocument) {
  if (ownerDocument.getElementById?.("bv-subgraph-nodes2-style")) return;
  const style = ownerDocument.createElement("style");
  style.id = "bv-subgraph-nodes2-style";
  style.textContent = `
[data-testid="node-widget"][data-bv-subgraph-presentation]{display:block!important;padding:0 12px;box-sizing:border-box}
.bv-subgraph-projection{width:100%;height:100%;display:flex;align-items:center;box-sizing:border-box}
.bv-subgraph-projection--heading button{all:unset;width:100%;font-size:20px;font-weight:700;line-height:1.2;cursor:text;color:inherit;box-sizing:border-box}
.bv-subgraph-projection--spacer,.bv-subgraph-projection--divider{cursor:pointer}
.bv-subgraph-projection--divider span{display:block;flex:1;border-top-style:solid;border-top-color:currentColor}
`;
  ownerDocument.head?.append?.(style);
}

function widgetRows(nodeElement) {
  return [...(nodeElement?.querySelectorAll?.('[data-testid="node-widgets"] > [data-testid="node-widget"]') || [])];
}

function rowLabel(row) {
  return String(row?.querySelector?.('[data-testid="widget-layout-field-label"]')?.textContent ?? "").trim();
}

function restoreRow(row) {
  delete row?.dataset?.bvSubgraphPresentation;
  delete row?.dataset?.bvSubgraphSignature;
  row?.querySelector?.('[data-bv-subgraph-projection="true"]')?.remove?.();
  for (const child of row?.children || []) {
    if (child?.dataset?.bvSubgraphNative === "true") {
      child.style.display = child.dataset.bvSubgraphDisplay || "";
      delete child.dataset.bvSubgraphNative;
      delete child.dataset.bvSubgraphDisplay;
    }
  }
  if (row?.style) {
    row.style.minHeight = "";
    row.style.height = "";
  }
}

function hideNativeChildren(row) {
  for (const child of row?.children || []) {
    if (child?.dataset?.bvSubgraphProjection === "true") continue;
    child.dataset ??= {};
    if (child.dataset.bvSubgraphNative !== "true") {
      child.dataset.bvSubgraphNative = "true";
      child.dataset.bvSubgraphDisplay = child.style?.display || "";
    }
    if (child.style) child.style.display = "none";
  }
}

function projectionElement(row, ownerDocument) {
  let element = row.querySelector?.('[data-bv-subgraph-projection="true"]');
  if (element) return element;
  element = ownerDocument.createElement("div");
  element.dataset.bvSubgraphProjection = "true";
  row.append?.(element);
  return element;
}

function projectedHeight(presentation, host) {
  const source = presentation.source;
  const target = presentation.target;
  if (typeof source?.computeSize !== "function") return presentation.presentationType === "BV_DIVIDER" ? 18 : 32;
  const previous = source.value;
  source.value = target?.value ?? source.value;
  try {
    return Math.max(0, Number(source.computeSize(host?.size?.[0] ?? 220)?.[1]) || 0);
  } finally {
    source.value = previous;
  }
}

function sourceWidgetValue(presentation, name, fallback) {
  const node = presentation.source?.__bvNode ?? presentation.sourceNode;
  return node?.widgets?.find?.((widget) => widget?.name === name)?.value ?? fallback;
}

function clamp(value, minimum, maximum, fallback) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
}

function editNumericPresentation(row, presentation, host, ownerDocument, canvas, event) {
  const target = presentation.target;
  const current = Number(target?.value ?? presentation.source.value ?? 0);
  const title = presentation.presentationType === "BV_SPACER" ? "Spacer height" : "Divider thickness";
  canvas?.prompt?.(title, String(current), (value) => {
    const next = presentation.presentationType === "BV_SPACER"
      ? clamp(value, 0, 400, current)
      : clamp(value, 1, 10, current);
    if (target) {
      target.value = next;
      target.callback?.(next);
    } else {
      presentation.source.value = next;
    }
    row.dataset.bvSubgraphSignature = "";
    queueMicrotask(() => projectSubgraphNodes2Presentation(host, ownerDocument, canvas));
  }, event, false);
}

function editHeadingPresentation(row, presentation, host, ownerDocument, canvas, event) {
  const target = presentation.target;
  const current = String(target?.value ?? presentation.source.value ?? "");
  canvas?.prompt?.(presentation.input?.label || presentation.input?.name || "Heading", current, (value) => {
    const next = String(value ?? "");
    if (target) {
      target.value = next;
      target.callback?.(next);
    }
    presentation.source.value = next;
    host.properties ??= {};
    host.properties.bvSubgraphUIValues ??= {};
    host.properties.bvSubgraphUIValues[presentation.key] = next;
    row.dataset.bvSubgraphSignature = "";
    queueMicrotask(() => projectSubgraphNodes2Presentation(host, ownerDocument, canvas));
  }, event, false);
}

function applyRow(row, presentation, host, ownerDocument, canvas) {
  const kind = KIND.get(presentation.presentationType);
  if (!kind) return;
  const height = projectedHeight(presentation, host);
  const value = String(presentation.target?.value ?? presentation.source.value ?? "");
  const thickness = kind === "divider" ? clamp(value, 1, 10, 2) : 0;
  const padding = kind === "divider" ? clamp(sourceWidgetValue(presentation, "padding", 10), 0, 60, 10) : 0;
  const alpha = kind === "divider" ? clamp(sourceWidgetValue(presentation, "alpha", 0.35), 0.05, 1, 0.35) : 1;
  const signature = `${kind}:${height}:${value}:${thickness}:${padding}:${alpha}`;
  if (row.dataset?.bvSubgraphSignature === signature && row.querySelector?.('[data-bv-subgraph-projection="true"]')) return;
  restoreRow(row);
  row.dataset.bvSubgraphPresentation = kind;
  row.dataset.bvSubgraphSignature = signature;
  hideNativeChildren(row);
  const element = projectionElement(row, ownerDocument);
  element.className = `bv-subgraph-projection bv-subgraph-projection--${kind}`;
  element.replaceChildren?.();
  row.style.minHeight = `${height}px`;
  row.style.height = `${height}px`;

  if (kind === "heading") {
    const button = ownerDocument.createElement("button");
    button.type = "button";
    button.textContent = value;
    button.addEventListener?.("click", (event) => editHeadingPresentation(row, presentation, host, ownerDocument, canvas, event));
    element.append?.(button);
  } else if (kind === "divider") {
    const line = ownerDocument.createElement("span");
    line.setAttribute?.("aria-hidden", "true");
    line.style.borderTopWidth = `${thickness}px`;
    line.style.marginInline = `${padding}px`;
    line.style.opacity = String(alpha);
    element.append?.(line);
  }
  if (kind === "spacer" || kind === "divider") {
    element.tabIndex = 0;
    element.setAttribute?.("role", "button");
    element.setAttribute?.("aria-label", kind === "spacer" ? "Edit spacer height" : "Edit divider thickness");
    element.addEventListener?.("click", (event) => editNumericPresentation(row, presentation, host, ownerDocument, canvas, event));
    element.addEventListener?.("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") editNumericPresentation(row, presentation, host, ownerDocument, canvas, event);
    });
  }
}

export function projectSubgraphNodes2Presentation(host, ownerDocument = globalThis.document, canvas) {
  if (!host || !ownerDocument?.querySelector) return false;
  ensureStyles(ownerDocument);
  const nodeElement = ownerDocument.querySelector(`.lg-node[data-node-id="${escapeSelector(host.id)}"]`);
  if (!nodeElement) return false;
  const presentations = resolveSubgraphWidgetPresentations(host);
  const activeRows = new Set();
  const rows = widgetRows(nodeElement);
  for (const presentation of presentations) {
    const names = new Set([
      presentation.input?.name,
      presentation.input?.label,
      presentation.target?.name,
      presentation.target?.label,
    ].filter(Boolean).map(String));
    const row = rows.find((candidate) => !activeRows.has(candidate) && names.has(rowLabel(candidate)));
    if (!row) continue;
    activeRows.add(row);
    applyRow(row, presentation, host, ownerDocument, canvas);
  }
  for (const row of rows) {
    if (row?.dataset?.bvSubgraphPresentation && !activeRows.has(row)) restoreRow(row);
  }
  return presentations.length > 0;
}

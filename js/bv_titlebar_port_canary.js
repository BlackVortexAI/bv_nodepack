// THROW AWAY - DO NOT MERGE OR RELEASE.
// Loaded by WEB_DIRECTORY even when the Python env gate is off, but completely
// inert unless one of the two exact Canary node definitions exists.

import { app } from "../../scripts/app.js";
import {
    CANARY_MODES,
    CANARY_RECEIVER,
    CANARY_SENDER,
    applyCanaryMode,
    captureCanaryBaseline,
    inspectCanaryNode,
    restoreCanaryNode,
    scheduleCanaryInspection,
} from "./bv_titlebar_port_canary_core.js";

const NAMES = new Set([CANARY_SENDER, CANARY_RECEIVER]);
const INSTALLED = Symbol("bvTitlebarPortCanaryInstalled");

function reportText(report) {
    if (!report?.ok) return `${report?.status ?? "BLOCKED"}: ${report?.reason ?? "unknown"}`;
    const invariant = report.comparison?.ok ? "PASS" : "NOT CAPTURED / FAIL";
    const links = JSON.stringify(report.links ?? []);
    const bodyY = (report.measuredSlots ?? []).map(slot => `${slot.index}:${slot.y}`).join(" ");
    const legacyY = (report.legacyMeasuredSlots ?? []).map(slot => `${slot.index}:${slot.y}`).join(" ");
    const widgetY = (report.widgetMetrics ?? []).map(widget => `${widget.name}:${widget.y ?? "?"}`).join(" ");
    const serializedPos = report.serialization?.providerHasOwnPos ? JSON.stringify(report.serialization.providerPos) : "absent";
    return [
        `${report.status} | ${report.direction}[${report.canonicalProviderIndex}] of ${report.canonicalSlotCount}`,
        `structure/link invariant: ${invariant}`,
        `links: ${links}`,
        `provider.pos: ${JSON.stringify(report.providerPosition)} | serialized pos: ${serializedPos}`,
        `slot world-y: ${bodyY}`,
        `legacy getConnectionPos y: ${legacyY}`,
        `widget y: ${widgetY}`,
        `node size: ${JSON.stringify(report.nodeSize)} | computeSize: ${JSON.stringify(report.computedSize)}`,
    ].join("\n");
}

function modeWidget(node) {
    return node?.widgets?.find(widget => widget?.name === "presentation_mode");
}

function refresh(node, nodeName, requestedMode) {
    const mode = requestedMode ?? modeWidget(node)?.value ?? "Native";
    const applied = applyCanaryMode(node, nodeName, mode, { nodes2Active: globalThis.LiteGraph?.vueNodesMode === true });
    const report = applied.ok ? inspectCanaryNode(node, nodeName) : applied;
    if (node.__bvTitlebarCanaryStatusWidget) node.__bvTitlebarCanaryStatusWidget.value = reportText(report);
    if (applied.ok) scheduleCanaryInspection(node, nodeName, postFrame => {
        if (node.__bvTitlebarCanaryStatusWidget) node.__bvTitlebarCanaryStatusWidget.value = reportText(postFrame);
        node.setDirtyCanvas?.(true, true);
    });
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
    return report;
}

function install(node, nodeName, recapture = false) {
    if (!NAMES.has(nodeName)) return;
    const mode = modeWidget(node);
    if (!mode) return;

    if (!node[INSTALLED]) {
        node[INSTALLED] = true;
        mode.serialize = false;
        const originalCallback = mode.callback;
        mode.callback = function(value) {
            const result = typeof originalCallback === "function" ? originalCallback.apply(this, arguments) : undefined;
            queueMicrotask(() => refresh(node, nodeName, value));
            return result;
        };
        const capture = node.addWidget?.("button", "Capture Native baseline", null, () => {
            const result = captureCanaryBaseline(node, nodeName);
            node.__bvTitlebarCanaryStatusWidget.value = result.ok ? reportText(inspectCanaryNode(node, nodeName)) : reportText(result);
        });
        if (capture) capture.serialize = false;
        const status = node.addWidget?.("text", "canary_status", "Waiting for Native baseline", null, { multiline: true });
        if (status) {
            status.serialize = false;
            node.__bvTitlebarCanaryStatusWidget = status;
        }
    }

    if (recapture || !node.__bvTitlebarCanaryBaselineReady) {
        applyCanaryMode(node, nodeName, "Native");
        const captured = captureCanaryBaseline(node, nodeName);
        node.__bvTitlebarCanaryBaselineReady = captured.ok;
    }
    refresh(node, nodeName, mode.value);
}

function wrapNodeType(nodeType, nodeName) {
    if (nodeType.prototype.__bvTitlebarPortCanaryWrapped) return;
    nodeType.prototype.__bvTitlebarPortCanaryWrapped = true;
    const created = nodeType.prototype.onNodeCreated;
    const configured = nodeType.prototype.onConfigure;
    const connectionsChanged = nodeType.prototype.onConnectionsChange;
    const resized = nodeType.prototype.onResize;
    const removed = nodeType.prototype.onRemoved;

    nodeType.prototype.onNodeCreated = function() {
        const result = created?.apply(this, arguments);
        queueMicrotask(() => install(this, nodeName, true));
        return result;
    };
    nodeType.prototype.onConfigure = function() {
        const result = configured?.apply(this, arguments);
        queueMicrotask(() => install(this, nodeName, true));
        return result;
    };
    nodeType.prototype.onConnectionsChange = function() {
        const result = connectionsChanged?.apply(this, arguments);
        queueMicrotask(() => {
            if (modeWidget(this)?.value === "Native") captureCanaryBaseline(this, nodeName);
            refresh(this, nodeName);
        });
        return result;
    };
    nodeType.prototype.onResize = function() {
        const result = resized?.apply(this, arguments);
        if (modeWidget(this)?.value !== "Native") queueMicrotask(() => refresh(this, nodeName));
        return result;
    };
    nodeType.prototype.onRemoved = function() {
        restoreCanaryNode(this);
        return removed?.apply(this, arguments);
    };
}

app.registerExtension({
    name: "bv.titlebar-provider-port-canary.throw-away",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (!NAMES.has(nodeData?.name)) return;
        wrapNodeType(nodeType, nodeData.name);
    },
});

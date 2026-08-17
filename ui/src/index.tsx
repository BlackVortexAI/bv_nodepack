import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getApi, getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
import styles from "./index.css?inline";
import RegionalEditor from "./regional/RegionalEditor";
import QuickPromptEditor from "./regional/QuickPromptEditor";
import { emptyDocument, parseDocument } from "./regional/model";
import { normalizeRegionId, regionChoices } from "./regional/regionSelector";
import { documentTargetChoices, resolveDocumentTarget } from "./regional/documentTargets";
const comfyApp = getApp();
const comfyApi = getApi();
import "./components/control/bv_control_center";

const OPEN_CONTROL_RACK_EVENT = "bv-open-control-rack";
const OPEN_REGIONAL_EDITOR_EVENT = "bv-open-regional-editor";
const OPEN_REGIONAL_QUICK_EDIT_EVENT = "bv-open-regional-quick-edit";
const REGIONAL_DOCUMENT_CHANGED_EVENT = "bv-regional-document-changed";
const STYLE_ID = "bv-nodepack-styles";

const hideRegionalWidget = (widget: any) => {
    widget.type = "converted-widget";
    widget.hidden = true;
    widget.computeSize = () => [0, -4];
    if (widget.element) widget.element.style.display = "none";
};

const sourceRegionalDocument = (node: any) => {
    const input = node.inputs?.find((item: any) => item.name === "regional");
    const graph = node.graph ?? (comfyApp as any).graph;
    const link = input?.link == null ? null : graph?.links?.[input.link] ?? graph?._links?.get?.(input.link);
    const source = link ? graph?.getNodeById?.(link.origin_id) : null;
    if (source?.type !== "BV Regional Prompt") return null;
    const value = source.widgets?.find((widget: any) => widget.name === "regional_json")?.value;
    try { return parseDocument(value); } catch { return null; }
};

const refreshRegionSelector = (node: any) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "region");
    const combo = node.widgets?.find((widget: any) => widget.name === "region_selector");
    if (!hidden || !combo) return;
    const choices = regionChoices(sourceRegionalDocument(node)?.regions ?? []);
    const selectedId = normalizeRegionId(hidden.value, choices);
    hidden.value = selectedId;
    node.__bvRegionChoices = choices;
    combo.options ??= {};
    combo.options.values = choices.length ? choices.map(choice => choice.label) : ["Connect a BV Regional Prompt"];
    combo.value = choices.find(choice => choice.id === selectedId)?.label ?? combo.options.values[0];
    const scope = node.widgets?.find((widget: any) => widget.name === "scope")?.value;
    combo.disabled = scope !== "region" || !choices.length;
    node.setDirtyCanvas?.(true, true);
};

const upgradeRegionSelector = (node: any) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "region");
    if (!hidden) return;
    hideRegionalWidget(hidden);
    let combo = node.widgets?.find((widget: any) => widget.name === "region_selector");
    if (!combo) {
        combo = node.addWidget("combo", "region_selector", "Connect a BV Regional Prompt", (label: string) => {
            const choice = node.__bvRegionChoices?.find((item: any) => item.label === label);
            if (choice) hidden.value = choice.id;
        }, { values: ["Connect a BV Regional Prompt"], serialize: false });
        combo.label = "region";
        combo.serialize = false;
    }
    const scope = node.widgets?.find((widget: any) => widget.name === "scope");
    if (scope && !scope.__bvRegionSelectorHooked) {
        scope.__bvRegionSelectorHooked = true;
        const original = scope.callback;
        scope.callback = function () { const result = original?.apply(this, arguments); refreshRegionSelector(node); return result; };
    }
    if (!node.__bvRegionDocumentListener) {
        node.__bvRegionDocumentListener = () => refreshRegionSelector(node);
        window.addEventListener(REGIONAL_DOCUMENT_CHANGED_EVENT, node.__bvRegionDocumentListener);
        const originalRemoved = node.onRemoved;
        node.onRemoved = function () { window.removeEventListener(REGIONAL_DOCUMENT_CHANGED_EVENT, node.__bvRegionDocumentListener); return originalRemoved?.apply(this, arguments); };
    }
    refreshRegionSelector(node);
};

type RegionalNode = { id: number | string; type?: string; title?: string; widgets?: Array<{ name: string; value: unknown }>; graph?: { setDirtyCanvas?: (a: boolean, b: boolean) => void } };
const regionalNodes = (): RegionalNode[] => {
    const graph = (comfyApp as any).graph;
    const found: RegionalNode[] = [];
    const visit = (candidate: any) => {
        for (const node of candidate?._nodes ?? []) {
            if (node.type === "BV Regional Prompt") found.push(node);
            if (node.subgraph) visit(node.subgraph);
        }
    };
    visit(graph);
    return found;
};
const availableDocumentTargets = () => documentTargetChoices(regionalNodes().flatMap(node => {
    try {
        const document = parseDocument(node.widgets?.find(widget => widget.name === "regional_json")?.value);
        return [{ documentId: document.document_id, nodeId: String(node.id), title: node.title || document.title || "BV Regional Prompt" }];
    } catch { return []; }
}));

const refreshImageTargetSelector = (node: any, initialize = false) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "document_id");
    const combo = node.widgets?.find((widget: any) => widget.name === "target_editor");
    if (!hidden || !combo) return;
    const choices = availableDocumentTargets();
    const selectedId = resolveDocumentTarget(hidden.value, choices, initialize);
    hidden.value = selectedId;
    node.__bvDocumentTargets = choices;
    combo.options ??= {};
    combo.options.values = choices.length ? choices.map(choice => choice.label) : ["No BV Regional Prompt available"];
    combo.value = choices.find(choice => choice.documentId === selectedId)?.label ?? (selectedId ? `Missing target · ${selectedId.slice(0, 8)}` : combo.options.values[0]);
    combo.disabled = !choices.length;
    node.setDirtyCanvas?.(true, true);
};

const upgradeImageTargetSelector = (node: any, initialize = false) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "document_id");
    if (!hidden) return;
    hideRegionalWidget(hidden);
    let combo = node.widgets?.find((widget: any) => widget.name === "target_editor");
    if (!combo) {
        combo = node.addWidget("combo", "target_editor", "No BV Regional Prompt available", (label: string) => {
            const choice = node.__bvDocumentTargets?.find((item: any) => item.label === label);
            if (choice) hidden.value = choice.documentId;
        }, { values: ["No BV Regional Prompt available"], serialize: false });
        combo.label = "target_editor";
        combo.serialize = false;
    }
    if (!node.__bvDocumentTargetListener) {
        node.__bvDocumentTargetListener = () => refreshImageTargetSelector(node, false);
        window.addEventListener(REGIONAL_DOCUMENT_CHANGED_EVENT, node.__bvDocumentTargetListener);
        const originalRemoved = node.onRemoved;
        node.onRemoved = function () { window.removeEventListener(REGIONAL_DOCUMENT_CHANGED_EVENT, node.__bvDocumentTargetListener); return originalRemoved?.apply(this, arguments); };
    }
    refreshImageTargetSelector(node, initialize);
};
const ensureUniqueDocument = (node: any, forceNew = false) => {
    const widget = node.widgets?.find((item: any) => item.name === "regional_json");
    if (!widget) return;
    try {
        const document = forceNew ? emptyDocument() : parseDocument(widget.value);
        const duplicate = !forceNew && regionalNodes().some(other => {
            if (other === node) return false;
            try { return parseDocument(other.widgets?.find(item => item.name === "regional_json")?.value).document_id === document.document_id; }
            catch { return false; }
        });
        if (duplicate) document.document_id = crypto.randomUUID();
        widget.value = JSON.stringify(document);
    } catch {
        widget.value = JSON.stringify(emptyDocument());
    }
};

function BVRoot() {
    const [portalOpen, setPortalOpen] = useState(false);
    const [regionalOpen, setRegionalOpen] = useState(false);
    const [quickEditOpen, setQuickEditOpen] = useState(false);
    const [regionalNode, setRegionalNode] = useState<RegionalNode | null>(null);
    const [nodes, setNodes] = useState<RegionalNode[]>([]);
    const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});

    useEffect(() => {
        const open = () => setPortalOpen(true);
        window.addEventListener(OPEN_CONTROL_RACK_EVENT, open);
        return () => window.removeEventListener(OPEN_CONTROL_RACK_EVENT, open);
    }, []);

    useEffect(() => {
        const open = (event: Event) => {
            const requested = (event as CustomEvent<{ node?: RegionalNode }>).detail?.node ?? null;
            const available = regionalNodes();
            setNodes(available);
            setRegionalNode(requested ?? available[0] ?? null);
            setRegionalOpen(false);
            setQuickEditOpen(true);
        };
        window.addEventListener(OPEN_REGIONAL_QUICK_EDIT_EVENT, open);
        return () => window.removeEventListener(OPEN_REGIONAL_QUICK_EDIT_EVENT, open);
    }, []);

    useEffect(() => {
        const executed = (event: CustomEvent<any>) => {
            const output = event.detail?.output;
            const target = output?.bv_regional_background?.[0]?.document_id;
            const image = output?.images?.[output.images.length - 1];
            if (!target || !image) return;
            const query = new URLSearchParams({ filename: image.filename, type: image.type, subfolder: image.subfolder || "" });
            setBackgrounds(current => ({ ...current, [target]: comfyApi.apiURL(`/view?${query}`) }));
        };
        comfyApi.addEventListener("executed", executed);
        return () => comfyApi.removeEventListener("executed", executed);
    }, []);

    useEffect(() => {
        const open = (event: Event) => {
            const requested = (event as CustomEvent<{ node?: RegionalNode }>).detail?.node ?? null;
            const available = regionalNodes();
            setNodes(available);
            setRegionalNode(requested ?? available[0] ?? null);
            setRegionalOpen(true);
        };
        window.addEventListener(OPEN_REGIONAL_EDITOR_EVENT, open);
        return () => window.removeEventListener(OPEN_REGIONAL_EDITOR_EVENT, open);
    }, []);

    return (<>
        <BVPortal
            open={portalOpen}
    onClose={() => setPortalOpen(false)}
>
    Hi
    </BVPortal>
        <RegionalEditor open={regionalOpen} nodes={nodes} initialNode={regionalNode} backgrounds={backgrounds} onClose={() => setRegionalOpen(false)} />
        <QuickPromptEditor open={quickEditOpen} nodes={nodes} initialNode={regionalNode} onClose={() => setQuickEditOpen(false)} onOpenEditor={node => { setRegionalNode(node); setQuickEditOpen(false); setRegionalOpen(true); }} />
    </>);
}

const MOUNT_ID = "bv-root";

function ensureMountedOnce() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = styles;
        document.head.appendChild(style);
    }
    let container = document.getElementById(MOUNT_ID);
    if (!container) {
        container = document.createElement("div");
        container.id = MOUNT_ID;
        document.body.appendChild(container);
        const root = ReactDOM.createRoot(container);
        root.render(
            <React.StrictMode>
                <BVRoot />
            </React.StrictMode>
        );
    }
}

comfyApp.registerExtension({
    name: "bv_nodepack.control_rack_portal",
    setup() {
        ensureMountedOnce();
    },
});

comfyApp.registerExtension({
    name: "bv_nodepack.regional_editor",
    commands: [{
        id: "bv.regional.openEditor",
        label: "Open BV Regional Editor",
        icon: "icon-[lucide--layers]",
        function: () => { window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_EDITOR_EVENT)); },
    }],
    actionBarButtons: [{
        icon: "icon-[lucide--scan-search]",
        class: "bv-regional-action bv-regional-action-editor",
        tooltip: "Open BV Regional Editor",
        onClick: () => window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_EDITOR_EVENT)),
    }, {
        icon: "icon-[lucide--layers]",
        class: "bv-regional-action bv-regional-action-quick",
        tooltip: "Quick edit BV Regional prompts",
        onClick: () => window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_QUICK_EDIT_EVENT)),
    }],
    beforeRegisterNodeDef(nodeType: any, nodeData: any) {
        if (nodeData.name === "BV Regional Image Send" || nodeData.name === "BV Regional Image Save") {
            const originalCreated = nodeType.prototype.onNodeCreated;
            const originalConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalCreated?.apply(this, arguments);
                queueMicrotask(() => upgradeImageTargetSelector(this, true));
                return result;
            };
            nodeType.prototype.onConfigure = function () {
                const result = originalConfigure?.apply(this, arguments);
                queueMicrotask(() => upgradeImageTargetSelector(this, false));
                return result;
            };
            return;
        }
        if (nodeData.name === "BV Regional Deconstructor") {
            const originalCreated = nodeType.prototype.onNodeCreated;
            const originalConfigure = nodeType.prototype.onConfigure;
            const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalCreated?.apply(this, arguments);
                upgradeRegionSelector(this);
                return result;
            };
            nodeType.prototype.onConfigure = function () {
                const result = originalConfigure?.apply(this, arguments);
                queueMicrotask(() => upgradeRegionSelector(this));
                return result;
            };
            nodeType.prototype.onConnectionsChange = function () {
                const result = originalConnectionsChange?.apply(this, arguments);
                queueMicrotask(() => refreshRegionSelector(this));
                return result;
            };
            return;
        }
        if (nodeData.name !== "BV Regional Prompt") return;
        const original = nodeType.prototype.onNodeCreated;
        const originalConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onNodeCreated = function () {
            const result = original?.apply(this, arguments);
            ensureUniqueDocument(this, true);
            const jsonWidget = this.widgets?.find((widget: any) => widget.name === "regional_json");
            if (jsonWidget) {
                hideRegionalWidget(jsonWidget);
                if (!jsonWidget.__bvRegionalDocumentHooked) {
                    jsonWidget.__bvRegionalDocumentHooked = true;
                    const originalCallback = jsonWidget.callback;
                    jsonWidget.callback = function () {
                        const callbackResult = originalCallback?.apply(this, arguments);
                        window.dispatchEvent(new CustomEvent(REGIONAL_DOCUMENT_CHANGED_EVENT));
                        return callbackResult;
                    };
                }
            }
            if (!this.widgets?.find((widget: any) => widget.name === "open_regional_editor")) {
                const button = this.addWidget("button", "open_regional_editor", null, () => window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_EDITOR_EVENT, { detail: { node: this } })), { serialize: false });
                button.label = "Open Regional Editor";
                button.serialize = false;
            }
            if (!this.widgets?.find((widget: any) => widget.name === "quick_edit_regional_prompts")) {
                const button = this.addWidget("button", "quick_edit_regional_prompts", null, () => window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_QUICK_EDIT_EVENT, { detail: { node: this } })), { serialize: false });
                button.label = "Quick Edit Prompts";
                button.serialize = false;
            }
            this.setSize?.([Math.max(this.size?.[0] ?? 0, 220), this.computeSize?.()[1] ?? 60]);
            window.dispatchEvent(new CustomEvent(REGIONAL_DOCUMENT_CHANGED_EVENT));
            return result;
        };
        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            ensureUniqueDocument(this, false);
            window.dispatchEvent(new CustomEvent(REGIONAL_DOCUMENT_CHANGED_EVENT));
            return result;
        };
        const originalRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            const result = originalRemoved?.apply(this, arguments);
            window.dispatchEvent(new CustomEvent(REGIONAL_DOCUMENT_CHANGED_EVENT));
            return result;
        };
    },
});

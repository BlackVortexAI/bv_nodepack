import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getApi, getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
import styles from "./index.css?inline";
import RegionalEditor from "./regional/RegionalEditor";
import QuickPromptEditor from "./regional/QuickPromptEditor";
import { emptyDocument, parseDocument } from "./regional/model";
import { regionChoices } from "./regional/regionSelector";
import { documentTargetChoices, resolveDocumentTarget } from "./regional/documentTargets";
import { applyCompletionDatasetSetting, bindCompletionDatasetPersistence, bindCompletionPlacementPersistence, bindCompletionSettingPersistence, COMPLETION_DATASETS_SETTING_ID, COMPLETION_PLACEMENT_SETTING_ID, COMPLETION_SETTING_ID, setCompletionEnabled, setCompletionPlacement } from "./completion/settings";
import { renderCompletionDatasetSetting } from "./completion/settingsRenderer";
import { installGlobalTextareaCompletion } from "./completion/globalTextareaAdapter";
import { watchActiveWorkflow } from "./regional/workflowLifecycle";
import { emptyLoraBindings, NamedLoraStack, needsFreshStackId, parseLoraBindings, reconcileLoraBindings } from "./regional/loraBindings";
import { detailerBackendWidgetValues, normalizeDetailerWidgetValues } from "./regional/detailerPersistence";
const comfyApp = getApp();
const comfyApi = getApi();
bindCompletionSettingPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_SETTING_ID, value));
bindCompletionDatasetPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_DATASETS_SETTING_ID, value));
bindCompletionPlacementPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_PLACEMENT_SETTING_ID, value));
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

const moveWidgetBefore = (node: any, widget: any, anchor: any) => {
    if (!widget || !anchor || widget === anchor) return;
    const currentIndex = node.widgets?.indexOf(widget) ?? -1;
    if (currentIndex < 0) return;
    node.widgets.splice(currentIndex, 1);
    const anchorIndex = node.widgets.indexOf(anchor);
    node.widgets.splice(anchorIndex < 0 ? node.widgets.length : anchorIndex, 0, widget);
};

const removeDetailerProjectionWidgets = (node: any) => {
    const projections = [
        node.widgets?.find((widget: any) => widget.name === "region_selector"),
        ...(node.__bvDetailerContextWidgets ?? []),
    ].filter(Boolean);
    for (const widget of projections) {
        const index = node.widgets?.indexOf(widget) ?? -1;
        if (index >= 0) node.widgets.splice(index, 1);
        widget.onRemove?.();
    }
    node.__bvDetailerContextWidgets = [];
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

type DetailerContextEntry = { region_id: string; influence: number };
const parseDetailerContexts = (value: unknown): DetailerContextEntry[] => {
    try {
        const parsed = JSON.parse(String(value ?? "[]"));
        if (!Array.isArray(parsed)) return [];
        return parsed.filter(item => item && typeof item.region_id === "string").map(item => ({
            region_id: item.region_id,
            influence: Math.max(0, Math.min(2, Number.isFinite(+item.influence) ? +item.influence : 1)),
        }));
    } catch { return []; }
};

const refreshDetailerContextSelectors = (node: any) => {
    if (node.comfyClass !== "BV Regional Detailer Mask" && node.type !== "BV Regional Detailer Mask") return;
    const hidden = node.widgets?.find((widget: any) => widget.name === "context_regions_json");
    if (!hidden) return;
    hideRegionalWidget(hidden);
    const document = sourceRegionalDocument(node);
    if (!document) return;
    for (const widget of node.__bvDetailerContextWidgets ?? []) {
        const widgetIndex = node.widgets?.indexOf(widget) ?? -1;
        if (widgetIndex >= 0) node.widgets.splice(widgetIndex, 1);
        widget.onRemove?.();
    }
    const primaryId = String(node.widgets?.find((widget: any) => widget.name === "region")?.value ?? "");
    const available = (document?.regions ?? []).filter((region: any) => region.enabled !== false && region.id !== primaryId);
    const seen = new Set<string>();
    const entries = parseDetailerContexts(hidden.value).filter(entry => entry.region_id !== primaryId && !seen.has(entry.region_id) && !!seen.add(entry.region_id));
    hidden.value = JSON.stringify(entries);
    const widgets: any[] = [];
    const rebuild = (next: DetailerContextEntry[]) => { hidden.value = JSON.stringify(next); queueMicrotask(() => refreshDetailerContextSelectors(node)); };
    for (let index = 0; index <= entries.length; index++) {
        const current = entries[index];
        const selectedElsewhere = new Set(entries.filter((_, itemIndex) => itemIndex !== index).map(entry => entry.region_id));
        const choices = regionChoices(available.filter((region: any) => !selectedElsewhere.has(region.id)));
        const missingLabel = current && !choices.some(choice => choice.id === current.region_id) ? `Missing region · ${current.region_id.slice(0, 8)}` : null;
        const combo = node.addWidget("combo", `context_region_${index + 1}`, current ? choices.find(choice => choice.id === current.region_id)?.label ?? missingLabel ?? "None" : "None", (label: string) => {
            if (label === "None") return rebuild(entries.slice(0, index));
            const choice = choices.find(item => item.label === label);
            if (!choice) return;
            const next = entries.slice();
            next[index] = { region_id: choice.id, influence: current?.influence ?? 1 };
            rebuild(next);
        }, { values: ["None", ...(missingLabel ? [missingLabel] : []), ...choices.map(choice => choice.label)], serialize: false });
        combo.label = `context region ${index + 1}`;
        combo.serialize = false;
        widgets.push(combo);
        if (current) {
            const influence = node.addWidget("number", `context_influence_${index + 1}`, current.influence, (value: number) => {
                const next = parseDetailerContexts(hidden.value);
                if (next[index]) next[index].influence = Math.max(0, Math.min(2, +value));
                hidden.value = JSON.stringify(next);
            }, { min: 0, max: 2, step: 0.05, precision: 2, serialize: false });
            influence.label = `context influence ${index + 1}`;
            influence.serialize = false;
            widgets.push(influence);
        }
    }
    node.__bvDetailerContextWidgets = widgets;
    const computedSize = node.computeSize?.();
    if (computedSize && node.setSize) {
        node.setSize([Math.max(node.size?.[0] ?? 0, computedSize[0]), computedSize[1]]);
    }
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
};

const refreshRegionSelector = (node: any) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "region");
    const combo = node.widgets?.find((widget: any) => widget.name === "region_selector");
    if (!hidden || !combo) return;
    const document = sourceRegionalDocument(node);
    if (!document) {
        combo.options ??= {};
        combo.options.values = ["Connect a BV Regional Prompt"];
        combo.value = combo.options.values[0];
        combo.disabled = true;
        node.setDirtyCanvas?.(true, true);
        return;
    }
    const consumer = node.comfyClass === "BV Regional Detailer Mask" || node.type === "BV Regional Detailer Mask" ? "detailer" : undefined;
    const choices = regionChoices(document.regions, consumer);
    const storedId = String(hidden.value ?? "");
    const selectedId = choices.some(choice => choice.id === storedId) ? storedId : storedId || choices[0]?.id || "";
    hidden.value = selectedId;
    node.__bvRegionChoices = choices;
    combo.options ??= {};
    const missingLabel = selectedId && !choices.some(choice => choice.id === selectedId) ? `Missing region · ${selectedId.slice(0, 8)}` : null;
    combo.options.values = choices.length || missingLabel ? [...(missingLabel ? [missingLabel] : []), ...choices.map(choice => choice.label)] : ["Connect a BV Regional Prompt"];
    combo.value = choices.find(choice => choice.id === selectedId)?.label ?? missingLabel ?? combo.options.values[0];
    const scopeWidget = node.widgets?.find((widget: any) => widget.name === "scope");
    combo.disabled = (scopeWidget && scopeWidget.value !== "region") || !choices.length;
    refreshDetailerContextSelectors(node);
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
            if (choice) { hidden.value = choice.id; refreshDetailerContextSelectors(node); }
        }, { values: ["Connect a BV Regional Prompt"], serialize: false });
        combo.label = "region";
        combo.serialize = false;
    }
    if (node.comfyClass === "BV Regional Detailer Mask" || node.type === "BV Regional Detailer Mask") {
        moveWidgetBefore(node, combo, node.widgets?.find((widget: any) => widget.name === "primary_region_influence"));
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
const namedLoraStacks = (): NamedLoraStack[] => {
    const graph = (comfyApp as any).graph, found: NamedLoraStack[] = [];
    const visit = (candidate: any) => {
        for (const node of candidate?._nodes ?? []) {
            if (node.type === "BV Named LoRA Stack") {
                const id = String(node.widgets?.find((widget: any) => widget.name === "stack_id")?.value ?? "").trim();
                const name = String(node.widgets?.find((widget: any) => widget.name === "name")?.value ?? "").trim();
                if (id && name) found.push({ id, name, nodeId: String(node.id) });
            }
            if (node.subgraph) visit(node.subgraph);
        }
    };
    visit(graph);
    return found.sort((left, right) => left.name.localeCompare(right.name));
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
        const bindingsWidget = node.widgets?.find((item: any) => item.name === "lora_bindings_json");
        if (bindingsWidget) {
            try {
                const parsed = { ...parseLoraBindings(bindingsWidget.value, forceNew ? "" : document.document_id), document_id: document.document_id };
                bindingsWidget.value = JSON.stringify(reconcileLoraBindings(parsed, new Set(document.regions.map(region => region.id))));
            }
            catch { bindingsWidget.value = JSON.stringify(emptyLoraBindings(document.document_id)); }
        }
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
    const [loraStacks, setLoraStacks] = useState<NamedLoraStack[]>([]);

    useEffect(() => {
        if (!regionalOpen && !quickEditOpen) return;
        return watchActiveWorkflow(comfyApp, comfyApi, () => {
            setRegionalOpen(false);
            setQuickEditOpen(false);
        });
    }, [quickEditOpen, regionalOpen]);

    useEffect(() => {
        const open = () => setPortalOpen(true);
        window.addEventListener(OPEN_CONTROL_RACK_EVENT, open);
        return () => window.removeEventListener(OPEN_CONTROL_RACK_EVENT, open);
    }, []);

    useEffect(() => {
        const open = (event: Event) => {
            const requested = (event as CustomEvent<{ node?: RegionalNode }>).detail?.node ?? null;
            const available = regionalNodes();
            setLoraStacks(namedLoraStacks());
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
            setLoraStacks(namedLoraStacks());
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
        <RegionalEditor open={regionalOpen} nodes={nodes} initialNode={regionalNode} backgrounds={backgrounds} loraStacks={loraStacks} onClose={() => setRegionalOpen(false)} />
        <QuickPromptEditor open={quickEditOpen} nodes={nodes} initialNode={regionalNode} loraStacks={loraStacks} onClose={() => setQuickEditOpen(false)} onOpenEditor={node => { setRegionalNode(node); setQuickEditOpen(false); setRegionalOpen(true); }} />
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
        installGlobalTextareaCompletion();
    },
});

comfyApp.registerExtension({
    name: "bv_nodepack.regional_editor",
    settings: [{
        id: COMPLETION_SETTING_ID as any,
        name: "Enable BV Prompt Autocomplete",
        type: "boolean",
        defaultValue: true,
        category: ["BV Node Pack", "Prompting", "Enable autocomplete"],
        tooltip: "Enable BV-owned prompt completion. Disable this when another autocomplete extension should control prompt fields.",
        onChange: (value: boolean) => setCompletionEnabled(Boolean(value)),
    }, {
        id: COMPLETION_PLACEMENT_SETTING_ID as any,
        name: "Autocomplete Popup Position",
        type: "combo",
        defaultValue: "caret",
        options: [{ text: "At Caret", value: "caret" }, { text: "Below Text Field", value: "field" }],
        category: ["BV Node Pack", "Prompting", "Popup position"],
        tooltip: "Open suggestions at the active caret or below the complete text field.",
        onChange: (value: string) => setCompletionPlacement(value),
    }, {
        id: COMPLETION_DATASETS_SETTING_ID as any,
        name: "Completion Datasets",
        type: renderCompletionDatasetSetting,
        defaultValue: "",
        category: ["BV Node Pack", "Prompting", "Completion datasets"],
        tooltip: "Choose one or more local CSV/TSV datasets for BV Prompt Autocomplete.",
        onChange: (value: string) => applyCompletionDatasetSetting(value),
    }],
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
        if (nodeData.name === "BV Named LoRA Stack") {
            const prepare = (node: any) => {
                const idWidget = node.widgets?.find((widget: any) => widget.name === "stack_id");
                if (!idWidget) return;
                const currentId = String(idWidget.value ?? "").trim();
                if (!currentId || needsFreshStackId(String(node.id), currentId, namedLoraStacks())) {
                    idWidget.value = crypto.randomUUID();
                    node.setDirtyCanvas?.(true, true);
                }
                hideRegionalWidget(idWidget);
            };
            const originalCreated = nodeType.prototype.onNodeCreated, originalConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onNodeCreated = function () { const result = originalCreated?.apply(this, arguments); prepare(this); return result; };
            nodeType.prototype.onConfigure = function () { const result = originalConfigure?.apply(this, arguments); queueMicrotask(() => prepare(this)); return result; };
            return;
        }
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
        if (["BV Regional Select", "BV Regional Deconstructor", "BV Regional Detailer Mask"].includes(nodeData.name)) {
            const originalCreated = nodeType.prototype.onNodeCreated;
            const originalConfigure = nodeType.prototype.onConfigure;
            const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalCreated?.apply(this, arguments);
                upgradeRegionSelector(this);
                return result;
            };
            const originalSerialize = nodeType.prototype.onSerialize;
            nodeType.prototype.onConfigure = function (data: any) {
                if (nodeData.name === "BV Regional Detailer Mask") {
                    removeDetailerProjectionWidgets(this);
                    if (data?.widgets_values) {
                        data = { ...data, widgets_values: normalizeDetailerWidgetValues(data.widgets_values) };
                    }
                }
                const result = originalConfigure?.call(this, data);
                queueMicrotask(() => upgradeRegionSelector(this));
                return result;
            };
            nodeType.prototype.onSerialize = function (data: any) {
                const result = originalSerialize?.apply(this, arguments);
                if (nodeData.name === "BV Regional Detailer Mask") {
                    data.widgets_values = detailerBackendWidgetValues(this.widgets);
                }
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
            const bindingsWidget = this.widgets?.find((widget: any) => widget.name === "lora_bindings_json");
            if (bindingsWidget) hideRegionalWidget(bindingsWidget);
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
            const bindingsWidget = this.widgets?.find((widget: any) => widget.name === "lora_bindings_json");
            if (bindingsWidget) hideRegionalWidget(bindingsWidget);
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

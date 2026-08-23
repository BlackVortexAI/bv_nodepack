import React, { useCallback, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { getApi, getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
import SmartPipeEditorWindow from "./components/SmartPipeEditorWindow";
import styles from "./index.css?inline";
import flexLayoutStyles from "flexlayout-react/style/combined.css?inline";
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
import { openDetailerPlanDialog } from "./regional/detailerPlanDialog";
import { parseDetailerPlanConfig } from "./regional/detailerPlanConfig";
import { openDetectorRegistryDialog } from "./regional/detectorRegistryDialog";
import { parseDetectorRegistryConfig } from "./regional/detectorRegistryConfig";
import { visibleExternalDetectorSlots } from "./regional/detectorExternalInputs";
import { DETAILER_UI_NODES, detailerUiLabel } from "./regional/detailerLoopUi";
import { upgradeRemoteLLMProvider } from "./remoteLLM";
import { installM0ResourceSpike } from "./regional/m0ResourceSpike";
import { hideLoraV3Widget, installLoraV3ConsumerSlot, installLoraV3Ui, LORA_V3_INVENTORY_CHANGED_EVENT, OPEN_LORA_V3_EDITOR_EVENT } from "./regional/loraV3Ui";
import LoraV3EditorWindow from "./regional/LoraV3EditorWindow";
import { installM0CanvasVisibility } from "./regional/m0VisualProjection";
import { applyReducedEffects, applyUiPreferences, applyUiSize, bindWindowSwitchModePersistence, getWindowSwitchMode, setWindowSwitchMode, UI_REDUCED_EFFECTS_SETTING_ID, UI_SIZE_SETTING_ID, UI_WINDOW_SWITCH_MODE_SETTING_ID } from "./ui/preferences";
import { BvGlobalToastStack, BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT, collectScopedNodes, lastBvFullWindowType, lastBvWindowInstance, rememberBvWindowInstance, setWindowMenuVisible, showBvToast, switchBvView, ToolbarWindowLauncher, ToolbarLauncherColumn, windowMenuVisible } from "./ui";
const comfyApp = getApp();
const comfyApi = getApi();
bindCompletionSettingPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_SETTING_ID, value));
bindCompletionDatasetPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_DATASETS_SETTING_ID, value));
bindCompletionPlacementPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_PLACEMENT_SETTING_ID, value));
bindWindowSwitchModePersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(UI_WINDOW_SWITCH_MODE_SETTING_ID, value));
import "./components/control/bv_control_center";

const OPEN_CONTROL_RACK_EVENT = "bv-open-control-rack";
const OPEN_REGIONAL_EDITOR_EVENT = "bv-open-regional-editor";
const OPEN_REGIONAL_QUICK_EDIT_EVENT = "bv-open-regional-quick-edit";
const REGIONAL_DOCUMENT_CHANGED_EVENT = "bv-regional-document-changed";
const STYLE_ID = "bv-nodepack-styles";
const DEBUG_BRIDGE_SETTING_ID = "BV.DebugBridge.Enabled";
let debugBridgeEnabled = false;
let debugBridgePublishTimer: number | null = null;

const debugWorkflowName = () => {
    const workflow = (comfyApp as any).extensionManager?.workflow?.activeWorkflow
        ?? (comfyApp as any).workflowManager?.activeWorkflow;
    return String(workflow?.filename ?? workflow?.path ?? "Current workflow");
};

const setDebugBridgeSession = async (enabled: boolean) => {
    debugBridgeEnabled = Boolean(enabled);
    const response = await fetch(comfyApi.apiURL("/bv_nodepack/debug/session"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: debugBridgeEnabled }),
    });
    if (!response.ok) throw new Error(`BV Debug Bridge session failed: ${response.status} ${await response.text()}`);
};

const publishDebugSnapshot = async () => {
    if (!debugBridgeEnabled) return false;
    const prompt = await (comfyApp as any).graphToPrompt();
    const response = await fetch(comfyApi.apiURL("/bv_nodepack/debug/snapshot"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.output, workflow_name: debugWorkflowName() }),
    });
    if (!response.ok) throw new Error(`BV Debug Bridge snapshot failed: ${response.status} ${await response.text()}`);
    return true;
};

const scheduleDebugSnapshot = () => {
    if (!debugBridgeEnabled) return;
    if (debugBridgePublishTimer != null) window.clearTimeout(debugBridgePublishTimer);
    debugBridgePublishTimer = window.setTimeout(() => {
        debugBridgePublishTimer = null;
        publishDebugSnapshot().catch(error => console.error(error));
    }, 600);
};

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
    const input = node.inputs?.find((item: any) => item.name === "regional" || item.name === "regional_prompt");
    const graph = node.graph ?? (comfyApp as any).graph;
    const link = input?.link == null ? null : graph?.links?.[input.link] ?? graph?._links?.get?.(input.link);
    const source = link ? graph?.getNodeById?.(link.origin_id) : null;
    if (source?.type !== "BV Regional Prompt") return null;
    const value = source.widgets?.find((widget: any) => widget.name === "regional_json")?.value;
    try { return parseDocument(value); } catch { return null; }
};

const detectorIdsForPlan = (node: any) => {
    const graph = node.graph ?? (comfyApp as any).graph;
    const registryInput = node.inputs?.find((input: any) => input.name === "detector_registry");
    const registryLink = registryInput?.link == null ? null : graph?.links?.[registryInput.link] ?? graph?._links?.get?.(registryInput.link);
    const registryNode = registryLink ? graph?.getNodeById?.(registryLink.origin_id) : null;
    if (registryNode?.type !== "BV Detector Registry") return [];
    const value = registryNode.widgets?.find((widget: any) => widget.name === "config_json")?.value;
    const ids = parseDetectorRegistryConfig(value).detectors.map(entry => entry.id);
    for (const input of registryNode.inputs ?? []) {
        if (!String(input.name).startsWith("external_detector_") || input.link == null) continue;
        const link = graph?.links?.[input.link] ?? graph?._links?.get?.(input.link);
        const bindingNode = link ? graph?.getNodeById?.(link.origin_id) : null;
        const detectorId = String(bindingNode?.widgets?.find((widget: any) => widget.name === "detector_id")?.value ?? "").trim();
        if (detectorId) ids.push(detectorId);
    }
    return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
};

const syncDetectorExternalInputs = (node: any) => {
    const pattern = /^external_detector_(\d+)$/;
    const connected = (node.inputs ?? []).flatMap((input: any) => {
        const match = pattern.exec(String(input.name));
        return match && input.link != null ? [Number(match[1])] : [];
    });
    const wanted = new Set(visibleExternalDetectorSlots(connected));
    for (let index = (node.inputs?.length ?? 0) - 1; index >= 0; index--) {
        const input = node.inputs[index], match = pattern.exec(String(input.name));
        if (match && input.link == null && !wanted.has(Number(match[1]))) node.removeInput(index);
    }
    for (const index of [...wanted].sort((left, right) => left - right)) {
        const name = `external_detector_${index}`;
        if (!node.inputs?.some((input: any) => input.name === name)) node.addInput(name, "BV_DETECTOR_BINDING", { label: `external detector ${index}`, nameLocked: true });
    }
    node.setDirtyCanvas?.(true, true);
};

const labelDetailerUi = (node: any, nodeName: string) => {
    for (const input of node.inputs ?? []) input.label = detailerUiLabel(nodeName, String(input.name));
    for (const output of node.outputs ?? []) output.label = detailerUiLabel(nodeName, String(output.name));
    for (const widget of node.widgets ?? []) {
        if (!String(widget.name).startsWith("configure_")) widget.label = detailerUiLabel(nodeName, String(widget.name));
    }
    node.setDirtyCanvas?.(true, true);
};

const refreshDetailerPlanNode = (node: any) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "config_json");
    const action = node.widgets?.find((widget: any) => widget.name === "configure_detailer_plan");
    if (!hidden || !action) return;
    hideRegionalWidget(hidden);
    const document = sourceRegionalDocument(node);
    const count = document ? parseDetailerPlanConfig(hidden.value, document.regions).jobs.length : 0;
    action.label = document ? `Configure Detailer Plan · ${count} Job${count === 1 ? "" : "s"}` : "Connect a BV Regional Prompt";
    action.disabled = !document;
    node.setDirtyCanvas?.(true, true);
};

const upgradeDetailerPlanNode = (node: any) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "config_json");
    if (!hidden) return;
    hideRegionalWidget(hidden);
    let action = node.widgets?.find((widget: any) => widget.name === "configure_detailer_plan");
    if (!action) {
        action = node.addWidget("button", "configure_detailer_plan", null, () => {
            const document = sourceRegionalDocument(node);
            if (!document) return;
            rememberBvWindowInstance("detailer",scopedNodeKey(node));
            openDetailerPlanDialog(document.regions, detectorIdsForPlan(node), hidden.value, value => {
                hidden.value = value;
                refreshDetailerPlanNode(node);
                node.graph?.setDirtyCanvas?.(true, true);
            }, `detailer-plan:${scopedNodeKey(node)}`, workflowNodesOfType("BV Regional Detailer Plan").filter(windowMenuVisible).map(item=>({id:scopedNodeKey(item),label:`${item.title||"BV Regional Detailer Plan"} · #${item.id}`})), (targetId,replaceCurrent)=>{
                const target=workflowNodesOfType("BV Regional Detailer Plan").find(item=>scopedNodeKey(item)===targetId);
                const targetAction=target?.widgets?.find((widget:any)=>widget.name==="configure_detailer_plan");
                if(targetAction)switchBvView(`detailer-plan:${scopedNodeKey(node)}`,`detailer-plan:${scopedNodeKey(target)}`,()=>targetAction.callback?.(),replaceCurrent);
            },node);
        }, { serialize: false });
        action.serialize = false;
    }
    refreshDetailerPlanNode(node);
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
const workflowNodesOfType = (type:string): any[] => {
    const found:any[]=[];
    const visit=(candidate:any)=>{for(const node of candidate?._nodes??[]){if(node.type===type)found.push(node);if(node.subgraph)visit(node.subgraph)}};
    visit((comfyApp as any).graph);return found;
};
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
const refreshBvToolbarCapabilities=()=>{
    const control=workflowNodesOfType("BV Control Center").length>0,quick=regionalNodes().length>0,full=quick||["BV Regional LoRA","BV Regional Detailer Plan","BV Detector Registry","BV Smart Pipe","BV Smart Pipe Merge"].some(type=>workflowNodesOfType(type).length>0),overview=full||quick;
    document.body.classList.toggle("bv-toolbar-no-control",!control);document.body.classList.toggle("bv-toolbar-no-editor",!full);document.body.classList.toggle("bv-toolbar-no-quick",!quick);document.body.classList.toggle("bv-toolbar-no-overview",!overview);
    window.dispatchEvent(new CustomEvent("bv-toolbar-capabilities-changed",{detail:{control,quick,full,overview}}));
};
const scopedNodeInfo=(node:any)=>collectScopedNodes((comfyApp as any).rootGraph??(comfyApp as any).graph,candidate=>candidate===node)[0];
const scopedNodeKey=(node:any)=>scopedNodeInfo(node)?.key??String(node.id);
const nodeLauncherLabel = (node:any, fallback:string) => {const scoped=scopedNodeInfo(node);return{label:String(node.title||fallback),meta:`${scoped?.breadcrumb?`${scoped.breadcrumb} · `:""}#${node.id}`}};
const activateManagedLauncherNode = (type:"detailer"|"detector", prefix:string, widgetName:string, node:any) => {
    const action=node.widgets?.find((widget:any)=>widget.name===widgetName);
    if(!action||action.disabled)return;
    const targetId=scopedNodeKey(node),currentId=lastBvWindowInstance(type),openTarget=()=>action.callback?.();
    if(currentId&&currentId!==targetId)switchBvView(`${prefix}:${currentId}`,`${prefix}:${targetId}`,openTarget,getWindowSwitchMode()==="replace");
    else openTarget();
    rememberBvWindowInstance(type,targetId);
};
const openFullEditorNode=(type:string,node:any)=>{if(type==="regional")window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_EDITOR_EVENT,{detail:{node}}));else if(type==="lora")window.dispatchEvent(new CustomEvent(OPEN_LORA_V3_EDITOR_EVENT,{detail:{node}}));else if(type==="detailer")activateManagedLauncherNode("detailer","detailer-plan","configure_detailer_plan",node);else if(type==="detector")activateManagedLauncherNode("detector","detector-registry","configure_detector_registry",node);else window.dispatchEvent(new CustomEvent("bv-open-smart-pipe-editor",{detail:{node,kind:type}}))};
const openLastFullBvEditor=()=>{
    const definitions=[{type:"regional",nodes:regionalNodes()},{type:"lora",nodes:workflowNodesOfType("BV Regional LoRA")},{type:"detailer",nodes:workflowNodesOfType("BV Regional Detailer Plan")},{type:"detector",nodes:workflowNodesOfType("BV Detector Registry")},{type:"pipe",nodes:workflowNodesOfType("BV Smart Pipe")},{type:"merge",nodes:workflowNodesOfType("BV Smart Pipe Merge")}],lastType=lastBvFullWindowType(),lastId=lastType&&lastBvWindowInstance(lastType),last=definitions.find(item=>item.type===lastType)?.nodes.find(node=>scopedNodeKey(node)===lastId);
    if(last){openFullEditorNode(lastType!,last);return}
    const fallback=definitions.flatMap(item=>item.nodes.map(node=>({type:item.type,node}))).sort((left,right)=>(Number(left.node.id)||Number.MAX_SAFE_INTEGER)-(Number(right.node.id)||Number.MAX_SAFE_INTEGER))[0];
    if(!fallback)return;openFullEditorNode(fallback.type,fallback.node);if(lastType)showBvToast({title:"Previous editor unavailable",message:"Opened the first available BV editor instead.",tone:"warning",duration:4000});
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
    const [hasControlNodes,setHasControlNodes]=useState(false);
    const [regionalOpen, setRegionalOpen] = useState(false);
    const [regionalActivation,setRegionalActivation]=useState(0);
    const [quickEditOpen, setQuickEditOpen] = useState(false);
    const [quickEditActivation,setQuickEditActivation]=useState(0);
    const [regionalNode, setRegionalNode] = useState<RegionalNode | null>(null);
    const [nodes, setNodes] = useState<RegionalNode[]>([]);
    const [backgrounds, setBackgrounds] = useState<Record<string, string>>({});
    const [loraStacks, setLoraStacks] = useState<NamedLoraStack[]>([]);
    const [loraV3Node,setLoraV3Node]=useState<any|null>(null);
    const launcherColumns=useCallback((includeHidden=false):ToolbarLauncherColumn[]=>{
        const regional=regionalNodes(),loras=workflowNodesOfType("BV Regional LoRA"),detailers=workflowNodesOfType("BV Regional Detailer Plan"),detectors=workflowNodesOfType("BV Detector Registry"),pipes=[...workflowNodesOfType("BV Smart Pipe"),...workflowNodesOfType("BV Smart Pipe Merge")];
        const decorate=(node:any,item:any)=>{const hidden=!windowMenuVisible(node);return hidden&&!includeHidden?null:{...item,hidden,onReveal:hidden?()=>setWindowMenuVisible(node,true):undefined}};
        const regionalItems=regional.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional Prompt"),last=lastBvWindowInstance("regional")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_EDITOR_EVENT,{detail:{node}})),secondary:{label:`Quick edit ${copy.label}`,onSelect:()=>window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_QUICK_EDIT_EVENT,{detail:{node}}))}})}).filter(Boolean) as any[];
        return [
            {id:"regional",label:"Regional Prompts",items:regionalItems},
            {id:"lora",label:"Regional LoRA",items:loras.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional LoRA"),last=lastBvWindowInstance("lora")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>{rememberBvWindowInstance("lora",scopedNodeKey(node));window.dispatchEvent(new CustomEvent(OPEN_LORA_V3_EDITOR_EVENT,{detail:{node}}));}})}).filter(Boolean) as any[]},
            {id:"detailer",label:"Detailer Plan",items:detailers.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional Detailer Plan"),action=node.widgets?.find((widget:any)=>widget.name==="configure_detailer_plan"),last=lastBvWindowInstance("detailer")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,disabled:!action||action.disabled,meta:`${copy.meta}${action?.disabled?" · Connect Regional Prompt":last?" · Last active":""}`,onSelect:()=>activateManagedLauncherNode("detailer","detailer-plan","configure_detailer_plan",node)})}).filter(Boolean) as any[]},
            {id:"detector",label:"Detector Registry",items:detectors.map(node=>{const copy=nodeLauncherLabel(node,"BV Detector Registry"),last=lastBvWindowInstance("detector")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>activateManagedLauncherNode("detector","detector-registry","configure_detector_registry",node)})}).filter(Boolean) as any[]},
            {id:"smart-pipe",label:"Smart Pipes",items:pipes.map(node=>{const kind=String(node.type??node.comfyClass)==="BV Smart Pipe Merge"?"merge":"pipe",copy=nodeLauncherLabel(node,kind==="merge"?"Smart Pipe Merge":"Smart Pipe");return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta} · ${kind==="merge"?"Merge":"Pipe"}`,onSelect:()=>window.dispatchEvent(new CustomEvent("bv-open-smart-pipe-editor",{detail:{node,kind}}))})}).filter(Boolean) as any[]},
        ];
    },[]);

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
    useEffect(()=>{const open=(event:Event)=>{const node=(event as CustomEvent<{node?:any}>).detail?.node??null;if(node)rememberBvWindowInstance("lora",scopedNodeKey(node));setLoraV3Node(node)};window.addEventListener(OPEN_LORA_V3_EDITOR_EVENT,open);return()=>window.removeEventListener(OPEN_LORA_V3_EDITOR_EVENT,open)},[]);
    useEffect(()=>{const update=(event:Event)=>setHasControlNodes(Boolean((event as CustomEvent).detail?.control));window.addEventListener("bv-toolbar-capabilities-changed",update);refreshBvToolbarCapabilities();return()=>window.removeEventListener("bv-toolbar-capabilities-changed",update)},[]);
    useEffect(()=>{const refresh=()=>refreshBvToolbarCapabilities();window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh)},[]);

    useEffect(() => {
        const open = (event: Event) => {
            const requested = (event as CustomEvent<{ node?: RegionalNode }>).detail?.node ?? null;
            const available = regionalNodes();
            setLoraStacks(namedLoraStacks());
            setNodes(available);
            const target=requested??available.find(node=>scopedNodeKey(node)===lastBvWindowInstance("quick"))??available[0]??null;
            if(target)rememberBvWindowInstance("quick",scopedNodeKey(target));
            setRegionalNode(target);
            setRegionalOpen(false);
            setQuickEditOpen(true);
            setQuickEditActivation(value=>value+1);
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
            const target=requested??available.find(node=>scopedNodeKey(node)===lastBvWindowInstance("regional"))??available[0]??null;
            if(target)rememberBvWindowInstance("regional",scopedNodeKey(target));
            setRegionalNode(target);
            if(target&&quickEditOpen&&String(regionalNode?.id)===String(target.id))setQuickEditOpen(false);
            setRegionalOpen(true);
            setRegionalActivation(value=>value+1);
        };
        window.addEventListener(OPEN_REGIONAL_EDITOR_EVENT, open);
        return () => window.removeEventListener(OPEN_REGIONAL_EDITOR_EVENT, open);
    }, [quickEditOpen,regionalNode]);

    return (<>
        <BvGlobalToastStack/>
        <ToolbarWindowLauncher getColumns={launcherColumns}/>
        <SmartPipeEditorWindow/>
        <BVPortal open={portalOpen} hasControlNodes={hasControlNodes} onClose={() => setPortalOpen(false)} />
        <LoraV3EditorWindow open={Boolean(loraV3Node)} node={loraV3Node} onClose={()=>setLoraV3Node(null)}/>
        <RegionalEditor open={regionalOpen} activationToken={regionalActivation} nodes={nodes} initialNode={regionalNode} backgrounds={backgrounds} loraStacks={loraStacks} onClose={() => setRegionalOpen(false)} />
        <QuickPromptEditor open={quickEditOpen} activationToken={quickEditActivation} nodes={nodes} initialNode={regionalNode} loraStacks={loraStacks} onClose={() => setQuickEditOpen(false)} onOpenEditor={node => { rememberBvWindowInstance("regional",scopedNodeKey(node)); setRegionalNode(node); setQuickEditOpen(false); setRegionalOpen(true); setRegionalActivation(value=>value+1); }} />
    </>);
}

const MOUNT_ID = "bv-root";

function ensureMountedOnce() {
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `${flexLayoutStyles}\n${styles}`;
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
        installM0CanvasVisibility((comfyApp as any).canvas);
        applyUiPreferences((comfyApp as any).ui?.settings);
        installGlobalTextareaCompletion();
        debugBridgeEnabled = Boolean((comfyApp as any).ui?.settings?.getSettingValue?.(DEBUG_BRIDGE_SETTING_ID, false));
        setDebugBridgeSession(debugBridgeEnabled)
            .then(() => { if (debugBridgeEnabled) scheduleDebugSnapshot(); })
            .catch(error => console.error(error));
        comfyApi.addEventListener("graphChanged", scheduleDebugSnapshot);
        comfyApi.addEventListener("graphChanged", refreshBvToolbarCapabilities);
    },
});

comfyApp.registerExtension({
    name: "bv_nodepack.regional_editor",
    settings: [{
        id: UI_SIZE_SETTING_ID as any,
        name: "BV Interface Size",
        type: "combo",
        defaultValue: "default",
        options: [
            { text: "Compact", value: "compact" },
            { text: "Default", value: "default" },
            { text: "Large", value: "large" },
        ],
        category: ["BV Node Pack", "Appearance", "Interface size"],
        tooltip: "Scale every BV-owned interface consistently. Default is the comfortable size; Compact matches the former standard.",
        onChange: (value: string) => applyUiSize(value),
    }, {
        id: UI_REDUCED_EFFECTS_SETTING_ID as any,
        name: "Reduce BV Interface Effects",
        type: "boolean",
        defaultValue: false,
        category: ["BV Node Pack", "Appearance", "Reduced effects"],
        tooltip: "Disable BV animations, transitions, blur and visual filters without changing ComfyUI's canvas.",
        onChange: (value: boolean) => applyReducedEffects(value),
    }, {
        id: UI_WINDOW_SWITCH_MODE_SETTING_ID as any,
        name: "BV Window Switch Mode",
        type: "combo",
        defaultValue: "keep",
        options: [
            { text: "Keep current window", value: "keep" },
            { text: "Replace current window", value: "replace" },
        ],
        category: ["BV Node Pack", "Appearance", "Window switching"],
        tooltip: "Choose whether changing the node in a BV editor minimizes or closes the current window. Hold Shift to invert the mode once.",
        onChange: (value: string) => setWindowSwitchMode(value, false),
    }, {
        id: DEBUG_BRIDGE_SETTING_ID as any,
        name: "Enable BV Debug Bridge",
        type: "boolean",
        defaultValue: false,
        category: ["BV Node Pack", "Developer", "Enable Debug Bridge"],
        tooltip: "Expose the current API-format workflow as an in-memory snapshot to loopback clients only.",
        onChange: (value: boolean) => {
            setDebugBridgeSession(Boolean(value))
                .then(() => { if (value) scheduleDebugSnapshot(); })
                .catch(error => console.error(error));
        },
    }, {
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
    }, {
        id: "bv.debugBridge.publishSnapshot",
        label: "Refresh BV Debug Bridge Snapshot",
        icon: "icon-[lucide--radio-tower]",
        function: () => publishDebugSnapshot().catch(error => console.error(error)),
    }],
    actionBarButtons: [{
        icon: "icon-[lucide--sliders-horizontal]",
        class: "bv-regional-action bv-regional-action-control",
        tooltip: "Open BV Control Center",
        onClick: () => window.dispatchEvent(new Event(OPEN_CONTROL_RACK_EVENT)),
    }, {
        icon: "icon-[lucide--scan-search]",
        class: "bv-regional-action bv-regional-action-editor",
        tooltip: "Open last BV editor",
        onClick: openLastFullBvEditor,
    }, {
        icon: "icon-[lucide--layers]",
        class: "bv-regional-action bv-regional-action-quick",
        tooltip: "Quick edit BV Regional prompts",
        onClick: () => window.dispatchEvent(new CustomEvent(OPEN_REGIONAL_QUICK_EDIT_EVENT)),
    }, {
        icon: "icon-[lucide--chevron-down]",
        class: "bv-regional-action bv-regional-action-menu",
        tooltip: "Choose BV window",
        onClick: () => window.dispatchEvent(new CustomEvent(BV_TOOLBAR_LAUNCHER_TOGGLE_EVENT)),
    }],
    beforeRegisterNodeDef(nodeType: any, nodeData: any) {
        if (installM0ResourceSpike(nodeType, nodeData)) return;
        if (installLoraV3Ui(nodeType, nodeData)) return;
        if(["BV Control Center","BV Regional Prompt","BV Regional Detailer Plan","BV Detector Registry","BV Smart Pipe","BV Smart Pipe Merge"].includes(nodeData.name)){
            const created=nodeType.prototype.onNodeCreated,removed=nodeType.prototype.onRemoved;
            nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);if(nodeData.name!=="BV Control Center"){this.properties??={};if(typeof this.properties.bvWindowMenuVisible!=="boolean")this.properties.bvWindowMenuVisible=!['BV Smart Pipe','BV Smart Pipe Merge'].includes(nodeData.name)}queueMicrotask(refreshBvToolbarCapabilities);return result};
            nodeType.prototype.onRemoved=function(){const result=removed?.apply(this,arguments);queueMicrotask(refreshBvToolbarCapabilities);return result};
        }
        if (DETAILER_UI_NODES.has(nodeData.name)) {
            const originalCreated = nodeType.prototype.onNodeCreated, originalConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onNodeCreated = function () { const result = originalCreated?.apply(this, arguments); queueMicrotask(() => labelDetailerUi(this, nodeData.name)); return result; };
            nodeType.prototype.onConfigure = function (data: any) {
                const result = originalConfigure?.call(this, data);
                queueMicrotask(() => labelDetailerUi(this, nodeData.name));
                return result;
            };
        }
        if (nodeData.name === "BV Detector Registry") {
            const prepare = (node: any) => {
                const hidden = node.widgets?.find((widget: any) => widget.name === "config_json");
                if (!hidden) return;
                hideRegionalWidget(hidden);
                let action = node.widgets?.find((widget: any) => widget.name === "configure_detector_registry");
                if (!action) {
                    action = node.addWidget("button", "configure_detector_registry", null, () => {
                        rememberBvWindowInstance("detector",scopedNodeKey(node));
                        openDetectorRegistryDialog(comfyApi, hidden.value, value => {
                            hidden.value = value;
                            prepare(node);
                            node.graph?.setDirtyCanvas?.(true, true);
                        }, `detector-registry:${scopedNodeKey(node)}`, workflowNodesOfType("BV Detector Registry").filter(windowMenuVisible).map(item=>({id:scopedNodeKey(item),label:`${item.title||"BV Detector Registry"} · #${item.id}`})), (targetId,replaceCurrent)=>{
                            const target=workflowNodesOfType("BV Detector Registry").find(item=>scopedNodeKey(item)===targetId);
                            const targetAction=target?.widgets?.find((widget:any)=>widget.name==="configure_detector_registry");
                            if(targetAction)switchBvView(`detector-registry:${scopedNodeKey(node)}`,`detector-registry:${scopedNodeKey(target)}`,()=>targetAction.callback?.(),replaceCurrent);
                        },node).catch(error => console.error(error));
                    }, { serialize: false });
                    action.serialize = false;
                }
                const count = parseDetectorRegistryConfig(hidden.value).detectors.length;
                action.label = `Configure Detector Registry · ${count} Detector${count === 1 ? "" : "s"}`;
                node.setDirtyCanvas?.(true, true);
            };
            const originalCreated = nodeType.prototype.onNodeCreated, originalConfigure = nodeType.prototype.onConfigure;
            const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onNodeCreated = function () { const result = originalCreated?.apply(this, arguments); queueMicrotask(() => { prepare(this); syncDetectorExternalInputs(this); }); return result; };
            nodeType.prototype.onConfigure = function () { const result = originalConfigure?.apply(this, arguments); queueMicrotask(() => { prepare(this); syncDetectorExternalInputs(this); }); return result; };
            nodeType.prototype.onConnectionsChange = function () { const result = originalConnectionsChange?.apply(this, arguments); queueMicrotask(() => syncDetectorExternalInputs(this)); return result; };
            return;
        }
        if (nodeData.name === "BV Regional Detailer Plan") {
            const originalCreated = nodeType.prototype.onNodeCreated;
            const originalConfigure = nodeType.prototype.onConfigure;
            const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalCreated?.apply(this, arguments);
                queueMicrotask(() => upgradeDetailerPlanNode(this));
                return result;
            };
            nodeType.prototype.onConfigure = function () {
                const result = originalConfigure?.apply(this, arguments);
                queueMicrotask(() => upgradeDetailerPlanNode(this));
                return result;
            };
            nodeType.prototype.onConnectionsChange = function () {
                const result = originalConnectionsChange?.apply(this, arguments);
                queueMicrotask(() => refreshDetailerPlanNode(this));
                return result;
            };
            return;
        }
        if (nodeData.name === "BV Remote LLM Provider") {
            const originalCreated = nodeType.prototype.onNodeCreated;
            const originalConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onNodeCreated = function () {
                const result = originalCreated?.apply(this, arguments);
                queueMicrotask(() => upgradeRemoteLLMProvider(this, comfyApi));
                return result;
            };
            nodeType.prototype.onConfigure = function (data: any) {
                // Prototype workflows stored the environment-variable name between model and reasoning.
                if (Array.isArray(data?.widgets_values) && data.widgets_values.length >= 6
                    && /^[A-Za-z_][A-Za-z0-9_]*$/.test(String(data.widgets_values[3] ?? ""))) {
                    data = { ...data, widgets_values: [...data.widgets_values.slice(0, 3), ...data.widgets_values.slice(4)] };
                }
                const result = originalConfigure?.call(this, data);
                queueMicrotask(() => upgradeRemoteLLMProvider(this, comfyApi));
                return result;
            };
            return;
        }
        if (nodeData.name === "BV Named LoRA Stack") {
            const prepare = (node: any) => {
                const idWidget = node.widgets?.find((widget: any) => widget.name === "stack_id");
                if (!idWidget) return;
                const currentId = String(idWidget.value ?? "").trim();
                if (!currentId || needsFreshStackId(String(node.id), currentId, namedLoraStacks())) {
                    const nextId = crypto.randomUUID();
                    if(currentId)node.__bvLoraResourceIdRemap={[currentId]:nextId};
                    idWidget.value = nextId;
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
            const loraV3Widget = this.widgets?.find((widget: any) => widget.name === "lora_v3_config_json");
            if (bindingsWidget) hideRegionalWidget(bindingsWidget);
            if (loraV3Widget) hideLoraV3Widget(loraV3Widget);
            installLoraV3ConsumerSlot(this);
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
            const loraV3Widget = this.widgets?.find((widget: any) => widget.name === "lora_v3_config_json");
            if (bindingsWidget) hideRegionalWidget(bindingsWidget);
            if (loraV3Widget) hideLoraV3Widget(loraV3Widget);
            installLoraV3ConsumerSlot(this);
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
    afterConfigureGraph() {
        scheduleDebugSnapshot();
        queueMicrotask(refreshBvToolbarCapabilities);
    },
});

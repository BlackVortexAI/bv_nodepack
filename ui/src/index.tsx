import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { applyBvTheme } from "./ui/theme";
import { closeWorkflowBvViews } from "./ui/mount";
import { getApi, getApp } from "./appHelper.js";
import BVPortal from "./components/BVPortal";
import SmartPipeEditorWindow from "./components/SmartPipeEditorWindow";
import styles from "./index.css?inline";
import flexLayoutStyles from "flexlayout-react/style/combined.css?inline";
import RegionalEditor from "./regional/RegionalEditor";
import QuickPromptEditor from "./regional/QuickPromptEditor";
import { emptyDocument, parseDocument } from "./regional/model";
import { regionChoices } from "./regional/regionSelector";
import { documentTargetChoices, resolveDocumentTargetState } from "./regional/documentTargets";
import { applyCompletionDatasetSetting, bindCompletionDatasetPersistence, bindCompletionPlacementPersistence, bindCompletionSettingPersistence, COMPLETION_DATASETS_SETTING_ID, COMPLETION_PLACEMENT_SETTING_ID, COMPLETION_SETTING_ID, setCompletionEnabled, setCompletionPlacement } from "./completion/settings";
import { renderCompletionDatasetSetting } from "./completion/settingsRenderer";
import { installGlobalTextareaCompletion } from "./completion/globalTextareaAdapter";
import { activeWorkflowIdentity, activeWorkflowScope, watchActiveWorkflow } from "./regional/workflowLifecycle";
import { canRequestRegionalWindow, requestRegionalWindow, subscribeRegionalWindow } from "./regional/windowRequests";
import { emptyLoraBindings, NamedLoraStack, needsFreshStackId, parseLoraBindings, reconcileLoraBindings } from "./regional/loraBindings";
import { detailerBackendWidgetValues, normalizeDetailerWidgetValues } from "./regional/detailerPersistence";
import { sourceRegionalDocument as resolveSourceRegionalDocument } from "./regional/regionalSourceDocument";
import { markRegionalConsumer, regionalWorkflowRoot, scheduleRegionalConsumersRefresh } from "./regional/regionalGraphSync";
import { openDetailerPlanDialog } from "./regional/detailerPlanDialog";
import { parseDetailerPlanConfig } from "./regional/detailerPlanConfig";
import { openDetectorRegistryDialog } from "./regional/detectorRegistryDialog";
import { parseDetectorRegistryConfig, serializeDetectorRegistryConfig } from "./regional/detectorRegistryConfig";
import { visibleExternalDetectorSlots } from "./regional/detectorExternalInputs";
import { compactNodeToComputedHeight } from "./regional/nodeLayout";
import { DETAILER_UI_NODES, detailerUiLabel } from "./regional/detailerLoopUi";
import { bindDetailerV3Graph, detailerV3Catalog, prepareDetailerPlanV3, prepareDetailerPromptV3, prepareDetectorCollectorV3 } from "./regional/detailerV3Graph";
import { prepareLutV3 } from "./regional/lutV3Catalog";
import { enableRegistryFamily } from "./regional/registryDgFamilies";
import { installRegistryDgLifecycle } from "./regional/registryDgLifecycle";
import { openLutDownloadDialog } from "./regional/lutDownloadDialog";
import { openLutPlanDialog } from "./regional/lutPlanDialog";
import { openLutRegistryDialog } from "./regional/lutRegistryDialog";
import { installLutNodePresentation } from "./regional/lutNodePresentation";
import { installNodePresentationLifecycle } from "./regional/nodePresentationLifecycle";
import { upgradeRemoteLLMProvider } from "./remoteLLM";
import { prepareDgClipboard } from "./regional/dgRouting";
import { installProjectedClipboard } from "./regional/projectedPortInteraction";
import { compactLoraConsumerNode, hideLoraV3Widget, installLoraV3ConsumerSlot, installLoraV3Ui } from "./regional/loraV3Ui";
import { installNamedLoraInventorySource, LORA_V3_INVENTORY_CHANGED_EVENT } from "./regional/loraV3Inventory";
import LoraV3EditorWindow from "./regional/LoraV3EditorWindow";
import { installM0CanvasVisibility, requestM0DebugAnimation } from "./regional/m0VisualProjection";
import { publishInstanceDgProjection, clearInstanceDgProjection, tickInstanceDgProjection } from "./regional/instanceDgProjection";
import { migrateRegionalNode, migrationReportMessage, queueRegionalMigrationReport, regionalEditorDraft, REGIONAL_MIGRATION_EVENT, REGIONAL_VALIDATION_EVENT } from "./regional/milestoneE";
import { clearLegacyPortSticky, installLegacyPorts, legacyDebugVisible, LEGACY_DEBUG_COMMAND_ID, LEGACY_DEBUG_SETTING_ID, legacyPortDescriptors, legacyUsage, refreshLegacyPorts, setLegacyDebugVisible } from "./regional/legacyPorts";
import { applyReducedEffects, applyUiPreferences, applyUiSize, bindWindowSwitchModePersistence, getWindowSwitchMode, setWindowSwitchMode, UI_REDUCED_EFFECTS_SETTING_ID, UI_SIZE_SETTING_ID, UI_WINDOW_SWITCH_MODE_SETTING_ID } from "./ui/preferences";
import { bvWindowActivity, BvGlobalToastStack, collectScopedNodes, createOpenLastBvEditorAction, createScopedBvWindowOpen, dismissBvToast, setWindowMenuVisible, showBvToast, switchBvView, toggleToolbarWindowLauncher, ToolbarWindowLauncher, ToolbarLauncherColumn, windowMenuVisible, type BvWindowCandidate, type BvWindowType } from "./ui";
import { reconcileDeferredPublicInputs, setProjectedSlotLabel, suppressInitialProjectedProviderDefinitions } from "./regional/portProjection";
import { applyClassicNodePresentation, applyClassicSubgraphLayout, removeNodePresentation } from "./regional/classicNodePresentation";
import { installNodePreviewProjection } from "./regional/nodePreviewProjection";
import { configurePresentationSizeLifecycle } from "./regional/presentationSize";
import { installExecutionResultPreview } from "./regional/executionResultPreview";
import { hasNodePresentationPolicy } from "./regional/nodePresentation";
import { installLoraRegistryUi } from "./regional/loraRegistryUi";
import { ExportDialog } from "./export/ExportDialog";
import { installExporter } from "./export/install";
import { openExportDialog } from "./export/events";
import { emptyRegionalCanvasImageCatalog, ingestRegionalCanvasImagePublication, pruneRegionalCanvasImageCatalog } from "./regional/regionalCanvasImages";
import { currentRegionalCanvasPublication, regionalCanvasExecutionOutputs, regionalCanvasSourceIsCurrent, subscribeRegionalCanvasExecutions } from "./regional/regionalCanvasExecution";
(globalThis as any).__bvNodePresentationBridge=Object.assign((globalThis as any).__bvNodePresentationBridge??{}, {
    publishInstanceDgProjection, clearInstanceDgProjection, tickInstanceDgProjection,
    dgDebugVisible:legacyDebugVisible,
    applyClassic(node:any,nodeType:string){
        node.__bvPresentationManaged=true;
        return applyClassicNodePresentation(node,nodeType);
    },
    applyClassicSubgraph(node:any){return applyClassicSubgraphLayout(node)},
    remove(node:any){removeNodePresentation(node)},
});
const comfyApp = getApp();
const comfyApi = getApi();
const presentationResizeCanvases=(node:any)=>{
    const appCanvas=(comfyApp as any).canvas,host=globalThis as any;
    return[...(node?.graph?.list_of_graphcanvas??[]),appCanvas,appCanvas?.constructor?.active_canvas,host.LGraphCanvas?.active_canvas,host.LiteGraph?.LGraphCanvas?.active_canvas];
};
configurePresentationSizeLifecycle({
    isUserResizing:node=>presentationResizeCanvases(node).some(canvas=>canvas?.resizing_node===node),
});
bindCompletionSettingPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_SETTING_ID, value));
bindCompletionDatasetPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_DATASETS_SETTING_ID, value));
bindCompletionPlacementPersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(COMPLETION_PLACEMENT_SETTING_ID, value));
bindWindowSwitchModePersistence(value => (comfyApp as any).ui?.settings?.setSettingValue?.(UI_WINDOW_SWITCH_MODE_SETTING_ID, value));
import "./components/control/bv_control_center";

const OPEN_CONTROL_RACK_EVENT = "bv-open-control-rack";
const STYLE_ID = "bv-nodepack-styles";

const hideRegionalWidget = (widget: any) => {
    widget.type = "converted-widget";
    widget.hidden = true;
    widget.options ??= {};
    widget.options.hidden = true;
    widget.computeSize = () => [0, 0];
    widget.computeLayoutSize = () => ({ minWidth: 0, minHeight: 0, maxHeight: 0 });
    widget.y = 0;
    widget.last_y = 0;
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

const sourceRegionalDocument = (node: any) => resolveSourceRegionalDocument(node, regionalWorkflowRoot(node, (comfyApp as any).graph));

const detailerGraphOwner=(node:any)=>{const root=(comfyApp as any).canvas?.graph??(comfyApp as any).graph;return collectScopedNodes(root,candidate=>candidate===node)[0]?.graph??node?.graph??null};
const detectorCollectorsForPlan = (node: any) => {
    const root=(comfyApp as any).canvas?.graph??(comfyApp as any).graph,graph=detailerGraphOwner(node);bindDetailerV3Graph(node,graph);
    for(const entry of collectScopedNodes(root,candidate=>String(candidate?.comfyClass??candidate?.type)==="BV Detector Registry"))if(entry.graph===graph)bindDetailerV3Graph(entry.node,graph);
    return detailerV3Catalog(node);
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
    if(!node.__bvPresentationManaged){
        const compact=()=>compactNodeToComputedHeight(node);
        compact();setTimeout(compact,0);
    }
    node.setDirtyCanvas?.(true, true);
};

const labelDetailerUi = (node: any, nodeName: string) => {
    for (const input of node.inputs ?? []) setProjectedSlotLabel(input,detailerUiLabel(nodeName,String(input.name)));
    for (const output of node.outputs ?? []) setProjectedSlotLabel(output,detailerUiLabel(nodeName,String(output.name)));
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
    node.__bvPresentationManaged=true;
    prepareDetailerPlanV3(node,detailerGraphOwner(node));
    const hidden = node.widgets?.find((widget: any) => widget.name === "config_json");
    if (!hidden) return;
    hideRegionalWidget(hidden);
    let action = node.widgets?.find((widget: any) => widget.name === "configure_detailer_plan");
    if (!action) {
        action = node.addWidget("button", "configure_detailer_plan", null, () => {
            const scope=activeActivityScope();
            return createScopedBvWindowOpen({scope,type:"detailer",id:scopedNodeKey(node),node,currentScope:activeActivityScope,inventory:workflowInventoryForScope,canOpen:()=>Boolean(sourceRegionalDocument(node)),open:()=>{
                const document = sourceRegionalDocument(node);
                if (!document) return false;
                openDetailerPlanDialog(document.regions, detectorCollectorsForPlan(node), hidden.value, value => {
                    enableRegistryFamily(node,"detailer");
                    hidden.value = value;
                    prepareDetailerPlanV3(node,detailerGraphOwner(node));
                    refreshDetailerPlanNode(node);
                    node.graph?.setDirtyCanvas?.(true, true);
                }, `detailer-plan:${scopedNodeKey(node)}`, workflowNodesOfType("BV Regional Detailer Plan").filter(windowMenuVisible).map(item=>({id:scopedNodeKey(item),label:`${item.title||"BV Regional Detailer Plan"} · #${item.id}`})), (targetId,replaceCurrent)=>{
                    const target=workflowNodesOfType("BV Regional Detailer Plan").find(item=>scopedNodeKey(item)===targetId);
                    const targetAction=target?.widgets?.find((widget:any)=>widget.name==="configure_detailer_plan");
                    if(targetAction)switchBvView(`detailer-plan:${scopedNodeKey(node)}`,`detailer-plan:${scopedNodeKey(target)}`,()=>targetAction.callback?.(),replaceCurrent);
                },node);
                return true;
            }})();
        }, { serialize: false });
        action.serialize = false;
    }
    refreshDetailerPlanNode(node);
    applyClassicNodePresentation(node,"BV Regional Detailer Plan");
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
    markRegionalConsumer(node, () => refreshRegionSelector(node));
    refreshRegionSelector(node);
};

type RegionalNode = { id: number | string; type?: string; title?: string; widgets?: Array<{ name: string; value: unknown }>; graph?: { setDirtyCanvas?: (a: boolean, b: boolean) => void } };
const activeGraph=()=> (comfyApp as any).canvas?.graph??(comfyApp as any).graph;
const activeActivityScope=()=>activeWorkflowScope(comfyApp);
const workflowInventory=(root:any)=>collectScopedNodes(root,()=>true).map(entry=>entry.node);
const workflowInventoryForScope=(scope:object)=>activeActivityScope()===scope?workflowInventory(activeGraph()):[];
const activityFor=(scope:object=activeActivityScope())=>bvWindowActivity(scope);
const schedulePromptConsumers=(node:any,fallbackGraph:any=activeGraph())=>queueMicrotask(()=>scheduleRegionalConsumersRefresh(regionalWorkflowRoot(node,fallbackGraph)));
const workflowNodesOfType = (type:string): any[] => {
    const found:any[]=[];
    const visit=(candidate:any)=>{for(const node of candidate?._nodes??[]){if(node.type===type)found.push(node);if(node.subgraph)visit(node.subgraph)}};
    visit(activeGraph());return found;
};
const regionalNodes = (graph: any = activeGraph()): RegionalNode[] => {
    const found: RegionalNode[] = [];
    const visit = (candidate: any) => {
        for (const node of candidate?._nodes ?? []) {
            if (node.type === "BV Regional Prompt" || node.comfyClass === "BV Regional Prompt") found.push(node);
            const nested = node.subgraph ?? (() => { try { return node.getSubgraph?.(); } catch { return null; } })();
            if (nested) visit(nested);
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
const scopedNodeInfo=(node:any)=>collectScopedNodes(activeGraph(),candidate=>candidate===node)[0];
const scopedNodeKey=(node:any)=>scopedNodeInfo(node)?.key??String(node.id);
const nodeLauncherLabel = (node:any, fallback:string) => {const scoped=scopedNodeInfo(node);return{label:String(node.title||fallback),meta:`${scoped?.breadcrumb?`${scoped.breadcrumb} · `:""}#${node.id}`}};
const activateManagedLauncherNode = (root:any,scope:object,type:"detailer"|"detector", prefix:string, widgetName:string, node:any) => {
    const action=node.widgets?.find((widget:any)=>widget.name===widgetName);
    if(!action||action.disabled)return false;
    const targetId=scopedNodeKey(node),currentId=activityFor(scope).lastInstance(type),openTarget=()=>{if(activeActivityScope()!==scope||!workflowInventoryForScope(scope).includes(node)||action.disabled)return;action.callback?.();};
    if(currentId&&currentId!==targetId)switchBvView(`${prefix}:${currentId}`,`${prefix}:${targetId}`,openTarget,getWindowSwitchMode()==="replace");
    else openTarget();
    return true;
};
const rawOpenFullEditorNode=(root:any,scope:object,type:BvWindowType,node:any)=>{if(type==="regional")return requestRegionalWindow("regional",node);if(type==="lora")return requestRegionalWindow("lora",node);if(type==="detailer")return activateManagedLauncherNode(root,scope,"detailer","detailer-plan","configure_detailer_plan",node);if(type==="detector")return activateManagedLauncherNode(root,scope,"detector","detector-registry","configure_detector_registry",node);window.dispatchEvent(new CustomEvent("bv-open-smart-pipe-editor",{detail:{node,kind:type}}));return true;};
const fullEditorCandidate=(root:any,scope:object,type:BvWindowType,node:any):BvWindowCandidate=>{const managed=type==="detailer"||type==="detector",action=type==="detailer"?node.widgets?.find((widget:any)=>widget.name==="configure_detailer_plan"):type==="detector"?node.widgets?.find((widget:any)=>widget.name==="configure_detector_registry"):null;return{scope,type,id:scopedNodeKey(node),node,canOpen:()=>type==="regional"?canRequestRegionalWindow("regional"):type==="lora"?canRequestRegionalWindow("lora"):managed?Boolean(action)&&!action.disabled:true,open:()=>rawOpenFullEditorNode(root,scope,type,node)}};
const fullEditorCandidates=(scope:object)=>{if(activeActivityScope()!==scope)return[];const root=activeGraph();return[
    ...regionalNodes(root).map(node=>fullEditorCandidate(root,scope,"regional",node)),
    ...collectScopedNodes(root,node=>String(node?.type??node?.comfyClass)==="BV Regional LoRA").map(entry=>fullEditorCandidate(root,scope,"lora",entry.node)),
    ...collectScopedNodes(root,node=>String(node?.type??node?.comfyClass)==="BV Regional Detailer Plan").map(entry=>fullEditorCandidate(root,scope,"detailer",entry.node)),
    ...collectScopedNodes(root,node=>String(node?.type??node?.comfyClass)==="BV Detector Registry").map(entry=>fullEditorCandidate(root,scope,"detector",entry.node)),
    ...collectScopedNodes(root,node=>String(node?.type??node?.comfyClass)==="BV Smart Pipe").map(entry=>fullEditorCandidate(root,scope,"pipe",entry.node)),
    ...collectScopedNodes(root,node=>String(node?.type??node?.comfyClass)==="BV Smart Pipe Merge").map(entry=>fullEditorCandidate(root,scope,"merge",entry.node)),
].sort((left,right)=>(Number(left.node.id)||Number.MAX_SAFE_INTEGER)-(Number(right.node.id)||Number.MAX_SAFE_INTEGER));
};
const openScopedFullEditorNode=(type:BvWindowType,node:any)=>{const root=activeGraph(),scope=activeActivityScope();return createScopedBvWindowOpen({...fullEditorCandidate(root,scope,type,node),currentScope:activeActivityScope,inventory:workflowInventoryForScope})();};
const openScopedRegionalWindow=(type:"regional"|"quick"|"lora",node:any)=>{const scope=activeActivityScope();return createScopedBvWindowOpen({scope,type,id:scopedNodeKey(node),node,currentScope:activeActivityScope,inventory:workflowInventoryForScope,canOpen:()=>canRequestRegionalWindow(type),open:()=>requestRegionalWindow(type,node)})()};
const openLastFullBvEditorAction=createOpenLastBvEditorAction({currentScope:activeActivityScope,candidates:fullEditorCandidates,inventory:workflowInventoryForScope,warn:()=>showBvToast({title:"Previous editor unavailable",message:"Opened the first available BV editor instead.",tone:"warning",duration:4000})});
const namedLoraStacks = (): NamedLoraStack[] => {
    const graph = activeGraph(), found: NamedLoraStack[] = [];
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
const availableDocumentTargets = (graph: any = activeGraph()) => documentTargetChoices(regionalNodes(graph).flatMap(node => {
    try {
        const document = parseDocument(node.widgets?.find(widget => widget.name === "regional_json")?.value);
        return [{ documentId: document.document_id, nodeId: String(node.id), title: node.title || document.title || "BV Regional Prompt" }];
    } catch { return []; }
}));

const refreshImageTargetSelector = (node: any, initialize = false, graph: any = regionalWorkflowRoot(node, activeGraph())) => {
    const hidden = node.widgets?.find((widget: any) => widget.name === "document_id");
    const combo = node.widgets?.find((widget: any) => widget.name === "target_editor");
    if (!hidden || !combo) return;
    const choices = availableDocumentTargets(graph);
    const targetState = resolveDocumentTargetState(hidden.value, choices, Boolean(node.__bvDocumentTargetEverResolved), initialize);
    const selectedId = targetState.documentId;
    hidden.value = selectedId;
    node.__bvDocumentTargetEverResolved = targetState.everResolved;
    node.__bvDocumentTargets = choices;
    combo.options ??= {};
    const missingLabel = selectedId && !choices.some(choice => choice.documentId === selectedId) ? `Missing target · ${selectedId.slice(0, 8)}` : null;
    combo.options.values = missingLabel ? [missingLabel, ...choices.map(choice => choice.label)] : choices.length ? choices.map(choice => choice.label) : ["No BV Regional Prompt available"];
    combo.value = choices.find(choice => choice.documentId === selectedId)?.label ?? missingLabel ?? combo.options.values[0];
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
            if (label.startsWith("Missing target ·")) return;
            const choice = node.__bvDocumentTargets?.find((item: any) => item.label === label);
            if (choice) { hidden.value = choice.documentId; node.__bvDocumentTargetEverResolved = true; }
        }, { values: ["No BV Regional Prompt available"], serialize: false });
        combo.label = "target_editor";
        combo.serialize = false;
    }
    markRegionalConsumer(node, () => refreshImageTargetSelector(node, false, regionalWorkflowRoot(node, activeGraph())));
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
    const regionalNodeRef=useRef<RegionalNode|null>(null);
    const [nodes, setNodes] = useState<RegionalNode[]>([]);
    const [canvasCatalog,setCanvasCatalog]=useState(emptyRegionalCanvasImageCatalog);
    const [loraStacks, setLoraStacks] = useState<NamedLoraStack[]>([]);
    const [loraV3Node,setLoraV3Node]=useState<any|null>(null);
    const quickEditOpenRef=useRef(false);
    regionalNodeRef.current=regionalNode;
    quickEditOpenRef.current=quickEditOpen;
    const workflowOwnerRef=useRef<unknown>(activeWorkflowIdentity(comfyApp));
    const bindActiveWorkflow=()=>{const owner=activeWorkflowIdentity(comfyApp);workflowOwnerRef.current=owner;return owner;};
    const launcherColumns=useCallback((includeHidden=false):ToolbarLauncherColumn[]=>{
        const root=activeGraph(),scope=activeActivityScope(),activity=activityFor(scope),regional=regionalNodes(root),loras=workflowNodesOfType("BV Regional LoRA"),detailers=workflowNodesOfType("BV Regional Detailer Plan"),detectors=workflowNodesOfType("BV Detector Registry"),pipes=[...workflowNodesOfType("BV Smart Pipe"),...workflowNodesOfType("BV Smart Pipe Merge")];
        const decorate=(node:any,item:any)=>{const hidden=!windowMenuVisible(node);return hidden&&!includeHidden?null:{...item,hidden,onReveal:hidden?()=>setWindowMenuVisible(node,true):undefined}};
        const regionalItems=regional.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional Prompt"),last=activity.lastInstance("regional")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>openScopedFullEditorNode("regional",node),secondary:{label:`Quick edit ${copy.label}`,onSelect:()=>openScopedRegionalWindow("quick",node)}})}).filter(Boolean) as any[];
        return [
            {id:"regional",label:"Regional Prompts",items:regionalItems},
            {id:"lora",label:"Regional LoRA",items:loras.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional LoRA"),last=activity.lastInstance("lora")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>openScopedFullEditorNode("lora",node)})}).filter(Boolean) as any[]},
            {id:"detailer",label:"Detailer Plan",items:detailers.map(node=>{const copy=nodeLauncherLabel(node,"BV Regional Detailer Plan"),action=node.widgets?.find((widget:any)=>widget.name==="configure_detailer_plan"),last=activity.lastInstance("detailer")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,disabled:!action||action.disabled,meta:`${copy.meta}${action?.disabled?" · Connect Regional Prompt":last?" · Last active":""}`,onSelect:()=>openScopedFullEditorNode("detailer",node)})}).filter(Boolean) as any[]},
            {id:"detector",label:"Detector Registry",items:detectors.map(node=>{const copy=nodeLauncherLabel(node,"BV Detector Registry"),last=activity.lastInstance("detector")===scopedNodeKey(node);return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta}${last?" · Last active":""}`,onSelect:()=>openScopedFullEditorNode("detector",node)})}).filter(Boolean) as any[]},
            {id:"smart-pipe",label:"Smart Pipes",items:pipes.map(node=>{const kind=String(node.type??node.comfyClass)==="BV Smart Pipe Merge"?"merge":"pipe",copy=nodeLauncherLabel(node,kind==="merge"?"Smart Pipe Merge":"Smart Pipe");return decorate(node,{id:scopedNodeKey(node),...copy,meta:`${copy.meta} · ${kind==="merge"?"Merge":"Pipe"}`,onSelect:()=>openScopedFullEditorNode(kind,node)})}).filter(Boolean) as any[]},
        ];
    },[]);

    useEffect(() => {
        const open = () => setPortalOpen(true);
        window.addEventListener(OPEN_CONTROL_RACK_EVENT, open);
        return () => window.removeEventListener(OPEN_CONTROL_RACK_EVENT, open);
    }, []);
    useEffect(()=>watchActiveWorkflow(comfyApp,comfyApi,()=>window.setTimeout(resetBvRootForWorkflow,0),undefined,undefined,workflowOwnerRef.current),[]);
    useEffect(()=>subscribeRegionalWindow("lora",requested=>{const scope=activeActivityScope(),available=workflowNodesOfType("BV Regional LoRA"),node=available.find(candidate=>candidate===requested)??null;if(node){bindActiveWorkflow();activityFor(scope).remember("lora",scopedNodeKey(node));}setLoraV3Node(node)}),[]);
    useEffect(()=>{const update=(event:Event)=>setHasControlNodes(Boolean((event as CustomEvent).detail?.control));window.addEventListener("bv-toolbar-capabilities-changed",update);refreshBvToolbarCapabilities();return()=>window.removeEventListener("bv-toolbar-capabilities-changed",update)},[]);
    useEffect(()=>{const refresh=()=>refreshBvToolbarCapabilities();window.addEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh);return()=>window.removeEventListener(LORA_V3_INVENTORY_CHANGED_EVENT,refresh)},[]);
    useEffect(()=>{const report=(event:Event)=>{const reports=(event as CustomEvent).detail?.reports??[];if(!reports.length)return;const copy=migrationReportMessage(reports);showBvToast({...copy,id:"bv-regional-migration-report",duration:10000})};window.addEventListener(REGIONAL_MIGRATION_EVENT,report);return()=>window.removeEventListener(REGIONAL_MIGRATION_EVENT,report)},[]);
    useEffect(()=>{const validation=(event:Event)=>{const node=(event as CustomEvent).detail?.node,draft=node&&regionalEditorDraft(node),id=`bv-regional-validation:${scopedNodeKey(node)}`;if(!draft?.issues.length){dismissBvToast(id);return}const first=draft.issues[0];showBvToast({id,title:"Regional fallbacks are active",message:`${draft.issues.length} invalid field${draft.issues.length===1?"":"s"}. ${first.message}`,tone:"warning",duration:0,actionLabel:"Open field",onAction:()=>{requestRegionalWindow("regional",node);window.setTimeout(()=>{const field=document.querySelector<HTMLElement>(`[data-bv-regional-field="${CSS.escape(first.field)}"]`);field?.scrollIntoView({block:"center"});field?.querySelector<HTMLElement>("input,textarea,button")?.focus()},100)}})};window.addEventListener(REGIONAL_VALIDATION_EVENT,validation);return()=>window.removeEventListener(REGIONAL_VALIDATION_EVENT,validation)},[]);
    useEffect(()=>{const warned=new Set<unknown>(),queued=()=>{const owner=activeWorkflowIdentity(comfyApp);if(warned.has(owner))return;const affected=(comfyApp as any).graph?._nodes?.filter((item:any)=>legacyUsage(item).length)??[];if(!affected.length)return;warned.add(owner);const target=affected[0];showBvToast({id:"bv-regional-legacy-usage",title:"Legacy Regional wiring detected",message:`${affected.length} node${affected.length===1?"":"s"} still use deprecated Regional ports. Existing execution remains active; migrate the wiring manually.`,tone:"warning",duration:0,actionLabel:"Open migration target",onAction:()=>{if(String(target?.comfyClass??target?.type)==="BV Regional Prompt")requestRegionalWindow("regional",target);else{(comfyApp as any).canvas?.selectNode?.(target);(comfyApp as any).canvas?.centerOnNode?.(target)}}})};comfyApi.addEventListener("execution_start",queued);return()=>comfyApi.removeEventListener("execution_start",queued)},[]);

    useEffect(() => {
        const open = (requested: RegionalNode|null) => {
            bindActiveWorkflow();
            const root=activeGraph(),scope=activeActivityScope();
            const available = regionalNodes(root),activity=activityFor(scope);
            setLoraStacks(namedLoraStacks());
            setNodes(available);
            const target=available.find(node=>node===requested)??available.find(node=>scopedNodeKey(node)===activity.lastInstance("quick"))??available[0]??null;
            if(target)activity.remember("quick",scopedNodeKey(target));
            setRegionalNode(target);
            setRegionalOpen(false);
            setQuickEditOpen(true);
            setQuickEditActivation(value=>value+1);
        };
        return subscribeRegionalWindow("quick",open);
    }, []);

    useEffect(()=>subscribeRegionalCanvasExecutions(comfyApi,()=>activeWorkflowScope(comfyApp),(event,scope)=>{
        if(scope!==activeWorkflowScope(comfyApp))return;
        const ingest=(output:any,nodeId:unknown)=>{for(const raw of output?.bv_regional_canvas_images??[]){const publication=currentRegionalCanvasPublication(activeGraph(),raw,nodeId);if(publication)setCanvasCatalog(current=>ingestRegionalCanvasImagePublication(current,scope,publication,nodeId))}};
        for(const{nodeId,output}of regionalCanvasExecutionOutputs(event,(comfyApp as any).nodeOutputs))ingest(output,nodeId);
    }),[]);
    useEffect(()=>{
        const refresh=()=>{const scope=activeWorkflowScope(comfyApp),root=activeGraph();setCanvasCatalog(current=>pruneRegionalCanvasImageCatalog(current,scope,(sourceId,kind,documentId)=>regionalCanvasSourceIsCurrent(root,sourceId,kind,documentId)))};
        comfyApi.addEventListener("graphChanged",refresh);return()=>comfyApi.removeEventListener("graphChanged",refresh);
    },[]);

    useEffect(() => {
        const open = (requested: RegionalNode|null) => {
            try {
                bindActiveWorkflow();
                const root=activeGraph(),scope=activeActivityScope();
                const available = regionalNodes(root),activity=activityFor(scope);
                setLoraStacks(namedLoraStacks());
                setNodes(available);
                const target=available.find(node=>node===requested)??available.find(node=>scopedNodeKey(node)===activity.lastInstance("regional"))??available[0]??null;
                if(target)activity.remember("regional",scopedNodeKey(target));
                setRegionalNode(target);
                if(target&&quickEditOpenRef.current&&String(regionalNodeRef.current?.id)===String(target.id))setQuickEditOpen(false);
                setRegionalOpen(true);
                setRegionalActivation(value=>value+1);
            } catch (error) {
                showBvToast({title:"Regional editor failed to open",message:error instanceof Error?error.message:String(error),tone:"danger",duration:10000});
                throw error;
            }
        };
        return subscribeRegionalWindow("regional",open);
    }, []);

    return (<>
        <BvGlobalToastStack/>
        <ExportDialog app={comfyApp} api={comfyApi}/>
        <ToolbarWindowLauncher getColumns={launcherColumns}/>
        <SmartPipeEditorWindow/>
        <BVPortal open={portalOpen} hasControlNodes={hasControlNodes} onClose={() => setPortalOpen(false)} />
        <LoraV3EditorWindow open={Boolean(loraV3Node)} node={loraV3Node} onClose={()=>setLoraV3Node(null)}/>
        <RegionalEditor open={regionalOpen} activationToken={regionalActivation} activityScope={activeActivityScope()} nodes={nodes} initialNode={regionalNode} canvasCatalog={canvasCatalog} canvasApiUrl={path=>comfyApi.apiURL(path)} loraStacks={loraStacks} onClose={() => setRegionalOpen(false)} />
        <QuickPromptEditor open={quickEditOpen} activationToken={quickEditActivation} activityScope={activeActivityScope()} nodes={nodes} initialNode={regionalNode} loraStacks={loraStacks} onClose={() => setQuickEditOpen(false)} onOpenEditor={node => { activityFor().remember("regional",scopedNodeKey(node)); setRegionalNode(node); setQuickEditOpen(false); setRegionalOpen(true); setRegionalActivation(value=>value+1); }} />
    </>);
}

const MOUNT_ID = "bv-root";
let bvRootContainer:HTMLDivElement|null=null;
let bvReactRoot:ReturnType<typeof ReactDOM.createRoot>|null=null;

function renderBvRoot(){
    if(!bvRootContainer)return;
    bvReactRoot=ReactDOM.createRoot(bvRootContainer);
    bvReactRoot.render(<React.StrictMode><BVRoot /></React.StrictMode>);
}

function resetBvRootForWorkflow(){
    if(!bvRootContainer?.isConnected){ensureMountedOnce();return;}
    closeWorkflowBvViews();
    bvReactRoot?.unmount();
    bvReactRoot=null;
    renderBvRoot();
}

function ensureMountedOnce() {
    applyBvTheme();
    if (!document.getElementById(STYLE_ID)) {
        const style = document.createElement("style");
        style.id = STYLE_ID;
        style.textContent = `${flexLayoutStyles}\n${styles}`;
        document.head.appendChild(style);
    }
    let container = document.getElementById(MOUNT_ID) as HTMLDivElement|null;
    if (!container) {
        container=bvRootContainer??document.createElement("div");container.id=MOUNT_ID;
        document.body.appendChild(container);
    }
    bvRootContainer=container;
    if(!bvReactRoot)renderBvRoot();
}

new MutationObserver(()=>{if(!document.getElementById(MOUNT_ID))ensureMountedOnce()}).observe(document.body,{childList:true});

comfyApp.registerExtension({
    name: "bv_nodepack.control_rack_portal",
    setup() {
        ensureMountedOnce();
        installExporter(comfyApp,comfyApi);
        installM0CanvasVisibility((comfyApp as any).canvas);
        installProjectedClipboard((comfyApp as any).canvas,prepareDgClipboard);
        applyUiPreferences((comfyApp as any).ui?.settings);
        setLegacyDebugVisible(Boolean((comfyApp as any).ui?.settings?.getSettingValue?.(LEGACY_DEBUG_SETTING_ID, false)),(comfyApp as any).graph);
        installGlobalTextareaCompletion();
        installNodePreviewProjection();
        comfyApi.addEventListener("graphChanged", refreshBvToolbarCapabilities);
    },
});

comfyApp.registerExtension({
    name:"bv_nodepack.image_export",
    commands:[{id:"bv.export.open",label:"Export BV graph or UI image",icon:"icon-[lucide--image-down]",function:()=>{openExportDialog()}}],
    getCanvasMenuItems(){return [{content:"BV Node Pack",has_submenu:true,submenu:{options:[{content:"Export Graph Image…",callback:(_value:unknown,_options:unknown,event?:MouseEvent,menu?:any)=>{menu?.getTopMenu?.().close(event);(window as any).LiteGraph?.closeAllContextMenus?.(window);queueMicrotask(()=>openExportDialog())}}]}}]},
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
        id: LEGACY_DEBUG_SETTING_ID as any,
        name: "Enable BV Regional Legacy Debug Mode",
        type: "boolean",
        defaultValue: false,
        category: ["BV Node Pack", "Regional", "Legacy debug mode"],
        tooltip: "Reveal deprecated Regional ports, legacy nodes and hidden provider wiring for debugging.",
        onChange: (value: boolean) => {
            const canvas=(comfyApp as any).canvas;
            setLegacyDebugVisible(Boolean(value),canvas?.graph??(comfyApp as any).graph);
            if(value)requestM0DebugAnimation(canvas);
        },
    }, {
        id: "BV.Regional.LegacyDebugShortcutInfo" as any,
        name: "Legacy Debug Shortcut",
        type: (_name:string) => {
            const host=document.createElement("div");
            host.className="bv-legacy-shortcut-info";
            host.innerHTML="<kbd>Ctrl</kbd><span>+</span><kbd>Alt</kbd><span>+</span><kbd>B</kbd><small>Default shortcut · change it in ComfyUI Settings → Shortcuts</small>";
            return host;
        },
        defaultValue: "Ctrl+Alt+B",
        category: ["BV Node Pack", "Regional", "Legacy debug shortcut"],
        tooltip: "The effective binding is managed by ComfyUI's native Shortcuts menu.",
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
    keybindings: [{commandId:LEGACY_DEBUG_COMMAND_ID,combo:{key:"b",ctrl:true,alt:true}}],
    commands: [{
        id: "bv.regional.openEditor",
        label: "Open BV Regional Editor",
        icon: "icon-[lucide--layers]",
        function: () => { requestRegionalWindow("regional"); },
    }, {
        id: LEGACY_DEBUG_COMMAND_ID,
        label: "Toggle BV Regional Legacy wiring debug",
        icon: "icon-[lucide--workflow]",
        function: () => {
            const canvas=(comfyApp as any).canvas,active=!legacyDebugVisible();
            const settings=(comfyApp as any).ui?.settings;
            settings?.setSettingValue?.(LEGACY_DEBUG_SETTING_ID,active);
            if(!settings?.setSettingValue)setLegacyDebugVisible(active,canvas?.graph??(comfyApp as any).graph);
            showBvToast({id:"bv-regional-debug-wiring",title:`Regional wiring debug ${active?"enabled":"disabled"}`,message:active?"Legacy ports and hidden V3 provider links are visible for this UI session.":"Legacy ports and V3 provider links returned to their normal presentation.",tone:"info",duration:3500});
        },
    }],
    actionBarButtons: [{
        icon: "icon-[lucide--sliders-horizontal]",
        class: "bv-regional-action bv-regional-action-control",
        tooltip: "Open BV Control Center",
        onClick: () => window.dispatchEvent(new Event(OPEN_CONTROL_RACK_EVENT)),
    }, openLastFullBvEditorAction, {
        icon: "icon-[lucide--layers]",
        class: "bv-regional-action bv-regional-action-quick",
        tooltip: "Quick edit BV Regional prompts",
        onClick: () => requestRegionalWindow("quick"),
    }, {
        icon: "icon-[lucide--chevron-down]",
        class: "bv-regional-action bv-regional-action-menu",
        tooltip: "Choose BV window",
        onClick: (event?:MouseEvent) => toggleToolbarWindowLauncher(event?.currentTarget instanceof HTMLElement?event.currentTarget:undefined),
    }],
    beforeRegisterNodeDef(nodeType: any, nodeData: any) {
        installNodePresentationLifecycle(nodeType,nodeData);
        if(nodeData.name==="BV Inspect Any"){
            installExecutionResultPreview(nodeType,nodeData.name,{id:"bv-inspect-any",widgetName:"bv_inspect_any_preview",messageKey:"text",placeholder:"Run the workflow to inspect the value.",minHeight:140,maxHeight:420});
            return;
        }
        if(nodeData.name==="BV Regional Prompt")suppressInitialProjectedProviderDefinitions(nodeData,["canvas_image"]);
        if(nodeData.name==="BV LoRA Registry"){installLoraRegistryUi(nodeType,nodeData,comfyApi,detailerGraphOwner);return}
        const legacyDescriptors=legacyPortDescriptors(nodeData.name);
        if(legacyDescriptors.length){
            const created=nodeType.prototype.onNodeCreated,configured=nodeType.prototype.onConfigure,changed=nodeType.prototype.onConnectionsChange,deselected=nodeType.prototype.onDeselected,removed=nodeType.prototype.onRemoved;
            const prepare=(node:any)=>{installLegacyPorts(node,legacyDescriptors);if(hasNodePresentationPolicy(nodeData.name)){node.__bvPresentationManaged=true;applyClassicNodePresentation(node,nodeData.name)}};
            nodeType.prototype.onNodeCreated=function(){const result=created?.apply(this,arguments);queueMicrotask(()=>prepare(this));return result};
            nodeType.prototype.onConfigure=function(){const result=configured?.apply(this,arguments);queueMicrotask(()=>prepare(this));return result};
            nodeType.prototype.onConnectionsChange=function(){const result=changed?.apply(this,arguments);queueMicrotask(()=>refreshLegacyPorts(this));return result};
            nodeType.prototype.onDeselected=function(){const result=deselected?.apply(this,arguments);clearLegacyPortSticky(this);return result};
            nodeType.prototype.onRemoved=function(){removeNodePresentation(this);return removed?.apply(this,arguments)};
        }
        const installedLoraV3Ui = installLoraV3Ui(nodeType, nodeData, detailerGraphOwner);
        if (installedLoraV3Ui && nodeData.name !== "BV Regional Prompt") return;
        if(installLutNodePresentation(nodeType,nodeData,{api:comfyApi,graphOwner:detailerGraphOwner,scopedNodeKey,workflowNodesOfType,windowMenuVisible,switchView:switchBvView,sourceDocument:sourceRegionalDocument,detectorCollectors:detectorCollectorsForPlan,openRegistry:openLutRegistryDialog,openPlan:openLutPlanDialog,openDownload:openLutDownloadDialog}))return;
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
                node.__bvPresentationManaged=true;
                const hidden = node.widgets?.find((widget: any) => widget.name === "config_json");
                if (!hidden) return;
                hideRegionalWidget(hidden);
                const normalized = parseDetectorRegistryConfig(hidden.value), serialized = serializeDetectorRegistryConfig(normalized);
                if (String(hidden.value ?? "") !== serialized) { hidden.value = serialized; hidden.callback?.(serialized); }
                prepareDetectorCollectorV3(node,detailerGraphOwner(node));
                let action = node.widgets?.find((widget: any) => widget.name === "configure_detector_registry");
                if (!action) {
                    action = node.addWidget("button", "configure_detector_registry", null, () => {
                        const scope=activeActivityScope();
                        return createScopedBvWindowOpen({scope,type:"detector",id:scopedNodeKey(node),node,currentScope:activeActivityScope,inventory:workflowInventoryForScope,canOpen:()=>true,open:()=>{
                            openDetectorRegistryDialog(comfyApi, hidden.value, value => {
                                hidden.value = value;
                                prepare(node);
                                node.graph?.setDirtyCanvas?.(true, true);
                            }, `detector-registry:${scopedNodeKey(node)}`, workflowNodesOfType("BV Detector Registry").filter(windowMenuVisible).map(item=>({id:scopedNodeKey(item),label:`${item.title||"BV Detector Registry"} · #${item.id}`})), (targetId,replaceCurrent)=>{
                                const target=workflowNodesOfType("BV Detector Registry").find(item=>scopedNodeKey(item)===targetId);
                                const targetAction=target?.widgets?.find((widget:any)=>widget.name==="configure_detector_registry");
                                if(targetAction)switchBvView(`detector-registry:${scopedNodeKey(node)}`,`detector-registry:${scopedNodeKey(target)}`,()=>targetAction.callback?.(),replaceCurrent);
                            },node).catch(error => console.error(error));
                            return true;
                        }})();
                    }, { serialize: false });
                    action.serialize = false;
                }
                const count = normalized.detectors.length;
                action.label = `Configure Detector Registry · ${count} Detector${count === 1 ? "" : "s"}`;
                node.setDirtyCanvas?.(true, true);
            };
            const reconcile=(node:any)=>{prepare(node);syncDetectorExternalInputs(node);applyClassicNodePresentation(node,"BV Detector Registry")};
            const originalCreated = nodeType.prototype.onNodeCreated, originalConfigure = nodeType.prototype.onConfigure;
            const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onNodeCreated = function () { const result = originalCreated?.apply(this, arguments); queueMicrotask(() => reconcile(this)); return result; };
            nodeType.prototype.onConfigure = function () { const result = originalConfigure?.apply(this, arguments); queueMicrotask(() => reconcile(this)); return result; };
            nodeType.prototype.onConnectionsChange = function () { const result = originalConnectionsChange?.apply(this, arguments); queueMicrotask(() => {syncDetectorExternalInputs(this);applyClassicNodePresentation(this,"BV Detector Registry")}); return result; };
            return;
        }
        if (nodeData.name === "BV Regional Detailer Plan") {
            installRegistryDgLifecycle(nodeType,upgradeDetailerPlanNode,node=>{queueRegionalMigrationReport(migrateRegionalNode(node));upgradeDetailerPlanNode(node)});
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
                // BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Prototype widget order.
                // Remove after Remote LLM workflows saved before the final widget schema expire.
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
                node.__bvPresentationManaged=true;
                applyClassicNodePresentation(node,"BV Named LoRA Stack");
            };
            installNamedLoraInventorySource(nodeType,prepare);
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
        const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
        const originalDeselected = nodeType.prototype.onDeselected;
        nodeType.prototype.onNodeCreated = function () {
            const fallbackGraph=activeGraph();
            const result = original?.apply(this, arguments);
            this.__bvPresentationManaged=true;
            ensureUniqueDocument(this, true);
            const jsonWidget = this.widgets?.find((widget: any) => widget.name === "regional_json");
            installLoraV3ConsumerSlot(this);
            prepareDetailerPromptV3(this,detailerGraphOwner(this));
            prepareLutV3(this,detailerGraphOwner(this));
            reconcileDeferredPublicInputs(this,nodeData);
            if (jsonWidget) {
                if (!jsonWidget.__bvRegionalDocumentHooked) {
                    jsonWidget.__bvRegionalDocumentHooked = true;
                    const originalCallback = jsonWidget.callback;
                    const promptNode=this;
                    jsonWidget.callback = function () {
                        const callbackResult = originalCallback?.apply(this, arguments);
                        schedulePromptConsumers(promptNode);
                        return callbackResult;
                    };
                }
            }
            if (!this.widgets?.find((widget: any) => widget.name === "open_regional_editor")) {
                const button = this.addWidget("button", "open_regional_editor", null, () => openScopedRegionalWindow("regional",this), { serialize: false });
                button.label = "Open Regional Editor";
                button.serialize = false;
            }
            if (!this.widgets?.find((widget: any) => widget.name === "quick_edit_regional_prompts")) {
                const button = this.addWidget("button", "quick_edit_regional_prompts", null, () => openScopedRegionalWindow("quick",this), { serialize: false });
                button.label = "Quick Edit Prompts";
                button.serialize = false;
            }
            this.__bvRegionalPromptUiReady=true;
            applyClassicNodePresentation(this,"BV Regional Prompt");
            schedulePromptConsumers(this,fallbackGraph);
            return result;
        };
        nodeType.prototype.onConfigure = function () {
            const result = originalConfigure?.apply(this, arguments);
            this.__bvPresentationManaged=true;
            queueRegionalMigrationReport(migrateRegionalNode(this));
            ensureUniqueDocument(this, false);
            installLoraV3ConsumerSlot(this);
            prepareDetailerPromptV3(this,detailerGraphOwner(this));
            prepareLutV3(this,detailerGraphOwner(this));
            reconcileDeferredPublicInputs(this,nodeData);
            this.__bvRegionalPromptUiReady=true;
            applyClassicNodePresentation(this,"BV Regional Prompt");
            schedulePromptConsumers(this);
            return result;
        };
        nodeType.prototype.onConnectionsChange = function () { const result=originalConnectionsChange?.apply(this,arguments);queueMicrotask(()=>refreshLegacyPorts(this));return result; };
        nodeType.prototype.onDeselected = function () { const result=originalDeselected?.apply(this,arguments);clearLegacyPortSticky(this);return result; };
        const originalRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            const ownerGraph=regionalWorkflowRoot(this,activeGraph());
            removeNodePresentation(this);
            const result = originalRemoved?.apply(this, arguments);
            scheduleRegionalConsumersRefresh(ownerGraph);
            return result;
        };
    },
    afterConfigureGraph() {
        scheduleRegionalConsumersRefresh((comfyApp as any).graph);
        queueMicrotask(refreshBvToolbarCapabilities);
    },
});

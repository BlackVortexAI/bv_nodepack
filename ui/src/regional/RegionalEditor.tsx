import React, { useCallback, useEffect, useRef, useState } from "react";
import Artboard from "./Artboard";
import EditorMenus from "./EditorMenus";
import LayerPanel from "./LayerPanel";
import OptionsPanel from "./OptionsPanel";
import { BrushSettings, Tool } from "./ToolPalette";
import { Bounds, boundsOfLayer, Handle, hitTest, moveLayer, resizeLayer, setLayerBounds, simplifyPoints } from "./geometry";
import { brushAddLayerTarget, regionsInPriorityOrder, shouldAppendFinalBrushPoint, shouldStartSelectionMove, synchronizeRegionPriorities } from "./interaction";
import { automaticRegionColor, clone, Geometry, geometryAuthoring, geometryLayerId, geometryLayers, geometryMaskGroupId, newRegion, parseDocument, Point, preserveDocumentIdentity, RegionalDocument, Region, uuid } from "./model";
import { mergeSelectedLayers, remapMaskGroups, selectLayers, splitCompoundLayer } from "./layerOperations";
import { activeWindowGeometry, applyObservedWindowSize, clampWindowGeometry, defaultEditorState, EditorViewState, loadEditorState, observedWindowSize, saveEditorState } from "./editorState";
import { splitDisconnectedLayer } from "./disconnectedAreas";
import { bindingSummary, bindingWarnings, createRegionalEditorSnapshot, emptyLoraBindings, NamedLoraStack, parseLoraBindings, reconcileLoraBindings, RegionalEditorSnapshot, RegionalLoraBindings } from "./loraBindings";
import BvDockLayout from "../ui/dock";

type NodeRef = { id: number | string; title?: string; widgets?: Array<{ name: string; value: unknown; callback?: (value: unknown) => void }>; graph?: { setDirtyCanvas?: (a: boolean, b: boolean) => void } };
type Props = { open: boolean; nodes: NodeRef[]; initialNode: NodeRef | null; backgrounds: Record<string, string>; loraStacks: NamedLoraStack[]; onClose: () => void };
type Gesture =
    | { mode: "draw-box" | "draw-brush" | "draw-polygon"; start: Point; commit: "add" | "subtract" }
    | { mode: "move"; start: Point; startScreen: { x: number; y: number }; original: Geometry[]; started: boolean }
    | { mode: "resize"; start: Point; original: Geometry[]; handle: Handle };

const getWidget = (node: NodeRef | null) => node?.widgets?.find(widget => widget.name === "regional_json");
const getBindingsWidget = (node: NodeRef | null) => node?.widgets?.find(widget => widget.name === "lora_bindings_json");
const layerOperations = (region: Region | null, id: string | null) => region && id ? region.geometry.filter(geometry => geometryLayerId(geometry) === id) : [];
const syncPriorities = synchronizeRegionPriorities<Region>;
const pointFor = (event: React.PointerEvent<HTMLElement>, pressureMode: BrushSettings["pressureMode"]): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)), pressure: pressureMode === "stylus" && event.pointerType === "pen" ? Math.max(.01, event.pressure) : 1 };
};

function downloadJson(name: string, value: unknown) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}

function remapImportedRegions(regions: Region[]): Region[] {
    const regionIds = new Map(regions.map(region => [region.id, uuid()]));
    return clone(regions).map(region => {
        region.id = regionIds.get(region.id)!;
        region.parent_region_id = region.parent_region_id ? regionIds.get(region.parent_region_id) ?? null : null;
        remapMaskGroups(region.geometry, uuid);
        const layerIds = new Map<string, string>();
        region.geometry.forEach(geometry => { const old = geometryLayerId(geometry); if (!layerIds.has(old)) layerIds.set(old, uuid()); geometry.id = uuid(); geometry.layer_id = layerIds.get(old)!; });
        return region;
    });
}

export default function RegionalEditor({ open, nodes, initialNode, backgrounds, loraStacks, onClose }: Props) {
    const [node, setNode] = useState<NodeRef | null>(initialNode), [documentValue, setDocumentValue] = useState<RegionalDocument | null>(null);
    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null), [selectedLayerId, setSelectedLayerId] = useState<string | null>(null), [selectedLayerIds, setSelectedLayerIds] = useState<string[]>([]);
    const [selectionAnchorId, setSelectionAnchorId] = useState<string | null>(null);
    const [tool, setTool] = useState<Tool>("select"), [brush, setBrush] = useState<BrushSettings>({ size: .04, hardness: .75, opacity: 1, shape: "round", pressureMode: "constant" });
    const [displayOpacity, setDisplayOpacity] = useState(.5), [backgroundOpacity, setBackgroundOpacity] = useState(1), [isolate, setIsolate] = useState(false);
    const [history, setHistory] = useState<RegionalEditorSnapshot<RegionalDocument>[]>([]), [future, setFuture] = useState<RegionalEditorSnapshot<RegionalDocument>[]>([]);
    const [draft, setDraft] = useState<Geometry[] | null>(null), [cursor, setCursor] = useState<Point | null>(null), [error, setError] = useState("");
    const [viewState, setViewState] = useState<EditorViewState>(() => defaultEditorState());
    const [dockResetSignal, setDockResetSignal] = useState(0);
    const [loraBindings, setLoraBindings] = useState<RegionalLoraBindings>(() => emptyLoraBindings(""));
    const gesture = useRef<Gesture | null>(null), shell = useRef<HTMLDivElement>(null);
    const updateArtboardView = useCallback((artboard: EditorViewState["artboard"]) => setViewState(current => {
        const previous = current.artboard;
        return previous.zoom === artboard.zoom && previous.panX === artboard.panX && previous.panY === artboard.panY && previous.fit === artboard.fit ? current : { ...current, artboard };
    }), []);
    const updateOpenMenu = useCallback((openMenu: EditorViewState["openMenu"]) => setViewState(current => current.openMenu === openMenu ? current : { ...current, openMenu }), []);

    useEffect(() => { if (initialNode) setNode(initialNode); else if (!node && nodes[0]) setNode(nodes[0]); }, [initialNode, node, nodes]);
    useEffect(() => {
        if (!open || !node) return;
        try {
            const next = parseDocument(getWidget(node)?.value); next.regions = regionsInPriorityOrder(next.regions); syncPriorities(next.regions);
            const parsedBindings = parseLoraBindings(getBindingsWidget(node)?.value, next.document_id);
            const nextBindings = reconcileLoraBindings(parsedBindings, new Set(next.regions.map(region => region.id)));
            const bindingsWidget = getBindingsWidget(node);
            if (bindingsWidget && JSON.stringify(parsedBindings) !== JSON.stringify(nextBindings)) {
                bindingsWidget.value = JSON.stringify(nextBindings);
                bindingsWidget.callback?.(bindingsWidget.value);
                node.graph?.setDirtyCanvas?.(true, true);
            }
            const stored = loadEditorState(next.document_id), regionId = next.regions.some(region => region.id === stored.selectedRegionId) ? stored.selectedRegionId : next.regions[0]?.id ?? null;
            const region = next.regions.find(item => item.id === regionId), layerId = region && geometryLayers(region).some(layer => layer.id === stored.selectedLayerId) ? stored.selectedLayerId : null;
            setViewState(stored); setDocumentValue(next); setLoraBindings(nextBindings); setSelectedRegionId(regionId); setSelectedLayerId(layerId); setSelectedLayerIds(layerId ? [layerId] : []); setSelectionAnchorId(layerId); setTool(stored.tool); setBrush(stored.brush); setDisplayOpacity(stored.displayOpacity); setBackgroundOpacity(stored.backgroundOpacity); setIsolate(stored.isolate && !!layerId); setHistory([]); setFuture([]); setError("");
        }
        catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    }, [node, open]);

    useEffect(() => {
        if (!documentValue) return;
        saveEditorState(documentValue.document_id, { ...viewState, selectedRegionId, selectedLayerId, displayOpacity, backgroundOpacity, isolate, tool, brush });
    }, [backgroundOpacity, brush, displayOpacity, documentValue, isolate, selectedLayerId, selectedRegionId, tool, viewState]);

    useEffect(() => {
        if (!open || !shell.current || viewState.mode !== "floating") return;
        const observedMode = viewState.mode;
        const observer = new ResizeObserver(entries => {
            const size = observedWindowSize(entries[0]);
            setViewState(current => {
                const active = current.windows[observedMode];
                if (Math.abs(active.width - size.width) < 1 && Math.abs(active.height - size.height) < 1) return current;
                return applyObservedWindowSize(current, observedMode, size);
            });
        });
        observer.observe(shell.current); return () => observer.disconnect();
    }, [open, viewState.mode]);

    useEffect(() => {
        if (!open) return;
        const resize = () => setViewState(current => ({ ...current, windows: {
            workspace: clampWindowGeometry(current.windows.workspace, { width: window.innerWidth, height: window.innerHeight }, "workspace"),
            floating: clampWindowGeometry(current.windows.floating, { width: window.innerWidth, height: window.innerHeight }, "floating"),
        } }));
        window.addEventListener("resize", resize); return () => window.removeEventListener("resize", resize);
    }, [open]);

    const selectedRegion = documentValue?.regions.find(region => region.id === selectedRegionId) ?? null;
    const selectedOperations = layerOperations(selectedRegion, selectedLayerId);
    const selectedLayer = selectedRegion && selectedLayerId ? geometryLayers(selectedRegion).find(layer => layer.id === selectedLayerId) ?? null : null;
    const selectedLayers = selectedRegion ? geometryLayers(selectedRegion).filter(layer => selectedLayerIds.includes(layer.id)) : [];
    const canMergeLayers = selectedLayers.length > 1 && selectedLayers.every(layer => !layer.authoring.locked);
    const canSplitCompoundLayer = !!selectedLayer && !selectedLayer.authoring.locked && new Set(selectedLayer.geometries.map(geometryMaskGroupId)).size > 1;
    const canSplitDisconnectedAreas = !!selectedLayer && !selectedLayer.authoring.locked;
    const replaceLayerSelection = (id: string | null) => { setSelectedLayerId(id); setSelectedLayerIds(id ? [id] : []); setSelectionAnchorId(id); };
    const selectLayer = (id: string, modifier: "replace" | "toggle" | "range") => {
        if (!selectedRegion) return;
        const visibleOrder = [...geometryLayers(selectedRegion)].reverse().map(layer => layer.id);
        const next = selectLayers({ ids: selectedLayerIds, primary: selectedLayerId, anchor: selectionAnchorId }, id, visibleOrder, modifier);
        setSelectedLayerIds(next.ids); setSelectedLayerId(next.primary); setSelectionAnchorId(next.anchor); setIsolate(false);
    };
    const activeOperations = draft && selectedLayerId && draft.every(item => geometryLayerId(item) === selectedLayerId)
        ? gesture.current && "commit" in gesture.current && gesture.current.commit === "subtract" ? [...selectedOperations, ...draft] : draft
        : selectedOperations;
    const selectionBounds = activeOperations.length && documentValue ? boundsOfLayer(activeOperations, documentValue.canvas) : null;

    const persist = useCallback((next: RegionalDocument, record = true, bindings = loraBindings) => {
        if (!node) return;
        if (record && documentValue) { setHistory(items => [...items.slice(-99), createRegionalEditorSnapshot(documentValue, loraBindings)]); setFuture([]); }
        const nextBindings = reconcileLoraBindings(bindings, new Set(next.regions.map(region => region.id)));
        setDocumentValue(next); const widget = getWidget(node);
        if (widget) { widget.value = JSON.stringify(next); widget.callback?.(widget.value); }
        setLoraBindings(nextBindings); const bindingsWidget = getBindingsWidget(node);
        if (bindingsWidget) { bindingsWidget.value = JSON.stringify(nextBindings); bindingsWidget.callback?.(bindingsWidget.value); }
        node.graph?.setDirtyCanvas?.(true, true);
    }, [documentValue, loraBindings, node]);
    const mutate = useCallback((fn: (value: RegionalDocument) => void, record = true) => { if (!documentValue) return; const next = clone(documentValue); fn(next); persist(next, record); }, [documentValue, persist]);
    const persistLoraBindings = useCallback((next: RegionalLoraBindings) => {
        if (!node) return;
        const reconciled = documentValue ? reconcileLoraBindings(next, new Set(documentValue.regions.map(region => region.id))) : next;
        setLoraBindings(reconciled);
        const widget = getBindingsWidget(node);
        if (widget) { widget.value = JSON.stringify(reconciled); widget.callback?.(widget.value); }
        node.graph?.setDirtyCanvas?.(true, true);
    }, [documentValue, node]);
    const setGlobalLoraStack = (stackId: string | null) => persistLoraBindings({ ...loraBindings, global_stack_id: stackId });
    const setRegionLoraStack = (regionId: string, stackId: string | null) => {
        const regions = { ...loraBindings.regions };
        if (stackId) regions[regionId] = stackId; else delete regions[regionId];
        persistLoraBindings({ ...loraBindings, regions });
    };
    const updateRegion = (fn: (region: Region) => void) => mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) fn(region); });
    const updateLayer = (id: string, fn: (geometries: Geometry[], region: Region) => void) => mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) fn(layerOperations(region, id), region); });
    const cancelGesture = useCallback(() => { gesture.current = null; setDraft(null); }, []);
    const finalizePolygon = useCallback(() => {
        if (gesture.current?.mode !== "draw-polygon" || !draft?.length) return;
        const final = draft.map(item => item.type === "polygon" ? { ...item, points: item.points.filter((point, index, points) => index === 0 || Math.hypot(point.x - points[index - 1].x, point.y - points[index - 1].y) > .001) } : item);
        if (final.some(item => item.type !== "polygon" || item.points.length < 3)) return cancelGesture();
        mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) region.geometry.push(...final); });
        cancelGesture();
    }, [cancelGesture, draft, mutate, selectedRegionId]);
    const undo = useCallback(() => { if (!documentValue || !history.length) return; const previous = history[history.length - 1]; setHistory(history.slice(0, -1)); setFuture([createRegionalEditorSnapshot(documentValue, loraBindings), ...future]); persist(clone(previous.document), false, clone(previous.loraBindings)); }, [documentValue, future, history, loraBindings, persist]);
    const redo = useCallback(() => { if (!documentValue || !future.length) return; const next = future[0]; setFuture(future.slice(1)); setHistory([...history, createRegionalEditorSnapshot(documentValue, loraBindings)]); persist(clone(next.document), false, clone(next.loraBindings)); }, [documentValue, future, history, loraBindings, persist]);

    const deleteLayer = (id: string) => { updateLayer(id, (_operations, region) => { region.geometry = region.geometry.filter(item => geometryLayerId(item) !== id); }); if (selectedLayerIds.includes(id)) replaceLayerSelection(null); };
    const mergeLayers = () => {
        if (!selectedRegionId || !selectedLayerId || !canMergeLayers) return;
        const targetId = selectedLayerId;
        mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) mergeSelectedLayers(region, selectedLayerIds, targetId); });
        replaceLayerSelection(targetId);
    };
    const splitLayer = () => {
        if (!selectedRegionId || !selectedLayerId || !canSplitCompoundLayer) return;
        let nextIds: string[] = [];
        mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) nextIds = splitCompoundLayer(region, selectedLayerId, uuid); });
        if (nextIds.length) { setSelectedLayerIds(nextIds); setSelectedLayerId(nextIds[0]); setSelectionAnchorId(nextIds[0]); }
    };
    const splitDisconnected = async () => {
        if (!documentValue || !selectedRegionId || !selectedLayerId || !selectedLayer || !canSplitDisconnectedAreas) return;
        try {
            const replacements = await splitDisconnectedLayer(selectedLayer.geometries, documentValue.canvas, uuid);
            if (replacements.length < 2) { alert("The selected layer contains fewer than two disconnected visible areas."); return; }
            mutate(value => {
                const region = value.regions.find(item => item.id === selectedRegionId); if (!region) return;
                const insertionIndex = region.geometry.findIndex(item => geometryLayerId(item) === selectedLayerId);
                region.geometry = region.geometry.filter(item => geometryLayerId(item) !== selectedLayerId);
                region.geometry.splice(Math.max(0, insertionIndex), 0, ...replacements);
            });
            const ids = replacements.map(item => geometryLayerId(item)); setSelectedLayerIds(ids); setSelectedLayerId(ids[0]); setSelectionAnchorId(ids[0]);
        } catch (reason) { alert(`Split failed: ${reason}`); }
    };
    const beginPanelResize = (side: "left" | "right", event: React.PointerEvent) => {
        event.preventDefault(); const start = event.clientX, original = viewState.panels[side];
        const move = (pointer: PointerEvent) => setViewState(current => ({ ...current, panels: { ...current.panels, [side]: Math.max(210, Math.min(620, original + (pointer.clientX - start) * (side === "left" ? 1 : -1))) } }));
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    const beginWindowDrag = (event: React.PointerEvent) => {
        if (viewState.mode !== "floating" || event.button !== 0) return;
        if ((event.target as Element).closest("button, select, input, textarea, .editor-menus")) return;
        event.preventDefault(); const startX = event.clientX, startY = event.clientY, original = viewState.windows.floating;
        const move = (pointer: PointerEvent) => setViewState(current => ({ ...current, windows: { ...current.windows, floating: clampWindowGeometry({ ...current.windows.floating, x: original.x + pointer.clientX - startX, y: original.y + pointer.clientY - startY }, { width: window.innerWidth, height: window.innerHeight }, "floating") } }));
        const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
        window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    };
    useEffect(() => {
        if (!open) return;
        const key = (event: KeyboardEvent) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); cancelGesture(); return; }
            if (event.key === "Enter" && gesture.current?.mode === "draw-polygon") { event.preventDefault(); event.stopImmediatePropagation(); finalizePolygon(); return; }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && event.shiftKey && canSplitCompoundLayer) { event.preventDefault(); event.stopImmediatePropagation(); splitLayer(); return; }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e" && canMergeLayers) { event.preventDefault(); event.stopImmediatePropagation(); mergeLayers(); return; }
            if ((event.key === "Delete" || event.key === "Backspace") && selectedLayerId && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); event.stopImmediatePropagation(); deleteLayer(selectedLayerId); return; }
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
            event.preventDefault(); event.stopImmediatePropagation(); event.shiftKey ? redo() : undo();
        };
        window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
    }, [cancelGesture, canMergeLayers, canSplitCompoundLayer, deleteLayer, finalizePolygon, open, redo, selectedLayerId, selectedLayerIds, undo]);

    const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue || !selectedRegion || selectedRegion.authoring.locked) return;
        const point = pointFor(event, brush.pressureMode);
        const handle = (event.target as Element).closest?.("[data-handle]")?.getAttribute("data-handle") as Handle | null;
        if (tool === "select") {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft(null);
            if (handle && selectedLayer && !selectedLayer.authoring.locked) { gesture.current = { mode: "resize", start: point, original: clone(selectedOperations), handle }; return; }
            const hit = [...geometryLayers(selectedRegion)].reverse().find(layer => layer.enabled && layer.authoring.visible && layer.geometries.filter(item => item.operation === "add").some(item => hitTest(item, point, documentValue.canvas)));
            replaceLayerSelection(hit?.id ?? null);
            if (hit && !hit.authoring.locked) gesture.current = { mode: "move", start: point, startScreen: { x: event.clientX, y: event.clientY }, original: clone(hit.geometries), started: false };
            return;
        }
        const subtract = tool.endsWith("subtract");
        if (subtract && (!selectedLayerId || selectedLayer?.authoring.locked)) return;
        if (tool.startsWith("polygon") && gesture.current?.mode === "draw-polygon") { setDraft(current => current?.map(item => item.type === "polygon" ? { ...item, points: [...item.points, point] } : item) ?? null); return; }
        const id = uuid(), reusableBrushLayerId = tool === "brush-add" ? brushAddLayerTarget(selectedLayer) : null;
        const layerId = subtract ? selectedLayerId! : reusableBrushLayerId ?? id;
        const shapeName = tool.startsWith("rect") ? "Rectangle" : tool.startsWith("ellipse") ? "Ellipse" : tool.startsWith("polygon") ? "Polygon" : "Brush";
        const authoring = subtract || reusableBrushLayerId ? selectedLayer?.authoring : { name: `${shapeName} ${geometryLayers(selectedRegion).length + 1}`, visible: true, locked: false };
        const maskGroups = subtract ? [...new Set(selectedOperations.map(geometryMaskGroupId))] : [undefined];
        if (tool.startsWith("rect") || tool.startsWith("ellipse")) {
            event.currentTarget.setPointerCapture(event.pointerId);
            const type = tool.startsWith("rect") ? "rect" : "ellipse";
            setDraft(maskGroups.map((maskGroupId, index) => ({ id: index ? uuid() : id, layer_id: layerId, mask_group_id: maskGroupId, type, operation: subtract ? "subtract" : "add", enabled: true, authoring, x: point.x, y: point.y, width: .001, height: .001 })));
            gesture.current = { mode: "draw-box", start: point, commit: subtract ? "subtract" : "add" }; if (!subtract) replaceLayerSelection(layerId);
        } else if (tool.startsWith("polygon")) {
            setDraft(maskGroups.map((maskGroupId, index) => ({ id: index ? uuid() : id, layer_id: layerId, mask_group_id: maskGroupId, type: "polygon", operation: subtract ? "subtract" : "add", enabled: true, authoring, points: [point] })));
            gesture.current = { mode: "draw-polygon", start: point, commit: subtract ? "subtract" : "add" }; if (!subtract) replaceLayerSelection(layerId);
        } else {
            event.currentTarget.setPointerCapture(event.pointerId);
            setDraft(maskGroups.map((maskGroupId, index) => ({ id: index ? uuid() : id, layer_id: layerId, mask_group_id: maskGroupId, type: "brush_stroke", operation: tool === "brush-add" ? "add" : "subtract", enabled: true, authoring, size: brush.size, hardness: brush.hardness, opacity: brush.opacity, shape: brush.shape, pressure_mode: brush.pressureMode, points: [point] })));
            gesture.current = { mode: "draw-brush", start: point, commit: tool === "brush-add" ? "add" : "subtract" }; if (tool === "brush-add") replaceLayerSelection(layerId);
        }
    };
    const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue) return; const point = pointFor(event, brush.pressureMode); setCursor(point); const active = gesture.current; if (!active) return;
        if (active.mode === "draw-box" && (draft?.[0]?.type === "rect" || draft?.[0]?.type === "ellipse")) setDraft(draft.map(geometry => geometry.type === "rect" || geometry.type === "ellipse" ? { ...geometry, x: Math.min(active.start.x, point.x), y: Math.min(active.start.y, point.y), width: Math.max(.001, Math.abs(point.x - active.start.x)), height: Math.max(.001, Math.abs(point.y - active.start.y)) } : geometry));
        else if (active.mode === "draw-brush" && draft?.[0]?.type === "brush_stroke") setDraft(draft.map(item => item.type === "brush_stroke" ? { ...item, points: [...item.points, point] } : item));
        else if (active.mode === "move") { if (!active.started && !shouldStartSelectionMove(active.startScreen, { x: event.clientX, y: event.clientY })) return; active.started = true; setDraft(moveLayer(active.original, point.x - active.start.x, point.y - active.start.y, documentValue.canvas)); }
        else if (active.mode === "resize") setDraft(resizeLayer(active.original, active.handle, point.x - active.start.x, point.y - active.start.y, event.shiftKey, documentValue.canvas));
    };
    const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue || !gesture.current || !draft) return cancelGesture();
        const active = gesture.current, finalPoint = pointFor(event, brush.pressureMode);
        if (active.mode === "draw-polygon") return;
        let final = shouldAppendFinalBrushPoint(active.mode) ? draft.map(item => item.type === "brush_stroke" ? { ...item, points: simplifyPoints([...item.points, finalPoint]) } : item) : draft;
        if (active.mode === "draw-box" && (final[0].type === "rect" || final[0].type === "ellipse") && (final[0].width <= .002 || final[0].height <= .002)) return cancelGesture();
        mutate(value => {
            const region = value.regions.find(item => item.id === selectedRegionId); if (!region) return;
            if (active.mode.startsWith("draw")) region.geometry.push(...final);
            else { const replacements = new Map(final.map(item => [item.id, item])); region.geometry = region.geometry.map(item => replacements.get(item.id) ?? item); }
        });
        cancelGesture();
    };
    const doubleClick = (event: React.MouseEvent<HTMLDivElement>) => { if (gesture.current?.mode === "draw-polygon") { event.preventDefault(); finalizePolygon(); } };

    const moveRegion = (id: string, direction: -1 | 1) => mutate(value => { const index = value.regions.findIndex(region => region.id === id), target = index + direction; if (target < 0 || target >= value.regions.length) return; [value.regions[index], value.regions[target]] = [value.regions[target], value.regions[index]]; syncPriorities(value.regions); });
    const moveLayerOrder = (id: string, direction: -1 | 1) => updateLayer(id, (_items, region) => { const layers = geometryLayers(region), index = layers.findIndex(layer => layer.id === id), target = index + direction; if (target < 0 || target >= layers.length) return; [layers[index], layers[target]] = [layers[target], layers[index]]; region.geometry = layers.flatMap(layer => layer.geometries); });
    const toggleLayer = (id: string, field: "enabled" | "visible" | "locked") => updateLayer(id, operations => { if (!operations.length) return; if (field === "enabled") { const target = !operations.some(item => item.enabled !== false); operations.forEach(item => { item.enabled = target; }); } else { const target = !geometryAuthoring(operations[0])[field]; operations.forEach(item => { item.authoring = { ...geometryAuthoring(item), [field]: target }; }); } });
    const duplicateLayer = (id: string) => updateLayer(id, (operations, region) => { const layerId = uuid(), copies = moveLayer(clone(operations), .02, .02, documentValue!.canvas); remapMaskGroups(copies, uuid); copies.forEach((item, index) => { item.id = uuid(); item.layer_id = layerId; item.authoring = { ...geometryAuthoring(item), name: `${geometryAuthoring(item).name} Copy`, visible: true, locked: false }; if (index) item.authoring = copies[0].authoring; }); region.geometry.push(...copies); replaceLayerSelection(layerId); });
    const deleteRegion = (id: string) => { const region = documentValue?.regions.find(item => item.id === id); if (!region || !window.confirm(`Delete region “${region.name}” with ${geometryLayers(region).length} layer(s)?`)) return; mutate(value => { value.regions = value.regions.filter(item => item.id !== id); value.regions.forEach(item => { if (item.parent_region_id === id) item.parent_region_id = null; }); syncPriorities(value.regions); }); setSelectedRegionId(documentValue?.regions.find(item => item.id !== id)?.id ?? null); replaceLayerSelection(null); };

    const importDocument = async (file: File) => { try { if (!documentValue) return; const imported = preserveDocumentIdentity(parseDocument(await file.text()), documentValue.document_id); imported.regions = regionsInPriorityOrder(imported.regions); syncPriorities(imported.regions); persist(imported); setSelectedRegionId(imported.regions[0]?.id ?? null); replaceLayerSelection(null); } catch (reason) { alert(`Import failed: ${reason}`); } };
    const importRegions = async (file: File) => { try { const data = JSON.parse(await file.text()); if (data?.schema !== "bv.regions" || ![1, 2].includes(data?.version) || !Array.isArray(data.regions)) throw new Error("Not a BV Regions v1/v2 export"); const regions = data.version === 1 ? data.regions.map((region: Region) => ({ ...region, usage: "generation" as const })) : data.regions; mutate(value => { value.regions.push(...remapImportedRegions(regions)); syncPriorities(value.regions); }); } catch (reason) { alert(`Import failed: ${reason}`); } };

    if (!open) return null;
    const windowGeometry = activeWindowGeometry(viewState, { width: window.innerWidth, height: window.innerHeight });
    const loraWarnings = documentValue ? bindingWarnings(loraBindings, loraStacks, new Set(documentValue.regions.map(region => region.id))) : [];
    const loraSummary = documentValue ? bindingSummary(loraBindings, loraStacks, Object.fromEntries(documentValue.regions.map(region => [region.id, region.name]))) : "";
    return <div ref={shell} className={`bv-regional-shell ${viewState.mode}`} role="dialog" aria-modal={viewState.mode === "workspace"} style={{ inset: "auto", left: windowGeometry.x, top: windowGeometry.y, width: windowGeometry.width, height: windowGeometry.height }} onKeyDown={event => event.stopPropagation()}>
        <header onPointerDown={beginWindowDrag}><EditorMenus openMenu={viewState.openMenu} onOpenMenu={updateOpenMenu} displayOpacity={displayOpacity} backgroundOpacity={backgroundOpacity} isolate={isolate} binaryMaskPreview={viewState.binaryMaskPreview} hasSelection={!!selectedLayerId} onDisplayOpacity={setDisplayOpacity} onBackgroundOpacity={setBackgroundOpacity} onToggleIsolate={() => setIsolate(value => !value)} onToggleBinaryMaskPreview={() => { cancelGesture(); setViewState(current => ({ ...current, binaryMaskPreview: !current.binaryMaskPreview })); }} onExportDocument={() => documentValue && downloadJson(`${documentValue.title || "bv-regional"}.json`, documentValue)} onExportRegions={() => documentValue && downloadJson(`${documentValue.title || "bv-regions"}.regions.json`, { schema: "bv.regions", version: 2, canvas: documentValue.canvas, regions: documentValue.regions })} onImportDocument={importDocument} onImportRegions={importRegions} onUndo={undo} onRedo={redo} canUndo={!!history.length} canRedo={!!future.length} canMergeLayers={canMergeLayers} onMergeLayers={mergeLayers} canSplitCompoundLayer={canSplitCompoundLayer} onSplitCompoundLayer={splitLayer} canSplitDisconnectedAreas={canSplitDisconnectedAreas} onSplitDisconnectedAreas={splitDisconnected} canvas={documentValue?.canvas ?? { width: 1024, height: 1024 }} onCanvas={canvas => mutate(value => { value.canvas = canvas; })}/><div className="window-drag-handle"><span aria-hidden="true">⠿</span><strong>BV Regional Editor</strong></div><select value={node?.id ?? ""} onChange={event => setNode(nodes.find(item => String(item.id) === event.target.value) ?? null)}>{nodes.map(item => <option key={item.id} value={String(item.id)}>{`${item.title || "BV Regional Prompt"} · #${item.id}`}</option>)}</select><button className="window-mode-button" title={viewState.mode === "workspace" ? "Switch to floating window" : "Switch to workspace view"} onClick={() => setViewState(current => ({ ...current, mode: current.mode === "workspace" ? "floating" : "workspace" }))}>{viewState.mode === "workspace" ? "Float" : "Workspace"}</button><button title="Close" onClick={onClose}>×</button></header>
        {error ? <div className="bv-regional-error">{error}</div> : documentValue && <>
            <main className="bv-regional-dock-host">
              <BvDockLayout storageId={`regional-editor:${documentValue.document_id}`} resetSignal={dockResetSignal} panels={[
                { id:"regions", title:"Regions", weight:22, minWidth:220, content:
                <LayerPanel regions={documentValue.regions} selectedRegionId={selectedRegionId} selectedLayerId={selectedLayerId} selectedLayerIds={selectedLayerIds} isolate={isolate} onSelectRegion={id => { setSelectedRegionId(id); replaceLayerSelection(null); setIsolate(false); }} onSelectLayer={selectLayer} onAddRegion={() => mutate(value => { const region = newRegion(value.regions.length); value.regions.unshift(region); syncPriorities(value.regions); setSelectedRegionId(region.id); replaceLayerSelection(null); })} onRenameRegion={(id, name) => mutate(value => { value.regions.find(region => region.id === id)!.name = name; })} onRenameLayer={(id, name) => updateLayer(id, operations => operations.forEach(item => { item.authoring = { ...geometryAuthoring(item), name }; }))} onToggleRegion={(id, field) => mutate(value => { const region = value.regions.find(item => item.id === id)!; if (field === "enabled") region.enabled = !region.enabled; else region.authoring.locked = !region.authoring.locked; })} onToggleLayer={toggleLayer} onMoveRegion={moveRegion} onMoveLayer={moveLayerOrder} onDeleteRegion={deleteRegion} onDeleteLayer={deleteLayer} onDuplicateLayer={duplicateLayer} onToggleIsolate={() => setIsolate(value => !value)}/>
                }, { id:"canvas", title:"Canvas", weight:54, minWidth:320, content:
                <Artboard key={documentValue.document_id} document={documentValue} background={backgrounds[documentValue.document_id]} selectedRegionId={selectedRegionId} selectedLayerId={selectedLayerId} draft={draft} selectionBounds={selectionBounds} cursor={cursor} tool={tool} brush={brush} canSubtract={!!selectedLayer && !selectedLayer.authoring.locked} displayOpacity={displayOpacity} backgroundOpacity={backgroundOpacity} isolate={isolate} binaryMaskPreview={viewState.binaryMaskPreview} initialView={viewState.artboard} onView={updateArtboardView} onTool={next => { setTool(next); cancelGesture(); }} onBrush={setBrush} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onPointerLeave={() => { if (!gesture.current) setCursor(null); }} onDoubleClick={doubleClick}/>
                }, { id:"properties", title:"Properties", weight:24, minWidth:240, content:
                <OptionsPanel region={selectedRegion} layer={selectedLayer} bounds={selectionBounds} canvas={documentValue.canvas} automaticRegionColor={selectedRegion ? automaticRegionColor(documentValue.regions.indexOf(selectedRegion)) : null} globalPrompts={documentValue.prompts.global} backgroundPrompts={documentValue.prompts.background} negativeMode={documentValue.negative_mode} promptSections={viewState.promptSections} loraBindings={loraBindings} loraStacks={loraStacks} onGlobalLoraStack={setGlobalLoraStack} onRegionLoraStack={setRegionLoraStack} onPromptSection={(section, open) => setViewState(current => ({ ...current, promptSections: { ...current.promptSections, [section]: open } }))} onNegativeMode={negativeMode => mutate(value => { value.negative_mode = negativeMode; })} onGlobalPrompts={prompts => mutate(value => { value.prompts.global = prompts; })} onBackgroundPrompts={prompts => mutate(value => { value.prompts.background = prompts; })} onRegion={updateRegion} onLayerBounds={bounds => selectedLayerId && updateLayer(selectedLayerId, (operations, region) => { const replacements = new Map(setLayerBounds(operations, bounds, documentValue.canvas).map(item => [item.id, item])); region.geometry = region.geometry.map(item => replacements.get(item.id) ?? item); })} onBrushSetting={(field, setting) => selectedLayerId && updateLayer(selectedLayerId, operations => operations.forEach(item => { if (item.type === "brush_stroke") Object.assign(item, { [field]: setting }); }))}/>
                }
              ]}/>
            </main>
            <footer className={loraWarnings.length ? "has-warning" : ""}><span>{loraWarnings[0] ? `⚠ ${loraWarnings[0]}` : `✓ ${loraSummary}`}</span><span>{documentValue.regions.length} regions · layout autosaved</span><button title="Restore the default panel arrangement" onClick={() => setDockResetSignal(value => value + 1)}>Reset layout</button><button onClick={onClose}>Close</button></footer>
        </>}
    </div>;
}

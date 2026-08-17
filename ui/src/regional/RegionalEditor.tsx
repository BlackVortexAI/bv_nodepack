import React, { useCallback, useEffect, useRef, useState } from "react";
import Artboard from "./Artboard";
import EditorMenus from "./EditorMenus";
import LayerPanel from "./LayerPanel";
import OptionsPanel from "./OptionsPanel";
import { BrushSettings, Tool } from "./ToolPalette";
import { Bounds, boundsOfLayer, Handle, hitTest, moveLayer, resizeLayer, setLayerBounds, simplifyPoints } from "./geometry";
import { regionsInPriorityOrder, shouldAppendFinalBrushPoint, shouldStartSelectionMove, synchronizeRegionPriorities } from "./interaction";
import { clone, Geometry, geometryAuthoring, geometryLayerId, geometryLayers, newRegion, parseDocument, Point, RegionalDocument, Region, uuid } from "./model";
import { activeWindowGeometry, applyObservedWindowSize, clampWindowGeometry, defaultEditorState, EditorViewState, loadEditorState, observedWindowSize, saveEditorState } from "./editorState";

type NodeRef = { id: number | string; title?: string; widgets?: Array<{ name: string; value: unknown; callback?: (value: unknown) => void }>; graph?: { setDirtyCanvas?: (a: boolean, b: boolean) => void } };
type Props = { open: boolean; nodes: NodeRef[]; initialNode: NodeRef | null; backgrounds: Record<string, string>; onClose: () => void };
type Gesture =
    | { mode: "draw-rect" | "draw-brush"; start: Point; commit: "add" | "subtract" }
    | { mode: "move"; start: Point; startScreen: { x: number; y: number }; original: Geometry[]; started: boolean }
    | { mode: "resize"; start: Point; original: Geometry[]; handle: Handle };

const getWidget = (node: NodeRef | null) => node?.widgets?.find(widget => widget.name === "regional_json");
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
        const layerIds = new Map<string, string>();
        region.geometry.forEach(geometry => { const old = geometryLayerId(geometry); if (!layerIds.has(old)) layerIds.set(old, uuid()); geometry.id = uuid(); geometry.layer_id = layerIds.get(old)!; });
        return region;
    });
}

export default function RegionalEditor({ open, nodes, initialNode, backgrounds, onClose }: Props) {
    const [node, setNode] = useState<NodeRef | null>(initialNode), [documentValue, setDocumentValue] = useState<RegionalDocument | null>(null);
    const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null), [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
    const [tool, setTool] = useState<Tool>("select"), [brush, setBrush] = useState<BrushSettings>({ size: .04, hardness: .75, opacity: 1, shape: "round", pressureMode: "constant" });
    const [displayOpacity, setDisplayOpacity] = useState(.5), [isolate, setIsolate] = useState(false);
    const [history, setHistory] = useState<RegionalDocument[]>([]), [future, setFuture] = useState<RegionalDocument[]>([]);
    const [draft, setDraft] = useState<Geometry[] | null>(null), [cursor, setCursor] = useState<Point | null>(null), [error, setError] = useState("");
    const [viewState, setViewState] = useState<EditorViewState>(() => defaultEditorState());
    const gesture = useRef<Gesture | null>(null), shell = useRef<HTMLDivElement>(null);
    const updateArtboardView = useCallback((artboard: EditorViewState["artboard"]) => setViewState(current => {
        const previous = current.artboard;
        return previous.zoom === artboard.zoom && previous.panX === artboard.panX && previous.panY === artboard.panY && previous.fit === artboard.fit ? current : { ...current, artboard };
    }), []);
    const updateOpenMenu = useCallback((openMenu: EditorViewState["openMenu"]) => setViewState(current => current.openMenu === openMenu ? current : { ...current, openMenu }), []);

    useEffect(() => { if (initialNode) setNode(initialNode); else if (!node && nodes[0]) setNode(nodes[0]); }, [initialNode, node, nodes]);
    useEffect(() => {
        if (!node) return;
        try {
            const next = parseDocument(getWidget(node)?.value); next.regions = regionsInPriorityOrder(next.regions); syncPriorities(next.regions);
            const stored = loadEditorState(next.document_id), regionId = next.regions.some(region => region.id === stored.selectedRegionId) ? stored.selectedRegionId : next.regions[0]?.id ?? null;
            const region = next.regions.find(item => item.id === regionId), layerId = region && geometryLayers(region).some(layer => layer.id === stored.selectedLayerId) ? stored.selectedLayerId : null;
            setViewState(stored); setDocumentValue(next); setSelectedRegionId(regionId); setSelectedLayerId(layerId); setTool(stored.tool); setBrush(stored.brush); setDisplayOpacity(stored.displayOpacity); setIsolate(stored.isolate && !!layerId); setHistory([]); setFuture([]); setError("");
        }
        catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    }, [node]);

    useEffect(() => {
        if (!documentValue) return;
        saveEditorState(documentValue.document_id, { ...viewState, selectedRegionId, selectedLayerId, displayOpacity, isolate, tool, brush });
    }, [brush, displayOpacity, documentValue, isolate, selectedLayerId, selectedRegionId, tool, viewState]);

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
    const activeOperations = draft && selectedLayerId && draft.every(item => geometryLayerId(item) === selectedLayerId)
        ? (gesture.current?.mode === "draw-brush" || gesture.current?.mode === "draw-rect") && gesture.current.commit === "subtract" ? [...selectedOperations, ...draft] : draft
        : selectedOperations;
    const selectionBounds = activeOperations.length && documentValue ? boundsOfLayer(activeOperations, documentValue.canvas) : null;

    const persist = useCallback((next: RegionalDocument, record = true) => {
        if (!node) return;
        if (record && documentValue) { setHistory(items => [...items.slice(-99), clone(documentValue)]); setFuture([]); }
        setDocumentValue(next); const widget = getWidget(node);
        if (widget) { widget.value = JSON.stringify(next); widget.callback?.(widget.value); }
        node.graph?.setDirtyCanvas?.(true, true);
    }, [documentValue, node]);
    const mutate = useCallback((fn: (value: RegionalDocument) => void, record = true) => { if (!documentValue) return; const next = clone(documentValue); fn(next); persist(next, record); }, [documentValue, persist]);
    const updateRegion = (fn: (region: Region) => void) => mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) fn(region); });
    const updateLayer = (id: string, fn: (geometries: Geometry[], region: Region) => void) => mutate(value => { const region = value.regions.find(item => item.id === selectedRegionId); if (region) fn(layerOperations(region, id), region); });
    const cancelGesture = useCallback(() => { gesture.current = null; setDraft(null); }, []);
    const undo = useCallback(() => { if (!documentValue || !history.length) return; const previous = history[history.length - 1]; setHistory(history.slice(0, -1)); setFuture([clone(documentValue), ...future]); persist(clone(previous), false); }, [documentValue, future, history, persist]);
    const redo = useCallback(() => { if (!documentValue || !future.length) return; const next = future[0]; setFuture(future.slice(1)); setHistory([...history, clone(documentValue)]); persist(clone(next), false); }, [documentValue, future, history, persist]);

    const deleteLayer = (id: string) => { updateLayer(id, (_operations, region) => { region.geometry = region.geometry.filter(item => geometryLayerId(item) !== id); }); if (selectedLayerId === id) setSelectedLayerId(null); };
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
            if ((event.key === "Delete" || event.key === "Backspace") && selectedLayerId && !(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) { event.preventDefault(); event.stopImmediatePropagation(); deleteLayer(selectedLayerId); return; }
            if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "z") return;
            event.preventDefault(); event.stopImmediatePropagation(); event.shiftKey ? redo() : undo();
        };
        window.addEventListener("keydown", key, true); return () => window.removeEventListener("keydown", key, true);
    }, [cancelGesture, deleteLayer, open, redo, selectedLayerId, undo]);

    const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue || !selectedRegion || selectedRegion.authoring.locked) return;
        const point = pointFor(event, brush.pressureMode); event.currentTarget.setPointerCapture(event.pointerId);
        const handle = (event.target as Element).closest?.("[data-handle]")?.getAttribute("data-handle") as Handle | null;
        if (tool === "select") {
            setDraft(null);
            if (handle && selectedLayer && !selectedLayer.authoring.locked) { gesture.current = { mode: "resize", start: point, original: clone(selectedOperations), handle }; return; }
            const hit = [...geometryLayers(selectedRegion)].reverse().find(layer => layer.enabled && layer.authoring.visible && layer.geometries.filter(item => item.operation === "add").some(item => hitTest(item, point, documentValue.canvas)));
            setSelectedLayerId(hit?.id ?? null);
            if (hit && !hit.authoring.locked) gesture.current = { mode: "move", start: point, startScreen: { x: event.clientX, y: event.clientY }, original: clone(hit.geometries), started: false };
            return;
        }
        if (tool === "brush-subtract" && (!selectedLayerId || selectedLayer?.authoring.locked)) return;
        const id = uuid(), layerId = tool === "brush-subtract" ? selectedLayerId! : id;
        const authoring = tool === "brush-subtract" ? selectedLayer?.authoring : { name: `${tool === "rect" ? "Rectangle" : "Brush"} ${geometryLayers(selectedRegion).length + 1}`, visible: true, locked: false };
        if (tool === "rect") {
            setSelectedLayerId(layerId); setDraft([{ id, layer_id: layerId, type: "rect", operation: "add", enabled: true, authoring, x: point.x, y: point.y, width: .001, height: .001 }]); gesture.current = { mode: "draw-rect", start: point, commit: "add" };
        } else {
            setDraft([{ id, layer_id: layerId, type: "brush_stroke", operation: tool === "brush-add" ? "add" : "subtract", enabled: true, authoring, size: brush.size, hardness: brush.hardness, opacity: brush.opacity, shape: brush.shape, pressure_mode: brush.pressureMode, points: [point] }]); gesture.current = { mode: "draw-brush", start: point, commit: tool === "brush-add" ? "add" : "subtract" }; if (tool === "brush-add") setSelectedLayerId(layerId);
        }
    };
    const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue) return; const point = pointFor(event, brush.pressureMode); setCursor(point); const active = gesture.current; if (!active) return;
        if (active.mode === "draw-rect" && draft?.[0]?.type === "rect") { const geometry = draft[0]; setDraft([{ ...geometry, x: Math.min(active.start.x, point.x), y: Math.min(active.start.y, point.y), width: Math.max(.001, Math.abs(point.x - active.start.x)), height: Math.max(.001, Math.abs(point.y - active.start.y)) }]); }
        else if (active.mode === "draw-brush" && draft?.[0]?.type === "brush_stroke") setDraft([{ ...draft[0], points: [...draft[0].points, point] }]);
        else if (active.mode === "move") { if (!active.started && !shouldStartSelectionMove(active.startScreen, { x: event.clientX, y: event.clientY })) return; active.started = true; setDraft(moveLayer(active.original, point.x - active.start.x, point.y - active.start.y, documentValue.canvas)); }
        else if (active.mode === "resize") setDraft(resizeLayer(active.original, active.handle, point.x - active.start.x, point.y - active.start.y, event.shiftKey, documentValue.canvas));
    };
    const pointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!documentValue || !gesture.current || !draft) return cancelGesture();
        const active = gesture.current, finalPoint = pointFor(event, brush.pressureMode);
        let final = shouldAppendFinalBrushPoint(active.mode) ? draft.map(item => item.type === "brush_stroke" ? { ...item, points: simplifyPoints([...item.points, finalPoint]) } : item) : draft;
        if (active.mode === "draw-rect" && final[0].type === "rect" && (final[0].width <= .002 || final[0].height <= .002)) return cancelGesture();
        mutate(value => {
            const region = value.regions.find(item => item.id === selectedRegionId); if (!region) return;
            if (active.mode.startsWith("draw")) region.geometry.push(...final);
            else { const replacements = new Map(final.map(item => [item.id, item])); region.geometry = region.geometry.map(item => replacements.get(item.id) ?? item); }
        });
        cancelGesture();
    };

    const moveRegion = (id: string, direction: -1 | 1) => mutate(value => { const index = value.regions.findIndex(region => region.id === id), target = index + direction; if (target < 0 || target >= value.regions.length) return; [value.regions[index], value.regions[target]] = [value.regions[target], value.regions[index]]; syncPriorities(value.regions); });
    const moveLayerOrder = (id: string, direction: -1 | 1) => updateLayer(id, (_items, region) => { const layers = geometryLayers(region), index = layers.findIndex(layer => layer.id === id), target = index + direction; if (target < 0 || target >= layers.length) return; [layers[index], layers[target]] = [layers[target], layers[index]]; region.geometry = layers.flatMap(layer => layer.geometries); });
    const toggleLayer = (id: string, field: "enabled" | "visible" | "locked") => updateLayer(id, operations => { if (!operations.length) return; if (field === "enabled") { const target = !operations.some(item => item.enabled !== false); operations.forEach(item => { item.enabled = target; }); } else { const target = !geometryAuthoring(operations[0])[field]; operations.forEach(item => { item.authoring = { ...geometryAuthoring(item), [field]: target }; }); } });
    const duplicateLayer = (id: string) => updateLayer(id, (operations, region) => { const layerId = uuid(), copies = moveLayer(clone(operations), .02, .02, documentValue!.canvas); copies.forEach((item, index) => { item.id = uuid(); item.layer_id = layerId; item.authoring = { ...geometryAuthoring(item), name: `${geometryAuthoring(item).name} Copy`, visible: true, locked: false }; if (index) item.authoring = copies[0].authoring; }); region.geometry.push(...copies); setSelectedLayerId(layerId); });
    const deleteRegion = (id: string) => { const region = documentValue?.regions.find(item => item.id === id); if (!region || !window.confirm(`Delete region “${region.name}” with ${geometryLayers(region).length} layer(s)?`)) return; mutate(value => { value.regions = value.regions.filter(item => item.id !== id); value.regions.forEach(item => { if (item.parent_region_id === id) item.parent_region_id = null; }); syncPriorities(value.regions); }); setSelectedRegionId(documentValue?.regions.find(item => item.id !== id)?.id ?? null); setSelectedLayerId(null); };

    const importDocument = async (file: File) => { try { const imported = parseDocument(await file.text()); imported.regions = regionsInPriorityOrder(imported.regions); syncPriorities(imported.regions); const collision = nodes.some(candidate => candidate !== node && (() => { try { return parseDocument(getWidget(candidate)?.value).document_id === imported.document_id; } catch { return false; } })()); if (collision) imported.document_id = uuid(); persist(imported); setSelectedRegionId(imported.regions[0]?.id ?? null); setSelectedLayerId(null); } catch (reason) { alert(`Import failed: ${reason}`); } };
    const importRegions = async (file: File) => { try { const data = JSON.parse(await file.text()); if (data?.schema !== "bv.regions" || data?.version !== 1 || !Array.isArray(data.regions)) throw new Error("Not a BV Regions v1 export"); mutate(value => { value.regions.push(...remapImportedRegions(data.regions)); syncPriorities(value.regions); }); } catch (reason) { alert(`Import failed: ${reason}`); } };

    if (!open) return null;
    const windowGeometry = activeWindowGeometry(viewState, { width: window.innerWidth, height: window.innerHeight });
    return <div ref={shell} className={`bv-regional-shell ${viewState.mode}`} role="dialog" aria-modal={viewState.mode === "workspace"} style={{ inset: "auto", left: windowGeometry.x, top: windowGeometry.y, width: windowGeometry.width, height: windowGeometry.height }} onKeyDown={event => event.stopPropagation()}>
        <header onPointerDown={beginWindowDrag}><EditorMenus openMenu={viewState.openMenu} onOpenMenu={updateOpenMenu} displayOpacity={displayOpacity} isolate={isolate} hasSelection={!!selectedLayerId} onDisplayOpacity={setDisplayOpacity} onToggleIsolate={() => setIsolate(value => !value)} onExportDocument={() => documentValue && downloadJson(`${documentValue.title || "bv-regional"}.json`, documentValue)} onExportRegions={() => documentValue && downloadJson(`${documentValue.title || "bv-regions"}.regions.json`, { schema: "bv.regions", version: 1, canvas: documentValue.canvas, regions: documentValue.regions })} onImportDocument={importDocument} onImportRegions={importRegions} onUndo={undo} onRedo={redo} canUndo={!!history.length} canRedo={!!future.length} canvas={documentValue?.canvas ?? { width: 1024, height: 1024 }} onCanvas={canvas => mutate(value => { value.canvas = canvas; })}/><div className="window-drag-handle"><span aria-hidden="true">⠿</span><strong>BV Regional Editor</strong></div><select value={node?.id ?? ""} onChange={event => setNode(nodes.find(item => String(item.id) === event.target.value) ?? null)}>{nodes.map(item => <option key={item.id} value={String(item.id)}>{`${item.title || "BV Regional Prompt"} · #${item.id}`}</option>)}</select><button className="window-mode-button" title={viewState.mode === "workspace" ? "Switch to floating window" : "Switch to workspace view"} onClick={() => setViewState(current => ({ ...current, mode: current.mode === "workspace" ? "floating" : "workspace" }))}>{viewState.mode === "workspace" ? "Float" : "Workspace"}</button><button title="Close" onClick={onClose}>×</button></header>
        {error ? <div className="bv-regional-error">{error}</div> : documentValue && <>
            <main style={{ gridTemplateColumns: `${viewState.panels.left}px 6px minmax(300px, 1fr) 6px ${viewState.panels.right}px` }}>
                <LayerPanel regions={documentValue.regions} selectedRegionId={selectedRegionId} selectedLayerId={selectedLayerId} isolate={isolate} onSelectRegion={id => { setSelectedRegionId(id); setSelectedLayerId(null); setIsolate(false); }} onSelectLayer={setSelectedLayerId} onAddRegion={() => mutate(value => { const region = newRegion(value.regions.length); value.regions.unshift(region); syncPriorities(value.regions); setSelectedRegionId(region.id); setSelectedLayerId(null); })} onRenameRegion={(id, name) => mutate(value => { value.regions.find(region => region.id === id)!.name = name; })} onRenameLayer={(id, name) => updateLayer(id, operations => operations.forEach(item => { item.authoring = { ...geometryAuthoring(item), name }; }))} onToggleRegion={(id, field) => mutate(value => { const region = value.regions.find(item => item.id === id)!; if (field === "enabled") region.enabled = !region.enabled; else region.authoring.locked = !region.authoring.locked; })} onToggleLayer={toggleLayer} onMoveRegion={moveRegion} onMoveLayer={moveLayerOrder} onDeleteRegion={deleteRegion} onDeleteLayer={deleteLayer} onDuplicateLayer={duplicateLayer} onToggleIsolate={() => setIsolate(value => !value)}/>
                <div className="panel-splitter" onPointerDown={event => beginPanelResize("left", event)} onDoubleClick={() => setViewState(current => ({ ...current, panels: { ...current.panels, left: 290 } }))}/>
                <Artboard key={documentValue.document_id} document={documentValue} background={backgrounds[documentValue.document_id]} selectedRegionId={selectedRegionId} selectedLayerId={selectedLayerId} draft={draft} selectionBounds={selectionBounds} cursor={cursor} tool={tool} brush={brush} canSubtract={!!selectedLayer && !selectedLayer.authoring.locked} displayOpacity={displayOpacity} isolate={isolate} initialView={viewState.artboard} onView={updateArtboardView} onTool={next => { setTool(next); cancelGesture(); }} onBrush={setBrush} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelGesture} onPointerLeave={() => { if (!gesture.current) setCursor(null); }}/>
                <div className="panel-splitter" onPointerDown={event => beginPanelResize("right", event)} onDoubleClick={() => setViewState(current => ({ ...current, panels: { ...current.panels, right: 340 } }))}/>
                <OptionsPanel region={selectedRegion} layer={selectedLayer} bounds={selectionBounds} canvas={documentValue.canvas} globalPrompts={documentValue.prompts.global} backgroundPrompts={documentValue.prompts.background} negativeMode={documentValue.negative_mode} promptSections={viewState.promptSections} onPromptSection={(section, open) => setViewState(current => ({ ...current, promptSections: { ...current.promptSections, [section]: open } }))} onNegativeMode={negativeMode => mutate(value => { value.negative_mode = negativeMode; })} onGlobalPrompts={prompts => mutate(value => { value.prompts.global = prompts; })} onBackgroundPrompts={prompts => mutate(value => { value.prompts.background = prompts; })} onRegion={updateRegion} onLayerBounds={bounds => selectedLayerId && updateLayer(selectedLayerId, (operations, region) => { const replacements = new Map(setLayerBounds(operations, bounds, documentValue.canvas).map(item => [item.id, item])); region.geometry = region.geometry.map(item => replacements.get(item.id) ?? item); })} onBrushSetting={(field, setting) => selectedLayerId && updateLayer(selectedLayerId, operations => operations.forEach(item => { if (item.type === "brush_stroke") Object.assign(item, { [field]: setting }); }))}/>
            </main>
            <footer><span>{documentValue.regions.length} regions · autosaved · Joint overlap</span><button onClick={onClose}>Close</button></footer>
        </>}
    </div>;
}

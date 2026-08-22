import React, { useEffect, useState } from "react";
import { InlineTextEdit, TreeButton } from "./data";
import { geometryAuthoring, geometryLayers, geometryMaskGroupId, Region } from "../../regional/model";
import type { TreeItemRef, TreeMove, TreeDropPosition } from "../../regional/treeMoves";
import { canRemoveGeometry } from "../../regional/operationOrder";

type Props = {
    regions: Region[];
    selectedRegionId: string | null;
    selectedLayerId: string | null;
    selectedLayerIds: string[];
    selectedGeometryId: string | null;
    onSelectRegion: (id: string) => void;
    onSelectLayer: (regionId: string, id: string, modifier: "replace" | "toggle" | "range") => void;
    onSelectGeometry: (regionId: string, layerId: string, geometryId: string) => void;
    onToggleGeometry: (geometryId: string) => void;
    onDeleteGeometry: (geometryId: string) => void;
    onAddRegion: () => void;
    onRenameRegion: (id: string, name: string) => void;
    onRenameLayer: (id: string, name: string) => void;
    onToggleRegion: (id: string, field: "enabled" | "visible" | "locked") => void;
    onToggleLayer: (id: string, field: "enabled" | "visible" | "locked") => void;
    onMoveRegion: (id: string, direction: -1 | 1) => void;
    onMoveLayer: (id: string, direction: -1 | 1) => void;
    onDeleteRegion: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    canSplitDisconnectedAreas: boolean;
    onSplitDisconnectedAreas: () => void;
    onTreeMove: (move: TreeMove) => void;
};

function EditableName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
    const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value);
    if (!editing) return <span className="layer-name" title={value} onDoubleClick={event => { event.stopPropagation(); setDraft(value); setEditing(true); }}>{value}</span>;
    const commit = () => { const next = draft.trim(); if (next) onCommit(next); setEditing(false); };
    return <InlineTextEdit className="inline-name" autoFocus value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onClick={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") commit(); if (event.key === "Escape") setEditing(false); }}/>
}

type TreeIconName = "chevron-right" | "chevron-down" | "eye" | "eye-off" | "lock" | "unlock" | "check" | "more" | "plus" | "split" | "trash";
function TreeIcon({ name }: { name: TreeIconName }) {
    const paths: Record<TreeIconName, React.ReactNode> = {
        "chevron-right": <path d="m9 6 6 6-6 6"/>,
        "chevron-down": <path d="m6 9 6 6 6-6"/>,
        eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
        "eye-off": <><path d="M3 3l18 18"/><path d="M10.6 6.15A9.8 9.8 0 0 1 12 6c6 0 9.5 6 9.5 6a14.3 14.3 0 0 1-2.05 2.7M6.05 6.05C3.75 7.65 2.5 12 2.5 12s3.5 6 9.5 6a9.4 9.4 0 0 0 3.1-.52"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></>,
        lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
        unlock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.4-2.1"/></>,
        check: <path d="m6 12 4 4 8-9"/>,
        more: <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>,
        plus: <path d="M12 5v14M5 12h14"/>,
        split: <><path d="M7 5v5a2 2 0 0 0 2 2h6a2 2 0 0 1 2 2v5"/><path d="m4 8 3 3 3-3M14 16l3 3 3-3"/></>,
        trash: <><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13"/><path d="M10 11v5M14 11v5"/></>,
    };
    return <svg className="tree-control-icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

export default function RegionLayerTree(props: Props) {
    const [expandedLayers, setExpandedLayers] = useState<Set<string>>(() => new Set());
    const [expandedRegions, setExpandedRegions] = useState<Set<string>>(() => new Set(props.selectedRegionId ? [props.selectedRegionId] : []));
    const [dragged, setDragged] = useState<TreeItemRef | null>(null), [dropKey, setDropKey] = useState<string | null>(null);
    const toggleExpanded = (id: string) => setExpandedLayers(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    const toggleRegionExpanded = (id: string) => setExpandedRegions(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; });
    useEffect(() => { if (props.selectedRegionId) setExpandedRegions(current => current.has(props.selectedRegionId!) ? current : new Set([...current, props.selectedRegionId!])); }, [props.selectedRegionId]);
    const keyFor = (item: TreeItemRef) => item.kind === "region" ? `region:${item.regionId}` : item.kind === "layer" ? `layer:${item.regionId}:${item.layerId}` : `geometry:${item.regionId}:${item.layerId}:${item.geometryId}`;
    const beginDrag = (item: TreeItemRef, event: React.DragEvent) => { setDragged(item); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", keyFor(item)); };
    const dropPosition = (target: TreeItemRef, event: React.DragEvent): TreeDropPosition => {
        if (!dragged || dragged.kind !== target.kind || target.kind === "layer" && dragged.kind === "geometry") return "inside";
        const rect = event.currentTarget.getBoundingClientRect(); return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    };
    const dropProps = (target: TreeItemRef) => ({
        onDragOver: (event: React.DragEvent) => { if (!dragged) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropKey(`${keyFor(target)}:${dropPosition(target, event)}`); },
        onDragLeave: (event: React.DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropKey(null); },
        onDrop: (event: React.DragEvent) => { event.preventDefault(); if (dragged) props.onTreeMove({ source:dragged, target, position:dropPosition(target, event) }); setDragged(null); setDropKey(null); },
    });
    const dropClass = (item: TreeItemRef) => { const parts = dropKey?.split(":") ?? []; return dropKey?.startsWith(`${keyFor(item)}:`) ? ` drop-target drop-${parts[parts.length - 1]}` : ""; };
    const selectedRegion = props.regions.find(region => region.id === props.selectedRegionId) ?? null;
    return <aside className="layers">
        <div className="panel-toolbar">
            <TreeButton className="panel-tool primary" title="Add region" aria-label="Add region" onClick={props.onAddRegion}><TreeIcon name="plus"/><span>Region</span></TreeButton>
            <TreeButton className="panel-tool" title="Split disconnected areas in the selected layer" aria-label="Split disconnected areas" disabled={!props.canSplitDisconnectedAreas} onClick={props.onSplitDisconnectedAreas}><TreeIcon name="split"/></TreeButton>
            <span className="panel-toolbar-spacer"/>
            <TreeButton className="panel-tool danger" title="Delete selected region" aria-label="Delete selected region" disabled={!selectedRegion} onClick={() => selectedRegion && props.onDeleteRegion(selectedRegion.id)}><TreeIcon name="trash"/></TreeButton>
        </div>
        {props.regions.map(region => {
            const selected = region.id === props.selectedRegionId;
            const regionExpanded = expandedRegions.has(region.id);
            const regionRef: TreeItemRef = { kind:"region", regionId:region.id };
            return <section className={`region-group ${selected ? "selected" : ""}`} key={region.id} aria-expanded={regionExpanded}>
                <div className={`region-row${dropClass(regionRef)}`} {...dropProps(regionRef)} onClick={() => props.onSelectRegion(region.id)}>
                    <TreeButton className="tree-drag-handle" draggable aria-label={`Move ${region.name}`} title="Drag to reorder; Alt + arrow keys also move" onDragStart={event => beginDrag(regionRef, event)} onDragEnd={() => { setDragged(null); setDropKey(null); }} onKeyDown={event => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); props.onMoveRegion(region.id, -1); } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); props.onMoveRegion(region.id, 1); } }} onClick={event => event.stopPropagation()}>⠿</TreeButton>
                    <TreeButton className="region-expand" aria-expanded={regionExpanded} title={regionExpanded ? "Collapse region" : "Expand region"} onClick={event => { event.stopPropagation(); toggleRegionExpanded(region.id); }}><TreeIcon name={regionExpanded ? "chevron-down" : "chevron-right"}/></TreeButton>
                    <i style={{ background: region.authoring.color }}/>
                    <EditableName value={region.name} onCommit={name => props.onRenameRegion(region.id, name)}/>
                    <span className="region-usage" title="Region usage">{region.usage === "generation" ? "GEN" : region.usage === "detailer" ? "DET" : "BOTH"}</span>
                    <span className="priority" title="Priority">P{region.priority}</span>
                    <TreeButton className={`tree-icon-button${region.authoring.visible ? "" : " deviant"}`} title={region.authoring.visible ? "Hide region in editor" : "Show region in editor"} aria-pressed={region.authoring.visible} onClick={event => { event.stopPropagation(); props.onToggleRegion(region.id, "visible"); }}><TreeIcon name={region.authoring.visible ? "eye" : "eye-off"}/></TreeButton>
                    <TreeButton className={`tree-icon-button${region.authoring.locked ? " deviant" : ""}`} title={region.authoring.locked ? "Unlock region" : "Lock region"} aria-pressed={region.authoring.locked} onClick={event => { event.stopPropagation(); props.onToggleRegion(region.id, "locked"); }}><TreeIcon name={region.authoring.locked ? "lock" : "unlock"}/></TreeButton>
                    <TreeButton className={`tree-check${region.enabled ? "" : " deviant"}`} role="checkbox" aria-checked={region.enabled} title={region.enabled ? "Disable region output" : "Enable region output"} onClick={event => { event.stopPropagation(); props.onToggleRegion(region.id, "enabled"); }}>{region.enabled && <TreeIcon name="check"/>}</TreeButton>
                </div>
                {regionExpanded && <div className="geometry-layers">
                    {[...geometryLayers(region)].reverse().map(layer => {
                        const selectedLayer = props.selectedLayerIds.includes(layer.id), primaryLayer = layer.id === props.selectedLayerId;
                        const geometryTypes = new Set(layer.geometries.map(item => item.type));
                        const maskGroups = new Set(layer.geometries.map(geometryMaskGroupId)).size;
                        const layerIcon = geometryTypes.size > 1 || maskGroups > 1 ? "◈" : layer.geometries[0].type === "rect" ? "▭" : layer.geometries[0].type === "ellipse" ? "◯" : layer.geometries[0].type === "polygon" ? "⬠" : layer.geometries[0].type === "raster_mask" ? "▦" : "✎";
                        const expanded = expandedLayers.has(layer.id);
                        const layerRef: TreeItemRef = { kind:"layer", regionId:region.id, layerId:layer.id };
                        return <div key={layer.id} className="geometry-tree-item"><div className={`geometry-row ${selectedLayer && !props.selectedGeometryId ? "selected" : ""} ${primaryLayer ? "primary-selection" : ""}${dropClass(layerRef)}`} {...dropProps(layerRef)} onClick={event => props.onSelectLayer(region.id, layer.id, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace")}>
                            <TreeButton className="tree-drag-handle" draggable aria-label={`Move ${layer.authoring.name}`} title="Drag layer; Alt + arrow keys also move" onDragStart={event => beginDrag(layerRef, event)} onDragEnd={() => { setDragged(null); setDropKey(null); }} onKeyDown={event => { if (event.altKey && event.key === "ArrowUp") { event.preventDefault(); props.onMoveLayer(layer.id, 1); } if (event.altKey && event.key === "ArrowDown") { event.preventDefault(); props.onMoveLayer(layer.id, -1); } }} onClick={event => event.stopPropagation()}>⠿</TreeButton>
                            <TreeButton className="layer-expand" aria-expanded={expanded} title={expanded ? "Collapse operations" : "Expand operations"} onClick={event => { event.stopPropagation(); toggleExpanded(layer.id); }}><TreeIcon name={expanded ? "chevron-down" : "chevron-right"}/></TreeButton><span title={`${layer.geometries.length} operations · ${maskGroups} mask group${maskGroups === 1 ? "" : "s"}`}>{layerIcon}{layer.geometries.some(item => item.operation === "subtract") ? "−" : ""}</span>
                            <EditableName value={layer.authoring.name} onCommit={name => props.onRenameLayer(layer.id, name)}/>
                            <TreeButton className={`tree-icon-button${layer.authoring.visible ? "" : " deviant"}`} title={layer.authoring.visible ? "Hide in editor" : "Show in editor"} aria-pressed={layer.authoring.visible} onClick={event => { event.stopPropagation(); props.onToggleLayer(layer.id, "visible"); }}><TreeIcon name={layer.authoring.visible ? "eye" : "eye-off"}/></TreeButton>
                            <TreeButton className={`tree-icon-button${layer.authoring.locked ? " deviant" : ""}`} title={layer.authoring.locked ? "Unlock layer" : "Lock layer"} aria-pressed={layer.authoring.locked} onClick={event => { event.stopPropagation(); props.onToggleLayer(layer.id, "locked"); }}><TreeIcon name={layer.authoring.locked ? "lock" : "unlock"}/></TreeButton>
                            <TreeButton className={`tree-check${layer.enabled ? "" : " deviant"}`} role="checkbox" aria-checked={layer.enabled} title={layer.enabled ? "Disable mask output" : "Enable mask output"} onClick={event => { event.stopPropagation(); props.onToggleLayer(layer.id, "enabled"); }}>{layer.enabled && <TreeIcon name="check"/>}</TreeButton>
                            <details className="layer-overflow" onClick={event => event.stopPropagation()}><summary title="Layer actions" aria-label="Layer actions"><TreeIcon name="more"/></summary><div><TreeButton onClick={event => { event.currentTarget.closest("details")!.removeAttribute("open"); props.onDuplicateLayer(layer.id); }}>Duplicate layer</TreeButton><TreeButton className="danger" onClick={event => { event.currentTarget.closest("details")!.removeAttribute("open"); props.onDeleteLayer(layer.id); }}>Delete layer</TreeButton></div></details>
                        </div>{expanded && <div className="geometry-operations">{layer.geometries.map((geometry, index) => { const geometryRef: TreeItemRef = { kind:"geometry", regionId:region.id, layerId:layer.id, geometryId:geometry.id }; return <div key={geometry.id} className={`geometry-operation ${props.selectedGeometryId === geometry.id ? "selected" : ""}${dropClass(geometryRef)}`} {...dropProps(geometryRef)}>
                            <TreeButton className="tree-drag-handle" draggable aria-label={`Move ${geometryAuthoring(geometry, index).name}`} title="Drag operation" onDragStart={event => beginDrag(geometryRef, event)} onDragEnd={() => { setDragged(null); setDropKey(null); }}>⠿</TreeButton>
                            <TreeButton className="geometry-operation-select" onClick={() => props.onSelectGeometry(region.id, layer.id, geometry.id)}>
                                <span className={`operation-kind ${geometry.operation}`}>{geometry.operation === "add" ? "+" : "−"}</span>
                                <span>{geometryAuthoring(geometry, index).name}</span>
                                <small>{geometry.type.replace("_", " ")}</small>
                            </TreeButton>
                            <TreeButton className={`tree-icon-button${geometry.enabled !== false ? "" : " deviant"}`} title={geometry.enabled !== false ? "Disable operation" : "Enable operation"} aria-pressed={geometry.enabled !== false} onClick={() => props.onToggleGeometry(geometry.id)}><TreeIcon name={geometry.enabled !== false ? "eye" : "eye-off"}/></TreeButton>
                            <TreeButton className="danger" disabled={!canRemoveGeometry(layer.geometries, geometry.id)} title={canRemoveGeometry(layer.geometries, geometry.id) ? "Delete operation" : "Additive base: remove dependent subtract operations first"} onClick={() => props.onDeleteGeometry(geometry.id)}>×</TreeButton>
                        </div>; })}</div>}</div>;
                    })}
                </div>}
            </section>;
        })}
    </aside>;
}

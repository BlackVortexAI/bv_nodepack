import React, { useState } from "react";
import { geometryLayers, geometryMaskGroupId, Region } from "./model";

type Props = {
    regions: Region[];
    selectedRegionId: string | null;
    selectedLayerId: string | null;
    selectedLayerIds: string[];
    isolate: boolean;
    onSelectRegion: (id: string) => void;
    onSelectLayer: (id: string, modifier: "replace" | "toggle" | "range") => void;
    onAddRegion: () => void;
    onRenameRegion: (id: string, name: string) => void;
    onRenameLayer: (id: string, name: string) => void;
    onToggleRegion: (id: string, field: "enabled" | "locked") => void;
    onToggleLayer: (id: string, field: "enabled" | "visible" | "locked") => void;
    onMoveRegion: (id: string, direction: -1 | 1) => void;
    onMoveLayer: (id: string, direction: -1 | 1) => void;
    onDeleteRegion: (id: string) => void;
    onDeleteLayer: (id: string) => void;
    onDuplicateLayer: (id: string) => void;
    onToggleIsolate: () => void;
};

function EditableName({ value, onCommit }: { value: string; onCommit: (name: string) => void }) {
    const [editing, setEditing] = useState(false), [draft, setDraft] = useState(value);
    if (!editing) return <span className="layer-name" title={value} onDoubleClick={event => { event.stopPropagation(); setDraft(value); setEditing(true); }}>{value}</span>;
    const commit = () => { const next = draft.trim(); if (next) onCommit(next); setEditing(false); };
    return <input className="inline-name" autoFocus value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onClick={event => event.stopPropagation()} onKeyDown={event => { event.stopPropagation(); if (event.key === "Enter") commit(); if (event.key === "Escape") setEditing(false); }}/>
}

export default function LayerPanel(props: Props) {
    const selectedRegion = props.regions.find(region => region.id === props.selectedRegionId) ?? null;
    return <aside className="layers">
        <div className="panel-toolbar">
            <button className="primary" onClick={props.onAddRegion}>+ Region</button>
            <button title="Show only the selected layer in the editor" disabled={!props.selectedLayerId} className={props.isolate ? "active" : ""} onClick={props.onToggleIsolate}>Isolate Selection</button>
        </div>
        {props.regions.map((region, regionIndex) => {
            const selected = region.id === props.selectedRegionId;
            return <section className={`region-group ${selected ? "selected" : ""}`} key={region.id}>
                <div className="region-row" onClick={() => props.onSelectRegion(region.id)}>
                    <i style={{ background: region.authoring.color }}/>
                    <EditableName value={region.name} onCommit={name => props.onRenameRegion(region.id, name)}/>
                    <span className="priority" title="Priority">P{region.priority}</span>
                    <button title="Move region up" disabled={regionIndex === 0} onClick={event => { event.stopPropagation(); props.onMoveRegion(region.id, -1); }}>↑</button>
                    <button title="Move region down" disabled={regionIndex === props.regions.length - 1} onClick={event => { event.stopPropagation(); props.onMoveRegion(region.id, 1); }}>↓</button>
                    <button title="Lock region" onClick={event => { event.stopPropagation(); props.onToggleRegion(region.id, "locked"); }}>{region.authoring.locked ? "🔒" : "🔓"}</button>
                    <input title="Enable region for output" type="checkbox" checked={region.enabled} onClick={event => event.stopPropagation()} onChange={() => props.onToggleRegion(region.id, "enabled")}/>
                </div>
                {selected && <div className="geometry-layers">
                    {[...geometryLayers(region)].reverse().map((layer, reverseIndex, layers) => {
                        const selectedLayer = props.selectedLayerIds.includes(layer.id), primaryLayer = layer.id === props.selectedLayerId;
                        const geometryTypes = new Set(layer.geometries.map(item => item.type));
                        const maskGroups = new Set(layer.geometries.map(geometryMaskGroupId)).size;
                        const layerIcon = geometryTypes.size > 1 || maskGroups > 1 ? "◈" : layer.geometries[0].type === "rect" ? "▭" : layer.geometries[0].type === "ellipse" ? "◯" : layer.geometries[0].type === "polygon" ? "⬠" : layer.geometries[0].type === "raster_mask" ? "▦" : "✎";
                        return <div key={layer.id} className={`geometry-row ${selectedLayer ? "selected" : ""} ${primaryLayer ? "primary-selection" : ""}`} onClick={event => props.onSelectLayer(layer.id, event.shiftKey ? "range" : event.ctrlKey || event.metaKey ? "toggle" : "replace")}>
                            <span title={`${layer.geometries.length} operations · ${maskGroups} mask group${maskGroups === 1 ? "" : "s"}`}>{layerIcon}{layer.geometries.some(item => item.operation === "subtract") ? "−" : ""}</span>
                            <EditableName value={layer.authoring.name} onCommit={name => props.onRenameLayer(layer.id, name)}/>
                            <button title="Visible in editor" onClick={event => { event.stopPropagation(); props.onToggleLayer(layer.id, "visible"); }}>{layer.authoring.visible ? "◉" : "○"}</button>
                            <button title="Lock layer" onClick={event => { event.stopPropagation(); props.onToggleLayer(layer.id, "locked"); }}>{layer.authoring.locked ? "🔒" : "🔓"}</button>
                            <input title="Enable for mask output" type="checkbox" checked={layer.enabled} onClick={event => event.stopPropagation()} onChange={() => props.onToggleLayer(layer.id, "enabled")}/>
                            {primaryLayer && props.selectedLayerIds.length === 1 && <div className="layer-quick-actions">
                                <button title="Move layer up" disabled={reverseIndex === 0} onClick={event => { event.stopPropagation(); props.onMoveLayer(layer.id, 1); }}>↑</button>
                                <button title="Move layer down" disabled={reverseIndex === layers.length - 1} onClick={event => { event.stopPropagation(); props.onMoveLayer(layer.id, -1); }}>↓</button>
                                <button title="Duplicate layer" onClick={event => { event.stopPropagation(); props.onDuplicateLayer(layer.id); }}>⧉</button>
                                <button className="danger" title="Delete layer" onClick={event => { event.stopPropagation(); props.onDeleteLayer(layer.id); }}>×</button>
                            </div>}
                        </div>;
                    })}
                </div>}
            </section>;
        })}
        {selectedRegion && <button className="delete-region" onClick={() => props.onDeleteRegion(selectedRegion.id)}>Delete Region</button>}
    </aside>;
}

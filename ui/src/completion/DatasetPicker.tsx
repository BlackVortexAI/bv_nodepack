import React, { useEffect, useState } from "react";
import { setCompletionDatasetSelection, useCompletionDatasetSelection } from "./settings";

type Dataset = { id: string; name: string; bytes: number };

export default function DatasetPicker() {
    const selected = useCompletionDatasetSelection();
    const [datasets, setDatasets] = useState<Dataset[]>([]);
    const [error, setError] = useState("");
    const load = async () => {
        try {
            const response = await fetch("/bv_nodepack/completion/status");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const payload = await response.json();
            setDatasets(Array.isArray(payload?.datasets) ? payload.datasets : []);
            setError("");
        } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    };
    useEffect(() => { void load(); }, []);
    const active = selected ?? datasets.map(item => item.id);
    const toggle = (id: string) => setCompletionDatasetSelection(active.includes(id) ? active.filter(item => item !== id) : [...active, id], true);
    const move = (id: string, offset: number) => {
        const index = active.indexOf(id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= active.length) return;
        const next = [...active];
        [next[index], next[target]] = [next[target], next[index]];
        setCompletionDatasetSelection(next, true);
    };
    const byId = new Map(datasets.map(item => [item.id, item]));
    const ordered = [...active.map(id => byId.get(id)).filter((item): item is Dataset => Boolean(item)), ...datasets.filter(item => !active.includes(item.id))];
    return <div className="completion-dataset-picker">
        <strong>Completion Data</strong>
        <small>Topmost enabled dataset wins when tags are duplicated.</small>
        {ordered.map(item => { const index = active.indexOf(item.id); const enabled = index >= 0; return <label key={item.id}><input type="checkbox" checked={enabled} onChange={() => toggle(item.id)}/><span title={item.id}>{item.name}</span><small>{(item.bytes / 1048576).toFixed(1)} MiB</small><span className="dataset-order"><button disabled={!enabled || index === 0} title="Move up" onClick={() => move(item.id, -1)}>↑</button><button disabled={!enabled || index === active.length - 1} title="Move down" onClick={() => move(item.id, 1)}>↓</button></span></label>; })}
        {!datasets.length && !error && <small>No local CSV/TSV dataset found.</small>}
        {error && <small className="dataset-error">Could not load datasets: {error}</small>}
        <button onClick={() => void load()}>Reload List</button>
    </div>;
}

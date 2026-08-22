import React, { useEffect, useState } from "react";
import { setCompletionDatasetSelection, useCompletionDatasetSelection } from "./settings";
import { Button, CheckboxField } from "../ui/components";

type Dataset = { id: string; name: string; bytes: number };

export default function DatasetPicker({ onSelectionChange }: { onSelectionChange?: (value: string[]) => void } = {}) {
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
    const commit = (next: string[]) => { setCompletionDatasetSelection(next, true); onSelectionChange?.(next); };
    const toggle = (id: string) => commit(active.includes(id) ? active.filter(item => item !== id) : [...active, id]);
    const move = (id: string, offset: number) => {
        const index = active.indexOf(id);
        const target = index + offset;
        if (index < 0 || target < 0 || target >= active.length) return;
        const next = [...active];
        [next[index], next[target]] = [next[target], next[index]];
        commit(next);
    };
    const byId = new Map(datasets.map(item => [item.id, item]));
    const ordered = [...active.map(id => byId.get(id)).filter((item): item is Dataset => Boolean(item)), ...datasets.filter(item => !active.includes(item.id))];
    return <div className="completion-dataset-picker">
        <strong>Completion Data</strong>
        <small>Topmost enabled dataset wins when tags are duplicated.</small>
        {ordered.map(item => { const index = active.indexOf(item.id); const enabled = index >= 0; return <div key={item.id}><CheckboxField label={item.name} help={`${(item.bytes / 1048576).toFixed(1)} MiB`} checked={enabled} onValue={()=>toggle(item.id)}/><span className="dataset-order"><Button intent="ghost" iconOnly disabled={!enabled || index === 0} title="Move up" onClick={() => move(item.id, -1)}>↑</Button><Button intent="ghost" iconOnly disabled={!enabled || index === active.length - 1} title="Move down" onClick={() => move(item.id, 1)}>↓</Button></span></div>; })}
        {!datasets.length && !error && <small>No local CSV/TSV dataset found.</small>}
        {error && <small className="dataset-error">Could not load datasets: {error}</small>}
        <Button onClick={() => void load()}>Reload List</Button>
    </div>;
}

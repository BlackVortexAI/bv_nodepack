import { useEffect, useState } from "react";

export const COMPLETION_SETTING_ID = "BV.NodePack.Completion.Enabled";
export const COMPLETION_DATASETS_SETTING_ID = "BV.NodePack.Completion.Datasets";
const STORAGE_KEY = "bv-nodepack:completion-enabled";
const CHANGE_EVENT = "bv-completion-enabled-changed";
const DATASET_STORAGE_KEY = "bv-nodepack:completion-datasets";
const DATASET_CHANGE_EVENT = "bv-completion-datasets-changed";
let persistPreference: ((enabled: boolean) => void) | null = null;
let persistDatasets: ((value: string) => void) | null = null;

export function completionEnabled() {
    try { return localStorage.getItem(STORAGE_KEY) !== "false"; }
    catch { return true; }
}

export function bindCompletionSettingPersistence(writer: (enabled: boolean) => void) {
    persistPreference = writer;
}

export function setCompletionEnabled(enabled: boolean, persist = false) {
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch {}
    if (persist) persistPreference?.(enabled);
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { enabled } }));
}

export function useCompletionEnabled() {
    const [enabled, setEnabled] = useState(completionEnabled);
    useEffect(() => {
        const update = (event: Event) => setEnabled(Boolean((event as CustomEvent).detail?.enabled));
        window.addEventListener(CHANGE_EVENT, update);
        return () => window.removeEventListener(CHANGE_EVENT, update);
    }, []);
    return enabled;
}

export function completionDatasetSelection(): string[] | null {
    try {
        const stored = localStorage.getItem(DATASET_STORAGE_KEY);
        if (stored == null) return null;
        const parsed = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.map(String) : null;
    } catch { return null; }
}

export function bindCompletionDatasetPersistence(writer: (value: string) => void) {
    persistDatasets = writer;
}

export function setCompletionDatasetSelection(datasets: string[], persist = false) {
    const normalized = [...new Set(datasets.map(String))];
    try { localStorage.setItem(DATASET_STORAGE_KEY, JSON.stringify(normalized)); } catch {}
    if (persist) persistDatasets?.(JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent(DATASET_CHANGE_EVENT, { detail: { datasets: normalized } }));
}

export function applyCompletionDatasetSetting(value: unknown) {
    if (value == null || value === "") {
        try { localStorage.removeItem(DATASET_STORAGE_KEY); } catch {}
        window.dispatchEvent(new CustomEvent(DATASET_CHANGE_EVENT, { detail: { datasets: null } }));
        return;
    }
    try {
        const parsed = typeof value === "string" ? JSON.parse(value) : value;
        if (Array.isArray(parsed)) setCompletionDatasetSelection(parsed.map(String));
    } catch {}
}

export function useCompletionDatasetSelection() {
    const [datasets, setDatasets] = useState<string[] | null>(completionDatasetSelection);
    useEffect(() => {
        const update = (event: Event) => setDatasets((event as CustomEvent).detail?.datasets ?? null);
        window.addEventListener(DATASET_CHANGE_EVENT, update);
        return () => window.removeEventListener(DATASET_CHANGE_EVENT, update);
    }, []);
    return datasets;
}

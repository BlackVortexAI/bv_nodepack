
import { getApp } from "../../appHelper.js";

const comfyApp = getApp();
const graph = comfyApp.rootGraph as any;

export type BVControlConfig = {
    rows: BVControlRow[];
}

export type BVControlRow = {
    title: string;
    entries: BVControlEntry[]
}

export type BVControlGroup = {
    title: string;
}

export type BVControlNode = {
    id: string;
}

// export type BVControlEntry =
//     | { kind: "group"; ref: BVControlGroup }
//     | { kind: "node"; ref: BVControlNode };

export type BVControlEntry = {
    kind: "group";
    ref: BVControlGroup
    action: "bypass"|"mute"
};

function getRootGraph(): any | null {
    const app = getApp();
    return app?.rootGraph ?? null;
}

export function writeConfig(config: BVControlConfig | null) {
    const graph = getRootGraph();
    if (!graph) {
        console.warn("[BV] rootGraph not ready yet, cannot write config");
        return;
    }

    graph.extra ??= {};
    graph.extra.bv_settings ??= {};
    graph.extra.bv_settings.controlConfig = config;

    // optional: mark dirty so the user saving will persist it
    graph.setDirtyCanvas?.(true, true);
}

export function readConfig(): BVControlConfig | null {
    const graph = getRootGraph();
    return (graph?.extra?.bv_settings?.controlConfig ?? null) as BVControlConfig | null;
}


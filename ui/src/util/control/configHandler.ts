import { getApp } from "../../appHelper.js";

export type BVControlAction = "activate" | "bypass" | "mute";

export type BVControlAssignment = {
    groupId: string;
    groupPath: string;
    groupTitle: string;
    action: BVControlAction;
    unresolved?: boolean;
};

export type BVControl = {
    id: string;
    name: string;
    enabled: boolean;
    assignments: BVControlAssignment[];
};

export type BVControlConfig = {
    version: 2;
    forceActive: boolean;
    controls: BVControl[];
};

export const CONFIG_CHANGED_EVENT = "bv-control-config-changed";

export function emptyConfig(): BVControlConfig {
    return { version: 2, forceActive: false, controls: [] };
}

export function writeConfig(config: BVControlConfig) {
    const graph = getApp()?.rootGraph as any;
    if (!graph) return;
    graph.extra ??= {};
    graph.extra.bv_settings ??= {};
    graph.extra.bv_settings.controlConfig = config;
    graph.setDirtyCanvas?.(true, true);
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT, { detail: config }));
}

export function readConfig(): BVControlConfig {
    const value = (getApp()?.rootGraph as any)?.extra?.bv_settings?.controlConfig;
    return value?.version === 2 ? value as BVControlConfig : emptyConfig();
}

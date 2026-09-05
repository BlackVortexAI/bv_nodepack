export const UI_SIZE_SETTING_ID = "BV.NodePack.UI.Size";
export const UI_REDUCED_EFFECTS_SETTING_ID = "BV.NodePack.UI.ReducedEffects";
export const UI_WINDOW_SWITCH_MODE_SETTING_ID = "BV.NodePack.UI.WindowSwitchMode";
export const LORA_MATURE_PREVIEWS_SETTING_ID = "BV.NodePack.LoRA.ShowMaturePreviews";

export type BvUiSize = "compact" | "default" | "large";
export type BvWindowSwitchMode = "keep" | "replace";

let windowSwitchMode: BvWindowSwitchMode = "keep";
let persistWindowSwitchMode: ((value: BvWindowSwitchMode) => void) | undefined;
const windowSwitchListeners = new Set<(value: BvWindowSwitchMode) => void>();
let maturePreviewVisibility=false;
let persistMaturePreviewVisibility:((value:boolean)=>void)|undefined;
const maturePreviewListeners=new Set<(value:boolean)=>void>();

export const getMaturePreviewVisibility=()=>maturePreviewVisibility;
export const bindMaturePreviewPersistence=(persist:(value:boolean)=>void)=>{persistMaturePreviewVisibility=persist};
export const subscribeMaturePreviewVisibility=(listener:(value:boolean)=>void)=>{maturePreviewListeners.add(listener);return()=>maturePreviewListeners.delete(listener)};
export function setMaturePreviewVisibility(value:unknown,persist=true){const next=value===true;if(next===maturePreviewVisibility)return next;maturePreviewVisibility=next;if(persist)persistMaturePreviewVisibility?.(next);maturePreviewListeners.forEach(listener=>listener(next));return next}

export const normalizeWindowSwitchMode = (value: unknown): BvWindowSwitchMode => value === "replace" ? "replace" : "keep";
export const getWindowSwitchMode = () => windowSwitchMode;
export const bindWindowSwitchModePersistence = (persist: (value: BvWindowSwitchMode) => void) => { persistWindowSwitchMode = persist; };
export const subscribeWindowSwitchMode = (listener: (value: BvWindowSwitchMode) => void) => { windowSwitchListeners.add(listener); return () => windowSwitchListeners.delete(listener); };
export function setWindowSwitchMode(value: unknown, persist = true) {
    windowSwitchMode = normalizeWindowSwitchMode(value);
    if (persist) persistWindowSwitchMode?.(windowSwitchMode);
    windowSwitchListeners.forEach(listener => listener(windowSwitchMode));
    return windowSwitchMode;
}

const SIZE_CLASSES = ["bv-ui-size-compact", "bv-ui-size-default", "bv-ui-size-large"];

export function normalizeUiSize(value: unknown): BvUiSize {
    return value === "compact" || value === "large" ? value : "default";
}

export function applyUiSize(value: unknown, root: HTMLElement = document.documentElement) {
    const size = normalizeUiSize(value);
    root.classList.remove(...SIZE_CLASSES);
    root.classList.add(`bv-ui-size-${size}`);
    return size;
}

export function applyReducedEffects(value: unknown, root: HTMLElement = document.documentElement) {
    root.classList.toggle("bv-ui-reduced-effects", Boolean(value));
    return Boolean(value);
}

export function applyUiPreferences(settings: { getSettingValue?: (id: string, fallback: unknown) => unknown } | undefined) {
    applyUiSize(settings?.getSettingValue?.(UI_SIZE_SETTING_ID, "default"));
    applyReducedEffects(settings?.getSettingValue?.(UI_REDUCED_EFFECTS_SETTING_ID, false));
    setWindowSwitchMode(settings?.getSettingValue?.(UI_WINDOW_SWITCH_MODE_SETTING_ID, "keep"), false);
    setMaturePreviewVisibility(settings?.getSettingValue?.(LORA_MATURE_PREVIEWS_SETTING_ID, false), false);
}

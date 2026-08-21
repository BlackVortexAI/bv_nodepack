export const UI_SIZE_SETTING_ID = "BV.NodePack.UI.Size";
export const UI_REDUCED_EFFECTS_SETTING_ID = "BV.NodePack.UI.ReducedEffects";

export type BvUiSize = "compact" | "default" | "large";

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
}

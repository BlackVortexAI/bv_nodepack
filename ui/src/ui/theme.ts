export const BV_THEME_NAMES = ["cool-graphite"] as const;
export type BvThemeName = typeof BV_THEME_NAMES[number];
export type BvAppearance = "auto" | "dark" | "light";
export type BvThemeSelection = Readonly<{ theme: BvThemeName; appearance: BvAppearance }>;

export const DEFAULT_BV_THEME: BvThemeSelection = Object.freeze({
    theme: "cool-graphite",
    appearance: "auto",
});

let currentTheme: BvThemeSelection = DEFAULT_BV_THEME;

export function applyBvTheme(selection: BvThemeSelection = DEFAULT_BV_THEME) {
    currentTheme = Object.freeze({ ...selection });
    const root = document.documentElement;
    root.dataset.bvTheme = currentTheme.theme;
    root.dataset.bvAppearance = currentTheme.appearance;
}

export function getBvTheme(): BvThemeSelection {
    return currentTheme;
}

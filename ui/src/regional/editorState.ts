import type { BrushSettings, Tool } from "./ToolPalette";

export type EditorMode = "workspace" | "floating";
export type EditorMenu = "file" | "edit" | "view" | "artboard" | "layers" | "help" | null;
export type WindowGeometry = { x: number; y: number; width: number; height: number };
export type ArtboardView = { zoom: number; panX: number; panY: number; fit: boolean };
export type EditorViewState = {
    version: 1;
    mode: EditorMode;
    windows: Record<EditorMode, WindowGeometry>;
    panels: { left: number; right: number };
    artboard: ArtboardView;
    selectedRegionId: string | null;
    selectedLayerId: string | null;
    displayOpacity: number;
    isolate: boolean;
    tool: Tool;
    brush: BrushSettings;
    openMenu: EditorMenu;
    promptSections: { region: boolean; global: boolean; background: boolean };
    quickPromptTarget: string;
    quickPromptWindow: { x: number; y: number };
};

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const PREFIX = "bv-regional-editor-state-v1:";
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const tools: Tool[] = ["select", "rect", "brush-add", "brush-subtract"];

export function editorStateKey(documentId: string) { return `${PREFIX}${documentId}`; }

export function clampQuickPromptPosition(value: { x: number; y: number }, viewport: { width: number; height: number }, panel = { width: 520, height: 560 }) {
    const visibleHeader = 52;
    return {
        x: clamp(finite(value.x, viewport.width - panel.width - 24), -panel.width + visibleHeader, viewport.width - visibleHeader),
        y: clamp(finite(value.y, 84), 72, Math.max(72, viewport.height - visibleHeader)),
    };
}

export function activeWindowGeometry(state: EditorViewState, viewport: { width: number; height: number }) {
    return state.mode === "workspace"
        ? clampWindowGeometry({ x: 24, y: 58, width: viewport.width - 48, height: viewport.height - 82 }, viewport, "workspace")
        : state.windows.floating;
}

export function observedWindowSize(entry: { contentRect: { width: number; height: number }; borderBoxSize?: ArrayLike<{ inlineSize: number; blockSize: number }> }) {
    const borderBox = entry.borderBoxSize?.[0];
    return borderBox ? { width: borderBox.inlineSize, height: borderBox.blockSize } : { width: entry.contentRect.width, height: entry.contentRect.height };
}

export function applyObservedWindowSize(state: EditorViewState, observedMode: EditorMode, size: { width: number; height: number }): EditorViewState {
    const current = state.windows[observedMode];
    return { ...state, windows: { ...state.windows, [observedMode]: { ...current, ...size } } };
}

export function clampWindowGeometry(value: WindowGeometry, viewport: { width: number; height: number }, mode: EditorMode): WindowGeometry {
    const minWidth = Math.min(780, Math.max(320, viewport.width - 16));
    const minHeight = Math.min(520, Math.max(300, viewport.height - 16));
    const maxWidth = Math.max(minWidth, viewport.width);
    const maxHeight = Math.max(minHeight, viewport.height);
    const width = clamp(finite(value.width, minWidth), minWidth, maxWidth);
    const height = clamp(finite(value.height, minHeight), minHeight, maxHeight);
    const margin = mode === "workspace" ? 8 : 0;
    return {
        x: clamp(finite(value.x, margin), margin - width + 80, viewport.width - margin - 80),
        y: clamp(finite(value.y, 58), 0, viewport.height - 42),
        width,
        height,
    };
}

export function defaultEditorState(viewport = { width: window.innerWidth, height: window.innerHeight }): EditorViewState {
    const workspace = clampWindowGeometry({ x: 24, y: 58, width: viewport.width - 48, height: viewport.height - 82 }, viewport, "workspace");
    const floatingWidth = Math.min(1100, viewport.width - 32), floatingHeight = Math.min(760, viewport.height - 80);
    const floating = clampWindowGeometry({ x: Math.max(16, viewport.width - floatingWidth - 32), y: 64, width: floatingWidth, height: floatingHeight }, viewport, "floating");
    return {
        version: 1,
        mode: "workspace",
        windows: { workspace, floating },
        panels: { left: 290, right: 340 },
        artboard: { zoom: 1, panX: 0, panY: 0, fit: true },
        selectedRegionId: null,
        selectedLayerId: null,
        displayOpacity: .5,
        isolate: false,
        tool: "select",
        brush: { size: .04, hardness: .75, opacity: 1, shape: "round", pressureMode: "constant" },
        openMenu: null,
        promptSections: { region: false, global: false, background: false },
        quickPromptTarget: "global",
        quickPromptWindow: clampQuickPromptPosition({ x: viewport.width - 544, y: 84 }, viewport),
    };
}

export function normalizeEditorState(value: unknown, viewport = { width: window.innerWidth, height: window.innerHeight }): EditorViewState {
    const defaults = defaultEditorState(viewport), input = value && typeof value === "object" ? value as Partial<EditorViewState> : {};
    const mode: EditorMode = input.mode === "floating" ? "floating" : "workspace";
    const windows = input.windows && typeof input.windows === "object" ? input.windows : defaults.windows;
    const panels = input.panels && typeof input.panels === "object" ? input.panels : defaults.panels;
    const artboard = input.artboard && typeof input.artboard === "object" ? input.artboard : defaults.artboard;
    const brush = input.brush && typeof input.brush === "object" ? input.brush : defaults.brush;
    return {
        version: 1,
        mode,
        windows: {
            workspace: clampWindowGeometry(windows.workspace ?? defaults.windows.workspace, viewport, "workspace"),
            floating: clampWindowGeometry(windows.floating ?? defaults.windows.floating, viewport, "floating"),
        },
        panels: { left: clamp(finite(panels.left, 290), 210, 620), right: clamp(finite(panels.right, 340), 210, 620) },
        artboard: {
            zoom: clamp(finite(artboard.zoom, 1), .02, 8),
            panX: finite(artboard.panX, 0),
            panY: finite(artboard.panY, 0),
            fit: typeof artboard.fit === "boolean" ? artboard.fit : true,
        },
        selectedRegionId: typeof input.selectedRegionId === "string" ? input.selectedRegionId : null,
        selectedLayerId: typeof input.selectedLayerId === "string" ? input.selectedLayerId : null,
        displayOpacity: clamp(finite(input.displayOpacity, .5), .05, 1),
        isolate: input.isolate === true,
        tool: tools.includes(input.tool as Tool) ? input.tool as Tool : "select",
        brush: {
            size: clamp(finite(brush.size, .04), .001, 1),
            hardness: clamp(finite(brush.hardness, .75), 0, 1),
            opacity: clamp(finite(brush.opacity, 1), 0, 1),
            shape: brush.shape === "square" ? "square" : "round",
            pressureMode: brush.pressureMode === "stylus" ? "stylus" : "constant",
        },
        openMenu: (["file", "edit", "view", "artboard", "layers", "help"] as EditorMenu[]).includes(input.openMenu as EditorMenu) ? input.openMenu as EditorMenu : null,
        promptSections: {
            region: input.promptSections?.region === true,
            global: input.promptSections?.global === true,
            background: input.promptSections?.background === true,
        },
        quickPromptTarget: typeof input.quickPromptTarget === "string" && input.quickPromptTarget ? input.quickPromptTarget : "global",
        quickPromptWindow: clampQuickPromptPosition(input.quickPromptWindow ?? defaults.quickPromptWindow, viewport),
    };
}

export function loadEditorState(documentId: string, storage: StorageLike = localStorage, viewport = { width: window.innerWidth, height: window.innerHeight }): EditorViewState {
    try { return normalizeEditorState(JSON.parse(storage.getItem(editorStateKey(documentId)) || "null"), viewport); }
    catch { return defaultEditorState(viewport); }
}

export function saveEditorState(documentId: string, value: EditorViewState, storage: StorageLike = localStorage) {
    try { storage.setItem(editorStateKey(documentId), JSON.stringify(value)); return true; }
    catch { return false; }
}

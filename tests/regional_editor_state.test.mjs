import assert from "node:assert/strict";
import test from "node:test";
import { activeWindowGeometry, applyObservedWindowSize, clampQuickPromptPosition, clampWindowGeometry, defaultEditorState, editorStateKey, loadEditorState, normalizeEditorState, observedWindowSize, saveEditorState } from "../ui/src/regional/editorState.ts";

const viewport = { width: 1600, height: 900 };
const memoryStorage = () => {
    const values = new Map();
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
};

test("editor state is isolated by stable document id", () => {
    const storage = memoryStorage(), state = defaultEditorState(viewport);
    state.mode = "floating";
    saveEditorState("doc-a", state, storage);
    assert.equal(loadEditorState("doc-a", storage, viewport).mode, "floating");
    assert.equal(loadEditorState("doc-b", storage, viewport).mode, "workspace");
    assert.notEqual(editorStateKey("doc-a"), editorStateKey("doc-b"));
});

test("invalid persisted values are normalized without entering semantic document data", () => {
    const normalized = normalizeEditorState({ mode: "garbage", panels: { left: -1, right: 9000 }, artboard: { zoom: 99 }, displayOpacity: -4, backgroundOpacity: 4 }, viewport);
    assert.equal(normalized.version, 1);
    assert.equal(normalized.mode, "workspace");
    assert.deepEqual(normalized.panels, { left: 210, right: 620 });
    assert.equal(normalized.artboard.zoom, 8);
    assert.equal(normalized.displayOpacity, .05);
    assert.equal(normalized.backgroundOpacity, 1);
    assert.equal(normalized.openMenu, null);
    assert.equal("document_id" in normalized, false);
});

test("background display opacity survives save and reload per document", () => {
    const storage = memoryStorage(), state = defaultEditorState(viewport);
    state.backgroundOpacity = .35;
    saveEditorState("doc", state, storage);
    assert.equal(loadEditorState("doc", storage, viewport).backgroundOpacity, .35);
    assert.equal(loadEditorState("other-doc", storage, viewport).backgroundOpacity, 1);
});

test("floating windows remain recoverable after viewport changes", () => {
    const value = clampWindowGeometry({ x: 5000, y: -300, width: 1200, height: 700 }, { width: 1000, height: 700 }, "floating");
    assert.ok(value.x <= 920);
    assert.equal(value.y, 0);
    assert.equal(value.width, 1000);
    assert.equal(value.height, 700);
});

test("corrupt storage falls back to defaults", () => {
    const storage = { getItem: () => "{broken", setItem: () => {} };
    assert.equal(loadEditorState("doc", storage, viewport).mode, "workspace");
});

test("storage quota failures do not break the editor", () => {
    const storage = { getItem: () => null, setItem: () => { throw new Error("quota"); } };
    assert.equal(saveEditorState("doc", defaultEditorState(viewport), storage), false);
});

test("resize observation persists border-box size without cumulative shrink", () => {
    const size = observedWindowSize({ contentRect: { width: 1098, height: 698 }, borderBoxSize: [{ inlineSize: 1100, blockSize: 700 }] });
    assert.deepEqual(size, { width: 1100, height: 700 });
});

test("a delayed observer updates the mode it observed rather than the newly active mode", () => {
    const state = defaultEditorState(viewport), floatingBefore = { ...state.windows.floating };
    state.mode = "floating";
    const updated = applyObservedWindowSize(state, "workspace", { width: 1400, height: 800 });
    assert.deepEqual(updated.windows.floating, floatingBefore);
    assert.equal(updated.windows.workspace.width, 1400);
});

test("workspace always fills the available viewport instead of using a resized window", () => {
    const state = defaultEditorState(viewport);
    state.windows.workspace = { x: 300, y: 200, width: 900, height: 600 };
    assert.deepEqual(activeWindowGeometry(state, viewport), { x: 24, y: 58, width: 1552, height: 818 });
});

test("expanded prompt sections survive save and reload for the same document", () => {
    const storage = memoryStorage(), state = defaultEditorState(viewport);
    state.promptSections.region = true;
    saveEditorState("doc", state, storage);
    assert.equal(loadEditorState("doc", storage, viewport).promptSections.region, true);
});

test("quick edit remembers its last prompt target per document", () => {
    const storage = memoryStorage(), state = defaultEditorState(viewport);
    state.quickPromptTarget = "region-id-2";
    saveEditorState("doc", state, storage);
    assert.equal(loadEditorState("doc", storage, viewport).quickPromptTarget, "region-id-2");
    assert.equal(loadEditorState("other-doc", storage, viewport).quickPromptTarget, "global");
});

test("quick edit starts below the ComfyUI toolbar and remains recoverable", () => {
    assert.deepEqual(clampQuickPromptPosition({ x: 5000, y: 10 }, viewport), { x: 1548, y: 72 });
    const storage = memoryStorage(), state = defaultEditorState(viewport);
    state.quickPromptWindow = { x: 320, y: 180 };
    saveEditorState("doc", state, storage);
    assert.deepEqual(loadEditorState("doc", storage, viewport).quickPromptWindow, { x: 320, y: 180 });
});

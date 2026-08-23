import assert from "node:assert/strict";
import test from "node:test";
import { textareaCaretRect } from "../ui/src/completion/position.ts";

test("caret positioning preserves textarea layout before mapping through canvas zoom", () => {
    const originalDocument = globalThis.document;
    const originalWindow = globalThis.window;
    let mirror;
    const marker = {
        style: {},
        getBoundingClientRect: () => mirror.style.width === "600px"
            ? { left: 200, top: 80 }
            : { left: 250, top: 180 },
    };
    mirror = {
        style: {},
        setAttribute: () => {},
        append: () => {},
        remove: () => {},
        getBoundingClientRect: () => ({ left: 0, top: 0 }),
        scrollTop: 0,
        scrollLeft: 0,
        textContent: "",
    };
    globalThis.document = { createElement: tag => tag === "span" ? marker : mirror, body: { append: () => {} } };
    globalThis.window = {
        getComputedStyle: () => ({ boxSizing: "border-box", lineHeight: "20px", fontSize: "16px" }),
    };
    const textarea = {
        value: "long transformed prompt",
        selectionStart: 12,
        scrollTop: 0,
        scrollLeft: 0,
        offsetWidth: 600,
        offsetHeight: 200,
        getBoundingClientRect: () => ({ left: 100, top: 50, width: 300, height: 100 }),
    };
    try {
        assert.deepEqual(textareaCaretRect(textarea), { left: 200, top: 90, bottom: 100 });
    } finally {
        globalThis.document = originalDocument;
        globalThis.window = originalWindow;
    }
});

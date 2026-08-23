import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../ui/src/completion/globalTextareaAdapter.ts", import.meta.url), "utf8");
const promptTextareaSource = readFileSync(new URL("../ui/src/completion/PromptTextarea.tsx", import.meta.url), "utf8");

test("global completion targets native multiline widgets and provides an explicit opt-out", () => {
    assert.match(source, /textarea\.comfy-multiline-input/);
    assert.match(source, /closest\("\[data-node-id\]"\)/);
    assert.match(source, /data-bv-autocomplete/);
    assert.match(source, /stopImmediatePropagation/);
});

test("global completion reevaluates suggestions when the caret moves", () => {
    assert.match(source, /addEventListener\("select", search\)/);
    assert.match(source, /removeEventListener\("select", search\)/);
    assert.match(source, /document\.addEventListener\("selectionchange", selectionChanged\)/);
    assert.match(source, /document\.removeEventListener\("selectionchange", selectionChanged\)/);
    assert.match(promptTextareaSource, /onSelect=\{event => \{ search\(/);
    assert.match(promptTextareaSource, /document\.addEventListener\("selectionchange", selectionChanged\)/);
    assert.match(promptTextareaSource, /document\.removeEventListener\("selectionchange", selectionChanged\)/);
});

test("BV prompt completion follows scrolling fields and corrects for measured popup height", () => {
    assert.match(promptTextareaSource, /addEventListener\("scroll",\s*position,\s*true\)/);
    assert.match(promptTextareaSource, /addEventListener\("resize",\s*position\)/);
    assert.match(promptTextareaSource, /onHeight=/);
    assert.match(source, /onHeight:/);
});

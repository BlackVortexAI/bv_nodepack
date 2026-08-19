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
    assert.match(promptTextareaSource, /onSelect=\{event => \{ search\(/);
});

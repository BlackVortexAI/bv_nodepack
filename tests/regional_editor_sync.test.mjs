import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preserveDocumentIdentity } from "../ui/src/regional/model.ts";
import { detailerBackendWidgetValues, normalizeDetailerWidgetValues } from "../ui/src/regional/detailerPersistence.ts";

const source = readFileSync(new URL("../ui/src/regional/RegionalEditor.tsx", import.meta.url), "utf8");
const extensionSource = readFileSync(new URL("../ui/src/index.tsx", import.meta.url), "utf8");

test("the full editor reloads the node document whenever it opens", () => {
    assert.match(source, /if \(!open \|\| !node\) return;/);
    assert.match(source, /\}, \[node, open\]\);/);
});

test("replacing document content preserves the target editor identity", () => {
    const imported = { document_id: "example-document", title: "Imported example" };
    const replaced = preserveDocumentIdentity(imported, "active-editor");
    assert.equal(replaced.document_id, "active-editor");
    assert.equal(replaced.title, "Imported example");
    assert.equal(imported.document_id, "example-document");
});

test("region selectors are installed for direct selection and detailer mask nodes", () => {
    assert.match(
        extensionSource,
        /\["BV Regional Select", "BV Regional Deconstructor", "BV Regional Detailer Mask"\]\.includes\(nodeData\.name\)/,
    );
    assert.match(
        extensionSource,
        /combo\.disabled = \(scopeWidget && scopeWidget\.value !== "region"\) \|\| !choices\.length;/,
    );
});

test("detailer context regions persist as weighted workflow JSON", () => {
    assert.match(extensionSource, /widget\.name === "context_regions_json"/);
    assert.match(extensionSource, /context_region_\$\{index \+ 1\}/);
    assert.match(extensionSource, /context_influence_\$\{index \+ 1\}/);
    assert.match(extensionSource, /hidden\.value = JSON\.stringify\(next\)/);
    assert.match(extensionSource, /region\.enabled !== false && region\.id !== primaryId/);
    assert.match(extensionSource, /moveWidgetBefore\(node, combo, node\.widgets\?\.find\(\(widget: any\) => widget\.name === "primary_region_influence"\)\)/);
    assert.match(extensionSource, /node\.setSize\(\[Math\.max\(node\.size\?\.\[0\] \?\? 0, computedSize\[0\]\), computedSize\[1\]\]\)/);
    assert.match(extensionSource, /const document = sourceRegionalDocument\(node\);\s+if \(!document\) return;/);
    assert.match(extensionSource, /if \(!document\) \{\s+combo\.options \?\?= \{\};/);
});

test("detailer persistence ignores visual widgets and preserves canonical backend order", () => {
    const context = '[{"region_id":"eyes","influence":1}]';
    const widgets = [
        { name: "region", value: "character" },
        { name: "global_influence", value: 0 },
        { name: "background_influence", value: 0 },
        { name: "region_selector", value: "Character" },
        { name: "primary_region_influence", value: 2 },
        { name: "context_regions_json", value: context },
        { name: "context_region_1", value: "Blue Eye" },
        { name: "context_influence_1", value: 1 },
    ];

    assert.deepEqual(detailerBackendWidgetValues(widgets), ["character", 0, 0, 2, context]);
});

test("detailer persistence migrates the positional null written by early builds", () => {
    const context = '[{"region_id":"eyes","influence":1}]';
    assert.deepEqual(
        normalizeDetailerWidgetValues(["character", 0, 0, null, 2, context]),
        ["character", 0, 0, 2, context],
    );
});

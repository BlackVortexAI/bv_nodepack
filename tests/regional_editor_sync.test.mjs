import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { preserveDocumentIdentity } from "../ui/src/regional/model.ts";

const source = readFileSync(new URL("../ui/src/regional/RegionalEditor.tsx", import.meta.url), "utf8");

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

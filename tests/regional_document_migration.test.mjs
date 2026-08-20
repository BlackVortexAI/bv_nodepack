import assert from "node:assert/strict";
import test from "node:test";
import { emptyDocument, newRegion, parseDocument } from "../ui/src/regional/model.ts";

test("new regional documents and regions use the v2 generation default", () => {
    assert.equal(emptyDocument().version, 2);
    assert.equal(newRegion(0).usage, "generation");
});

test("v1 documents migrate every region to generation usage", () => {
    const document = emptyDocument();
    document.regions.push(newRegion(0));
    const legacy = { ...document, version: 1, regions: document.regions.map(({ usage: _usage, ...region }) => region) };
    const migrated = parseDocument(legacy);
    assert.equal(migrated.version, 2);
    assert.equal(migrated.regions[0].usage, "generation");
});

test("v2 rejects unknown region usages", () => {
    const document = emptyDocument();
    document.regions.push({ ...newRegion(0), usage: "upscaler" });
    assert.throws(() => parseDocument(document), /Invalid region usage/);
});

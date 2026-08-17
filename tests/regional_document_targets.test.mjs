import assert from "node:assert/strict";
import test from "node:test";
import { documentTargetChoices, resolveDocumentTarget } from "../ui/src/regional/documentTargets.ts";

const choices = documentTargetChoices([
    { documentId: "doc-a", nodeId: "12", title: "Characters" },
    { documentId: "doc-b", nodeId: "34", title: "Background Pass" },
]);

test("image sender exposes readable node labels while retaining document IDs", () => {
    assert.deepEqual(choices.map(choice => choice.label), ["Characters · #12", "Background Pass · #34"]);
    assert.equal(choices[1].documentId, "doc-b");
});

test("a new sender selects the first target but never silently retargets a deleted document", () => {
    assert.equal(resolveDocumentTarget("", choices, true), "doc-a");
    assert.equal(resolveDocumentTarget("doc-b", choices, false), "doc-b");
    assert.equal(resolveDocumentTarget("deleted", choices, false), "");
});

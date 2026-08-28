import assert from "node:assert/strict";
import test from "node:test";
import { documentTargetChoices, resolveDocumentTarget, resolveDocumentTargetState } from "../ui/src/regional/documentTargets.ts";

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

test("a sender created before any prompt binds once when the first prompt appears", () => {
    const initiallyEmpty = resolveDocumentTargetState("", [], false);
    assert.deepEqual(initiallyEmpty, { documentId: "", everResolved: false });
    const firstPrompt = resolveDocumentTargetState("", choices, initiallyEmpty.everResolved);
    assert.deepEqual(firstPrompt, { documentId: "doc-a", everResolved: true });
    const deletedTarget = resolveDocumentTargetState("deleted", [choices[1]], true);
    assert.deepEqual(deletedTarget, { documentId: "deleted", everResolved: true });
    const afterReload = resolveDocumentTargetState(deletedTarget.documentId, [choices[1]], false);
    assert.deepEqual(afterReload, { documentId: "deleted", everResolved: true });
});

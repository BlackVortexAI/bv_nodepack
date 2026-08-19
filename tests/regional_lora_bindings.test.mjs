import assert from "node:assert/strict";
import test from "node:test";
import { bindingSummary, bindingWarnings, createRegionalEditorSnapshot, emptyLoraBindings, needsFreshStackId, parseLoraBindings, reconcileLoraBindings } from "../ui/src/regional/loraBindings.ts";
test("LoRA bindings remain outside the regional document", () => { const value = emptyLoraBindings("doc-a"); assert.deepEqual(value.regions, {}); assert.throws(() => parseLoraBindings({ ...value, document_id: "doc-b" }, "doc-a"), /different BV Regional document/); });
test("missing assignments remain visible", () => { const value = { ...emptyLoraBindings("doc-a"), global_stack_id: "missing" }; assert.equal(bindingWarnings(value, []).length, 1); assert.match(bindingSummary(value, [], {}), /Missing stack/); });
test("status identifies live assignments", () => { const value = { ...emptyLoraBindings("doc-a"), global_stack_id: "base", regions: { face: "detail" } }; const stacks = [{ id: "base", name: "Base Style", nodeId: "1" }, { id: "detail", name: "Face Detail", nodeId: "2" }]; assert.equal(bindingWarnings(value, stacks).length, 0); assert.equal(bindingSummary(value, stacks, { face: "Face" }), "Global: Base Style · Face: Face Detail · source values unchanged"); });
test("duplicate sender identities are blocking warnings", () => { const value = { ...emptyLoraBindings("doc-a"), global_stack_id: "same" }; assert.match(bindingWarnings(value, [{ id: "same", name: "A", nodeId: "1" }, { id: "same", name: "B", nodeId: "2" }])[0], /Duplicate LoRA stack ID/); });
test("only a later duplicated named stack needs a fresh identity", () => {
  const stacks = [{ id: "same", name: "Original", nodeId: "24" }, { id: "same", name: "Copy", nodeId: "31" }];
  assert.equal(needsFreshStackId("24", "same", stacks), false);
  assert.equal(needsFreshStackId("31", "same", stacks), true);
  assert.equal(needsFreshStackId("32", "unique", stacks), false);
});
test("orphaned region assignments remain visible as warnings", () => { const value = { ...emptyLoraBindings("doc-a"), regions: { deleted: "stack" } }; assert.match(bindingWarnings(value, [{ id: "stack", name: "Stack", nodeId: "1" }], new Set())[0], /missing region/); });
test("reconciliation removes assignments for regions outside the current document", () => {
  const value = { ...emptyLoraBindings("doc-a"), global_stack_id: "global", regions: { current: "live", deleted: "stale" } };
  assert.deepEqual(reconcileLoraBindings(value, new Set(["current"])), {
    ...emptyLoraBindings("doc-a"), global_stack_id: "global", regions: { current: "live" },
  });
});
test("editor snapshots restore a deleted region together with its LoRA assignment", () => {
  const document = { document_id: "doc-a", regions: [{ id: "region-a" }] };
  const bindings = { ...emptyLoraBindings("doc-a"), regions: { "region-a": "skin" } };
  const beforeDelete = createRegionalEditorSnapshot(document, bindings);
  const afterDelete = createRegionalEditorSnapshot({ ...document, regions: [] }, bindings);
  assert.deepEqual(afterDelete.loraBindings.regions, {});
  assert.deepEqual(beforeDelete.document.regions, [{ id: "region-a" }]);
  assert.deepEqual(beforeDelete.loraBindings.regions, { "region-a": "skin" });
});

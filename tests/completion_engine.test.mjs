import assert from "node:assert/strict";
import test from "node:test";
import { collectSuggestions, completionRequest, insertSuggestion } from "../ui/src/completion/engine.ts";

test("completion extracts the active comma-separated prompt segment", () => {
    const request = completionRequest("masterpiece, blue_h", 19, { scope: "region", polarity: "positive" });
    assert.equal(request.term, "blue_h");
    assert.equal(request.start, 13);
});

test("completion keeps multi-word tags open but closes on a prompt separator", () => {
    const context = { scope: "region", polarity: "positive" };
    assert.equal(completionRequest("woman with ", 11, context)?.term, "woman with ");
    assert.equal(completionRequest("blue hair, red eyes", 10, context), null);
});

test("completion insertion replaces only the active term and leaves one separator", () => {
    const request = completionRequest("masterpiece, blue_h", 19, { scope: "region", polarity: "positive" });
    const result = insertSuggestion("masterpiece, blue_h", request, { id: "blue-hair", insertText: "blue_hair", label: "blue hair", source: "fake" });
    assert.equal(result.text, "masterpiece, blue_hair, ");
    assert.equal(result.caret, result.text.length);
});

test("provider failures are isolated and duplicate candidates are ranked once", async () => {
    const request = completionRequest("blue", 4, { scope: "generic", polarity: "positive" });
    const good = { id: "good", suggest: async () => [{ id: "tag:blue_hair", insertText: "blue_hair", label: "blue hair", source: "fake", score: 5 }, { id: "tag:blue_hair", insertText: "blue_hair", label: "duplicate", source: "fake", score: 1 }] };
    const broken = { id: "broken", suggest: async () => { throw new Error("offline"); } };
    const results = await collectSuggestions(request, [broken, good], new AbortController().signal);
    assert.deepEqual(results.map(item => item.label), ["blue hair"]);
});

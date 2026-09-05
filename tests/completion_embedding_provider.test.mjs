import assert from "node:assert/strict";
import test from "node:test";
import { createEmbeddingCompletionProvider, embeddingSuggestions } from "../ui/src/completion/embeddingProvider.ts";

const request = term => ({ scope: "generic", polarity: "positive", text: term, caret: term.length, term, start: 0, end: term.length, limit: 20 });

test("embedding completion preserves ComfyUI names and inserts prompt syntax", () => {
    const results = embeddingSuggestions(["styles/Frieren.pt", "bad_hands"], "embedding:frie");
    assert.deepEqual(results.map(item => item.insertText), ["embedding:styles/Frieren.pt"]);
    assert.equal(results[0].category, "embedding");
    assert.equal(results[0].source, "ComfyUI Embeddings");
});

test("embedding completion matches spaces, underscores and folders", () => {
    assert.deepEqual(
        embeddingSuggestions(["portrait/bad_hands", "lighting.safetensors"], "bad hands").map(item => item.insertText),
        ["embedding:portrait/bad_hands"],
    );
});

test("explicit embedding syntax can open the complete alphabetic list", () => {
    assert.deepEqual(
        embeddingSuggestions(["zeta", "alpha"], "embedding:").map(item => item.insertText),
        ["embedding:alpha", "embedding:zeta"],
    );
});

test("embedding provider caches success and retries after failure", async () => {
    let calls = 0;
    const cached = createEmbeddingCompletionProvider(async () => { calls++; return ["one_embedding"]; });
    await cached.suggest(request("one"), new AbortController().signal);
    await cached.suggest(request("one"), new AbortController().signal);
    assert.equal(calls, 1);

    const retrying = createEmbeddingCompletionProvider(async () => { calls++; if (calls === 2) throw new Error("temporary"); return ["two_embedding"]; });
    await assert.rejects(retrying.suggest(request("two"), new AbortController().signal));
    assert.equal((await retrying.suggest(request("two"), new AbortController().signal))[0].insertText, "embedding:two_embedding");
    assert.equal(calls, 3);
});

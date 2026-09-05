import type { CompletionProvider, CompletionSuggestion } from "./engine";

type EmbeddingLoader = () => Promise<unknown>;

const normalize = (value: string) => value.trim().toLocaleLowerCase().replaceAll("\\", "/").replaceAll("_", " ");
const searchTerm = (value: string) => normalize(value).replace(/^embedding\s*:\s*/, "");

export function embeddingSuggestions(payload: unknown, term: string): CompletionSuggestion[] {
    const query = searchTerm(term);
    const explicit = /^\s*embedding\s*:/i.test(term);
    if ((!explicit && query.length < 2) || !Array.isArray(payload)) return [];
    return payload.flatMap((value): CompletionSuggestion[] => {
        const name = String(value ?? "").trim();
        if (!name) return [];
        const candidate = normalize(name);
        const match = candidate.indexOf(query);
        if (match < 0) return [];
        const score = (explicit ? 2_000_000_000 : 1_000_000_000) + (candidate === query ? 20_000_000 : match === 0 ? 10_000_000 : 0);
        return [{
            id: `embedding:${name.toLocaleLowerCase()}`,
            insertText: `embedding:${name}`,
            label: `embedding:${name}`,
            source: "ComfyUI Embeddings",
            category: "embedding",
            score,
            metadata: { embedding: name },
        }];
    }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.label.localeCompare(b.label));
}

export function createEmbeddingCompletionProvider(load: EmbeddingLoader): CompletionProvider {
    let cached: Promise<unknown> | null = null;
    const embeddings = () => cached ??= load().catch(error => { cached = null; throw error; });
    return {
        id: "comfy-embeddings",
        async suggest(request, signal) {
            const payload = await embeddings();
            if (signal.aborted) return [];
            return embeddingSuggestions(payload, request.term).slice(0, request.limit);
        },
    };
}

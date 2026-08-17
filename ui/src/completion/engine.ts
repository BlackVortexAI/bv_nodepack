export type CompletionContext = { scope: "global" | "background" | "region" | "generic"; polarity: "positive" | "negative"; modelProfile?: string };
export type CompletionRequest = CompletionContext & { text: string; caret: number; term: string; start: number; end: number; limit: number };
export type CompletionSuggestion = { id: string; insertText: string; label: string; source: string; detail?: string; category?: string; score?: number; metadata?: Record<string, unknown> };
export type CompletionProvider = { id: string; suggest(request: CompletionRequest, signal: AbortSignal): Promise<CompletionSuggestion[]> };

export function completionRequest(text: string, caret: number, context: CompletionContext, limit = 20): CompletionRequest | null {
    const safeCaret = Math.max(0, Math.min(text.length, caret));
    const before = text.slice(0, safeCaret);
    const match = before.match(/(?:^|[,\n;])\s*([^,\n;]*)$/);
    const segment = match?.[1] ?? "";
    const leading = segment.match(/^\s*/)?.[0].length ?? 0;
    const term = segment.slice(leading);
    if (term.trim().length < 2) return null;
    const start = safeCaret - segment.length + leading;
    return { ...context, text, caret: safeCaret, term, start, end: safeCaret, limit };
}

export function insertSuggestion(text: string, request: CompletionRequest, suggestion: CompletionSuggestion) {
    const suffix = text.slice(request.end).match(/^\s*[,;\n]/) ? "" : ", ";
    const inserted = `${suggestion.insertText}${suffix}`;
    return { text: text.slice(0, request.start) + inserted + text.slice(request.end), caret: request.start + inserted.length };
}

export async function collectSuggestions(request: CompletionRequest, providers: CompletionProvider[], signal: AbortSignal) {
    const settled = await Promise.allSettled(providers.map(provider => provider.suggest(request, signal)));
    if (signal.aborted) return [];
    const unique = new Map<string, CompletionSuggestion>();
    settled.forEach(result => {
        if (result.status !== "fulfilled") return;
        result.value.forEach(item => { if (!unique.has(item.id)) unique.set(item.id, item); });
    });
    return [...unique.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.label.localeCompare(b.label)).slice(0, request.limit);
}

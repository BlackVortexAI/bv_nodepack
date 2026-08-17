import type { CompletionProvider, CompletionSuggestion } from "./engine";
import { completionDatasetSelection } from "./settings";

export const localCompletionProvider: CompletionProvider = {
    id: "bv-local-tags",
    async suggest(request, signal) {
        const response = await fetch("/bv_nodepack/completion/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ term: request.term.trim(), limit: request.limit, datasets: completionDatasetSelection() }),
            signal,
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const rows = Array.isArray(payload?.results) ? payload.results : [];
        return rows.flatMap((row: any): CompletionSuggestion[] => {
            const insertText = String(row?.insert_text ?? "").trim();
            if (!insertText) return [];
            return [{
                id: String(row?.id ?? `local:${insertText}`),
                insertText,
                label: String(row?.label ?? insertText),
                source: String(row?.source ?? "BV Local Tags"),
                detail: row?.detail || undefined,
                category: row?.category || undefined,
                score: Number(row?.score) || 0,
                metadata: row?.metadata && typeof row.metadata === "object" ? row.metadata : {},
            }];
        });
    },
};

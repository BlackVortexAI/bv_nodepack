import type { CompletionProvider, CompletionSuggestion } from "./engine";

export const exTagCompleteProvider: CompletionProvider = {
    id: "ex-tag-complete",
    async suggest(request, signal) {
        const response = await fetch("/jupo/ExTagComplete/search", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ term: request.term.trim(), filters: [] }),
            signal,
        });
        if (!response.ok) return [];
        const payload = await response.json();
        const rows = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
        return rows.flatMap((row: any, index: number): CompletionSuggestion[] => {
            const insertText = String(row?.value ?? row?.text ?? row?.term ?? "").trim();
            if (!insertText) return [];
            return [{
                id: `ex-tag-complete:${row?.term ?? insertText}:${index}`,
                insertText,
                label: String(row?.display ?? row?.text ?? row?.term ?? insertText),
                source: "ExTagComplete",
                detail: row?.translate || row?.note || undefined,
                category: row?.categoryName || row?.category || undefined,
                score: Number(row?.postCount) || 0,
                metadata: { site: row?.site, postCount: row?.postCount },
            }];
        });
    },
};

export type DocumentTarget = { documentId: string; nodeId: string; title: string };
export type DocumentTargetChoice = DocumentTarget & { label: string };

export function documentTargetChoices(targets: DocumentTarget[]): DocumentTargetChoice[] {
    const titleCounts = new Map<string, number>();
    targets.forEach(target => titleCounts.set(target.title, (titleCounts.get(target.title) ?? 0) + 1));
    return targets.map(target => ({
        ...target,
        label: titleCounts.get(target.title)! > 1 ? `${target.title} · #${target.nodeId}` : `${target.title} · #${target.nodeId}`,
    }));
}

export function resolveDocumentTarget(currentDocumentId: unknown, choices: DocumentTargetChoice[], initialize: boolean) {
    const current = typeof currentDocumentId === "string" ? currentDocumentId : "";
    if (choices.some(choice => choice.documentId === current)) return current;
    return initialize ? choices[0]?.documentId ?? "" : "";
}

export type ReferenceMention = { start: number; end: number; label: string; collector_id: string; resource_id: string };
export type ReferenceChoice = { collector_id: string; resource_id: string; label: string; origin: string; preview?: string; available?: boolean; media_type?: string };

export function referenceRequest(text: string, caret: number) {
    const match = text.slice(0, caret).match(/(?:^|\s)@([^@\n,;]*)$/);
    return match ? { start: caret - match[1].length - 1, end: caret, term: match[1].toLowerCase() } : null;
}
/** Edits outside mentions shift offsets. Editing a mention removes its binding. */
export function updateMentions(before: string, after: string, mentions: ReferenceMention[]) {
    if (before === after) return mentions;
    let start = 0; while (start < before.length && start < after.length && before[start] === after[start]) start++;
    let end = before.length, nextEnd = after.length;
    while (end > start && nextEnd > start && before[end - 1] === after[nextEnd - 1]) { end--; nextEnd--; }
    const delta = nextEnd - end;
    return mentions.flatMap(mention => mention.end <= start ? [mention] : mention.start >= end ? [{ ...mention, start: mention.start + delta, end: mention.end + delta }] : []);
}
export function insertReference(text: string, request: {start:number;end:number}, choice: ReferenceChoice, mentions: ReferenceMention[]) {
    const label = `@${choice.label}`, next = text.slice(0, request.start) + label + text.slice(request.end);
    const updated = updateMentions(text, next, mentions);
    if(updated.length>=100)return {text,caret:request.end,mentions};
    return { text: next, caret: request.start + label.length, mentions: [...updated, { start: request.start, end: request.start + label.length, label, collector_id: choice.collector_id, resource_id: choice.resource_id }].sort((a,b)=>a.start-b.start) };
}

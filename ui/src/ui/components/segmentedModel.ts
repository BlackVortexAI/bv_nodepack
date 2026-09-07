/** Keep ordering stable; reserve the overflow trigger only when needed. */
export function visibleSegmentCount(widths: number[], available: number, overflowWidth: number) {
    if (widths.reduce((sum, width) => sum + width, 0) <= available) return widths.length;
    let used = overflowWidth, count = 0;
    for (const width of widths) { if (used + width > available) break; used += width; count++; }
    return count;
}
export function toggleSegment(values: string[], id: string, required = false) {
    return values.includes(id) ? required && values.length === 1 ? values : values.filter(value => value !== id) : [...values, id];
}

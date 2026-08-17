export type ConnectedArea = { label: number; x: number; y: number; width: number; height: number; pixels: number };

// Alpha below roughly 3% is an antialiasing/blur tail, not visible topology.
// Counting it as connected would join brush islands across an apparently empty gap.
export function connectedAreas(alpha: Uint8ClampedArray, width: number, height: number, threshold = 8): { labels: Int32Array; areas: ConnectedArea[] } {
    if (alpha.length !== width * height) throw new Error("Alpha buffer size does not match its dimensions");
    const labels = new Int32Array(alpha.length); const areas: ConnectedArea[] = []; let label = 0;
    const queue = new Int32Array(alpha.length);
    for (let start = 0; start < alpha.length; start++) {
        if (alpha[start] < threshold || labels[start]) continue;
        label++; let head = 0, tail = 0, minX = width, minY = height, maxX = 0, maxY = 0, pixels = 0;
        labels[start] = label; queue[tail++] = start;
        while (head < tail) {
            const index = queue[head++], x = index % width, y = Math.floor(index / width); pixels++;
            minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
            for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
                const next = ny * width + nx; if (!labels[next] && alpha[next] >= threshold) { labels[next] = label; queue[tail++] = next; }
            }
        }
        areas.push({ label, x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, pixels });
    }
    return { labels, areas };
}

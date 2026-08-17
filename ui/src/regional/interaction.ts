export type ScreenPoint = { x: number; y: number };

export function shouldStartSelectionMove(start: ScreenPoint, current: ScreenPoint, threshold = 3) {
    return Math.hypot(current.x - start.x, current.y - start.y) >= threshold;
}

export function regionsInPaintOrder<T extends { priority: number }>(regions: T[]) {
    return [...regions].sort((left, right) => right.priority - left.priority);
}

export function synchronizeRegionPriorities<T extends { priority: number }>(regions: T[]) {
    regions.forEach((region, index) => { region.priority = index; });
}

// Mirrors the current pointer-up behavior: every brush-containing gesture is finalized as a stroke.
export function shouldAppendFinalBrushPoint(mode: string) {
    return mode === "draw-brush";
}

export function regionsInPriorityOrder<T extends { priority: number }>(regions: T[]) {
    return [...regions].sort((left, right) => left.priority - right.priority);
}

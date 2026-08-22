export type BvWindowType = "regional" | "quick" | "detailer" | "detector";

const lastActive = new Map<BvWindowType, string>();

export function rememberBvWindowInstance(type: BvWindowType, nodeId: string | number) {
    const id = String(nodeId);
    if (id) lastActive.set(type, id);
}

export function lastBvWindowInstance(type: BvWindowType) {
    return lastActive.get(type);
}

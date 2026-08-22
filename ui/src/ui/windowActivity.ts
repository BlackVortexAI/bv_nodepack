export type BvWindowType = "regional" | "quick" | "detailer" | "detector" | "pipe" | "merge";

const lastActive = new Map<BvWindowType, string>();
let lastFull:BvWindowType|undefined;

export function rememberBvWindowInstance(type: BvWindowType, nodeId: string | number) {
    const id = String(nodeId);
    if (id) lastActive.set(type, id);
    if(id&&type!=="quick")lastFull=type;
}
export function lastBvFullWindowType(){return lastFull}

export function lastBvWindowInstance(type: BvWindowType) {
    return lastActive.get(type);
}

import type { ComfyApp, LGraph, LGraphGroup, LGraphNode } from "../../types/comfyui-frontend-types.augment";

type AnyObj = Record<string, unknown>;

export interface GraphPathEntry {
    node: LGraphNode;
    graph: LGraph;
    depth: number;
}

export interface CollectedGroup {
    group: LGraphGroup;
    graph: LGraph;
    path: GraphPathEntry[];
    id: string;
    pathLabel: string;
}

export interface CollectedNode {
    node: LGraphNode;
    graph: LGraph;
    path: GraphPathEntry[];
}

export type NodePredicate = (node: LGraphNode) => boolean;

/** Resolve best root graph from ComfyApp or accept a graph directly */
export function resolveRootGraph(input: ComfyApp | LGraph | unknown): LGraph | null {
    if (!input || typeof input !== "object") return null;

    const x = input as AnyObj;

    // Prefer rootGraph (your working solution)
    const rg = x["rootGraph"];
    if (rg && typeof rg === "object") return rg as LGraph;

    // Fallback graph
    const g = x["graph"];
    if (g && typeof g === "object") return g as LGraph;

    // Or treat input itself as graph
    return input as LGraph;
}

function getGraphNodes(graph: LGraph): LGraphNode[] {
    return (graph._nodes ?? graph.nodes ?? []) as LGraphNode[];
}

function getGraphGroups(graph: LGraph): LGraphGroup[] {
    return (graph._groups ?? graph.groups ?? []) as LGraphGroup[];
}

function getNodeSubgraph(node: any): LGraph | null {
    if (node.subgraph && typeof node.subgraph === "object") return node.subgraph as LGraph;

    if (typeof node.getSubgraph === "function") {
        try {
            return node.getSubgraph() ?? null;
        } catch {
            return null;
        }
    }
    return null;
}

function traverseGraphs(
    root: LGraph,
    onGraph: (graph: LGraph, path: GraphPathEntry[]) => void
): void {
    const visited = new Set<object>();
    const stack: Array<{ graph: LGraph; path: GraphPathEntry[] }> = [{ graph: root, path: [] }];

    while (stack.length) {
        const { graph, path } = stack.pop()!;
        const key = graph as unknown as object;

        if (visited.has(key)) continue;
        visited.add(key);

        onGraph(graph, path);

        for (const node of getGraphNodes(graph)) {
            const sg = getNodeSubgraph(node);
            if (!sg) continue;

            stack.push({
                graph: sg,
                path: path.concat([{ node, graph, depth: path.length + 1 }]),
            });
        }
    }
}

function newGroupId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `bv-group-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function groupId(group: LGraphGroup, usedIds: Set<string>): string {
    const target = group as any;
    target.flags ??= {};
    let id = typeof target.flags.bvGroupId === "string" ? target.flags.bvGroupId : "";
    if (!id || usedIds.has(id)) {
        do id = newGroupId(); while (usedIds.has(id));
        target.flags.bvGroupId = id;
    }
    usedIds.add(id);
    return id;
}

/**
 * Collect ALL groups in main graph + every subgraph (typed).
 * Pass either comfyApp or a graph.
 */
export function collectAllGroups(input: ComfyApp | LGraph | unknown): CollectedGroup[] {
    const root = resolveRootGraph(input);
    if (!root) return [];

    const results: CollectedGroup[] = [];
    const usedIds = new Set<string>();
    traverseGraphs(root, (graph, path) => {
        for (const group of getGraphGroups(graph)) {
            const segments = path.map((entry) => String((entry.node as any).title || (entry.node as any).type || entry.node.id));
            const pathLabel = [...segments, String(group.title || "Untitled Group")].join(" / ");
            results.push({ group, graph, path, id: groupId(group, usedIds), pathLabel });
        }
    });
    return results;
}

/**
 * Collect ALL nodes of a given type (string) or predicate in main graph + every subgraph (typed).
 */
export function collectNodesByType(
    input: ComfyApp | LGraph | unknown,
    typeOrPredicate: string | NodePredicate
): CollectedNode[] {
    const root = resolveRootGraph(input);
    if (!root) return [];

    const results: CollectedNode[] = [];

    traverseGraphs(root, (graph, path) => {
        for (const node of getGraphNodes(graph)) {
            if (nodeMatchesType(node, typeOrPredicate)) {
                results.push({ node, graph, path });
            }
        }
    });

    return results;
}

export function nodeMatchesType(node: LGraphNode, typeOrPredicate: string | NodePredicate): boolean {
    if (typeof typeOrPredicate === "function") return !!typeOrPredicate(node);

    const wanted = String(typeOrPredicate);

    const candidates = [
        node.type,
        node.comfyClass,
        node.title,
        (node as any).constructor?.name,
    ]
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .map(String);

    return candidates.includes(wanted);
}

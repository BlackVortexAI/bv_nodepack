type RegionalConsumer = { __bvRefreshRegionalSource?: () => void; subgraph?: unknown };

function nestedGraph(node: any) {
    if (node?.subgraph) return node.subgraph;
    try { return node?.getSubgraph?.() ?? null; } catch { return null; }
}

export function regionalWorkflowRoot(nodeOrGraph: any, fallback: any = null) {
    const graph = nodeOrGraph?._nodes || nodeOrGraph?.nodes
        ? nodeOrGraph
        : nodeOrGraph?.__bvConcreteGraph ?? nodeOrGraph?.graph ?? fallback;
    return graph?.rootGraph ?? graph ?? fallback;
}

export function markRegionalConsumer(node: RegionalConsumer, refresh: () => void) {
    node.__bvRefreshRegionalSource = refresh;
}

export function refreshRegionalConsumers(graph: any, visited = new Set<any>()): number {
    if (!graph || visited.has(graph)) return 0;
    visited.add(graph);
    let refreshed = 0;
    for (const node of graph._nodes ?? graph.nodes ?? []) {
        if (typeof node?.__bvRefreshRegionalSource === "function") {
            try {
                node.__bvRefreshRegionalSource();
                refreshed++;
            } catch {
                // One malformed consumer must not prevent the remaining graph
                // from observing the new Regional Prompt state.
            }
        }
        refreshed += refreshRegionalConsumers(nestedGraph(node), visited);
    }
    return refreshed;
}

const pendingGraphs = new WeakSet<object>();

export function scheduleRegionalConsumersRefresh(graph: any) {
    if (!graph || typeof graph !== "object" || pendingGraphs.has(graph)) return;
    pendingGraphs.add(graph);
    queueMicrotask(() => {
        pendingGraphs.delete(graph);
        refreshRegionalConsumers(graph);
    });
}

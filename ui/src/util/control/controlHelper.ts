import { getApp } from "../../appHelper.js";
import { LGraphNode } from "../../types/comfyui-frontend-types.augment";

export function showErrorToast(msg: string) {
    getApp().extensionManager.toast.add({
        severity: "error",
        summary: "Error",
        detail: msg,
        life: 5000
    });
}

export function getNodeHelper(nodeId: number, graph: any, subgraph: boolean = false): LGraphNode | undefined {
    if (!graph?.nodes) return;

    let foundNode: LGraphNode | undefined;

    graph.nodes.forEach((node: any) => {
        if (!foundNode) {
            if (node.id == nodeId) {
                if (subgraph) {
                    foundNode = node;
                    if (node.subgraph && !node.type) {
                        foundNode = node;
                    }
                } else {
                    if (!node.subgraph) {
                        foundNode = node;
                    }
                }
            }
            if (!foundNode && node.isSubgraphNode) {
                foundNode = getNodeHelper(nodeId, node.subgraph)
            }
        }
    });

    return foundNode;
}

export function crawlSubgraphForNode(nodes: any[]): LGraphNode[] {
    const controlNodes: LGraphNode[] = [];
    nodes.forEach((node: any) => {
        if (node.isSubgraphNode && node.isSubgraphNode()) {
            const sGraph = node;
            controlNodes.push(...crawlSubgraphForNode(sGraph.subgraph.nodes))
        } else {
            if (node.type === "BV Control Center") {
                controlNodes.push(node);
            }
        }
    })
    return controlNodes;
}

export function getWidgetValue(node: LGraphNode, slot: number) {
    const inputSlot = node.getInputInfo(slot)
    if (!inputSlot) return;
    return node.getWidgetFromSlot(inputSlot)?.value as boolean;
}

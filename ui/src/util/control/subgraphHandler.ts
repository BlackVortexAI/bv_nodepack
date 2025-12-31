import { getApp } from "../../appHelper.js";
import { LGraphNode, Subgraph, SubgraphNode } from "../../types/comfyui-frontend-types.augment";
import { getNodeHelper } from "./controlHelper";
import { readConfig } from "./configHandler";

export function renameSubGraphInputSlot(node: LGraphNode, slotNumber: number, slotName?: string) {
    let label = slotName
    if (!slotName) {
        // @ts-ignore
        label = node.inputs[slotNumber].label
        if (!label) label = node.inputs[slotNumber].name
    }

    if (!label) return false;

    try {
        if (node.getInputLink(slotNumber)) {
            if (node.graph?._subgraphs) {
                const subgraph = node.graph as Subgraph

                const link = node.getInputLink(slotNumber);
                const orgingId = link?.origin_id
                const orgingSlot = link?.origin_slot;
                if (subgraph.inputNode.id == orgingId && typeof orgingSlot === 'number') {
                    const slot = subgraph.inputNode.allSlots[orgingSlot]
                    subgraph.renameInput(slot, label.split(" - ")[0])
                    return true;
                }
                return false
            }
            return true;
        }
    } catch (e) {
        console.error("Error renaming subgraph input slot (LINK)", e)
        return false;
    }
    return false
}

export function findAllSubgraphContainers(graph: any): any[] {
    const result: any[] = [];
    const walk = (nodes: any[]) => {
        for (const n of nodes ?? []) {
            if (n?.isSubgraphNode?.()) {
                result.push(n);
                if (n.subgraph?.nodes) walk(n.subgraph.nodes);
            }
        }
    };
    walk(graph?.nodes);
    return result;
}

export function getOuterNode(innerNode: LGraphNode) {
    if (innerNode.graph?.subgraphs) {
        const subgraph = innerNode.graph as Subgraph;

        function walk(graph: any, type: string): LGraphNode | undefined {
            let foundNode: LGraphNode | undefined;
            for (const node of graph.nodes) {
                if (!foundNode) {
                    if (node.isSubgraphNode()) {
                        if (type == node.type) {
                            return node;
                        } else {
                            foundNode = walk(node.subgraph, type)
                            if (foundNode) return foundNode;
                        }
                    }
                } else {
                    return foundNode;
                }
            }
            return foundNode;
        }
        return walk(getApp().rootGraph, subgraph.id)
    }
    return undefined;
}

export function patchSubgraphContainerPrototype(subgraphNode: any, hookSubgraphWidgetChanged: (node: SubgraphNode) => void, executeChange: (title: string, value: boolean) => void) {
    const proto = subgraphNode?.constructor?.prototype;

    if (!proto) return false;
    if (proto.__bv_patched) return false;

    proto.__bv_patched = true;

    // Preserve original if it exists
    const original = proto.onWidgetChanged;

    proto.onWidgetChanged = function (
        name: string,
        value: any,
        old_value: any,
        widget: any
    ) {
        let r;
        try {
            // @ts-ignore
            r = original?.apply(this, arguments);
        } catch {
        }

        const graph = getApp()?.rootGraph;
        const node = getNodeHelper(this.id, graph, true) as SubgraphNode
        if (node) {
            hookSubgraphWidgetChanged(node)
        }

        if (widget?.label) {
            executeChange(widget.label, value);
        }

        return r
    };

    return true;
}

export function ensureSubgraphContainerPatchedFromInnerNode(innerNode: any, hookSubgraphWidgetChanged: (node: SubgraphNode) => void, executeChange: (title: string, value: boolean) => void) {
    const g: any = innerNode?.graph;
    if (!g) return false;

    const container = getOuterNode(innerNode)
    if (!container) return false;

    return patchSubgraphContainerPrototype(container, hookSubgraphWidgetChanged, executeChange);
}

export function ensureSubgraphContainerPatchedFromInnerNodeRetry(innerNode: any, hookSubgraphWidgetChanged: (node: SubgraphNode) => void, executeChange: (title: string, value: boolean) => void, maxTries = 20) {
    let tries = 0;
    const tick = () => {
        console.debug("Retrying patching subgraph container from inner node", innerNode.id, tries)
        tries++;
        if (ensureSubgraphContainerPatchedFromInnerNode(innerNode, hookSubgraphWidgetChanged, executeChange)) return;
        if (tries >= maxTries) return;
        requestAnimationFrame(tick);
    };
    tick();
}

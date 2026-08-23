export const BV_WINDOW_MENU_VISIBILITY_PROPERTY = "bvWindowMenuVisible";
export const BV_WINDOW_VISIBILITY_CHANGED_EVENT = "bv-window-menu-visibility-changed";

export type BvWindowFamily = "regional" | "detailer" | "detector" | "smart-pipe";
export type BvEditorCapability = "full" | "quick";

export const defaultWindowMenuVisibility = (nodeType: string) =>
    !["BV Smart Pipe", "BV Smart Pipe Merge"].includes(nodeType);

export function windowMenuVisible(node: any) {
    const stored = node?.properties?.[BV_WINDOW_MENU_VISIBILITY_PROPERTY];
    return typeof stored === "boolean" ? stored : defaultWindowMenuVisibility(String(node?.type ?? node?.comfyClass ?? ""));
}

export function setWindowMenuVisible(node: any, visible: boolean) {
    if (!node) return;
    node.properties ??= {};
    node.properties[BV_WINDOW_MENU_VISIBILITY_PROPERTY] = Boolean(visible);
    node.graph?.setDirtyCanvas?.(true, true);
    window.dispatchEvent(new CustomEvent(BV_WINDOW_VISIBILITY_CHANGED_EVENT, { detail: { node, visible: Boolean(visible) } }));
}

export function subscribeWindowMenuVisibility(notify: () => void) {
    window.addEventListener(BV_WINDOW_VISIBILITY_CHANGED_EVENT, notify);
    return () => window.removeEventListener(BV_WINDOW_VISIBILITY_CHANGED_EVENT, notify);
}

let visibilityRevision=0;
window.addEventListener(BV_WINDOW_VISIBILITY_CHANGED_EVENT,()=>visibilityRevision++);
export function useWindowMenuVisibility(node:any){
    useSyncExternalStore(subscribeWindowMenuVisibility,()=>visibilityRevision,()=>visibilityRevision);
    return windowMenuVisible(node);
}

const runtimeGraphTokens=new WeakMap<object,string>();let nextRuntimeGraphToken=1;
const graphToken = (graph: any, fallback: string) => {
    const persisted=graph?.id??graph?._id??graph?.extra?.uuid;if(persisted!=null&&String(persisted))return String(persisted);
    if(!graph||typeof graph!=="object")return fallback;
    let token=runtimeGraphTokens.get(graph);if(!token){token=`${fallback}@${nextRuntimeGraphToken++}`;runtimeGraphTokens.set(graph,token);}return token;
};

export type ScopedNode = { node:any; graph:any; path:string[]; key:string; breadcrumb:string };

export function collectScopedNodes(root: any, predicate: (node:any) => boolean): ScopedNode[] {
    const result: ScopedNode[] = [];
    const visit = (graph: any, path: string[], labels: string[], ancestors = new Set<object>()) => {
        if (!graph || ancestors.has(graph)) return;
        const branch=new Set(ancestors);branch.add(graph);
        const graphId = graphToken(graph, path.length ? path[path.length - 1] : "root");
        for (const node of graph._nodes ?? graph.nodes ?? []) {
            const nodeId = String(node.id);
            const scopedPath = [...path, graphId];
            if (predicate(node)) result.push({ node, graph, path: scopedPath, key: `${scopedPath.join("/")}:${nodeId}`, breadcrumb: labels.join(" › ") });
            const subgraph = node.subgraph ?? (() => { try { return node.getSubgraph?.(); } catch { return null; } })();
            if (subgraph) visit(subgraph, [...scopedPath, nodeId], [...labels, String(node.title || node.type || `#${nodeId}`)],branch);
        }
    };
    visit(root, [], []);
    return result;
}
export function scopedNodeKey(root:any,node:any){return collectScopedNodes(root,candidate=>candidate===node)[0]?.key??String(node?.id??"")}

const numericId = (value:any) => /^\d+$/.test(String(value)) ? Number(value) : Number.POSITIVE_INFINITY;
export function compareScopedNodes(left: ScopedNode, right: ScopedNode) {
    const path = left.breadcrumb.localeCompare(right.breadcrumb);
    if (path) return path;
    const numeric = numericId(left.node.id) - numericId(right.node.id);
    return numeric || String(left.node.id).localeCompare(String(right.node.id));
}
import { useSyncExternalStore } from "react";

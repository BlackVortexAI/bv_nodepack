// @ts-ignore
// import type { ComfyApp, LGraph, LGraphGroup, LGraphNode } from "@comfyorg/comfyui-frontend-types";


import type { ComfyApp, LGraph, LGraphGroup, LGraphNode } from "../../types/comfyui-frontend-types.augment";

/** LiteGraph node modes (typical) */
export enum NodeMode {
    ALWAYS = 0,
    ON_EVENT = 1,
    NEVER = 2,
    ON_TRIGGER = 3,
}

const COMFY_MODE_NORMAL = 0;
const COMFY_MODE_BYPASS = 4;
const COMFY_MODE_MUTE = 2;

/** Accept either app or graph */
function resolveRootGraph(input: ComfyApp | LGraph | unknown): LGraph | null {
    if (!input || typeof input !== "object") return null;
    const x = input as any;

    // prefer rootGraph (your case)
    if (x.rootGraph && typeof x.rootGraph === "object") return x.rootGraph as LGraph;
    if (x.graph && typeof x.graph === "object") return x.graph as LGraph;

    // treat input itself as a graph
    return input as LGraph;
}

function getGraphNodes(graph: LGraph): LGraphNode[] {
    return (graph._nodes ?? graph.nodes ?? []) as LGraphNode[];
}

function getGraphGroups(graph: LGraph): LGraphGroup[] {
    return (graph._groups ?? graph.groups ?? []) as LGraphGroup[];
}

function getNodeSubgraph(node: LGraphNode): LGraph | null {
    if(node.isSubgraphNode()) return node.graph;
    return null;
}

function traverseGraphs(root: LGraph, cb: (graph: LGraph) => void): void {
    const visited = new Set<object>();
    const stack: LGraph[] = [root];

    while (stack.length) {
        const g = stack.pop()!;
        const key = g as unknown as object;
        if (visited.has(key)) continue;
        visited.add(key);

        cb(g);

        for (const n of getGraphNodes(g)) {
            const sg = getNodeSubgraph(n);
            if (sg) stack.push(sg);
        }
    }
}

/** -------- Node lookup helpers -------- */

export function findNodeById(input: ComfyApp | LGraph | unknown, id: number | string): { graph: LGraph; node: LGraphNode } | null {
    const root = resolveRootGraph(input);
    if (!root) return null;

    let found: { graph: LGraph; node: LGraphNode } | null = null;

    traverseGraphs(root, (graph) => {
        if (found) return;
        const nodes = getGraphNodes(graph);
        for (const node of nodes) {
            if (String(node.id) === String(id)) {
                found = { graph, node };
                return;
            }
        }
    });

    return found;
}

/** -------- Mute / Unmute nodes by ID --------
 * We store previous mode so unmute can restore it.
 * Stored on node.properties.__bv_prev_mode (safe and serializable in most builds).
 */
const BV_PREV_MODE_KEY = "__bv_prev_mode";

export function muteNodeById(input: ComfyApp | LGraph | unknown, id: number | string): boolean {
    const hit = findNodeById(input, id);
    if (!hit) return false;

    const node = hit.node as any;
    node.properties ??= {};
    if (typeof node.properties[BV_PREV_MODE_KEY] !== "number") {
        node.properties[BV_PREV_MODE_KEY] = typeof node.mode === "number" ? node.mode : NodeMode.ALWAYS;
    }
    node.mode = NodeMode.NEVER;
    return true;
}

export function unmuteNodeById(input: ComfyApp | LGraph | unknown, id: number | string): boolean {
    const hit = findNodeById(input, id);
    if (!hit) return false;

    const node = hit.node as any;
    const prev = node.properties?.[BV_PREV_MODE_KEY];
    node.mode = typeof prev === "number" ? prev : NodeMode.ALWAYS;

    // optional: cleanup
    if (node.properties && BV_PREV_MODE_KEY in node.properties) delete node.properties[BV_PREV_MODE_KEY];

    return true;
}

/** -------- Bypass (node-level) --------
 * IMPORTANT: ComfyUI bypass implementation can differ across builds.
 * This is a pragmatic approach:
 * - set mode to NEVER
 * - store a flag that your UI/logic can interpret as "bypass"
 *
 * If your build has a dedicated field (e.g. node.bypass = true or node.mode = <BYPASS>),
 * adapt ONLY inside this function.
 */
const BV_BYPASS_KEY = "__bv_bypass";
const BV_PREV_MODE_FOR_BYPASS_KEY = "__bv_prev_mode_for_bypass";

export function bypassNodeById(input: ComfyApp | LGraph | unknown, id: number | string): boolean {
    const hit = findNodeById(input, id);
    if (!hit) return false;

    const node = hit.node as any;
    node.properties ??= {};

    if (typeof node.properties[BV_PREV_MODE_FOR_BYPASS_KEY] !== "number") {
        node.properties[BV_PREV_MODE_FOR_BYPASS_KEY] = typeof node.mode === "number" ? node.mode : NodeMode.ALWAYS;
    }

    node.properties[BV_BYPASS_KEY] = true;

    // Common fallback: mark as never-run; server/runner may treat bypass specially depending on build
    node.mode = NodeMode.NEVER;

    return true;
}

export function unbypassNodeById(input: ComfyApp | LGraph | unknown, id: number | string): boolean {
    const hit = findNodeById(input, id);
    if (!hit) return false;

    const node = hit.node as any;
    const prev = node.properties?.[BV_PREV_MODE_FOR_BYPASS_KEY];
    node.mode = typeof prev === "number" ? prev : NodeMode.ALWAYS;

    if (node.properties) {
        delete node.properties[BV_BYPASS_KEY];
        delete node.properties[BV_PREV_MODE_FOR_BYPASS_KEY];
    }

    return true;
}

/** -------- Group -> Nodes in group (canvas box) -------- */

export type GroupNodeContainment = "topleft" | "fully" | "overlap";

/** Safely get node size */
function nodeSize(node: LGraphNode): [number, number] {
    const s = (node as any).size;
    if (Array.isArray(s) && s.length >= 2) return [Number(s[0]) || 0, Number(s[1]) || 0];
    return [0, 0];
}

/** Check if a node is inside a group box */
export function isNodeInGroup(node: LGraphNode, group: LGraphGroup, mode: GroupNodeContainment = "overlap"): boolean {
    const gpos = (group.pos ?? [0, 0]) as [number, number];
    const gsize = (group.size ?? [0, 0]) as [number, number];
    const npos = (node.pos ?? [0, 0]) as [number, number];
    const nsize = nodeSize(node);

    const gx1 = gpos[0], gy1 = gpos[1];
    const gx2 = gpos[0] + gsize[0], gy2 = gpos[1] + gsize[1];

    const nx1 = npos[0], ny1 = npos[1];
    const nx2 = npos[0] + nsize[0], ny2 = npos[1] + nsize[1];

    if (mode === "topleft") {
        return nx1 >= gx1 && nx1 <= gx2 && ny1 >= gy1 && ny1 <= gy2;
    }

    if (mode === "fully") {
        return nx1 >= gx1 && ny1 >= gy1 && nx2 <= gx2 && ny2 <= gy2;
    }

    // overlap (default): any intersection
    const overlapX = nx1 <= gx2 && nx2 >= gx1;
    const overlapY = ny1 <= gy2 && ny2 >= gy1;
    return overlapX && overlapY;
}

/** Find all groups by title across root graph + subgraphs */
export function findGroupsByTitle(input: ComfyApp | LGraph | unknown, title: string): Array<{ graph: LGraph; group: LGraphGroup }> {
    const root = resolveRootGraph(input);
    if (!root) return [];

    const matches: Array<{ graph: LGraph; group: LGraphGroup }> = [];
    const wanted = title.trim();

    traverseGraphs(root, (graph) => {
        for (const group of getGraphGroups(graph)) {
            if ((group.title ?? "").trim() === wanted) {
                matches.push({ graph, group });
            }
        }
    });

    return matches;
}

/** Collect nodes inside a specific group (in the SAME graph) */
export function collectNodesInGroup(graph: LGraph, group: LGraphGroup, containment: GroupNodeContainment = "overlap"): LGraphNode[] {
    const nodes = getGraphNodes(graph);
    return nodes.filter((n) => isNodeInGroup(n, group, containment));
}

/** -------- Group actions (by title) --------
 * If multiple groups share the same title, ALL will be affected.
 * Return value contains details so you can show a UI summary.
 */
export interface GroupActionResult {
    groupTitle: string;
    affectedGroups: number;
    affectedNodes: number;
    perGroup: Array<{
        graph: LGraph;
        group: LGraphGroup;
        nodes: LGraphNode[];
    }>;
}

function buildGroupResult(
    input: ComfyApp | LGraph | unknown,
    title: string,
    containment: GroupNodeContainment
): GroupActionResult {
    const matches = findGroupsByTitle(input, title);

    const perGroup = matches.map(({ graph, group }) => ({
        graph,
        group,
        nodes: collectNodesInGroup(graph, group, containment),
    }));

    const affectedNodes = perGroup.reduce((sum, x) => sum + x.nodes.length, 0);

    return {
        groupTitle: title,
        affectedGroups: perGroup.length,
        affectedNodes,
        perGroup,
    };
}

export function muteGroupsByTitle(
    input: ComfyApp | LGraph | unknown,
    title: string,
    containment: GroupNodeContainment = "overlap"
): GroupActionResult {
    const res = buildGroupResult(input, title, containment);

    for (const item of res.perGroup) {
        for (const node of item.nodes) {
            // mute by id if present, else directly
            const n: any = node;
            n.properties ??= {};
            if (typeof n.properties[BV_PREV_MODE_KEY] !== "number") {
                n.properties[BV_PREV_MODE_KEY] = typeof n.mode === "number" ? n.mode : NodeMode.ALWAYS;
            }
            n.mode = COMFY_MODE_MUTE;
        }
    }

    return res;
}

export function unmuteGroupsByTitle(
    input: ComfyApp | LGraph | unknown,
    title: string,
    containment: GroupNodeContainment = "overlap"
): GroupActionResult {
    const res = buildGroupResult(input, title, containment);

    for (const item of res.perGroup) {
        for (const node of item.nodes) {
            const n: any = node;
            const prev = n.properties?.[BV_PREV_MODE_KEY];
            n.mode = typeof prev === "number" ? prev : COMFY_MODE_NORMAL;
            if (n.properties && BV_PREV_MODE_KEY in n.properties) delete n.properties[BV_PREV_MODE_KEY];
        }
    }

    return res;
}

export function bypassGroupsByTitle(
    input: ComfyApp | LGraph | unknown,
    title: string,
    containment: GroupNodeContainment = "overlap"
): GroupActionResult {
    const res = buildGroupResult(input, title, containment);

    for (const item of res.perGroup) {
        for (const node of item.nodes) {
            const n: any = node;
            n.properties ??= {};
            if (typeof n.properties[BV_PREV_MODE_FOR_BYPASS_KEY] !== "number") {
                n.properties[BV_PREV_MODE_FOR_BYPASS_KEY] = typeof n.mode === "number" ? n.mode : NodeMode.ALWAYS;
            }
            n.properties[BV_BYPASS_KEY] = true;
            n.mode = COMFY_MODE_BYPASS;
        }
    }

    return res;
}

export function unbypassGroupsByTitle(
    input: ComfyApp | LGraph | unknown,
    title: string,
    containment: GroupNodeContainment = "overlap"
): GroupActionResult {
    const res = buildGroupResult(input, title, containment);

    for (const item of res.perGroup) {
        for (const node of item.nodes) {
            const n: any = node;
            const prev = n.properties?.[BV_PREV_MODE_FOR_BYPASS_KEY];
            n.mode = typeof prev === "number" ? prev : COMFY_MODE_NORMAL;

            if (n.properties) {
                delete n.properties[BV_BYPASS_KEY];
                delete n.properties[BV_PREV_MODE_FOR_BYPASS_KEY];
            }
        }
    }

    return res;
}

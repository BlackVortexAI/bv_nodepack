import { getApp } from "../../appHelper.js";
import { showErrorToast } from "./controlHelper";

export const BV_SINGLETON_TYPE = "BV Control Center";

let singletonRemovalScheduled = false;
const pendingSingletonAdds: Array<{ node: any; graph: any }> = [];

export function scheduleRemoveJustAddedSingletons() {
    if (singletonRemovalScheduled) return;
    singletonRemovalScheduled = true;

    // next tick: let ComfyUI finish subgraph conversion / internal moves
    setTimeout(() => {
        singletonRemovalScheduled = false;

        const root = getApp()?.rootGraph;
        if (!root) return;

        // collect all singleton nodes across entire workflow (root + subgraphs)
        const all: Array<{ node: any; graph: any }> = [];
        const walk = (g: any) => {
            for (const n of g?.nodes ?? []) {
                if (!n) continue;
                if (n.type === BV_SINGLETON_TYPE) all.push({node: n, graph: g});
                if (n.isSubgraphNode?.() && n.subgraph) walk(n.subgraph);
            }
        };
        walk(root);

        if (all.length <= 1) {
            pendingSingletonAdds.length = 0;
            return;
        }

        // Prefer keeping an "old" one: keep the one with the smallest id (usually the existing one)
        all.sort((a, b) => (a.node?.id ?? 0) - (b.node?.id ?? 0));
        const keep = all[0].node;

        // Remove everything else, but especially remove the ones that were just added by the user
        let removedAny = false;

        for (const entry of all.slice(1)) {
            const n = entry.node;
            const g = entry.graph;

            if (n === keep) continue;

            try {
                g.remove(n);
            } catch {
                const idx = g.nodes?.indexOf(n);
                if (idx >= 0) g.nodes.splice(idx, 1);
            }

            removedAny = true;
        }

        if (removedAny) {
            showErrorToast("BV Control Center is already in the workflow.");
            root.setDirtyCanvas?.(true, true);
        }

        pendingSingletonAdds.length = 0;
    }, 0);
}

export function patchGraphAddSingletonGuard() {
    const LGraphCtor: any = (window as any).LGraph;
    if (!LGraphCtor?.prototype) return false;

    const proto = LGraphCtor.prototype;
    if (proto.__bv_singleton_add_patched) return true;
    proto.__bv_singleton_add_patched = true;

    const addFnName = proto.add ? "add" : (proto.addNode ? "addNode" : null);
    if (!addFnName) {
        return false;
    }

    const origAdd = proto[addFnName];

    proto[addFnName] = function (node: any) {
        const r = origAdd.apply(this, arguments);

        if (node?.type === BV_SINGLETON_TYPE) {
            pendingSingletonAdds.push({node, graph: this});
            scheduleRemoveJustAddedSingletons();
        }

        return r;
    };

    return true;
}

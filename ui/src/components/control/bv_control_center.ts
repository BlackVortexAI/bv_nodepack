import {getApp} from "../../appHelper.js";
import {BVControlConfig, BVControlEntry, readConfig} from "../../util/control/configHandler";
import {IBaseWidget, LGraphNode, Subgraph, SubgraphNode} from "../../types/comfyui-frontend-types.augment";
import {
    bypassGroupsByTitle,
    muteGroupsByTitle,
    unbypassGroupsByTitle,
    unmuteGroupsByTitle
} from "../../util/control/stateHandler";

const comfyApp = getApp();

let configWatcherStarted = false;

function startConfigWatcher() {
    if (configWatcherStarted) return;
    configWatcherStarted = true;

    let config = readConfig();
    if (config) {
        updateControlNodes(config);
    }

    setInterval(() => {
        const newConfig = readConfig();
        if (!newConfig) return;

        if (JSON.stringify(newConfig) !== JSON.stringify(config)) {
            config = newConfig;
            updateControlNodes(config);
        }
    }, 500);
}

function hookSubgraphWidgetChanged(node: SubgraphNode) {

    let found = false
    let foundNode: LGraphNode | undefined;

    node.subgraph.inputs.forEach((input) => {
        input.getLinks().forEach((link) => {
            if (!found) {
                foundNode = getNodeHelper(link.target_id as number, node.graph)
                if (!found && foundNode?.type == "BV Control Center") {
                    found = true
                }
            }
        })
    })

    if (!foundNode) {
        return
    }

    const config = readConfig();

    if (!config) return;

    setTimeout(() => {
        updateSingleControlNode(foundNode, config)


    }, 100)

}

function showErrorToast(msg: string) {
    getApp().extensionManager.toast.add({
        severity: "error",
        summary: "Error",
        detail: msg,
        life: 5000
    });
}

function renameSubGraphInputSlot(node: LGraphNode, slotNumber: number, slotName?: string) {


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

function updateSingleControlNode(node: any, config: BVControlConfig, savedValuesOverride?: any[], overrideValue: boolean = true) {
    if (!node || !config) return;

    let changed = false;
    if (!node.widgets) node.widgets = [];

    // Prefer workflow-loaded values
    // @ts-ignore
    const savedValues = savedValuesOverride ?? node.widgets_values;

    const desiredCount = config.rows.length;

    // Ensure enough inputs
    while (node.inputs.length < desiredCount) {
        const i = node.inputs.length;
        const inputName = `v_${String(i).padStart(3, "0")}`;
        let label = config.rows[i].title;

        if (getWidgetValue(node, i)) {
            label = label + " - (ACTIVE)"
        } else {
            label = label + " - (MUTE/BYPASS)"
        }

        node.addInput(inputName, "BOOLEAN", {
            label,
            nameLocked: true,
            default: true,
            widget: {name: inputName}
        });

        const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
        const w = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true));
        w.label = label;
        w.serialize = true;

        // @ts-ignore
        node.inputs[i]._widget = w;
        changed = true;
    }

    // Remove extra inputs
    while (node.inputs.length > desiredCount) {
        const i = node.inputs.length - 1;
        const inputName = `v_${String(i).padStart(3, "0")}`;

        const wi = node.widgets?.findIndex((w: any) => w.name === inputName) ?? -1;
        if (wi !== -1) node.widgets.splice(wi, 1);

        if (node.isInputConnected(i)) node.disconnectInput(i);
        node.removeInput(i);
        changed = true;
    }

    // Sync labels + widget values + link input<->widget
    for (let i = 0; i < desiredCount; i++) {
        let label = config.rows[i].title;

        if (getWidgetValue(node, i)) {
            label = label + " - (ACTIVE)"
        } else {
            label = label + " - (MUTE/BYPASS)"
        }

        const inputName = `v_${String(i).padStart(3, "0")}`;

        if (node.inputs[i]?.label !== label) {
            node.inputs[i].label = label;
            changed = true;
        }

        let w = node.widgets.find((ww: any) => ww.name === inputName);
        if (!w) {
            const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
            w = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true));
            w.label = label;
            w.serialize = true;
            changed = true;
        } else {
            if (w.label !== label) {
                w.label = label;
                changed = true;
            }
            if (overrideValue && savedValues && savedValues[i] !== undefined && w.value !== savedValues[i]) {
                w.value = savedValues[i];
                changed = true;
            }
        }

        if (node.inputs[i]) {
            node.inputs[i].widget = {name: inputName};
            // @ts-ignore
            node.inputs[i]._widget = w;
        }
        const gNode = getNodeHelper(node.id, node.graph)
        if (gNode) {
            renameSubGraphInputSlot(gNode, i, label.split(" - ")[0])
        }
    }

    if (changed) {
        node.serialize_widgets = true;
        node.setDirtyCanvas(true, true);
        node.size = node.computeSize?.() ?? node.size;
    }
}

function updateControlNodes(config: BVControlConfig, savedValuesOverride?: any[]) {
    const app = getApp();
    const graph = app.rootGraph;
    if (!graph?.nodes || !config) return;

    const controlNodes = crawlSubgraphForNode(graph.nodes);

    controlNodes.forEach((node) => {
        let changed = false;

        if (!node.widgets) node.widgets = [];

        // @ts-ignore
        const savedValues = savedValuesOverride ?? node.widgets_values;

        const commonCount = Math.min(node.inputs.length, config.rows.length);
        for (let i = 0; i < commonCount; i++) {
            let label = config.rows[i].title;
            const rawLabel = config.rows[i].title;


            if (getWidgetValue(node, i)) {
                label = label + " - (ACTIVE)"
            } else {
                label = label + " - (MUTE/BYPASS)"
            }

            const inputName = `v_${String(i).padStart(3, "0")}`;

            if (node.inputs[i].label !== label) {
                node.inputs[i].label = label;

                changed = true;
            }

            let widget = node.widgets.find(w => w.name === inputName);
            if (!widget) {
                const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
                widget = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true));
                widget.label = label;
                widget.serialize = true;
                changed = true;
            } else {
                // Apply saved value on load as well
                if (savedValues && savedValues[i] !== undefined && widget.value !== savedValues[i]) {
                    widget.value = savedValues[i];
                    changed = true;
                }
                if (widget.label !== label) {
                    widget.label = label;
                    changed = true;
                }
            }

            node.inputs[i].widget = {name: inputName} as any;
            // @ts-ignore
            node.inputs[i]._widget = widget;

            renameSubGraphInputSlot(node, i, rawLabel)

        }

        if (node.inputs.length > config.rows.length) {
            for (let i = node.inputs.length - 1; i >= config.rows.length; i--) {
                const inputName = `v_${String(i).padStart(3, "0")}`;
                const widgetIndex = node.widgets?.findIndex(w => w.name === inputName) ?? -1;
                if (widgetIndex !== -1) node.widgets.splice(widgetIndex, 1);
                if (node.isInputConnected(i)) node.disconnectInput(i);
                node.removeInput(i);
                changed = true;
            }
        } else if (node.inputs.length < config.rows.length) {
            for (let i = node.inputs.length; i < config.rows.length; i++) {
                let label = config.rows[i].title;
                if (getWidgetValue(node, i)) {
                    label = label + " - (ACTIVE)"
                } else {
                    label = label + " - (MUTE/BYPASS)"
                }
                const inputName = `v_${String(i).padStart(3, "0")}`;

                node.addInput(inputName, "BOOLEAN", {
                    label,
                    nameLocked: true,
                    default: true,
                    widget: {name: inputName}
                });

                const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
                const widget = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true));
                // @ts-ignore
                widget.label = label;
                widget.serialize = true;

                // @ts-ignore
                node.inputs[i]._widget = widget;
                changed = true;
            }
        }

        if (changed) {
            node.serialize_widgets = true;
            node.setDirtyCanvas(true, true);
            node.size = node.computeSize();
        }
    });
}

function crawlSubgraphForNode(nodes: any[]) {
    const controlNodes: LGraphNode[] = [];
    nodes.forEach((node: any) => {

        if (node.isSubgraphNode && node.isSubgraphNode()) {
            const sGraph = node as SubgraphNode;
            controlNodes.push(...crawlSubgraphForNode(sGraph.subgraph.nodes))
        } else {
            if (node.type === "BV Control Center") {
                controlNodes.push(node);
            }
        }
    })
    return controlNodes;
}

function getNodeHelper(nodeId: number, graph: any, subgraph: boolean = false) {

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

    })


    return foundNode;
}

function hookWidgetChanged(node: any) {
    if (node.__bv_onWidgetChanged_patched) return;
    node.__bv_onWidgetChanged_patched = true;

    const original = node.onWidgetChanged;

    node.onWidgetChanged = function (name: string, value: any, old_value: any, widget: IBaseWidget) {
        let r;
        try {
            // @ts-ignore
            r = original?.apply(this, arguments);
        } catch {
        }


        const config = readConfig();
        if (config) {
            const title = widget.label?.split(" - ")[0]
            if (!title) return;
            executeChange(title, value);
            updateSingleControlNode(node, config, undefined, false);
        }

        return r
    }


}


function getWidgetValue(node: LGraphNode, slot: number) {
    const inputSlot = node.getInputInfo(slot)
    if (!inputSlot) return;
    return node.getWidgetFromSlot(inputSlot)?.value as boolean;
}

function normalizeGroupTitle(entry: BVControlEntry) {
    return entry.ref.title
}

function normalizeAction(value: "bypass" | "mute") {
    const v = (value ?? "").toString().toLowerCase().trim();
    return v === "bypass" ? "bypass" : "mute";
}

function applyEntry(groupTitle: string, action: "bypass" | "mute", enabled: boolean) {
    if (!groupTitle) return;
    const appOrGraph = getApp()

    const a = normalizeAction(action);

    if (a === "bypass") {
        if (enabled) bypassGroupsByTitle(appOrGraph, groupTitle, "overlap");
        else unbypassGroupsByTitle(appOrGraph, groupTitle, "overlap");
        return;
    }

    if (enabled) muteGroupsByTitle(appOrGraph, groupTitle, "overlap");
    else unmuteGroupsByTitle(appOrGraph, groupTitle, "overlap");
}

function executeChange(title: string, value: boolean): void {
    const config = readConfig();
    if (!config) return;

    const applyDisable = !value;

    const foundRow = config.rows.find(row => row.title === title);
    if (!foundRow) return;
    for (const entry of foundRow.entries) {
        const groupTitle = normalizeGroupTitle(entry);
        const action = normalizeAction(entry.action);
        if (!groupTitle) continue;

        applyEntry(groupTitle, action, applyDisable);
    }
}

comfyApp.registerExtension({
    name: "bv_control_center",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType.type;
        const nodeName = nodeData.name;

        const isControlCenter =
            comfyClass === "BVControlCenterNode" ||
            nodeName === "BV Control Center" ||
            nodeName?.includes("BV Control Center") ||
            nodeName?.includes("🌀 BV Control Center");

        if (!isControlCenter) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            // @ts-ignore
            const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
            this.serialize_widgets = true;


            this.serialize_widgets = true;

            const cfg = readConfig();
            if (cfg) {
                updateSingleControlNode(this, cfg);
            }

            hookWidgetChanged(this)

            startConfigWatcher();

            return r;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function (nodeInfo: any) {
            // @ts-ignore
            const r = onConfigure ? onConfigure.apply(this, arguments) : undefined;

            this.serialize_widgets = true;

            const cfg = readConfig();
            if (cfg) {
                updateSingleControlNode(this, cfg, nodeInfo?.widgets_values);
            }

            return r;
        };

        const onConnectInput = nodeType.prototype.onConnectInput
        // @ts-ignore
        nodeType.prototype.onConnectInput = function (target_slot, type, output, node, slot) {
            // @ts-ignore
            const r = onConnectInput ? onConnectInput.apply(this, arguments) : undefined;

            this.serialize_widgets = true;

            // @ts-ignore
            if (node.type && !node.subgraph) {
                showErrorToast("BV Control Center can only be connected to a Subgraph.")
                return false
            }

            if (this.type == "BV Control Center") {

                ensureSubgraphContainerPatchedFromInnerNodeRetry(this);

                if (typeof this.id !== 'number') {
                    return r;
                }

                const id = this.id;

                const retries = 20

                function retry(n = 0) {
                    if (n >= retries) return;
                    const gNode = getNodeHelper(id, getApp().rootGraph)


                    if (gNode) {

                        const suc = renameSubGraphInputSlot(gNode, target_slot)

                        if (suc) return;

                    }

                    setTimeout(() => {
                        retry(n + 1)
                    }, 50)
                }

                retry()
                return r;

            }
        }
    }
});


function findAllSubgraphContainers(graph: any): any[] {
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

function getOuterNode(innerNode: LGraphNode) {
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

function patchSubgraphContainerPrototype(subgraphNode: any) {

    const proto = subgraphNode?.constructor?.prototype;

    if (!proto) return false;
    if (proto.__bv_patched) return false;
    if (!proto || proto.__bv_patched) return false;

    proto.__bv_patched = true;


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

        hookSubgraphWidgetChanged(node)

        executeChange(widget.label, value);

        return r
    };

    return true;
}


function patchAllSubgraphs(): number {
    const graph = getApp()?.rootGraph;
    if (!graph) return 0;

    const subs = findAllSubgraphContainers(graph);

    let patched = 0;
    for (const s of subs) {
        const didPatch = patchSubgraphContainerPrototype(s); // <-- return boolean!
        if (didPatch) patched++;
    }

    return patched;
}

function retryPatchAllSubgraphs(opts?: {
    intervalMs?: number;
    maxAttempts?: number;
    stopWhenPatched?: boolean;
}) {
    const intervalMs = opts?.intervalMs ?? 200;
    const maxAttempts = opts?.maxAttempts ?? 30;
    const stopWhenPatched = opts?.stopWhenPatched ?? true;

    let attempt = 0;

    const tick = () => {
        attempt++;

        const patchedCount = patchAllSubgraphs();

        if (stopWhenPatched && patchedCount > 0) return;
        if (attempt >= maxAttempts) return;

        setTimeout(tick, intervalMs);
    };

    tick();
}

function ensureSubgraphContainerPatchedFromInnerNode(innerNode: any) {
    const g: any = innerNode?.graph;
    if (!g) return false;

    const container = getOuterNode(innerNode)
    if (!container) return false;

    return patchSubgraphContainerPrototype(container);

}

function ensureSubgraphContainerPatchedFromInnerNodeRetry(innerNode: any, maxTries = 20) {
    let tries = 0;

    const tick = () => {

        console.debug("Retrying patching subgraph container from inner node", innerNode.id, tries)
        tries++;
        if (ensureSubgraphContainerPatchedFromInnerNode(innerNode)) return;
        if (tries >= maxTries) return;
        requestAnimationFrame(tick);
    };

    tick();
}


retryPatchAllSubgraphs({intervalMs: 150, maxAttempts: 80});

let __bvSingletonCheckScheduled = false;

let singletonRemovalScheduled = false;
const pendingSingletonAdds: Array<{ node: any; graph: any }> = [];

function scheduleRemoveJustAddedSingletons() {
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

function scheduleSingletonEnforce() {
    if (__bvSingletonCheckScheduled) return;
    __bvSingletonCheckScheduled = true;

    // next macrotask is usually enough; increase to 0/RAF if needed
    setTimeout(() => {
        __bvSingletonCheckScheduled = false;
        enforceSingletonKeepNewest(); // or keep oldest, your choice
    }, 0);
}

function enforceSingletonKeepNewest() {
    const root = getApp()?.rootGraph;
    if (!root) return;

    const found: any[] = [];

    const walk = (g: any) => {
        for (const n of g?.nodes ?? []) {
            if (!n) continue;
            if (n.type === BV_SINGLETON_TYPE) found.push({node: n, graph: g});
            if (n.isSubgraphNode?.() && n.subgraph) walk(n.subgraph);
        }
    };

    walk(root);
    if (found.length <= 1) return;

    // Keep the newest one (highest id) - tends to be the "inner" one during subgraph creation
    found.sort((a, b) => (b.node.id ?? 0) - (a.node.id ?? 0));
    const keep = found[0].node;

    for (let i = 1; i < found.length; i++) {
        const {node, graph} = found[i];
        if (node === keep) continue;
        try {
            graph.remove(node);
        } catch {
            const idx = graph.nodes?.indexOf(node);
            if (idx >= 0) graph.nodes.splice(idx, 1);
        }
    }

    root.setDirtyCanvas?.(true, true);
}

const BV_SINGLETON_TYPE = "BV Control Center";


function patchGraphAddSingletonGuard() {
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

// Retry because LGraph might not be ready instantly
(function retry(n = 0) {
    if (patchGraphAddSingletonGuard()) return;
    if (n > 80) return;
    setTimeout(() => retry(n + 1), 50);
})();


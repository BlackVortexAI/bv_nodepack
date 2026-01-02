import {getApp} from "../../appHelper.js";
import {BVControlConfig, BVControlEntry, readConfig} from "../../util/control/configHandler";
import {IBaseWidget, LGraphNode, Subgraph, SubgraphNode} from "../../types/comfyui-frontend-types.augment";
import {
    bypassGroupsByTitle,
    muteGroupsByTitle,
    unbypassGroupsByTitle,
    unmuteGroupsByTitle
} from "../../util/control/stateHandler";
import {
    crawlSubgraphForNode,
    getNodeHelper,
    getWidgetValue,
    showErrorToast
} from "../../util/control/controlHelper";
import {
    ensureSubgraphContainerPatchedFromInnerNodeRetry, findAllSubgraphContainers, getOuterNode,
    patchSubgraphContainerPrototype,
    renameSubGraphInputSlot
} from "../../util/control/subgraphHandler";
import {patchGraphAddSingletonGuard} from "../../util/control/singletonHandler";

const ACTIVE = "ACTIVE";
const MUTE   = "MUTE/BYPASS";

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

function hookSubgraphWidgetChanged(node: SubgraphNode, name?: string) {
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

    let retries = 0;
    const maxRetries = 200;
    const retry = () => {
        const success = updateSingleControlNode(foundNode, config, undefined, true, name);
        if (success || retries >= maxRetries) {
            return;
        }
        retries++;
        setTimeout(retry, 10);
    };

    retry();
}

function updateSingleControlNode(node: any, config: BVControlConfig, savedValuesOverride?: any[], overrideValue: boolean = true, name?: string): boolean {
    if (!node || !config) return false;

    let changed = false;
    if (!node.widgets) node.widgets = [];

    // Prefer workflow-loaded values
    // @ts-ignore
    const savedValues = savedValuesOverride ?? node.widgets_values;

    const desiredCount = config.rows.length;


    // Ensure enough inputs
    while (node.inputs.length < desiredCount) {
        const i = node.inputs.length;
        const inputName = `bvcc_${String(i).padStart(3, "0")}`;
        const label = config.rows[i].title;

        node.addInput(inputName, "BOOLEAN", {
            label,
            nameLocked: true,
            default: true,
            widget: {name: inputName}
        });

        const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
        // (node as LGraphNode).addWidget()
        const w = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true), {on: ACTIVE, off: MUTE});
        w.label = label;
        w.serialize = true;

        // @ts-ignore
        node.inputs[i]._widget = w;
        changed = true;
    }

    // Remove extra inputs
    while (node.inputs.length > desiredCount) {
        const i = node.inputs.length - 1;
        const inputName = `bvcc_${String(i).padStart(3, "0")}`;

        const wi = node.widgets?.findIndex((w: any) => w.name === inputName) ?? -1;
        if (wi !== -1) node.widgets.splice(wi, 1);

        if (node.isInputConnected(i)) node.disconnectInput(i);
        node.removeInput(i);
        changed = true;
    }

    let allSlotsRenamed = true;
    // Sync labels + widget values + link input<->widget
    for (let i = 0; i < desiredCount; i++) {
        let label = config.rows[i].title;

        const inputName = `bvcc_${String(i).padStart(3, "0")}`;

        if (node.inputs[i]?.label !== label) {
            node.inputs[i].label = label;
            changed = true;
        }

        let w = node.widgets.find((ww: any) => ww.name === inputName);
        if (!w) {
            const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
            w = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true), {on: ACTIVE, off: MUTE});
            w.serialize = true;
            w.label = label;
            changed = true;
        } else {
            if (w.options) {
                if (w.options.on !== ACTIVE || w.options.off !== MUTE) {
                    w.options.on = ACTIVE;
                    w.options.off = MUTE;
                    changed = true;
                }
            }
            if (overrideValue && savedValues && savedValues[i] !== undefined && w.value !== savedValues[i]) {
                w.value = savedValues[i];
                w.label = label;
                changed = true;
            }
        }

        if (node.inputs[i]) {
            node.inputs[i].widget = {name: inputName};
            // @ts-ignore
            node.inputs[i]._widget = w;
        }


        const ccNode = getNodeHelper(node.id, node.graph)
        if(ccNode){
            const ccInput = ccNode.inputs[i]
            const ccLink = ccNode.getInputLink(i)
            if(ccLink && ccNode.graph){
                setTimeout(() => {
                    const graphNode = getOuterNode(ccNode)
                    if(graphNode) {
                        const graphWidgets = graphNode.widgets
                        if(graphWidgets){
                            const graphWidget = graphWidgets[ccLink.origin_slot]
                            if(graphWidget){
                                graphWidget.label = label
                            }
                        }
                    }



                }, 50)

            }
        }

        const gNode = getNodeHelper(node.id, node.graph)

        if (gNode) {
            let success = false

            success = renameSubGraphInputSlot(node, i, label)

            if (!success) {
                allSlotsRenamed = false;
            }
        } else {
            allSlotsRenamed = false;
        }
    }

    if (changed) {
        node.serialize_widgets = true;
        node.setDirtyCanvas(true, true);
        node.size = node.computeSize?.() ?? node.size;
    }

    return allSlotsRenamed;
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

            const inputName = `bvcc_${String(i).padStart(3, "0")}`;

            if (node.inputs[i].label !== label) {
                node.inputs[i].label = label;
                changed = true;
            }

            let widget = node.widgets.find(w => w.name === inputName);
            if (!widget) {
                const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
                widget = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true), {on: ACTIVE, off: MUTE});
                widget.serialize = true;
                changed = true;
            } else {
                // Apply saved value on load as well
                if (savedValues && savedValues[i] !== undefined && widget.value !== savedValues[i]) {
                    widget.value = savedValues[i];
                    changed = true;
                }
                if (widget.options) {
                    if (widget.options.on !== ACTIVE || widget.options.off !== MUTE) {
                        widget.options.on = ACTIVE;
                        widget.options.off = MUTE;
                        changed = true;
                    }
                }
            }

            node.inputs[i].widget = {name: inputName} as any;
            // @ts-ignore
            node.inputs[i]._widget = widget;

            renameSubGraphInputSlot(node, i, label)
        }

        if (node.inputs.length > config.rows.length) {
            for (let i = node.inputs.length - 1; i >= config.rows.length; i--) {
                const inputName = `bvcc_${String(i).padStart(3, "0")}`;
                const widgetIndex = node.widgets?.findIndex(w => w.name === inputName) ?? -1;
                if (widgetIndex !== -1) node.widgets.splice(widgetIndex, 1);
                if (node.isInputConnected(i)) node.disconnectInput(i);
                node.removeInput(i);
                changed = true;
            }
        } else if (node.inputs.length < config.rows.length) {
            for (let i = node.inputs.length; i < config.rows.length; i++) {
                let label = config.rows[i].title;
                const inputName = `bvcc_${String(i).padStart(3, "0")}`;

                node.addInput(inputName, "BOOLEAN", {
                    label,
                    nameLocked: true,
                    default: true,
                    widget: {name: inputName}
                });

                const initialValue = (savedValues && savedValues[i] !== undefined) ? savedValues[i] : true;
                const widget = node.addWidget("toggle", inputName, initialValue, () => node.setDirtyCanvas(true), {on: ACTIVE, off: MUTE});
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
            const index = node.widgets.indexOf(widget);
            const title = (index !== -1 && node.inputs[index]) ? node.inputs[index].label : widget.label;
            if (!title) return;
            executeChange(title, value);
            // updateSingleControlNode(node, config, undefined, false);
        }

        return r
    }
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

            const cfg = readConfig();
            if (cfg) {
                setTimeout(() => {

                    updateSingleControlNode(this, cfg);
                }, 50)
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
                ensureSubgraphContainerPatchedFromInnerNodeRetry(this, hookSubgraphWidgetChanged, executeChange);


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

        const onConnectionsChange = nodeType.prototype.onConnectionsChange
        // @ts-ignore
        nodeType.prototype.onConnectionsChange = function (type, index, connected, link_info) {
            // @ts-ignore
            const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;

            if (!connected && type === 1) { // 1 is LiteGraph.INPUT
                if (this.type == "BV Control Center") {

                    console.debug("onConnectionsChange", type, link_info, connected, index)

                    const id = this.id;

                    const ccNode = getNodeHelper(id as number, getApp().rootGraph, true)

                    if (ccNode){

                        const sNode = getOuterNode(ccNode) as SubgraphNode

                        if(link_info && sNode && sNode.widgets){
                            const sWidget = sNode.widgets[link_info.origin_slot]
                            const value = sWidget.value

                            sNode.removeWidget(sWidget)
                            const newSize = sNode.computeSize?.() ?? sNode.size;
                            sNode.setSize?.(newSize);
                            sNode.size = newSize;

                            sNode.setDirtyCanvas?.(true, true);
                            sNode.graph?.setDirtyCanvas?.(true, true);
                            const ccINput = ccNode.getInputInfo(index)
                            if(ccINput != null){
                                const widget = ccNode.getWidgetFromSlot(ccINput);
                                if (widget) {
                                    function setWidgetValue(node: any, widgetName: any, newValue: any) {
                                        // @ts-ignore
                                        const w = node?.widgets?.find(x => x?.name === widgetName);
                                        if (!w) return false;
                                        w.value = newValue;
                                        (w.callback || w.onChange)?.call(w, newValue, node, w);

                                        node.setSize?.(node.computeSize?.() ?? node.size);

                                        node.setDirtyCanvas?.(true, true);
                                        node.graph?.setDirtyCanvas?.(true, true);

                                        return true;
                                    }

                                    setWidgetValue(sNode, sWidget.name, value)
                                }
                            }

                        }

                    }
                }
            }
            return r;
        }
    }
});

function patchAllSubgraphs(): number {
    const graph = getApp()?.rootGraph;
    if (!graph) return 0;

    const subs = findAllSubgraphContainers(graph);

    let patched = 0;
    for (const s of subs) {
        const didPatch = patchSubgraphContainerPrototype(s, hookSubgraphWidgetChanged, executeChange);
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

retryPatchAllSubgraphs({intervalMs: 150, maxAttempts: 80});

// Retry because LGraph might not be ready instantly
(function retry(n = 0) {
    if (patchGraphAddSingletonGuard()) return;
    if (n > 80) return;
    setTimeout(() => retry(n + 1), 50);
})();

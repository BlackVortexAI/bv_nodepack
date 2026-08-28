import { getApp } from "../../appHelper.js";
import { collectAllGroups, collectNodesByType, nodeMatchesType } from "../../util/control/collector";
import { BVControlConfig, CONFIG_CHANGED_EVENT, readConfig, writeConfig } from "../../util/control/configHandler";
import { findActiveControlConflicts, formatControlConflictStatus, nodesInControlGroup } from "../../util/control/controlCenterModel.js";
import { applyClassicNodePresentation } from "../../regional/classicNodePresentation.js";

const NODE_CLASS = "BV Control Center";
const NORMAL = 0;
const MUTE = 2;
const BYPASS = 4;
const BASE_MODE = "bvControlBaseMode";
const OPEN_CONTROL_RACK_EVENT = "bv-open-control-rack";
const CONTROL_CENTER_MIN_WIDTH = 320;
const CONTROL_CENTER_WIDTH_BUFFER = 48;
const CONTROL_CENTER_WIDGET_START_Y = 34;
const CONTROL_STATUS_WIDGET = "bv_control_conflict_status";
const previouslyControlled = new Set<any>();

function restrictionForAction(action: "activate" | "bypass" | "mute") {
    if (action === "activate") return { mode: NORMAL, priority: 3 };
    if (action === "mute") return { mode: MUTE, priority: 2 };
    return { mode: BYPASS, priority: 1 };
}

function configForValidation(config: BVControlConfig): BVControlConfig {
    const available = new Set(collectAllGroups(getApp()).map((group) => group.id));
    return {
        ...config,
        controls: config.controls.map((control) => ({
            ...control,
            assignments: control.assignments.map((assignment) => ({ ...assignment, unresolved: !available.has(assignment.groupId) })),
        })),
    };
}

function nodesInGroup(item: any): any[] {
    return nodesInControlGroup(item, (node: any) => nodeMatchesType(node, NODE_CLASS));
}

function applyConfig(config: BVControlConfig) {
    for (const node of previouslyControlled) {
        const base = node.properties?.[BASE_MODE];
        node.mode = config.forceActive ? NORMAL : typeof base === "number" ? base : node.mode;
        if (node.properties) delete node.properties[BASE_MODE];
        node.setDirtyCanvas?.(true, true);
    }
    previouslyControlled.clear();

    const groups = new Map(collectAllGroups(getApp()).map((item) => [item.id, item]));
    const restrictions = new Map<any, { mode: number; priority: number }>();
    for (const control of config.controls) {
        if (!control.enabled) continue;
        for (const assignment of control.assignments) {
            const group = groups.get(assignment.groupId);
            if (!group) continue;
            for (const node of nodesInGroup(group)) {
                const restriction = restrictionForAction(assignment.action);
                const current = restrictions.get(node);
                if (!current || restriction.priority > current.priority) restrictions.set(node, restriction);
            }
        }
    }
    for (const [node, restriction] of restrictions) {
        node.properties ??= {};
        if (typeof node.properties[BASE_MODE] !== "number") node.properties[BASE_MODE] = typeof node.mode === "number" ? node.mode : NORMAL;
        node.mode = restriction.mode;
        previouslyControlled.add(node);
        node.setDirtyCanvas?.(true, true);
    }
}

function removeControlPort(node: any, index: number) {
    const input = node.inputs[index];
    const widget = node.widgets?.find((item: any) => item.name === input.name);
    if (widget) node.removeWidget?.(widget);
    if (input.link != null) node.disconnectInput(index);
    node.removeInput(index);
}

function syncConflictStatus(node: any, config: BVControlConfig) {
    const conflicts = findActiveControlConflicts(config);
    const value = formatControlConflictStatus(conflicts);
    let widget = node.widgets?.find((item: any) => item.name === CONTROL_STATUS_WIDGET);
    if (!widget) {
        widget = node.addCustomWidget({
            name: CONTROL_STATUS_WIDGET,
            type: "custom",
            value,
            y: 0,
            options: {},
            serialize: false,
            computeSize: () => [0, 24],
            computeLayoutSize: () => ({ minHeight: 24, maxHeight: 24, minWidth: CONTROL_CENTER_MIN_WIDTH }),
            mouse: () => false,
            draw(ctx: CanvasRenderingContext2D, _node: any, width: number, y: number, height: number) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(10, y, Math.max(0, width - 20), height);
                ctx.clip();
                ctx.fillStyle = this.__bvHasConflict ? "#ffbd66" : "#8fc9a3";
                ctx.font = "12px sans-serif";
                ctx.textBaseline = "middle";
                ctx.fillText(String(this.value ?? ""), 14, y + height / 2);
                ctx.restore();
            },
        });
    }
    widget.value = value;
    widget.__bvHasConflict = conflicts.length > 0;
    widget.tooltip = conflicts.map((conflict: any) => `${conflict.groupPath}: ${conflict.winnerAction} wins`).join("\n");
}

function moveWidgetToEnd(node: any, name: string) {
    const widgets = node.widgets;
    if (!Array.isArray(widgets)) return;
    const index = widgets.findIndex((widget: any) => widget.name === name);
    if (index < 0 || index === widgets.length - 1) return;
    const [widget] = widgets.splice(index, 1);
    widgets.push(widget);
}

function syncNode(node: any, config: BVControlConfig) {
    node.mode = NORMAL;
    if (node.properties) delete node.properties[BASE_MODE];

    let configureWidget = node.widgets?.find((item: any) => item.name === "configure_control_center");
    if (!configureWidget) configureWidget = node.addWidget("button", "configure_control_center", null, () => window.dispatchEvent(new Event(OPEN_CONTROL_RACK_EVENT)), { serialize: false });
    configureWidget.label = "Configure Control Center";
    configureWidget.serialize = false;

    const desiredNames = new Set(config.controls.map((control) => `bvcc_${control.id}`));
    for (let index = node.inputs.length - 1; index >= 0; index--) {
        const input = node.inputs[index];
        if (input.name.startsWith("bvcc_") && !desiredNames.has(input.name)) removeControlPort(node, index);
    }
    for (const control of config.controls) {
        const name = `bvcc_${control.id}`;
        const onToggle = (value: boolean) => {
            const latest = readConfig();
            const next = { ...latest, controls: latest.controls.map((item) => item.id === control.id ? { ...item, enabled: Boolean(value) } : item) };
            writeConfig(next);
        };
        let input = node.inputs.find((item: any) => item.name === name);
        if (!input) input = node.addInput(name, "BOOLEAN", { label: control.name, nameLocked: true, widget: { name } });
        input.label = control.name;
        let widget = node.widgets?.find((item: any) => item.name === name);
        if (widget && !widget.__bvControlCallbackBound) {
            node.removeWidget?.(widget);
            widget = null;
        }
        if (!widget) widget = node.addWidget("toggle", name, control.enabled, onToggle, { on: "ACTIVE", off: "INACTIVE" });
        widget.__bvControlCallbackBound = true;
        widget.label = control.name;
        widget.value = control.enabled;
        widget.serialize = true;
        widget.options ??= {};
        widget.options.on = "ACTIVE";
        widget.options.off = "INACTIVE";
        widget.callback = onToggle;
        input.widget = { name };
    }
    syncConflictStatus(node, config);
    const configWidget = node.widgets?.find((item: any) => item.name === "bv_control_config_json");
    if (configWidget) {
        configWidget.value = JSON.stringify(configForValidation(config));
        configWidget.type = "converted-widget";
        configWidget.draw = () => {};
        configWidget.hidden = true;
        configWidget.options ??= {};
        configWidget.options.hidden = true;
        if (configWidget.element) configWidget.element.style.display = "none";
        configWidget.computeSize = () => [0, -4];
        configWidget.serializeValue = () => JSON.stringify(configForValidation(readConfig()));
    }
    // Dynamic control widgets are appended by ComfyUI. Reassert the status row
    // after every reconciliation so it remains the final row on the node.
    moveWidgetToEnd(node, CONTROL_STATUS_WIDGET);
    node.serialize_widgets = true;
    const currentSize = node.size ?? [0, 0];
    const computedSize = node.computeSize?.() ?? currentSize;
    const minimumWidth = Math.max(CONTROL_CENTER_MIN_WIDTH, (computedSize[0] ?? 0) + CONTROL_CENTER_WIDTH_BUFFER);
    node.__bvPresentationManaged=true;
    const presentation={minWidth:minimumWidth,compactWidgetOnly:true,widgetStartY:CONTROL_CENTER_WIDGET_START_Y} as const;
    applyClassicNodePresentation(node,NODE_CLASS,presentation);
    if(!node.__bvControlFinalLayoutQueued&&typeof requestAnimationFrame!=="undefined"){
        node.__bvControlFinalLayoutQueued=true;
        requestAnimationFrame(()=>{node.__bvControlFinalLayoutQueued=false;applyClassicNodePresentation(node,NODE_CLASS,presentation)});
    }
}

function syncAll(config = readConfig()) {
    for (const { node } of collectNodesByType(getApp(), NODE_CLASS)) syncNode(node, config);
    applyConfig(config);
}

window.addEventListener(CONFIG_CHANGED_EVENT, (event) => syncAll((event as CustomEvent<BVControlConfig>).detail));

getApp().registerExtension({
    name: "bv_nodepack.control_center",
    async beforeRegisterNodeDef(nodeType: any, nodeData: any) {
        if (nodeData.name !== NODE_CLASS) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);
            queueMicrotask(() => syncNode(this, readConfig()));
            return result;
        };
    },
    afterConfigureGraph() {
        syncAll();
    },
});

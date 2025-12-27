import {
    bypassGroupsByTitle,
    muteGroupsByTitle,
    unbypassGroupsByTitle,
    unmuteGroupsByTitle,
} from "../../util/control/stateHandler";
import { getApp } from "../../appHelper.js";

const EXT_NAME = "bv_nodepack.bv_control_center";

const app = getApp();

function getRootGraph() {
    return app?.graph;
}

function readControlConfigFromGraph() {
    const g = getRootGraph();
    return g?.extra?.bv_settings?.controlConfig ?? null;
}

function stableStringify(obj) {
    try {
        return obj === undefined ? "undefined" : JSON.stringify(obj);
    } catch {
        return "unstringifiable";
    }
}

function findWidgetByName(node, name) {
    const ws = node?.widgets || [];
    return ws.find((w) => w?.name === name) ?? null;
}

function findWidgetsByName(node, name) {
    const ws = node?.widgets || [];
    return ws.filter((w) => w?.name === name);
}

function setWidgetHidden(widget, hidden) {
    if (!widget) return;
    widget.hidden = !!hidden;
}

function setInputHiddenByName(node, inputName, hidden) {
    const inputs = node?.inputs || [];
    for (const inp of inputs) {
        if (inp?.name === inputName) inp.hidden = !!hidden;
    }
}

function hideConfigJson(node) {
    const cfgWidget = findWidgetByName(node, "config_json");
    if (cfgWidget) setWidgetHidden(cfgWidget, true);
    setInputHiddenByName(node, "config_json", true);
}

function normalizeAction(value) {
    const v = (value ?? "").toString().toLowerCase().trim();
    return v === "bypass" ? "bypass" : "mute";
}

function normalizeGroupTitle(entry) {
    return (
        entry?.group ??
        entry?.groupTitle ??
        entry?.group_title ??
        entry?.targetGroup ??
        entry?.target_group ??
        entry?.ref?.title ??
        ""
    ).toString().trim();
}

/**
 * Apply action using your stateHandler.
 * enabled=true means "apply bypass/mute now"
 * enabled=false means "restore (unbypass/unmute)"
 */
function applyEntry(appOrGraph, groupTitle, action, enabled) {
    if (!groupTitle) return;

    const a = normalizeAction(action);

    if (a === "bypass") {
        if (enabled) bypassGroupsByTitle(appOrGraph, groupTitle, "overlap");
        else unbypassGroupsByTitle(appOrGraph, groupTitle, "overlap");
        return;
    }

    // default: mute
    if (enabled) muteGroupsByTitle(appOrGraph, groupTitle, "overlap");
    else unmuteGroupsByTitle(appOrGraph, groupTitle, "overlap");
}

/**
 * Determine the "mode label" for a row based on its entries.
 * - If all entries are bypass -> BYPASSED
 * - If all entries are mute   -> MUTED
 * - If mixed                 -> DISABLED
 */
function getRowDisableLabel(row) {
    const entries =
        (Array.isArray(row?.entries) && row.entries) ||
        (Array.isArray(row?.groups) && row.groups) ||
        (Array.isArray(row?.items) && row.items) ||
        (Array.isArray(row?.actions) && row.actions) ||
        (Array.isArray(row?.targets) && row.targets) ||
        [];

    const actions = new Set(
        entries.map((e) => normalizeAction(e?.action ?? e?.mode ?? e?.operation ?? e?.type))
    );

    if (actions.size === 1) {
        const only = [...actions][0];
        return only === "bypass" ? "BYPASSED" : "MUTED";
    }

    // either mixed or no entries
    return actions.size === 0 ? "DISABLED" : "DISABLED";
}

/**
 * Build user-facing label based on current ACTIVE state.
 * true  -> "... — ACTIVE"
 * false -> "... — MUTED / BYPASSED / DISABLED"
 */
function buildStateLabel(row, isActive, fallbackKey) {
    const base = (row?.title ?? fallbackKey).toString();
    if (isActive) return `${base} — ACTIVE`;
    return `${base} — ${getRowDisableLabel(row)}`;
}

function getBoolWidget(node, key) {
    return (node?.widgets || []).find((w) => w?.name === key) ?? null;
}

function getOriginalInput(node, key) {
    return (node?.inputs || []).find((x) => x?.__bv_original_name === key || x?.name === key) ?? null;
}

/**
 * Update label on the node widget AND the node input port name.
 * (Port name affects Subgraph exposed ports.)
 */
function applyLabelToNode(node, key, row, isActive) {
    const w = getBoolWidget(node, key);
    if (w) {
        w.label = buildStateLabel(row, isActive, key);
    }

    const inp = getOriginalInput(node, key);
    if (inp) {
        inp.__bv_original_name ??= key;
        inp.name = buildStateLabel(row, isActive, key);
    }
}

/**
 * IMPORTANT UX FIX:
 * - Do NOT force node.setSize(computeSize()) on every refresh.
 * - Only autosize when the UI structure actually changed.
 */
function updateNodeUIFromConfig(node, cfg, allowAutosize = false) {
    hideConfigJson(node);

    const rows = cfg?.rows;
    let changed = false;

    for (let i = 1; i <= 100; i++) {
        const key = `b_${String(i).padStart(3, "0")}`;
        const row = (Array.isArray(rows) && rows[i - 1]) ? rows[i - 1] : null;

        const widgets = findWidgetsByName(node, key);
        const hasRow = !!row;

        // Determine current state (INVERTED semantics):
        // true  -> ACTIVE
        // false -> DISABLED (mute/bypass)
        const w0 = widgets[0];
        const currentValue = !!(w0?.value);
        const isActive = currentValue;

        const labelText = hasRow ? buildStateLabel(row, isActive, key) : key;

        // 1) widget visibility + label + store row
        for (const w of widgets) {
            const nextHidden = !hasRow;
            if (w.hidden !== nextHidden) changed = true;
            setWidgetHidden(w, nextHidden);

            if (hasRow) {
                if (w.label !== labelText) changed = true;
                w.label = labelText;

                if (w.__bv_row !== row) changed = true;
                w.__bv_row = row;
            } else {
                if (w.__bv_row != null) changed = true;
                w.__bv_row = null;
            }
        }

        // 2) hide unused input pins (structural)
        const inputs = node?.inputs || [];
        for (const inp of inputs) {
            if (inp?.name === key) {
                const nextHidden = !hasRow;
                if (inp.hidden !== nextHidden) changed = true;
                inp.hidden = nextHidden;
            }
        }

        // 3) rename the *input port name* so subgraph exports the pretty name
        const inp = (node.inputs || []).find(x => x?.name === key || x?.__bv_original_name === key);
        if (inp) {
            inp.__bv_original_name ??= key;

            const nextName = hasRow ? labelText : key;
            if (inp.name !== nextName) changed = true;
            inp.name = nextName;
        }
    }

    if (allowAutosize && changed) {
        const newSize = node.computeSize?.();
        if (newSize) node.setSize?.(newSize);
    }

    node.graph?.setDirtyCanvas?.(true, true);
    node.graph?.parent_graph?.setDirtyCanvas?.(true, true);
}

function hookBooleanWidgetHandlers(node) {
    const appOrGraph = app;

    const widgets = node?.widgets || [];
    for (const w of widgets) {
        if (!w?.name || !/^b_\d{3}$/.test(w.name)) continue;

        if (w.__bv_patched) continue;
        w.__bv_patched = true;

        const original = w.callback;

        w.callback = function (value) {
            try { original?.call(this, value); } catch { }

            if (w.hidden) return;

            const row = w.__bv_row;
            if (!row) return;

            // INVERTED semantics:
            // true  -> ACTIVE (do NOT apply bypass/mute)
            // false -> DISABLED (apply bypass/mute)
            const isActive = !!value;
            const applyDisable = !isActive;

            // Update label (node + subgraph port) immediately for UX
            applyLabelToNode(node, w.name, row, isActive);

            const entries =
                (Array.isArray(row.entries) && row.entries) ||
                (Array.isArray(row.groups) && row.groups) ||
                (Array.isArray(row.items) && row.items) ||
                (Array.isArray(row.actions) && row.actions) ||
                (Array.isArray(row.targets) && row.targets) ||
                [];

            for (const entry of entries) {
                const groupTitle = normalizeGroupTitle(entry);
                const action = normalizeAction(entry?.action ?? entry?.mode ?? entry?.operation ?? entry?.type);
                if (!groupTitle) continue;

                applyEntry(appOrGraph, groupTitle, action, applyDisable);
            }

            getRootGraph()?.setDirtyCanvas?.(true, true);
        };
    }
}

function installImmediateRefreshHook(node) {
    const graph = getRootGraph();
    if (!graph || node.__bv_dirtyHookInstalled) return;
    node.__bv_dirtyHookInstalled = true;

    const orig = graph.setDirtyCanvas;
    if (typeof orig !== "function") return;

    graph.setDirtyCanvas = function () {
        const r = orig.apply(this, arguments);
        try { node.__bv_force_refresh = true; } catch { }
        return r;
    };
}

function startConfigWatcher(node) {
    let lastSig = "";

    const tick = () => {
        if (!node || !node.graph) return;

        installImmediateRefreshHook(node);

        const cfg = readControlConfigFromGraph();
        const sig = stableStringify(cfg);

        // Autosize ONLY when config signature really changed
        if (sig !== lastSig) {
            lastSig = sig;

            updateNodeUIFromConfig(node, cfg, true);
            hookBooleanWidgetHandlers(node);
            hookWidgetChanged(node);
            return;
        }

        // For "force refresh" (canvas dirty), update UI but DO NOT autosize
        if (node.__bv_force_refresh) {
            node.__bv_force_refresh = false;

            updateNodeUIFromConfig(node, cfg, false);
            hookBooleanWidgetHandlers(node);
            hookWidgetChanged(node);
        }
    };

    tick();
    const id = setInterval(tick, 400);
    node.__bv_cfg_watch_id = id;

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        try { clearInterval(node.__bv_cfg_watch_id); } catch { }
        return onRemoved?.apply(this, arguments);
    };
}

function hookWidgetChanged(node) {
    if (node.__bv_onWidgetChanged_patched) return;
    node.__bv_onWidgetChanged_patched = true;

    const original = node.onWidgetChanged;

    node.onWidgetChanged = function (name, value, widget) {
        let r;
        try { r = original?.apply(this, arguments); } catch { }

        if (!name || !/^b_\d{3}$/.test(name)) return r;

        const w =
            widget ||
            (this.widgets || []).find((x) => x?.name === name) ||
            null;

        if (!w || w.hidden) return r;

        const row = w.__bv_row;
        if (!row) return r;

        // INVERTED semantics:
        const isActive = !!value;
        const applyDisable = !isActive;

        // Update label (node + subgraph port) immediately for UX
        applyLabelToNode(this, name, row, isActive);

        const entries =
            (Array.isArray(row.entries) && row.entries) ||
            (Array.isArray(row.groups) && row.groups) ||
            (Array.isArray(row.items) && row.items) ||
            (Array.isArray(row.actions) && row.actions) ||
            (Array.isArray(row.targets) && row.targets) ||
            [];

        for (const entry of entries) {
            const groupTitle = normalizeGroupTitle(entry);
            const actionRaw = entry?.action ?? entry?.mode ?? entry?.operation ?? entry?.type;

            if (!groupTitle) continue;

            const action = normalizeAction(actionRaw);
            applyEntry(app, groupTitle, action, applyDisable);
        }

        getRootGraph()?.setDirtyCanvas?.(true, true);
        return r;
    };
}

app.registerExtension({
    name: EXT_NAME,

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType?.ComfyClass || nodeType?.comfyClass;
        const nodeName = nodeData?.name;

        const isControlCenter =
            comfyClass === "BVControlCenterNode" ||
            nodeName === "BV Control Center" ||
            nodeName?.includes("BV Control Center") ||
            nodeName?.includes("🌀 BV Control Center");

        if (!isControlCenter) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            hideConfigJson(this);
            startConfigWatcher(this);

            return r;
        };
    },
});

import {
    bypassGroupsByTitle,
    muteGroupsByTitle,
    unbypassGroupsByTitle,
    unmuteGroupsByTitle,
} from "../../util/control/stateHandler";
import {getApp} from "../../appHelper.js";


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
 * ✅ This is the key change:
 * Use your stateHandler for per-entry action.
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

function updateNodeUIFromConfig(node, cfg) {
    hideConfigJson(node);

    const rows = cfg?.rows;
    for (let i = 1; i <= 100; i++) {
        const key = `b_${String(i).padStart(3, "0")}`;
        const row = (Array.isArray(rows) && rows[i - 1]) ? rows[i - 1] : null;

        const widgets = findWidgetsByName(node, key);
        const hasRow = !!row;

        for (const w of widgets) {
            setWidgetHidden(w, !hasRow);

            if (hasRow) {
                const title = (row?.title ?? key).toString();
                w.label = title;

                // Store the row on the widget so toggle can apply all entries
                w.__bv_row = row;
            } else {
                w.__bv_row = null;
            }
        }

        setInputHiddenByName(node, key, !hasRow);
    }

    node.setSize?.(node.computeSize?.() ?? node.size);
    node.graph?.setDirtyCanvas?.(true, true);
}

function hookBooleanWidgetHandlers(node) {
    // stateHandler accepts app OR graph; we pass app so traversal can use rootGraph if present
    const appOrGraph = app;

    const widgets = node?.widgets || [];
    for (const w of widgets) {
        if (!w?.name || !/^b_\d{3}$/.test(w.name)) continue;

        if (w.__bv_patched) continue;
        w.__bv_patched = true;

        const original = w.callback;

        w.callback = function (value) {
            try { original?.call(this, value); } catch {}

            if (w.hidden) return;

            const row = w.__bv_row;
            if (!row) return;

            const enabled = !!value;
            const entries = Array.isArray(row.entries) ? row.entries : [];

            for (const entry of entries) {
                const groupTitle = normalizeGroupTitle(entry);
                const action = normalizeAction(entry?.action ?? entry?.mode ?? entry?.operation);

                // ✅ apply per group with correct action and correct revert on disable
                applyEntry(appOrGraph, groupTitle, action, enabled);
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
        try { node.__bv_force_refresh = true; } catch {}
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

        if (sig !== lastSig || node.__bv_force_refresh) {
            node.__bv_force_refresh = false;
            lastSig = sig;

            updateNodeUIFromConfig(node, cfg);
            hookBooleanWidgetHandlers(node);
            hookWidgetChanged(node);
        }
    };

    tick();
    const id = setInterval(tick, 400);
    node.__bv_cfg_watch_id = id;

    const onRemoved = node.onRemoved;
    node.onRemoved = function () {
        try { clearInterval(node.__bv_cfg_watch_id); } catch {}
        return onRemoved?.apply(this, arguments);
    };
}

function hookWidgetChanged(node) {
    if (node.__bv_onWidgetChanged_patched) return;
    node.__bv_onWidgetChanged_patched = true;

    const original = node.onWidgetChanged;

    node.onWidgetChanged = function (name, value, widget) {
        // call original first
        let r;
        try { r = original?.apply(this, arguments); } catch {}

        // only booleans b_001..b_100
        if (!name || !/^b_\d{3}$/.test(name)) return r;

        // sometimes widget param isn't passed; find it
        const w =
            widget ||
            (this.widgets || []).find((x) => x?.name === name) ||
            null;

        // If hidden or not configured, ignore
        if (!w || w.hidden) return r;

        const row = w.__bv_row;
        if (!row) return r;

        const enabled = !!value;

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

            if (!groupTitle) {
                console.warn(`[${EXT_NAME}] Entry has no groupTitle`, entry);
                continue;
            }

            const action = normalizeAction(actionRaw);

            applyEntry(app, groupTitle, action, enabled);
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

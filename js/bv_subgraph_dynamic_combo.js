import { app } from "../../scripts/app.js";

/**
 * BV Util Dynamic Combo
 * - Replaces a STRING widget named "value" with a real "combo" widget.
 * - Combo options are taken from a multiline STRING widget named "options".
 * - Works also when node is exposed via subgraph (hooks onNodeCreated + onConfigure).
 */

function parseOptions(text) {
    const lines = (text ?? "")
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);

    // unique, order-preserving
    const seen = new Set();
    const out = [];
    for (const l of lines) {
        if (!seen.has(l)) {
            seen.add(l);
            out.push(l);
        }
    }

    return out.length ? out : [""];
}

function isMultilineStringWidget(w) {
    return (
        w &&
        w.type === "customtext"
    );
}

function isStringValueWidget(w) {
    // value is declared as STRING in python -> litegraph widget is usually type "string"
    return w && w.name === "value" && (w.type === "string" || w.type === "text");
}

function findWidgets(node) {
    const widgets = node?.widgets || [];
    const valueWidget = widgets.find((w) => w?.name === "value");
    const optionsWidget = widgets.find((w) => w?.name === "options");
    return { valueWidget, optionsWidget };
}

function replaceWidget(node, oldWidget, newWidget) {
    const idx = node.widgets.indexOf(oldWidget);
    if (idx >= 0) node.widgets.splice(idx, 1, newWidget);
}

function ensurePropertiesSync(node, key, val) {
    node.properties = node.properties || {};
    node.properties[key] = val;
}

function ensureComboValid(comboWidget) {
    const values = comboWidget?.options?.values || [];
    if (!values.includes(comboWidget.value)) {
        comboWidget.value = values[0] ?? "";
    }
}

function upgradeDynamicCombo(node) {
    if (!node || !node.widgets) return;

    // Avoid patching twice
    if (node.__bvDynamicComboPatched) return;

    const { valueWidget, optionsWidget } = findWidgets(node);
    if (!valueWidget || !optionsWidget) return;

    // We only patch if:
    // - options is multiline string (the editor list)
    // - value is a string widget (declared STRING in python)
    if (!isMultilineStringWidget(optionsWidget)) return;
    if (!isStringValueWidget(valueWidget)) return;

    const values = parseOptions(optionsWidget.value);

    // Create a REAL combo widget
    const comboWidget = node.addWidget(
        "combo",
        "value",
        valueWidget.value ?? (values[0] ?? ""),
        (v) => {
            ensurePropertiesSync(node, "value", v);
        },
        { values }
    );


    // Replace old string widget with our combo widget
    replaceWidget(node, valueWidget, comboWidget);

    // Sync properties & validate selection
    ensureComboValid(comboWidget);
    ensurePropertiesSync(node, "value", comboWidget.value);

    // Update combo values when options change
    const originalOptionsCb = optionsWidget.callback;
    optionsWidget.callback = (v) => {
        originalOptionsCb?.(v);

        const newValues = parseOptions(v);
        comboWidget.options.values = newValues;

        ensureComboValid(comboWidget);
        ensurePropertiesSync(node, "value", comboWidget.value);

        node.setDirtyCanvas(true, true);
    };

    node.__bvDynamicComboPatched = true;
    node.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "bv_nodepack.bv_util_dynamic_combo",

    async setup() {
        // Patch existing nodes (e.g., after reload)
        try {
            const graph = app?.graph;
            const nodes = graph?._nodes || graph?.nodes || [];
            for (const n of nodes) upgradeDynamicCombo(n);
        } catch (e) {
            // ignore
        }
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        // Patch ALL nodes (important for subgraph-exposed nodes whose name differs)
        const origCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = origCreated?.apply(this, arguments);
            try {
                upgradeDynamicCombo(this);
            } catch (e) {
                // ignore
            }
            return r;
        };

        // Needed for:
        // - Loading a workflow
        // - Subgraph expose rebuilds
        const origConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = origConfigure?.apply(this, arguments);
            try {
                upgradeDynamicCombo(this);
            } catch (e) {
                // ignore
            }
            return r;
        };
    },
});

import { app } from "../../scripts/app.js";
import { ComfyWidgets } from "../../scripts/widgets.js";

const WIDGET_NAME = "bv_ast_debug_output";
const TEXT_LOG_WIDGET_NAME = "bv_text_log_preview";
const TEXT_LOG_MODES = new Set(["overwrite", "append", "timestamped"]);

function linkedOrigin(node, inputIndex = 0) {
    const linkId = node?.inputs?.[inputIndex]?.link;
    const graph = node?.graph;
    if (linkId == null || !graph) return null;
    const link = graph.links?.[linkId] ?? graph._links?.get?.(linkId);
    const origin = link ? graph.getNodeById?.(link.origin_id) : null;
    return origin ? { node: origin, slot: Number(link.origin_slot) } : null;
}

function inferTextLogName(node) {
    const origin = linkedOrigin(node);
    if (!origin) return "";
    if (origin.node.type === "BV Regional Prompt Enhancer") {
        if (origin.slot === 1) return "regional-enhancer-diff.json";
        if (origin.slot === 2) return "regional-enhancer-diagnostics.txt";
    }
    if (origin.node.type === "BV Regional Debug" && origin.slot === 0) {
        const regionalOrigin = linkedOrigin(origin.node);
        if (regionalOrigin?.node?.type === "BV Apply Regional Enhancement") {
            return "regional-enhancer-after.json";
        }
        return "regional-enhancer-before.json";
    }
    return "";
}

function migrateTextLogWriterWidgets(node) {
    const legacyText = node?.widgets?.find((widget) => widget.name === "text");
    const logName = node?.widgets?.find((widget) => widget.name === "log_name");
    const mode = node?.widgets?.find((widget) => widget.name === "mode");
    const writeEnabled = node?.widgets?.find((widget) => widget.name === "write_enabled");
    if (!logName || !mode || !writeEnabled) return false;

    let changed = false;
    if (TEXT_LOG_MODES.has(logName.value) && typeof mode.value === "boolean") {
        const recoveredName = typeof legacyText?.value === "string" ? legacyText.value.trim() : "";
        const inferredName = inferTextLogName(node);
        const restoredName = recoveredName || inferredName;
        if (restoredName) {
            const recoveredMode = logName.value;
            const recoveredEnabled = mode.value;
            logName.value = restoredName;
            mode.value = recoveredMode;
            writeEnabled.value = recoveredEnabled;
            changed = true;
        }
    }
    if (!TEXT_LOG_MODES.has(mode.value) && typeof mode.value === "string" && mode.value.trim()) {
        if (!String(logName.value ?? "").trim()) logName.value = mode.value;
        mode.value = TEXT_LOG_MODES.has(writeEnabled.value) ? writeEnabled.value : "timestamped";
        changed = true;
    }
    if (typeof writeEnabled.value !== "boolean") {
        writeEnabled.value = true;
        changed = true;
    }
    if (legacyText) {
        legacyText.value = "";
        legacyText.serialize = true;
        legacyText.type = "converted-widget";
        legacyText.hidden = true;
        legacyText.computeSize = () => [0, -4];
        if (legacyText.element) legacyText.element.style.display = "none";
    }
    if (changed) {
        node.setDirtyCanvas?.(true, true);
        node.graph?.setDirtyCanvas?.(true, true);
    }
    return changed;
}

function ensureDebugWidget(node) {
    if (!node || node.__bvAstDebugWidget) return node?.__bvAstDebugWidget;

    const textarea = document.createElement("textarea");
    textarea.readOnly = true;
    textarea.placeholder = "Run the workflow to inspect the AST.";
    textarea.style.boxSizing = "border-box";
    textarea.style.width = "100%";
    textarea.style.height = "100%";
    textarea.style.minHeight = "160px";
    textarea.style.resize = "vertical";
    textarea.style.fontFamily = "ui-monospace, SFMono-Regular, Consolas, monospace";
    textarea.style.fontSize = "12px";
    textarea.style.whiteSpace = "pre";

    const widget = node.addDOMWidget(WIDGET_NAME, "textarea", textarea, {
        serialize: false,
        getMinHeight: () => 160,
        getValue: () => textarea.value,
        setValue: (value) => {
            textarea.value = typeof value === "string" ? value : "";
        },
    });

    widget.element = textarea;
    node.__bvAstDebugWidget = widget;
    return widget;
}

function setDebugText(node, value) {
    const widget = ensureDebugWidget(node);
    const textarea = widget?.element;
    if (!textarea) return;

    textarea.value = value;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function ensureTextLogPreview(node) {
    if (!node || node.__bvTextLogPreviewWidget) return node?.__bvTextLogPreviewWidget;

    const widget = ComfyWidgets["STRING"](
        node,
        TEXT_LOG_WIDGET_NAME,
        ["STRING", { multiline: true, default: "" }],
        app,
    ).widget;
    widget.serialize = false;
    widget.serializeValue = () => undefined;
    widget.value = "";
    if (widget.inputEl) {
        widget.inputEl.readOnly = true;
        widget.inputEl.placeholder = "Run the workflow to preview the received text.";
        widget.inputEl.setAttribute("aria-label", "BV Text Log Writer preview");
        widget.inputEl.style.opacity = "0.75";
        widget.inputEl.style.minHeight = "220px";
    }
    node.__bvTextLogPreviewWidget = widget;
    node.setSize?.([Math.max(node.size?.[0] ?? 0, 360), Math.max(node.size?.[1] ?? 0, 390)]);
    return widget;
}

function setTextLogPreview(node, value) {
    const widget = ensureTextLogPreview(node);
    if (!widget) return;
    widget.value = value;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "bv_nodepack.ast_debug_output",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData?.name === "BV Text Log Writer") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const result = onNodeCreated?.apply(this, arguments);
                migrateTextLogWriterWidgets(this);
                requestAnimationFrame(() => ensureTextLogPreview(this));
                return result;
            };

            const onConfigure = nodeType.prototype.onConfigure;
            nodeType.prototype.onConfigure = function () {
                const result = onConfigure?.apply(this, arguments);
                migrateTextLogWriterWidgets(this);
                requestAnimationFrame(() => ensureTextLogPreview(this));
                return result;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function (message) {
                const result = onExecuted?.apply(this, arguments);
                const text = message?.text?.[0];
                if (typeof text === "string") setTextLogPreview(this, text);
                return result;
            };
            return;
        }

        if (nodeData?.name !== "BV Prompt AST Debug") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onNodeCreated?.apply(this, arguments);
            ensureDebugWidget(this);
            return result;
        };

        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            ensureDebugWidget(this);
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const result = onExecuted?.apply(this, arguments);
            const text = message?.ast_json?.[0];
            if (typeof text === "string") setDebugText(this, text);
            return result;
        };
    },

    afterConfigureGraph() {
        for (const node of app.graph?._nodes ?? []) {
            if (node.type === "BV Text Log Writer") migrateTextLogWriterWidgets(node);
        }
    },
});

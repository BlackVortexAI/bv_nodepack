import { app } from "../../scripts/app.js";

const WIDGET_NAME = "bv_ast_debug_output";

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

app.registerExtension({
    name: "bv_nodepack.ast_debug_output",

    async beforeRegisterNodeDef(nodeType, nodeData) {
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
});

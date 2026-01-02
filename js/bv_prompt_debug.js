import { app } from "../../scripts/app.js";

function setWidgetReadonly(widget, readonly = true) {
    // Keep it interactive (scroll/select), but prevent edits
    widget.disabled = false;
    widget.readonly = readonly;
    widget.options = widget.options || {};
    widget.options.readonly = readonly;

    // If the DOM element exists (textarea/input), set readonly there too
    const el = widget.inputEl || widget.element || widget.el;
    if (el) {
        el.readOnly = readonly;
        el.setAttribute("readonly", readonly ? "true" : "false");
        // Important: do NOT disable pointer events, otherwise scrolling breaks
        el.style.pointerEvents = "auto";
    }

    // Some ComfyUI widget implementations use callback to commit value;
    // we can keep callback but readonly prevents edits anyway.
}

app.registerExtension({
    name: "bv_nodepack.ast_debug_output",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const name = nodeData?.name;
        if (name !== "BV Prompt AST Debug") return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            // Find by widget name (much more stable than slot index)
            const w = this.widgets?.find((x) => x.name === "debug_output");
            if (w) {
                // Mark readonly immediately (if DOM exists already)
                setWidgetReadonly(w, true);

                // Fallback: ensure readonly once the input element exists
                const origDraw = w.draw;
                w.draw = function () {
                    const rr = origDraw?.apply(this, arguments);
                    if (!w.__bv_readonly_applied) {
                        setWidgetReadonly(w, true);
                        // if element exists now, lock it
                        const el = w.inputEl || w.element || w.el;
                        if (el) w.__bv_readonly_applied = true;
                    }
                    return rr;
                };
            }

            return r;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            const r = onExecuted?.apply(this, arguments);

            // Your python returns UI key "ast_json": [txt] :contentReference[oaicite:1]{index=1}
            const txt = message?.ast_json?.[0];
            if (typeof txt === "string") {
                const w = this.widgets?.find((x) => x.name === "debug_output");
                if (w) {
                    w.value = txt;

                    // Keep readonly and refresh element value if present
                    setWidgetReadonly(w, true);
                    const el = w.inputEl || w.element || w.el;
                    if (el) el.value = txt;

                    this.setDirtyCanvas(true, true);
                    this.graph?.setDirtyCanvas(true, true);
                }
            }

            return r;
        };
    }
});

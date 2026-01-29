import { app } from "../../scripts/app.js";

function getWidget(node, name) {
    return (node?.widgets || []).find((w) => w?.name === name) || null;
}

function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = a;
    return Math.max(a, Math.min(b, n));
}

function forceRelayout(node) {
    if (!node) return;
    node.setSize?.(node.computeSize());
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

function patchHeading(node) {
    const valueW =
        (node.widgets || []).find((w) => w?.name === "value") ||
        (node.widgets || []).find((w) => w?.config?.[0] === "STRING");

    if (!node || !valueW) return;

    // Allow re-patching if widgets were rebuilt:
    // Only mark patched on the widget instance itself
    if (!valueW.__bvHeadingPatched) {
        valueW.__bvHeadingPatched = true;
        valueW.__bvNode = node;

        valueW.type = "BV_HEADING";
        valueW.options = valueW.options || {};
        valueW.options.serialize = true;

        valueW.draw = function (ctx, _node, width, posY, height) {
            const n = this.__bvNode || node;

            // IMPORTANT: do not cache these widgets; fetch fresh each draw
            const fontSizeW = getWidget(n, "font_size");
            const showDividerW = getWidget(n, "show_divider");

            const text = String(this.value ?? "");
            const fontSize = clamp(fontSizeW?.value ?? 20, 10, 80);
            const showDivider = !!showDividerW?.value;

            const padX = 10;
            const padY = 10;
            const textH = fontSize * 1.35;

            const y = posY + Math.max(0, (height - (textH + (showDivider ? 10 : 0))) * 0.5);

            ctx.save();

            // Clip only the text area
            ctx.beginPath();
            ctx.rect(padX, posY + padY, width - padX * 2, textH + padY);
            ctx.clip();

            ctx.font = `700 ${fontSize}px Inter, system-ui, sans-serif`;
            ctx.fillStyle = "#ddd";
            ctx.textAlign = "left";
            ctx.textBaseline = "top";
            ctx.fillText(text, padX, y + padY);

            ctx.restore();

            if (showDivider) {
                const lineY = posY + textH + 5;
                ctx.save();
                ctx.globalAlpha = 0.35;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(padX, lineY);
                ctx.lineTo(width - padX, lineY);
                ctx.strokeStyle = "#ddd";
                ctx.stroke();
                ctx.restore();
            }
        };

        valueW.computeSize = function (width) {
            const n = this.__bvNode || node;
            const fontSizeW = getWidget(n, "font_size");
            const showDividerW = getWidget(n, "show_divider");

            const fontSize = clamp(fontSizeW?.value ?? 20, 10, 80);
            const showDivider = !!showDividerW?.value;

            const padY = 10;
            const textH = Math.ceil(fontSize * 1.35);
            const dividerExtra = showDivider ? 12 : 0;

            const h = Math.max(34, textH + padY + dividerExtra);
            return [Math.max(220, width || 220), h];
        };

        // Keep widget->input conversion compatibility
        valueW.config = valueW.config || ["STRING", { default: valueW.value ?? "", multiline: false }];
    }

    const hookRedraw = (w) => {
        if (!w || w.__bvHeadingHooked) return;
        w.__bvHeadingHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = valueW.__bvNode || node;
            forceRelayout(n);
            return oldCb?.apply(this, arguments);
        };
    };

    // Hook whatever is present right now (and re-hook later if widgets get rebuilt)
    hookRedraw(getWidget(node, "font_size"));
    hookRedraw(getWidget(node, "show_divider"));
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "bv_nodepack.bv_subgraph_heading",

    getCustomWidgets() {
        return {
            BV_HEADING: () => ({ widget: null }),
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType?.ComfyClass || nodeType?.comfyClass;
        const nodeName = nodeData?.name;

        const isHeading =
            comfyClass === "BVSubgraphHeading" || nodeName === "BV Subgraph Heading";
        if (!isHeading) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            patchHeading(this);
            hideAllOutputs(this);
            forceRelayout(this);

            this.serialize_widgets = true;
            return r;
        };

        const oldConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = oldConfigure?.apply(this, arguments);

            patchHeading(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };

        // NEW: keep layout correct after slot/widget rebuilds
        const oldConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = oldConnectionsChange?.apply(this, arguments);

            patchHeading(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };
    },
});

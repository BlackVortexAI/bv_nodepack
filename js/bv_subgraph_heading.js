import {app} from "../../scripts/app.js";

function getWidget(node, name) {
    return (node?.widgets || []).find((w) => w?.name === name) || null;
}

function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = a;
    return Math.max(a, Math.min(b, n));
}

function patchHeading(node) {
    const valueW =
        (node.widgets || []).find((w) => w?.name === "value") ||
        (node.widgets || []).find((w) => w?.config?.[0] === "STRING");

    if (!node || !valueW || valueW.__bvHeadingPatched) return;
    valueW.__bvHeadingPatched = true;

    valueW.__bvNode = node;
    valueW.__bvFontSizeWidget = getWidget(node, "font_size");
    valueW.__bvShowDividerWidget = getWidget(node, "show_divider");

    valueW.type = "BV_HEADING";
    valueW.options = valueW.options || {};
    valueW.options.serialize = true;

    valueW.draw = function (ctx, _node, width, posY, height) {
        const text = String(this.value ?? "");
        const fontSize = clamp(this.__bvFontSizeWidget?.value ?? 20, 10, 80);
        const showDivider = !!this.__bvShowDividerWidget?.value;

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
        const fontSize = clamp(this.__bvFontSizeWidget?.value ?? 20, 10, 80);
        const showDivider = !!this.__bvShowDividerWidget?.value;

        const padY = 10;
        const textH = Math.ceil(fontSize * 1.35);
        const dividerExtra = showDivider ? 12 : 0;

        const h = Math.max(34, textH + padY + dividerExtra);
        return [Math.max(220, width || 220), h];
    };

    // Keep widget->input conversion compatibility
    valueW.config = valueW.config || ["STRING", {default: valueW.value ?? "", multiline: false}];

    const hookRedraw = (w) => {
        if (!w || w.__bvHeadingHooked) return;
        w.__bvHeadingHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = valueW.__bvNode || node;
            n?.setSize?.(n.computeSize());
            n?.setDirtyCanvas(true, true);
            n?.graph?.setDirtyCanvas(true, true);
            return oldCb?.apply(this, arguments);
        };
    };

    hookRedraw(valueW.__bvFontSizeWidget);
    hookRedraw(valueW.__bvShowDividerWidget);
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;           // removes output slots visually
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "bv_nodepack.bv_subgraph_heading",

    getCustomWidgets() {
        return {
            BV_HEADING: () => ({widget: null}),
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

            this.setSize?.(this.computeSize());
            this.graph?.setDirtyCanvas(true, true);

            this.serialize_widgets = true;
            this.setDirtyCanvas(true, true);
            return r;
        };

        const oldConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = oldConfigure?.apply(this, arguments);

            // patch + hide outputs after graph loads/restores node
            patchHeading(this);
            hideAllOutputs(this);

            this.setSize?.(this.computeSize());
            return r;
        };
    },
});

import {app} from "../../scripts/app.js";

function getWidget(node, name) {
    return (node?.widgets || []).find((w) => w?.name === name) || null;
}

function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = a;
    return Math.max(a, Math.min(b, n));
}

function patchDivider(node) {
    const thickW = getWidget(node, "thickness");
    const padW = getWidget(node, "padding");
    const alphaW = getWidget(node, "alpha");

    if (!node || !thickW || thickW.__bvDividerPatched) return;
    thickW.__bvDividerPatched = true;

    thickW.__bvNode = node;
    thickW.__bvPadWidget = padW;
    thickW.__bvAlphaWidget = alphaW;

    thickW.type = "BV_DIVIDER";
    thickW.options = thickW.options || {};
    thickW.options.serialize = true;

    thickW.draw = function (ctx, _node, width, posY, height) {
        const thickness = clamp(thickW.value ?? 2, 1, 10);
        const pad = clamp(this.__bvPadWidget?.value ?? 10, 0, 60);
        const alpha = clamp(this.__bvAlphaWidget?.value ?? 0.35, 0.05, 1.0);

        const y = posY + height * 0.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.lineWidth = thickness;
        ctx.strokeStyle = "#ddd";
        ctx.beginPath();
        ctx.moveTo(pad, y);
        ctx.lineTo(width - pad, y);
        ctx.stroke();
        ctx.restore();
    };

    thickW.computeSize = function (width) {
        const thickness = clamp(thickW.value ?? 2, 1, 10);
        const padY = 10;
        const h = Math.max(18, thickness + padY);
        return [Math.max(220, width || 220), h];
    };

    const hookRedraw = (w) => {
        if (!w || w.__bvDividerHooked) return;
        w.__bvDividerHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = thickW.__bvNode || node;
            n?.setSize?.(n.computeSize());
            n?.setDirtyCanvas(true, true);
            n?.graph?.setDirtyCanvas(true, true);
            return oldCb?.apply(this, arguments);
        };
    };

    hookRedraw(thickW);
    hookRedraw(padW);
    hookRedraw(alphaW);
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;           // removes output slots visually
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}


app.registerExtension({
    name: "bv_nodepack.bv_divider",

    getCustomWidgets() {
        return {
            BV_DIVIDER: () => ({widget: null}),
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType?.ComfyClass || nodeType?.comfyClass;
        const nodeName = nodeData?.name;

        const isDivider = comfyClass === "BVSubgraphDivider" || nodeName === "BV Subgraph Divider";
        if (!isDivider) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            patchDivider(this);


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
            patchDivider(this);
            hideAllOutputs(this);

            this.setSize?.(this.computeSize());
            return r;
        };
    },
});

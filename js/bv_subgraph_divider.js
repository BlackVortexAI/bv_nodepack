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

function patchDivider(node) {
    const thickW = getWidget(node, "thickness");
    if (!node || !thickW) return;

    node.__bvPresentationWidget = thickW;

    // Patch per widget instance; allow re-patching if rebuilt
    if (!thickW.__bvDividerPatched) {
        thickW.__bvDividerPatched = true;
        thickW.__bvNode = node;

        thickW.__bvPresentationType = "BV_DIVIDER";
        thickW.options = thickW.options || {};
        thickW.options.serialize = true;

        thickW.draw = function (ctx, _node, width, posY, height) {
            const n = this.__bvNode || node;

            // IMPORTANT: do not cache; fetch fresh each draw
            const padW = getWidget(n, "padding");
            const alphaW = getWidget(n, "alpha");

            const thickness = clamp(this.value ?? 2, 1, 10);
            const pad = clamp(padW?.value ?? 10, 0, 60);
            const alpha = clamp(alphaW?.value ?? 0.35, 0.05, 1.0);

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
            const thickness = clamp(this.value ?? 2, 1, 10);
            const padY = 10;
            const h = Math.max(18, thickness + padY);
            return [Math.max(220, width || 220), h];
        };
    }

    const hookRedraw = (w) => {
        if (!w || w.__bvDividerHooked) return;
        w.__bvDividerHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = thickW.__bvNode || node;
            forceRelayout(n);
            return oldCb?.apply(this, arguments);
        };
    };

    // Hook current widgets (re-hooking will happen after rebuild via onConnectionsChange)
    hookRedraw(thickW);
    hookRedraw(getWidget(node, "padding"));
    hookRedraw(getWidget(node, "alpha"));
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "bv_nodepack.bv_divider",

    getCustomWidgets() {
        return {
            BV_DIVIDER: () => ({ widget: null }),
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType?.ComfyClass || nodeType?.comfyClass;
        const nodeName = nodeData?.name;

        const isDivider =
            comfyClass === "BVSubgraphDivider" || nodeName === "BV Subgraph Divider";
        if (!isDivider) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            patchDivider(this);
            hideAllOutputs(this);
            forceRelayout(this);

            this.serialize_widgets = true;
            return r;
        };

        const oldConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = oldConfigure?.apply(this, arguments);

            patchDivider(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };

        // NEW: keep layout correct after slot/widget rebuilds
        const oldConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = oldConnectionsChange?.apply(this, arguments);

            patchDivider(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };
    },
});

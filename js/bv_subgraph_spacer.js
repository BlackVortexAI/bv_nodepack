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

function patchSpacer(node) {
    const hW = getWidget(node, "height");
    if (!node || !hW || hW.__bvSpacerPatched) return;

    node.__bvPresentationWidget = hW;

    hW.__bvSpacerPatched = true;
    hW.__bvNode = node;

    hW.__bvPresentationType = "BV_SPACER";
    hW.options = hW.options || {};
    hW.options.serialize = true;

    hW.draw = function () { };

    hW.computeSize = function (width) {
        // IMPORTANT: do NOT cache the scale widget; it may be replaced on subgraph input reorder/rebuild
        const scaleW = getWidget(hW.__bvNode || node, "scale");

        const base = clamp(hW.value ?? 24, 0, 400);
        const scale = clamp(scaleW?.value ?? 1.0, 0.0, 5.0);
        const h = Math.max(8, Math.round(base * scale));
        return [Math.max(220, width || 220), h];
    };

    const hookRedraw = (w) => {
        if (!w || w.__bvSpacerHooked) return;
        w.__bvSpacerHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = hW.__bvNode || node;
            forceRelayout(n);
            return oldCb?.apply(this, arguments);
        };
    };

    hookRedraw(hW);

    // Hook scale widget if present (but do not cache it)
    hookRedraw(getWidget(node, "scale"));
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "bv_nodepack.bv_spacer",

    getCustomWidgets() {
        return {
            BV_SPACER: () => ({ widget: null }),
        };
    },

    async beforeRegisterNodeDef(nodeType, nodeData) {
        const comfyClass = nodeType?.ComfyClass || nodeType?.comfyClass;
        const nodeName = nodeData?.name;

        const isSpacer = comfyClass === "BVSubgraphSpacer" || nodeName === "BV Subgraph Spacer";
        if (!isSpacer) return;

        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const r = onNodeCreated?.apply(this, arguments);

            patchSpacer(this);
            hideAllOutputs(this);
            forceRelayout(this);

            this.serialize_widgets = true;
            return r;
        };

        const oldConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const r = oldConfigure?.apply(this, arguments);

            patchSpacer(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };

        // NEW: Re-run layout when links/slots change (often happens during subgraph input reorder/rebuild)
        const oldConnectionsChange = nodeType.prototype.onConnectionsChange;
        nodeType.prototype.onConnectionsChange = function () {
            const r = oldConnectionsChange?.apply(this, arguments);

            // Make sure widget patching & layout are consistent after slot/order changes
            patchSpacer(this);
            hideAllOutputs(this);
            forceRelayout(this);

            return r;
        };
    },
});

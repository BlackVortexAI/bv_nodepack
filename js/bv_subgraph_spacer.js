import {app} from "../../scripts/app.js";

function getWidget(node, name) {
    return (node?.widgets || []).find((w) => w?.name === name) || null;
}

function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) n = a;
    return Math.max(a, Math.min(b, n));
}

function patchSpacer(node) {
    const hW = getWidget(node, "height");
    if (!node || !hW || hW.__bvSpacerPatched) return;

    hW.__bvSpacerPatched = true;
    hW.__bvNode = node;

    // NEW: cache scale widget
    hW.__bvScaleWidget = getWidget(node, "scale");

    hW.type = "BV_SPACER";
    hW.options = hW.options || {};
    hW.options.serialize = true;

    hW.draw = function () {
    };

    hW.computeSize = function (width) {
        const base = clamp(hW.value ?? 24, 0, 400);
        const scale = clamp(this.__bvScaleWidget?.value ?? 1.0, 0.0, 5.0);
        const h = Math.max(8, Math.round(base * scale));
        return [Math.max(220, width || 220), h];
    };

    // NEW: hookRedraw helper + hook both widgets
    const hookRedraw = (w) => {
        if (!w || w.__bvSpacerHooked) return;
        w.__bvSpacerHooked = true;

        const oldCb = w.callback;
        w.callback = function () {
            const n = hW.__bvNode || node;
            n?.setSize?.(n.computeSize());
            n?.setDirtyCanvas(true, true);
            n?.graph?.setDirtyCanvas(true, true);
            return oldCb?.apply(this, arguments);
        };
    };

    hookRedraw(hW);
    hookRedraw(hW.__bvScaleWidget);
}

function hideAllOutputs(node) {
    if (!node?.outputs?.length) return;
    node.outputs.length = 0;           // removes output slots visually
    node.setDirtyCanvas?.(true, true);
    node.graph?.setDirtyCanvas?.(true, true);
}


app.registerExtension({
    name: "bv_nodepack.bv_spacer",

    getCustomWidgets() {
        return {
            BV_SPACER: () => ({widget: null}),
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
            patchSpacer(this);
            hideAllOutputs(this);

            this.setSize?.(this.computeSize());
            return r;
        };
    },
});

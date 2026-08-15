import { app } from "../../scripts/app.js";

/**
 * Keeps aspect ratio widget names stable while presenting compact labels.
 */

const LABEL_MAP = {
  use_1_1:  "Resolution 1×1",
  use_3_2:  "Resolution 3×2",
  use_2_3:  "Resolution 2×3",
  use_4_3:  "Resolution 4×3",
  use_3_4:  "Resolution 3×4",
  use_16_9: "Resolution 16×9",
  use_9_16: "Resolution 9×16",
  use_21_9: "Resolution 21×9",
  use_9_21: "Resolution 9×21",
};

function relabelAspectRatioWidgets(node) {
  if (!node || !node.widgets) return;

  if (node.type !== "BV Latent Random Aspect Ratio" && node.type !== "BV Empty Latent Random Ratio") return;

  for (const w of node.widgets) {
    if (!w || !w.name) continue;
    const newLabel = LABEL_MAP[w.name];
    if (newLabel) w.label = newLabel;
  }

  node.setDirtyCanvas(true, true);
}

app.registerExtension({
  name: "bv_nodepack.relabel_aspect_ratio_toggles",

  async setup() {
    // Patch existing nodes (after reload)
    try {
      const graph = app?.graph;
      const nodes = graph?._nodes || graph?.nodes || [];
      for (const n of nodes) relabelAspectRatioWidgets(n);
    } catch (e) {
      // ignore
    }
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "BV Latent Random Aspect Ratio" && nodeData.name !== "BV Empty Latent Random Ratio") return;
    // Hook creation
    const origCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = origCreated?.apply(this, arguments);
      try { relabelAspectRatioWidgets(this); } catch (e) {}
      return r;
    };

    // Hook configure (workflow load + subgraph expose rebuilds)
    const origConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = origConfigure?.apply(this, arguments);
      try { relabelAspectRatioWidgets(this); } catch (e) {}
      return r;
    };
  },
});

import { app } from "../../scripts/app.js";
import { normalizeDynamicComboSelection, parseDynamicComboOptions } from "./bv_dynamic_combo_model.js";

const NODE_CLASS = "BV Dynamic Combo";

function valueWidgetFor(node) {
  const visible = node.widgets?.find((widget) => widget.name === "value");
  if (visible) return visible;
  const input = node.inputs?.find((candidate) => candidate.name === "value");
  return node.getWidgetFromSlot?.(input) ?? null;
}

function upgrade(node) {
  let valueWidget = valueWidgetFor(node);
  const optionsWidget = node.widgets?.find((widget) => widget.name === "options");
  if (!valueWidget || !optionsWidget) return;

  if (valueWidget.type !== "combo") {
    const previousValue = valueWidget.value;
    node.removeWidget?.(valueWidget);
    const combo = node.addWidget("combo", "value", previousValue, null, { values: parseDynamicComboOptions(optionsWidget.value) });
    valueWidget = combo;
  }
  const combo = valueWidget;
  combo.options ??= {};
  combo.options.values = parseDynamicComboOptions(optionsWidget.value);
  combo.value = normalizeDynamicComboSelection(combo.value, combo.options.values);
  combo.options.serialize = true;

  if (!optionsWidget.__bvDynamicComboHooked) {
    optionsWidget.__bvDynamicComboHooked = true;
    const originalCallback = optionsWidget.callback;
    optionsWidget.callback = function (value) {
      originalCallback?.apply(this, arguments);
      const current = valueWidgetFor(node);
      if (current) {
        const values = parseDynamicComboOptions(value);
        current.options ??= {};
        current.options.values = values;
        const normalized = normalizeDynamicComboSelection(current.value, values);
        if (normalized !== current.value) {
          current.value = normalized;
          current.callback?.(normalized);
        }
        window.dispatchEvent(new CustomEvent("bv-dynamic-combo-options-changed", {
          detail: { sourceNode: node, values },
        }));
      }
      node.setDirtyCanvas?.(true, true);
    };
  }
}

app.registerExtension({
  name: "bv_nodepack.dynamic_combo",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_CLASS) return;
    const originalCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const result = originalCreated?.apply(this, arguments);
      upgrade(this);
      return result;
    };
    const originalConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const result = originalConfigure?.apply(this, arguments);
      upgrade(this);
      return result;
    };
    const originalConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const result = originalConnectionsChange?.apply(this, arguments);
      upgrade(this);
      return result;
    };
  },
});

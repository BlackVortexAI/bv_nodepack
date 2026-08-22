import { createElement, type ComponentType } from "react";
import { createRoot } from "react-dom/client";
import DatasetPicker from "./DatasetPicker";
import { applyCompletionDatasetSetting } from "./settings";

/** Comfy settings adapter: the host node is imperative, its visible content is canonical React UI. */
export function renderCompletionDatasetSetting(_name: string, setter: (value: unknown) => void, value: unknown) {
    applyCompletionDatasetSetting(value);
    const host = document.createElement("div");
    host.className = "bv-ui bv-settings-datasets";
    const root = createRoot(host);
    const Picker = DatasetPicker as ComponentType<{ onSelectionChange?: (value: string[]) => void }>;
    root.render(createElement(Picker, { onSelectionChange: (next: string[]) => setter(JSON.stringify(next)) }));
    return host;
}

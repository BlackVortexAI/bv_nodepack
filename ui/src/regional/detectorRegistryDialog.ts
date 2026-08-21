import { DetectorModelCatalog, DetectorRegistryConfig, emptyDetectorRegistryConfig, parseDetectorRegistryConfig, serializeDetectorRegistryConfig } from "./detectorRegistryConfig";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => { const value = document.createElement(tag); if (text != null) value.textContent = text; return value; };
const btn = (label: string, action: () => void) => { const value = el("button", label); value.type = "button"; value.onclick = action; return value; };

export const openDetectorRegistryDialog = async (api: any, stored: unknown, save: (value: string) => void) => {
    const response = await fetch(api.apiURL("/bv_nodepack/detectors/models"));
    if (!response.ok) throw new Error(`Detector model catalog failed: ${response.status}`);
    const catalog = await response.json() as DetectorModelCatalog;
    let config: DetectorRegistryConfig = parseDetectorRegistryConfig(stored);
    const dialog = el("dialog");
    dialog.className = "bv-detailer-dialog";
    const list = el("div");
    Object.assign(list.style, { display: "grid", gap: "10px", maxHeight: "64vh", overflowY: "auto" });
    const field = (caption: string, control: HTMLElement) => { const label = el("label", caption); label.style.display = "grid"; label.append(control); return label; };
    const render = () => {
        list.replaceChildren();
        config.detectors.forEach((entry, index) => {
            const card = el("section");
            card.className = "bv-detailer-card bv-detailer-control-grid";
            const id = el("input"); id.value = entry.id; id.placeholder = "e.g. eyes"; id.oninput = () => entry.id = id.value.trim();
            const provider = el("select"); for (const value of ["ultralytics", "onnx"]) { const option = el("option", value === "onnx" ? "ONNX" : "Ultralytics"); option.value = value; option.selected = entry.provider === value; provider.append(option); }
            provider.onchange = () => { entry.provider = provider.value as any; entry.model_name = catalog[entry.provider][0] ?? ""; render(); };
            const model = el("select"); for (const value of catalog[entry.provider]) { const option = el("option", value); option.value = value; option.selected = entry.model_name === value; model.append(option); } model.onchange = () => entry.model_name = model.value;
            const sam = el("select"); { const none = el("option", "No SAM refinement"); none.value = ""; sam.append(none); } for (const value of catalog.sam) { const option = el("option", value); option.value = value; option.selected = entry.sam_model_name === value; sam.append(option); } sam.onchange = () => entry.sam_model_name = sam.value || undefined;
            const mode = el("select"); for (const value of ["AUTO", "Prefer GPU", "CPU"]) { const option = el("option", value); option.value = value; option.selected = (entry.sam_device_mode ?? "AUTO") === value; mode.append(option); } mode.onchange = () => entry.sam_device_mode = mode.value as any;
            card.append(field("Detector ID", id), field("Provider", provider), field("Model", model), field("SAM model (optional)", sam), field("SAM device", mode), btn("Remove", () => { config.detectors.splice(index, 1); render(); }));
            list.append(card);
        });
        if (!config.detectors.length) list.append(el("p", "No detectors configured yet."));
    };
    const footer = el("div"); Object.assign(footer.style, { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "14px" });
    footer.append(btn("Clear", () => { config = emptyDetectorRegistryConfig(); render(); }), btn("Add detector", () => {
        const provider = catalog.ultralytics.length ? "ultralytics" : "onnx";
        const model = catalog[provider][0] ?? "";
        config.detectors.push({ id: `detector-${config.detectors.length + 1}`, provider, model_name: model }); render();
    }), btn("Cancel", () => dialog.close()), btn("Save registry", () => {
        const ids = config.detectors.map(entry => entry.id.trim());
        if (ids.some(id => !id) || new Set(ids).size !== ids.length || config.detectors.some(entry => !entry.model_name)) return;
        save(serializeDetectorRegistryConfig(config)); dialog.close();
    }));
    dialog.addEventListener("close", () => dialog.remove());
    dialog.append(el("h2", "Detector Registry"), el("p", "Models are loaded internally through the installed Impact providers. External provider nodes are not required."), list, footer);
    document.body.append(dialog); render(); dialog.showModal();
};

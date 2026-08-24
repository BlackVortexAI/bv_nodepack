export type DetectorModelCatalog = { ultralytics: string[]; onnx: string[]; sam: string[] };
export type DetectorRegistryEntry = {
    id: string;
    provider: "ultralytics" | "onnx";
    model_name: string;
    sam_model_name?: string;
    sam_device_mode?: "AUTO" | "Prefer GPU" | "CPU";
};
export type DetectorRegistryConfig = { schema: "bv.detector_registry_config"; version: 2; collector_id: string; detectors: DetectorRegistryEntry[] };

export const emptyDetectorRegistryConfig = (): DetectorRegistryConfig => ({ schema: "bv.detector_registry_config", version: 2, collector_id: crypto.randomUUID(), detectors: [] });
export const parseDetectorRegistryConfig = (value: unknown): DetectorRegistryConfig => {
    try {
        const parsed = String(value ?? "").trim() ? JSON.parse(String(value)) : emptyDetectorRegistryConfig();
        const collector_id = String(parsed?.collector_id ?? "").trim() || crypto.randomUUID();
        const detectors = Array.isArray(parsed?.detectors) ? parsed.detectors.flatMap((entry: any) => {
            const id = String(entry?.id ?? "").trim(), model = String(entry?.model_name ?? "").trim();
            if (!id || !model) return [];
            const provider = entry.provider === "onnx" ? "onnx" : "ultralytics";
            const sam = String(entry.sam_model_name ?? "").trim();
            return [{ id, provider, model_name: model, ...(sam ? { sam_model_name: sam, sam_device_mode: ["Prefer GPU", "CPU"].includes(entry.sam_device_mode) ? entry.sam_device_mode : "AUTO" } : {}) } as DetectorRegistryEntry];
        }) : [];
        return { schema: "bv.detector_registry_config", version: 2, collector_id, detectors };
    } catch { return emptyDetectorRegistryConfig(); }
};
export const serializeDetectorRegistryConfig = (config: DetectorRegistryConfig) => JSON.stringify(config);

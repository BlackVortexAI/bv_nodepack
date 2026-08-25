export type PromptPair = { positive_source: string; negative_source: string };
export type Point = { x: number; y: number; pressure: number };
export type Geometry =
    | { id: string; layer_id?: string; mask_group_id?: string; type: "rect"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; x: number; y: number; width: number; height: number }
    | { id: string; layer_id?: string; mask_group_id?: string; type: "ellipse"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; x: number; y: number; width: number; height: number }
    | { id: string; layer_id?: string; mask_group_id?: string; type: "polygon"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; points: Point[] }
    | { id: string; layer_id?: string; mask_group_id?: string; type: "brush_stroke"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; shape?: "round" | "square"; pressure_mode?: "constant" | "stylus"; size: number; hardness: number; opacity: number; points: Point[] }
    | { id: string; layer_id?: string; mask_group_id?: string; type: "raster_mask"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; x: number; y: number; width: number; height: number; pixel_width: number; pixel_height: number; data_url: string };
export type GeometryAuthoring = { name: string; visible: boolean; locked: boolean };
export type GeometryLayer = { id: string; geometries: Geometry[]; authoring: GeometryAuthoring; enabled: boolean };
export type RegionUsage = "generation" | "detailer" | "both";
export type Region = {
    id: string; name: string; parent_region_id: string | null; enabled: boolean; usage: RegionUsage; strength: number; priority: number;
    prompts: PromptPair; mask: { feather: number }; geometry: Geometry[];
    authoring: { visible: boolean; locked: boolean; color: string };
};
export type RegionalDocument = {
    schema: "bv.regional"; version: 2; document_id: string; title: string;
    canvas: { width: number; height: number };
    prompts: { global: PromptPair; background: PromptPair };
    negative_mode: "auto" | "prompt" | "zero_out";
    overlap: { mode: "joint" | "normalized" | "priority" | "exclusive" };
    regions: Region[];
};

export const COLORS = ["#E45756", "#4C78A8", "#54A24B", "#F2CF5B", "#B279A2", "#FF9DA6"];
export const automaticRegionColor = (index: number) => COLORS[index % COLORS.length];
export const uuid = () => crypto.randomUUID();
export const emptyDocument = (): RegionalDocument => ({
    schema: "bv.regional", version: 2, document_id: uuid(), title: "Regional Prompt",
    canvas: { width: 1024, height: 1024 },
    prompts: { global: { positive_source: "", negative_source: "" }, background: { positive_source: "", negative_source: "" } },
    negative_mode: "auto", overlap: { mode: "joint" }, regions: [],
});
export const newRegion = (index: number): Region => ({
    id: uuid(), name: `Region ${index + 1}`, parent_region_id: null, enabled: true, usage: "generation", strength: 1, priority: index,
    prompts: { positive_source: "", negative_source: "" }, mask: { feather: 0.01 }, geometry: [],
    authoring: { visible: true, locked: false, color: automaticRegionColor(index) },
});
export const clone = <T,>(value: T): T => structuredClone(value);
export function preserveDocumentIdentity<T extends { document_id: string }>(imported: T, documentId: string): T {
    return { ...imported, document_id: documentId };
}
export const geometryAuthoring = (geometry: Geometry, index = 0): GeometryAuthoring => geometry.authoring ?? { name: `${geometry.type === "rect" ? "Rectangle" : geometry.type === "ellipse" ? "Ellipse" : geometry.type === "polygon" ? "Polygon" : geometry.type === "raster_mask" ? "Raster" : "Brush"} ${index + 1}`, visible: true, locked: false };
export const geometryLayerId = (geometry: Geometry) => geometry.layer_id ?? geometry.id;
export const geometryMaskGroupId = (geometry: Geometry) => geometry.mask_group_id ?? geometryLayerId(geometry);
export function geometryGroups(geometries: Geometry[], idFor: (geometry: Geometry) => string): GeometryLayer[] {
    const groups = new Map<string, Geometry[]>();
    for (const geometry of geometries) {
        const id = idFor(geometry), existing = groups.get(id);
        if (existing) existing.push(geometry); else groups.set(id, [geometry]);
    }
    return [...groups].map(([id, items], index) => ({ id, geometries: items, authoring: geometryAuthoring(items[0], index), enabled: items.some(geometry => geometry.enabled !== false) }));
}
export function geometryLayers(region: Region): GeometryLayer[] {
    return geometryGroups(region.geometry, geometryLayerId);
}
export function geometryMaskGroups(geometries: Geometry[]): GeometryLayer[] {
    return geometryGroups(geometries, geometryMaskGroupId);
}
export function parseDocument(value: unknown): RegionalDocument {
    const document = typeof value === "string" ? JSON.parse(value) : clone(value);
    if (document?.schema !== "bv.regional" || ![1, 2].includes(document?.version) || !Array.isArray(document?.regions)) throw new Error("Not a valid BV_REGIONAL document");
    // BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Workflow document v1 -> v2.
    // Remove v1 acceptance after saved workflows have passed the migration window.
    if (document.version === 1) {
        for (const region of document.regions as Region[]) region.usage = "generation";
        document.version = 2;
    }
    for (const region of document.regions as Region[]) {
        if (!["generation", "detailer", "both"].includes(region.usage)) throw new Error(`Invalid region usage: ${region.usage}`);
        // BV-LEGACY(marked=2026-08-25, remove-after=2026-10-25): Pre-layer geometry repair.
        const legacyLayerId = region.geometry.find(geometry => !geometry.layer_id)?.id;
        region.geometry.forEach((geometry, index) => {
            geometry.enabled ??= true;
            geometry.layer_id ??= legacyLayerId ?? geometry.id;
            geometry.authoring ??= geometryAuthoring(geometry, index);
            if (geometry.type === "brush_stroke") { geometry.shape ??= "round"; geometry.pressure_mode ??= "constant"; }
        });
    }
    return document as RegionalDocument;
}

export type PromptPair = { positive_source: string; negative_source: string };
export type Point = { x: number; y: number; pressure: number };
export type Geometry =
    | { id: string; layer_id?: string; type: "rect"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; x: number; y: number; width: number; height: number }
    | { id: string; layer_id?: string; type: "brush_stroke"; operation: "add" | "subtract"; enabled?: boolean; authoring?: GeometryAuthoring; shape?: "round" | "square"; pressure_mode?: "constant" | "stylus"; size: number; hardness: number; opacity: number; points: Point[] };
export type GeometryAuthoring = { name: string; visible: boolean; locked: boolean };
export type GeometryLayer = { id: string; geometries: Geometry[]; authoring: GeometryAuthoring; enabled: boolean };
export type Region = {
    id: string; name: string; parent_region_id: string | null; enabled: boolean; strength: number; priority: number;
    prompts: PromptPair; mask: { feather: number }; geometry: Geometry[];
    authoring: { visible: boolean; locked: boolean; color: string };
};
export type RegionalDocument = {
    schema: "bv.regional"; version: 1; document_id: string; title: string;
    canvas: { width: number; height: number };
    prompts: { global: PromptPair; background: PromptPair };
    negative_mode: "auto" | "prompt" | "zero_out";
    overlap: { mode: "joint" | "normalized" | "priority" | "exclusive" };
    regions: Region[];
};

export const COLORS = ["#E45756", "#4C78A8", "#54A24B", "#F2CF5B", "#B279A2", "#FF9DA6"];
export const uuid = () => crypto.randomUUID();
export const emptyDocument = (): RegionalDocument => ({
    schema: "bv.regional", version: 1, document_id: uuid(), title: "Regional Prompt",
    canvas: { width: 1024, height: 1024 },
    prompts: { global: { positive_source: "", negative_source: "" }, background: { positive_source: "", negative_source: "" } },
    negative_mode: "auto", overlap: { mode: "joint" }, regions: [],
});
export const newRegion = (index: number): Region => ({
    id: uuid(), name: `Region ${index + 1}`, parent_region_id: null, enabled: true, strength: 1, priority: index,
    prompts: { positive_source: "", negative_source: "" }, mask: { feather: 0.01 }, geometry: [],
    authoring: { visible: true, locked: false, color: COLORS[index % COLORS.length] },
});
export const clone = <T,>(value: T): T => structuredClone(value);
export const geometryAuthoring = (geometry: Geometry, index = 0): GeometryAuthoring => geometry.authoring ?? { name: `${geometry.type === "rect" ? "Rectangle" : "Brush"} ${index + 1}`, visible: true, locked: false };
export const geometryLayerId = (geometry: Geometry) => geometry.layer_id ?? geometry.id;
export function geometryLayers(region: Region): GeometryLayer[] {
    const layers = new Map<string, Geometry[]>();
    for (const geometry of region.geometry) {
        const id = geometryLayerId(geometry), existing = layers.get(id);
        if (existing) existing.push(geometry); else layers.set(id, [geometry]);
    }
    return [...layers].map(([id, geometries], index) => ({ id, geometries, authoring: geometryAuthoring(geometries[0], index), enabled: geometries.some(geometry => geometry.enabled !== false) }));
}
export function parseDocument(value: unknown): RegionalDocument {
    const document = typeof value === "string" ? JSON.parse(value) : clone(value);
    if (document?.schema !== "bv.regional" || document?.version !== 1 || !Array.isArray(document?.regions)) throw new Error("Not a valid BV_REGIONAL v1 document");
    for (const region of document.regions as Region[]) {
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

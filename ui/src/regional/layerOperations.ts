type GeometryLike = {
    id: string;
    layer_id?: string;
    mask_group_id?: string;
    authoring?: { name: string; visible: boolean; locked: boolean };
};
type RegionLike<T extends GeometryLike = GeometryLike> = { geometry: T[] };

const layerId = (geometry: GeometryLike) => geometry.layer_id ?? geometry.id;
const authoring = (geometry: GeometryLike) => geometry.authoring ?? { name: "Layer", visible: true, locked: false };

export type LayerSelectionModifier = "replace" | "toggle" | "range";
export type LayerSelection = { ids: string[]; primary: string | null; anchor: string | null };

export function selectLayers(current: LayerSelection, id: string, visibleOrder: string[], modifier: LayerSelectionModifier): LayerSelection {
    if (modifier === "replace") return { ids: [id], primary: id, anchor: id };
    if (modifier === "toggle") {
        const ids = current.ids.includes(id) ? current.ids.filter(item => item !== id) : [...current.ids, id];
        return { ids, primary: ids.includes(id) ? id : ids[ids.length - 1] ?? null, anchor: id };
    }
    const anchor = current.anchor && visibleOrder.includes(current.anchor) ? current.anchor : current.primary;
    if (!anchor) return { ids: [id], primary: id, anchor: id };
    const start = visibleOrder.indexOf(anchor), end = visibleOrder.indexOf(id);
    if (start < 0 || end < 0) return { ids: [id], primary: id, anchor: id };
    return { ids: visibleOrder.slice(Math.min(start, end), Math.max(start, end) + 1), primary: id, anchor };
}

export function mergeSelectedLayers<T extends GeometryLike>(region: RegionLike<T>, selectedIds: string[], targetId: string): boolean {
    const selected = new Set(selectedIds);
    if (selected.size < 2 || !selected.has(targetId)) return false;
    const target = region.geometry.find(item => layerId(item) === targetId);
    if (!target) return false;
    const targetAuthoring = authoring(target);
    let changed = false;
    region.geometry.forEach(geometry => {
        const originalLayerId = layerId(geometry);
        if (!selected.has(originalLayerId)) return;
        geometry.mask_group_id ??= originalLayerId;
        geometry.layer_id = targetId;
        geometry.authoring = { ...targetAuthoring };
        changed ||= originalLayerId !== targetId;
    });
    return changed;
}

export function splitCompoundLayer<T extends GeometryLike>(region: RegionLike<T>, compoundLayerId: string, makeId: () => string): string[] {
    const operations = region.geometry.filter(geometry => layerId(geometry) === compoundLayerId);
    const groups = new Map<string, T[]>();
    operations.forEach(geometry => {
        const groupId = geometry.mask_group_id ?? layerId(geometry), existing = groups.get(groupId);
        if (existing) existing.push(geometry); else groups.set(groupId, [geometry]);
    });
    if (groups.size < 2) return [];
    const baseName = authoring(operations[0]).name;
    const layerIds: string[] = [];
    [...groups.values()].forEach((geometries, index) => {
        const nextLayerId = makeId(), nextAuthoring = { ...authoring(geometries[0]), name: `${baseName} ${index + 1}` };
        layerIds.push(nextLayerId);
        geometries.forEach(geometry => {
            geometry.layer_id = nextLayerId;
            delete geometry.mask_group_id;
            geometry.authoring = { ...nextAuthoring };
        });
    });
    return layerIds;
}

export function remapMaskGroups<T extends GeometryLike>(geometries: T[], makeId: () => string) {
    const ids = new Map<string, string>();
    geometries.forEach(geometry => {
        if (!geometry.mask_group_id) return;
        if (!ids.has(geometry.mask_group_id)) ids.set(geometry.mask_group_id, makeId());
        geometry.mask_group_id = ids.get(geometry.mask_group_id)!;
    });
}

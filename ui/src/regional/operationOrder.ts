import { geometryMaskGroupId, type Geometry } from "./model";

/** Every independently composed mask group must start from positive geometry. */
export function hasAdditiveOperationBases(geometries: Geometry[]): boolean {
    const firstByGroup = new Map<string, Geometry>();
    for (const geometry of geometries) {
        const groupId = geometryMaskGroupId(geometry);
        if (!firstByGroup.has(groupId)) firstByGroup.set(groupId, geometry);
    }
    return [...firstByGroup.values()].every(geometry => geometry.operation === "add");
}

export function canRemoveGeometry(geometries: Geometry[], geometryId: string): boolean {
    return hasAdditiveOperationBases(geometries.filter(geometry => geometry.id !== geometryId));
}

import { geometryAuthoring, geometryLayerId, geometryLayers, type Geometry, type RegionalDocument, type Region } from "./model";
import { hasAdditiveOperationBases } from "./operationOrder";

export type TreeItemRef =
    | { kind: "region"; regionId: string }
    | { kind: "layer"; regionId: string; layerId: string }
    | { kind: "geometry"; regionId: string; layerId: string; geometryId: string };
export type TreeDropPosition = "before" | "inside" | "after";
export type TreeMove = { source: TreeItemRef; target: TreeItemRef; position: TreeDropPosition };

const regionFor = (document: RegionalDocument, id: string) => document.regions.find(region => region.id === id) ?? null;
const layerFor = (region: Region | null, id: string) => region ? geometryLayers(region).find(layer => layer.id === id) ?? null : null;
const targetLayerId = (target: TreeItemRef) => target.kind === "layer" ? target.layerId : target.kind === "geometry" ? target.layerId : null;

function canMove(document: RegionalDocument, move: TreeMove) {
    const sourceRegion = regionFor(document, move.source.regionId), targetRegion = regionFor(document, move.target.regionId);
    if (!sourceRegion || !targetRegion || sourceRegion.authoring.locked || targetRegion.authoring.locked) return false;
    if (move.source.kind !== "region" && layerFor(sourceRegion, move.source.layerId)?.authoring.locked) return false;
    const destinationLayerId = targetLayerId(move.target);
    if (destinationLayerId && layerFor(targetRegion, destinationLayerId)?.authoring.locked) return false;
    return true;
}

function insertLayer(region: Region, geometries: Geometry[], targetLayer: string | null, position: TreeDropPosition) {
    if (!targetLayer || position === "inside") { region.geometry.push(...geometries); return; }
    const indexes = region.geometry.map((geometry, index) => geometryLayerId(geometry) === targetLayer ? index : -1).filter(index => index >= 0);
    if (!indexes.length) { region.geometry.push(...geometries); return; }
    // Layer rows are displayed in reverse model order.
    const index = position === "before" ? indexes[indexes.length - 1] + 1 : indexes[0];
    region.geometry.splice(index, 0, ...geometries);
}

export function applyTreeMove(document: RegionalDocument, move: TreeMove, makeId: () => string): boolean {
    if (!canMove(document, move)) return false;
    const previousRegions = structuredClone(document.regions);
    const finish = () => {
        if (document.regions.every(region => hasAdditiveOperationBases(region.geometry))) return true;
        document.regions = previousRegions;
        return false;
    };
    if (move.source.kind === "region") {
        if (move.target.kind !== "region" || move.position === "inside" || move.source.regionId === move.target.regionId) return false;
        const sourceIndex = document.regions.findIndex(region => region.id === move.source.regionId);
        const [source] = document.regions.splice(sourceIndex, 1);
        const targetIndex = document.regions.findIndex(region => region.id === move.target.regionId);
        document.regions.splice(move.position === "before" ? targetIndex : targetIndex + 1, 0, source);
        document.regions.forEach((region, index) => { region.priority = index; });
        return finish();
    }

    const sourceRegion = regionFor(document, move.source.regionId)!;
    const destinationRegion = regionFor(document, move.target.regionId)!;
    if (move.source.kind === "layer") {
        const source = move.source;
        if (move.target.kind === "geometry" || source.layerId === targetLayerId(move.target)) return false;
        const geometries = sourceRegion.geometry.filter(geometry => geometryLayerId(geometry) === source.layerId);
        if (!geometries.length) return false;
        sourceRegion.geometry = sourceRegion.geometry.filter(geometry => geometryLayerId(geometry) !== source.layerId);
        insertLayer(destinationRegion, geometries, targetLayerId(move.target), move.position);
        return finish();
    }

    const source = move.source;
    const sourceIndex = sourceRegion.geometry.findIndex(geometry => geometry.id === source.geometryId);
    if (sourceIndex < 0 || move.target.kind === "region" && move.position !== "inside") return false;
    const [geometry] = sourceRegion.geometry.splice(sourceIndex, 1);
    if (move.target.kind === "region") {
        geometry.layer_id = makeId(); delete geometry.mask_group_id;
        geometry.authoring = { ...geometryAuthoring(geometry) };
        destinationRegion.geometry.push(geometry); return finish();
    }
    const destinationLayerId = move.target.layerId;
    if (destinationLayerId !== source.layerId || destinationRegion !== sourceRegion) {
        geometry.mask_group_id ??= source.layerId;
        geometry.layer_id = destinationLayerId;
        geometry.authoring = { ...layerFor(destinationRegion, destinationLayerId)!.authoring };
    }
    if (move.target.kind === "layer" || move.position === "inside") {
        const indexes = destinationRegion.geometry.map((item, index) => geometryLayerId(item) === destinationLayerId ? index : -1).filter(index => index >= 0);
        destinationRegion.geometry.splice(indexes.length ? indexes[indexes.length - 1] + 1 : destinationRegion.geometry.length, 0, geometry);
    } else {
        const target = move.target;
        const targetIndex = destinationRegion.geometry.findIndex(item => item.id === target.geometryId);
        destinationRegion.geometry.splice(move.position === "before" ? targetIndex : targetIndex + 1, 0, geometry);
    }
    return finish();
}

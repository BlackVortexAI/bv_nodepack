import { clone, Geometry, Point } from "./model";

export type Bounds = { x: number; y: number; width: number; height: number };
export type CanvasSize = { width: number; height: number };
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export function boundsOf(geometry: Geometry, canvas: CanvasSize = { width: 1, height: 1 }): Bounds {
    if (geometry.type === "rect" || geometry.type === "raster_mask") return { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    const xs = geometry.points.map(point => point.x), ys = geometry.points.map(point => point.y);
    const short = Math.min(canvas.width, canvas.height), radiusX = geometry.size * short / canvas.width / 2, radiusY = geometry.size * short / canvas.height / 2;
    const x = clamp(Math.min(...xs) - radiusX), y = clamp(Math.min(...ys) - radiusY);
    const right = clamp(Math.max(...xs) + radiusX), bottom = clamp(Math.max(...ys) + radiusY);
    return { x, y, width: right - x, height: bottom - y };
}

function distanceToSegment(point: Point, start: Point, end: Point) {
    const dx = end.x - start.x, dy = end.y - start.y;
    if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y);
    const ratio = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy));
    return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy));
}

export function hitTest(geometry: Geometry, point: Point, canvas: CanvasSize = { width: 1, height: 1 }) {
    if (geometry.type === "rect" || geometry.type === "raster_mask") return point.x >= geometry.x && point.x <= geometry.x + geometry.width && point.y >= geometry.y && point.y <= geometry.y + geometry.height;
    const scaled = (value: Point): Point => ({ ...value, x: value.x * canvas.width, y: value.y * canvas.height });
    const radius = geometry.size * Math.min(canvas.width, canvas.height) / 2, target = scaled(point);
    if (geometry.points.length === 1) return Math.hypot(target.x - geometry.points[0].x * canvas.width, target.y - geometry.points[0].y * canvas.height) <= radius;
    return geometry.points.slice(1).some((end, index) => distanceToSegment(target, scaled(geometry.points[index]), scaled(end)) <= radius);
}

export function moveGeometry(source: Geometry, dx: number, dy: number, canvas?: CanvasSize): Geometry {
    const geometry = clone(source), bounds = boundsOf(source, canvas);
    dx = clamp(dx, -bounds.x, 1 - bounds.x - bounds.width);
    dy = clamp(dy, -bounds.y, 1 - bounds.y - bounds.height);
    if (geometry.type === "rect" || geometry.type === "raster_mask") { geometry.x += dx; geometry.y += dy; }
    else geometry.points = geometry.points.map(point => ({ ...point, x: clamp(point.x + dx), y: clamp(point.y + dy) }));
    return geometry;
}

export function resizeGeometry(source: Geometry, handle: Handle, dx: number, dy: number, proportional = false, canvas?: CanvasSize): Geometry {
    const original = boundsOf(source, canvas); let left = original.x, top = original.y, right = left + original.width, bottom = top + original.height;
    if (handle.includes("w")) left = clamp(left + dx, 0, right - .002);
    if (handle.includes("e")) right = clamp(right + dx, left + .002, 1);
    if (handle.includes("n")) top = clamp(top + dy, 0, bottom - .002);
    if (handle.includes("s")) bottom = clamp(bottom + dy, top + .002, 1);
    if (proportional && handle.length === 2) {
        const ratio = original.width / Math.max(original.height, .0001), width = right - left, height = bottom - top;
        if (width / height > ratio) { const target = width / ratio; handle.includes("n") ? top = clamp(bottom - target) : bottom = clamp(top + target); }
        else { const target = height * ratio; handle.includes("w") ? left = clamp(right - target) : right = clamp(left + target); }
    }
    return setBounds(source, { x: left, y: top, width: right - left, height: bottom - top }, canvas);
}

export function setBounds(source: Geometry, target: Bounds, canvas?: CanvasSize): Geometry {
    target = { x: clamp(target.x, 0, .998), y: clamp(target.y, 0, .998), width: target.width, height: target.height };
    target.width = clamp(target.width, .002, 1 - target.x);
    target.height = clamp(target.height, .002, 1 - target.y);
    const geometry = clone(source), original = boundsOf(source, canvas);
    const sx = target.width / Math.max(original.width, .000001), sy = target.height / Math.max(original.height, .000001);
    if (geometry.type === "rect" || geometry.type === "raster_mask") return { ...geometry, ...target };
    geometry.points = geometry.points.map(point => ({ ...point, x: clamp(target.x + (point.x - original.x) * sx), y: clamp(target.y + (point.y - original.y) * sy) }));
    geometry.size = clamp(geometry.size * Math.sqrt(sx * sy), .001, 1);
    return geometry;
}

export function boundsOfLayer(geometries: Geometry[], canvas?: CanvasSize): Bounds {
    const bounds = geometries.map(geometry => boundsOf(geometry, canvas));
    const x = Math.min(...bounds.map(item => item.x)), y = Math.min(...bounds.map(item => item.y));
    const right = Math.max(...bounds.map(item => item.x + item.width)), bottom = Math.max(...bounds.map(item => item.y + item.height));
    return { x, y, width: right - x, height: bottom - y };
}

export function moveLayer(geometries: Geometry[], dx: number, dy: number, canvas?: CanvasSize): Geometry[] {
    const bounds = boundsOfLayer(geometries, canvas);
    dx = clamp(dx, -bounds.x, 1 - bounds.x - bounds.width);
    dy = clamp(dy, -bounds.y, 1 - bounds.y - bounds.height);
    return geometries.map(geometry => {
        const result = clone(geometry);
        if (result.type === "rect" || result.type === "raster_mask") { result.x += dx; result.y += dy; }
        else result.points = result.points.map(point => ({ ...point, x: point.x + dx, y: point.y + dy }));
        return result;
    });
}

export function setLayerBounds(geometries: Geometry[], target: Bounds, canvas?: CanvasSize): Geometry[] {
    const original = boundsOfLayer(geometries, canvas);
    target = { x: clamp(target.x, 0, .998), y: clamp(target.y, 0, .998), width: clamp(target.width, .002, 1), height: clamp(target.height, .002, 1) };
    target.width = Math.min(target.width, 1 - target.x); target.height = Math.min(target.height, 1 - target.y);
    const sx = target.width / Math.max(original.width, .000001), sy = target.height / Math.max(original.height, .000001);
    return geometries.map(source => {
        const geometry = clone(source);
        if (geometry.type === "rect" || geometry.type === "raster_mask") {
            geometry.x = target.x + (geometry.x - original.x) * sx; geometry.y = target.y + (geometry.y - original.y) * sy;
            geometry.width *= sx; geometry.height *= sy;
        } else {
            geometry.points = geometry.points.map(point => ({ ...point, x: target.x + (point.x - original.x) * sx, y: target.y + (point.y - original.y) * sy }));
            geometry.size = clamp(geometry.size * Math.sqrt(sx * sy), .001, 1);
        }
        return geometry;
    });
}

export function resizeLayer(geometries: Geometry[], handle: Handle, dx: number, dy: number, proportional = false, canvas?: CanvasSize): Geometry[] {
    const original = boundsOfLayer(geometries, canvas); let left = original.x, top = original.y, right = left + original.width, bottom = top + original.height;
    if (handle.includes("w")) left = clamp(left + dx, 0, right - .002);
    if (handle.includes("e")) right = clamp(right + dx, left + .002, 1);
    if (handle.includes("n")) top = clamp(top + dy, 0, bottom - .002);
    if (handle.includes("s")) bottom = clamp(bottom + dy, top + .002, 1);
    if (proportional && handle.length === 2) {
        const ratio = original.width / Math.max(original.height, .0001), width = right - left, height = bottom - top;
        if (width / height > ratio) { const target = width / ratio; handle.includes("n") ? top = clamp(bottom - target) : bottom = clamp(top + target); }
        else { const target = height * ratio; handle.includes("w") ? left = clamp(right - target) : right = clamp(left + target); }
    }
    return setLayerBounds(geometries, { x: left, y: top, width: right - left, height: bottom - top }, canvas);
}

function perpendicularDistance(point: Point, start: Point, end: Point) { return distanceToSegment(point, start, end); }
export function simplifyPoints(points: Point[], tolerance = .0015): Point[] {
    if (points.length <= 2) return points;
    const spaced = [points[0]];
    for (const point of points.slice(1, -1)) if (Math.hypot(point.x - spaced[spaced.length - 1].x, point.y - spaced[spaced.length - 1].y) >= tolerance) spaced.push(point);
    spaced.push(points[points.length - 1]);
    const rdp = (items: Point[]): Point[] => {
        if (items.length <= 2) return items;
        let max = 0, index = 0;
        for (let i = 1; i < items.length - 1; i++) { const distance = perpendicularDistance(items[i], items[0], items[items.length - 1]); if (distance > max) { max = distance; index = i; } }
        if (max <= tolerance) return [items[0], items[items.length - 1]];
        return [...rdp(items.slice(0, index + 1)).slice(0, -1), ...rdp(items.slice(index))];
    };
    return rdp(spaced);
}

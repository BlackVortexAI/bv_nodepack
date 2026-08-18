import { Geometry, GeometryAuthoring, geometryMaskGroupId } from "./model";
import { connectedAreas } from "./connectedComponents";

const canvas = (width: number, height: number) => { const value = document.createElement("canvas"); value.width = width; value.height = height; return value; };
const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error("Raster layer image could not be decoded")); image.src = src; });

async function drawOperation(context: CanvasRenderingContext2D, geometry: Geometry, width: number, height: number) {
    context.save(); context.globalCompositeOperation = geometry.operation === "subtract" ? "destination-out" : "source-over"; context.fillStyle = "white"; context.strokeStyle = "white";
    if (geometry.type === "rect") context.fillRect(geometry.x * width, geometry.y * height, geometry.width * width, geometry.height * height);
    else if (geometry.type === "ellipse") { context.beginPath(); context.ellipse((geometry.x + geometry.width / 2) * width, (geometry.y + geometry.height / 2) * height, geometry.width * width / 2, geometry.height * height / 2, 0, 0, Math.PI * 2); context.fill(); }
    else if (geometry.type === "polygon") { context.beginPath(); geometry.points.forEach((point, index) => index ? context.lineTo(point.x * width, point.y * height) : context.moveTo(point.x * width, point.y * height)); context.closePath(); context.fill(); }
    else if (geometry.type === "raster_mask") context.drawImage(await loadImage(geometry.data_url), geometry.x * width, geometry.y * height, geometry.width * width, geometry.height * height);
    else {
        const short = Math.min(width, height), points = geometry.points, nominalSize = geometry.size * short;
        const cap: CanvasLineCap = geometry.shape === "square" ? "square" : "round";
        const drawDot = (point: typeof points[number], scale: number, blur = 0) => {
            const size = nominalSize * point.pressure * scale;
            context.filter = blur > 0 ? `blur(${blur}px)` : "none";
            context.beginPath();
            if (geometry.shape === "square") context.rect(point.x * width - size / 2, point.y * height - size / 2, size, size);
            else context.arc(point.x * width, point.y * height, size / 2, 0, Math.PI * 2);
            context.fill();
        };
        const drawStroke = (scale: number, blur = 0) => {
            context.filter = blur > 0 ? `blur(${blur}px)` : "none";
            context.lineCap = cap; context.lineJoin = cap === "round" ? "round" : "miter";
            for (let index = 1; index < points.length; index++) {
                const start = points[index - 1], end = points[index], pressure = (geometry.pressure_mode ?? "constant") === "constant" ? 1 : (start.pressure + end.pressure) / 2;
                context.lineWidth = nominalSize * pressure * scale;
                context.beginPath(); context.moveTo(start.x * width, start.y * height); context.lineTo(end.x * width, end.y * height); context.stroke();
            }
        };
        context.globalAlpha = geometry.opacity;
        const softness = (1 - geometry.hardness) * nominalSize / 6;
        if (points.length === 1) {
            drawDot(points[0], 1, softness);
            if (geometry.hardness > 0) drawDot(points[0], geometry.hardness);
        } else {
            drawStroke(1, softness);
            if (geometry.hardness > 0) drawStroke(geometry.hardness);
        }
    }
    context.restore();
}

async function renderLayer(geometries: Geometry[], width: number, height: number): Promise<HTMLCanvasElement> {
    const result = canvas(width, height), output = result.getContext("2d", { willReadFrequently: true })!;
    const groups = new Map<string, Geometry[]>();
    geometries.filter(item => item.enabled !== false).forEach(item => { const id = geometryMaskGroupId(item), group = groups.get(id); group ? group.push(item) : groups.set(id, [item]); });
    for (const operations of groups.values()) { const groupCanvas = canvas(width, height), context = groupCanvas.getContext("2d")!; for (const operation of operations) await drawOperation(context, operation, width, height); output.drawImage(groupCanvas, 0, 0); }
    return result;
}

export async function splitDisconnectedLayer(geometries: Geometry[], size: { width: number; height: number }, makeId: () => string): Promise<Geometry[]> {
    const rendered = await renderLayer(geometries, size.width, size.height), context = rendered.getContext("2d", { willReadFrequently: true })!;
    const pixels = context.getImageData(0, 0, size.width, size.height), alpha = new Uint8ClampedArray(size.width * size.height);
    for (let index = 0; index < alpha.length; index++) alpha[index] = pixels.data[index * 4 + 3];
    const { labels, areas } = connectedAreas(alpha, size.width, size.height);
    const visibleAreas = areas.filter(area => area.pixels > 1);
    if (visibleAreas.length < 2) return [];
    const base: GeometryAuthoring = { ...(geometries[0].authoring ?? { name: "Layer", visible: true, locked: false }) };
    return visibleAreas.map((area, areaIndex) => {
        const crop = canvas(area.width, area.height), cropContext = crop.getContext("2d")!, image = cropContext.createImageData(area.width, area.height);
        for (let y = 0; y < area.height; y++) for (let x = 0; x < area.width; x++) { const source = (area.y + y) * size.width + area.x + x; if (labels[source] !== area.label) continue; const target = (y * area.width + x) * 4; image.data[target] = image.data[target + 1] = image.data[target + 2] = 255; image.data[target + 3] = alpha[source]; }
        cropContext.putImageData(image, 0, 0); const id = makeId();
        return { id, layer_id: id, type: "raster_mask", operation: "add", enabled: true, authoring: { ...base, name: `${base.name} ${areaIndex + 1}` }, x: area.x / size.width, y: area.y / size.height, width: area.width / size.width, height: area.height / size.height, pixel_width: area.width, pixel_height: area.height, data_url: crop.toDataURL("image/png") };
    });
}

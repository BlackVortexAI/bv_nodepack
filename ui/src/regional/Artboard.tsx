import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bounds, Handle } from "./geometry";
import { Geometry, geometryAuthoring, geometryLayerId, geometryMaskGroups, Point, RegionalDocument, Region } from "./model";
import { regionsInPaintOrder } from "./interaction";
import ToolPalette, { BrushSettings, Tool } from "./ToolPalette";
import type { ArtboardView } from "./editorState";

type Props = {
    document: RegionalDocument;
    background?: string;
    selectedRegionId: string | null;
    selectedLayerId: string | null;
    draft: Geometry[] | null;
    selectionBounds: Bounds | null;
    cursor: Point | null;
    tool: Tool;
    brush: BrushSettings;
    canSubtract: boolean;
    displayOpacity: number;
    backgroundOpacity: number;
    isolate: boolean;
    binaryMaskPreview: boolean;
    onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
    onPointerCancel: () => void;
    onPointerLeave: () => void;
    onDoubleClick: (event: React.MouseEvent<HTMLDivElement>) => void;
    onTool: (tool: Tool) => void;
    onBrush: (settings: BrushSettings) => void;
    initialView: ArtboardView;
    onView: (view: ArtboardView) => void;
};

const HANDLES: Array<{ id: Handle; x: number; y: number }> = [{ id: "nw", x: 0, y: 0 }, { id: "n", x: .5, y: 0 }, { id: "ne", x: 1, y: 0 }, { id: "e", x: 1, y: .5 }, { id: "se", x: 1, y: 1 }, { id: "s", x: .5, y: 1 }, { id: "sw", x: 0, y: 1 }, { id: "w", x: 0, y: .5 }];

function MaskShape({ geometry, canvas }: { geometry: Geometry; canvas: RegionalDocument["canvas"] }) {
    const color = geometry.operation === "add" ? "white" : "black";
    if (geometry.type === "rect") return <rect x={geometry.x * canvas.width} y={geometry.y * canvas.height} width={geometry.width * canvas.width} height={geometry.height * canvas.height} fill={color}/>;
    if (geometry.type === "ellipse") return <ellipse cx={(geometry.x + geometry.width / 2) * canvas.width} cy={(geometry.y + geometry.height / 2) * canvas.height} rx={geometry.width * canvas.width / 2} ry={geometry.height * canvas.height / 2} fill={color}/>;
    if (geometry.type === "polygon") return <polygon points={geometry.points.map(point => `${point.x * canvas.width},${point.y * canvas.height}`).join(" ")} fill={color}/>;
    if (geometry.type === "raster_mask") { const id = `raster-${geometry.id}`; return <><defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={canvas.width} height={canvas.height}><image href={geometry.data_url} x={geometry.x * canvas.width} y={geometry.y * canvas.height} width={geometry.width * canvas.width} height={geometry.height * canvas.height} preserveAspectRatio="none"/></mask></defs><rect width={canvas.width} height={canvas.height} fill={color} mask={`url(#${id})`}/></>; }
    const cap = geometry.shape === "square" ? "square" : "round", size = geometry.size * Math.min(canvas.width, canvas.height), blurId = `bv-brush-soft-${geometry.id}`;
    const softness = (1 - geometry.hardness) * size / 6;
    const softFilter = softness > .05 ? `url(#${blurId})` : undefined;
    if (geometry.points.length === 1) {
        const point = geometry.points[0], diameter = size * point.pressure;
        const outer = geometry.shape === "square" ? <rect x={point.x * canvas.width - diameter / 2} y={point.y * canvas.height - diameter / 2} width={diameter} height={diameter} fill={color} fillOpacity={geometry.opacity} filter={softFilter}/> : <circle cx={point.x * canvas.width} cy={point.y * canvas.height} r={diameter / 2} fill={color} fillOpacity={geometry.opacity} filter={softFilter}/>;
        const core = diameter * geometry.hardness;
        return <><defs>{softFilter && <filter id={blurId} filterUnits="userSpaceOnUse" x="0" y="0" width={canvas.width} height={canvas.height}><feGaussianBlur stdDeviation={softness}/></filter>}</defs>{outer}{core > 0 && (geometry.shape === "square" ? <rect x={point.x * canvas.width - core / 2} y={point.y * canvas.height - core / 2} width={core} height={core} fill={color} fillOpacity={geometry.opacity}/> : <circle cx={point.x * canvas.width} cy={point.y * canvas.height} r={core / 2} fill={color} fillOpacity={geometry.opacity}/>)}</>;
    }
    if ((geometry.pressure_mode ?? "constant") === "constant") {
        const path = geometry.points.map((point, index) => `${index ? "L" : "M"}${point.x * canvas.width},${point.y * canvas.height}`).join(" ");
        return <><defs>{softFilter && <filter id={blurId} filterUnits="userSpaceOnUse" x="0" y="0" width={canvas.width} height={canvas.height}><feGaussianBlur stdDeviation={softness}/></filter>}</defs><path d={path} fill="none" stroke={color} strokeOpacity={geometry.opacity} strokeWidth={size} strokeLinecap={cap} strokeLinejoin={cap === "round" ? "round" : "miter"} filter={softFilter}/>{geometry.hardness > 0 && <path d={path} fill="none" stroke={color} strokeOpacity={geometry.opacity} strokeWidth={size * geometry.hardness} strokeLinecap={cap} strokeLinejoin={cap === "round" ? "round" : "miter"}/>}</>;
    }
    return <>{geometry.points.slice(1).map((end, index) => { const start = geometry.points[index], pressure = (start.pressure + end.pressure) / 2; return <line key={index} x1={start.x * canvas.width} y1={start.y * canvas.height} x2={end.x * canvas.width} y2={end.y * canvas.height} stroke={color} strokeOpacity={geometry.opacity} strokeWidth={size * pressure} strokeLinecap={cap}/>; })}</>;
}

function PreviewShape({ geometry, canvas, cursor, activePolygon }: { geometry: Geometry; canvas: RegionalDocument["canvas"]; cursor: Point | null; activePolygon: boolean }) {
    const className = `tool-preview-shape ${geometry.operation}`;
    if (geometry.type === "rect" || geometry.type === "raster_mask") return <rect className={className} x={geometry.x * canvas.width} y={geometry.y * canvas.height} width={geometry.width * canvas.width} height={geometry.height * canvas.height}/>;
    if (geometry.type === "ellipse") return <ellipse className={className} cx={(geometry.x + geometry.width / 2) * canvas.width} cy={(geometry.y + geometry.height / 2) * canvas.height} rx={geometry.width * canvas.width / 2} ry={geometry.height * canvas.height / 2}/>;
    if (geometry.type === "polygon") {
        const points = [...geometry.points, ...(activePolygon && cursor ? [cursor] : [])];
        const shape = activePolygon ? <polyline className={className} points={points.map(point => `${point.x * canvas.width},${point.y * canvas.height}`).join(" ")}/> : <polygon className={className} points={points.map(point => `${point.x * canvas.width},${point.y * canvas.height}`).join(" ")}/>;
        return <>{shape}{geometry.points.map((point, index) => <circle key={index} className={`tool-preview-vertex ${geometry.operation}`} cx={point.x * canvas.width} cy={point.y * canvas.height} r="4"/>)}</>;
    }
    const path = geometry.points.map((point, index) => `${index ? "L" : "M"}${point.x * canvas.width},${point.y * canvas.height}`).join(" ");
    return <path className={className} d={path} strokeWidth={geometry.size * Math.min(canvas.width, canvas.height)} strokeLinecap={geometry.shape === "square" ? "square" : "round"}/>;
}

function RegionMask({ region, geometries, canvas, opacity, resolved }: { region: Region; geometries: Geometry[]; canvas: RegionalDocument["canvas"]; opacity: number; resolved?: boolean }) {
    const layers = geometryMaskGroups(geometries).filter(layer => layer.enabled && (resolved || layer.geometries.some((geometry, index) => geometryAuthoring(geometry, index).visible)));
    const filterId = `bv-feather-${region.id}`, radius = Math.min(64, Math.round(region.mask.feather * Math.min(canvas.width, canvas.height))), deviation = radius / 3;
    return <g opacity={opacity}>{resolved && radius > 0 && <defs><filter id={filterId} filterUnits="userSpaceOnUse" x="0" y="0" width={canvas.width} height={canvas.height}><feGaussianBlur stdDeviation={deviation}/></filter></defs>}<g filter={resolved && radius > 0 ? `url(#${filterId})` : undefined}>{layers.map(layer => {
        const id = `bv-mask-${region.id}-${layer.id}`;
        return <g key={layer.id}><defs><mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width={canvas.width} height={canvas.height}><rect width={canvas.width} height={canvas.height} fill="black"/>{layer.geometries.filter((geometry, index) => geometry.enabled !== false && (resolved || geometryAuthoring(geometry, index).visible)).map(geometry => <MaskShape key={geometry.id} geometry={geometry} canvas={canvas}/>)}</mask></defs><rect width={canvas.width} height={canvas.height} fill={region.authoring.color} mask={`url(#${id})`}/></g>;
    })}</g></g>;
}

export default function Artboard(props: Props) {
    const { document, selectedLayerId, selectedRegionId } = props;
    const viewport = useRef<HTMLDivElement>(null), panGesture = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
    const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 }), [zoom, setZoom] = useState(props.initialView.zoom), [pan, setPan] = useState({ x: props.initialView.panX, y: props.initialView.panY }), [fitMode, setFitMode] = useState(props.initialView.fit), [spacePressed, setSpacePressed] = useState(false);
    const fitZoom = useCallback((size = viewportSize) => Math.max(.02, Math.min(1, (size.width - 40) / document.canvas.width, (size.height - 40) / document.canvas.height)), [document.canvas.height, document.canvas.width, viewportSize]);
    const fit = useCallback(() => { setZoom(fitZoom()); setPan({ x: 0, y: 0 }); setFitMode(true); }, [fitZoom]);
    useEffect(() => {
        const element = viewport.current; if (!element) return;
        const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect, size = { width: rect.width, height: rect.height }; setViewportSize(size); if (fitMode) { setZoom(Math.max(.02, Math.min(1, (size.width - 40) / document.canvas.width, (size.height - 40) / document.canvas.height))); setPan({ x: 0, y: 0 }); } });
        observer.observe(element); return () => observer.disconnect();
    }, [document.canvas.height, document.canvas.width, fitMode]);
    useEffect(() => props.onView({ zoom, panX: pan.x, panY: pan.y, fit: fitMode }), [fitMode, pan.x, pan.y, props.onView, zoom]);
    useEffect(() => {
        const down = (event: KeyboardEvent) => { const target = event.target as HTMLElement | null; if (event.code !== "Space" || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target?.isContentEditable) return; event.preventDefault(); event.stopImmediatePropagation(); setSpacePressed(true); };
        const up = (event: KeyboardEvent) => { if (event.code !== "Space") return; event.preventDefault(); event.stopImmediatePropagation(); setSpacePressed(false); panGesture.current = null; };
        window.addEventListener("keydown", down, true); window.addEventListener("keyup", up, true); return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("keyup", up, true); };
    }, []);
    const geometriesFor = (region: Region) => {
        let geometries = [...region.geometry];
        if (props.draft && region.id === selectedRegionId) {
            const ids = new Set(props.draft.map(item => item.id));
            geometries = geometries.map(item => ids.has(item.id) ? props.draft!.find(draft => draft.id === item.id)! : item);
            for (const draft of props.draft) if (!geometries.some(item => item.id === draft.id)) geometries.push(draft);
        }
        if (!props.binaryMaskPreview && props.isolate && selectedLayerId) geometries = geometries.filter(item => geometryLayerId(item) === selectedLayerId);
        return geometries;
    };
    const cursorWidth = props.brush.size * Math.min(document.canvas.width, document.canvas.height) / document.canvas.width * 100;
    const onWheel = (event: React.WheelEvent<HTMLDivElement>) => {
        event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(), mouseX = event.clientX - rect.left, mouseY = event.clientY - rect.top;
        const next = Math.max(.02, Math.min(8, zoom * Math.exp(-event.deltaY * .0015))), ratio = next / zoom;
        setPan(current => ({ x: mouseX - rect.width / 2 - (mouseX - rect.width / 2 - current.x) * ratio, y: mouseY - rect.height / 2 - (mouseY - rect.height / 2 - current.y) * ratio }));
        setZoom(next); setFitMode(false);
    };
    const beginPan = (event: React.PointerEvent<HTMLDivElement>) => {
        if (event.button !== 1 && !(event.button === 0 && spacePressed)) return;
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId); panGesture.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y }; setFitMode(false);
    };
    const movePan = (event: React.PointerEvent<HTMLDivElement>) => { if (!panGesture.current) return; event.preventDefault(); event.stopPropagation(); setPan({ x: panGesture.current.panX + event.clientX - panGesture.current.x, y: panGesture.current.panY + event.clientY - panGesture.current.y }); };
    const endPan = (event: React.PointerEvent<HTMLDivElement>) => { if (!panGesture.current) return; event.preventDefault(); event.stopPropagation(); panGesture.current = null; };
    const stageLeft = viewportSize.width / 2 - document.canvas.width * zoom / 2 + pan.x, stageTop = viewportSize.height / 2 - document.canvas.height * zoom / 2 + pan.y;
    return <section className="bv-regional-work"><div ref={viewport} className={`artboard-viewport ${spacePressed ? "pan-ready" : ""}`} onWheel={onWheel} onPointerDownCapture={beginPan} onPointerMoveCapture={movePan} onPointerUpCapture={endPan} onPointerCancelCapture={endPan}>
        <ToolPalette tool={props.tool} brush={props.brush} canSubtract={props.canSubtract} canvas={document.canvas} onTool={props.onTool} onBrush={props.onBrush}/>
        <div className="artboard-stage" style={{ width: document.canvas.width, height: document.canvas.height, transform: `translate(${stageLeft}px, ${stageTop}px) scale(${zoom})` }}><div
        className={`bv-regional-canvas tool-${props.tool}`}
        style={{ width: document.canvas.width, height: document.canvas.height }}
        onPointerDown={props.binaryMaskPreview ? undefined : props.onPointerDown} onPointerMove={props.binaryMaskPreview ? undefined : props.onPointerMove} onPointerUp={props.binaryMaskPreview ? undefined : props.onPointerUp} onPointerCancel={props.binaryMaskPreview ? undefined : props.onPointerCancel} onPointerLeave={props.onPointerLeave} onDoubleClick={props.binaryMaskPreview ? undefined : props.onDoubleClick}
    >
        {props.background && !props.binaryMaskPreview && (
          <div
            className="bv-background-image"
            style={{
              backgroundImage: `linear-gradient(#0002,#0002), url(${JSON.stringify(props.background)})`,
              opacity: props.backgroundOpacity,
            }}
          />
        )}
        <svg className="bv-composition" style={props.binaryMaskPreview ? { background: "black" } : undefined} viewBox={`0 0 ${document.canvas.width} ${document.canvas.height}`} preserveAspectRatio="none">{regionsInPaintOrder(document.regions.filter(region => region.enabled && (props.binaryMaskPreview || region.authoring.visible))).map(region => <RegionMask key={region.id} region={props.binaryMaskPreview ? { ...region, authoring: { ...region.authoring, color: "#FFFFFF" } } : region} geometries={geometriesFor(region)} canvas={document.canvas} opacity={props.binaryMaskPreview ? 1 : props.displayOpacity} resolved={props.binaryMaskPreview}/>)}</svg>
        {!props.binaryMaskPreview && props.draft && <svg className="bv-tool-preview" viewBox={`0 0 ${document.canvas.width} ${document.canvas.height}`} preserveAspectRatio="none">{props.draft.map(geometry => <PreviewShape key={geometry.id} geometry={geometry} canvas={document.canvas} cursor={props.cursor} activePolygon={props.tool.startsWith("polygon")}/>)}</svg>}
        {!props.binaryMaskPreview && props.selectionBounds && <svg className="bv-selection-overlay" viewBox={`0 0 ${document.canvas.width} ${document.canvas.height}`} preserveAspectRatio="none">
            <rect className="brush-bounds" x={props.selectionBounds.x * document.canvas.width} y={props.selectionBounds.y * document.canvas.height} width={props.selectionBounds.width * document.canvas.width} height={props.selectionBounds.height * document.canvas.height}/>
            {HANDLES.map(handle => <rect key={handle.id} data-handle={handle.id} className="resize-handle" x={(props.selectionBounds!.x + props.selectionBounds!.width * handle.x) * document.canvas.width - 6} y={(props.selectionBounds!.y + props.selectionBounds!.height * handle.y) * document.canvas.height - 6} width="12" height="12"/>)}
            {props.draft && <text className="tool-preview-size" style={{ fontSize: 12 / zoom }} x={(props.selectionBounds.x + props.selectionBounds.width) * document.canvas.width - 4 / zoom} y={(props.selectionBounds.y + props.selectionBounds.height) * document.canvas.height - 7 / zoom}>{Math.round(props.selectionBounds.width * document.canvas.width)} × {Math.round(props.selectionBounds.height * document.canvas.height)} px</text>}
        </svg>}
        {!props.binaryMaskPreview && props.cursor && props.tool.startsWith("brush") && <div className={`brush-cursor ${props.brush.shape}`} style={{ left: `${props.cursor.x * 100}%`, top: `${props.cursor.y * 100}%`, width: `${cursorWidth}%`, aspectRatio: "1" }}><i style={{ width: `${props.brush.hardness * 100}%`, height: `${props.brush.hardness * 100}%` }}/></div>}
        </div></div>
        <div className="zoom-controls" onWheel={event => event.stopPropagation()}><button title="Zoom out" onClick={() => { setZoom(value => Math.max(.02, value / 1.25)); setFitMode(false); }}>−</button><button title="100%" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); setFitMode(false); }}>{Math.round(zoom * 100)} %</button><button title="Zoom in" onClick={() => { setZoom(value => Math.min(8, value * 1.25)); setFitMode(false); }}>+</button><button title="Fit to view" onClick={fit}>Fit</button></div>
    </div></section>;
}
